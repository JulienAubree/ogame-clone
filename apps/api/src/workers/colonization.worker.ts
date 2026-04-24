import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { Database } from '@exilium/db';
import { colonizationProcesses, fleetEvents, planets } from '@exilium/db';
import { eq } from 'drizzle-orm';
import { scaleFleetToFP, type UnitCombatStats, type FPConfig } from '@exilium/game-engine';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';
import type { createColonizationService } from '../modules/colonization/colonization.service.js';
import type { GameConfigService } from '../modules/admin/game-config.service.js';
import type { Queue } from 'bullmq';

/** Default pirate template ratios used when no DB templates are available */
const DEFAULT_PIRATE_TEMPLATE: Record<string, number> = { interceptor: 3, frigate: 1 };

export function startColonizationWorker(
  db: Database,
  redis: Redis,
  colonizationService: ReturnType<typeof createColonizationService>,
  gameConfigService: GameConfigService,
  fleetQueue: Queue,
) {
  // Register repeatable tick job
  import('../queues/queues.js').then(({ colonizationQueue }) => {
    colonizationQueue.add('tick-all', {}, {
      repeat: { every: 5 * 60 * 1000 }, // Every 5 minutes
      jobId: 'colonization-tick-all',
    });
  });

  const worker = new Worker(
    'colonization',
    async (job) => {
      if (job.name !== 'tick-all') return;

      const activeProcesses = await db
        .select()
        .from(colonizationProcesses)
        .where(eq(colonizationProcesses.status, 'active'));

      for (const process of activeProcesses) {
        try {
          // 1. Consume resources (returns whether stock is sufficient)
          const { stockSufficient } = await colonizationService.consumeResources(process.id);

          // 2. Advance passive progress (halved if stock insufficient)
          const updated = await colonizationService.tick(process.id, stockSufficient);
          if (!updated) continue;

          // 3. Maybe generate a pirate raid
          const raidInfo = await colonizationService.maybeGenerateRaid(process.id);
          if (raidInfo) {
            await createRaidFleetEvent(
              db,
              gameConfigService,
              fleetQueue,
              redis,
              process.userId,
              process.id,
              raidInfo,
            );
          }

          // 4. Re-read progress after tick
          const [fresh] = await db
            .select()
            .from(colonizationProcesses)
            .where(eq(colonizationProcesses.id, process.id));

          if (!fresh || fresh.status !== 'active') continue;

          // Compute deadlines from config
          const fullConfig = await gameConfigService.getFullConfig();
          const gracePeriodHours = Number(fullConfig.universe.colonization_grace_period_hours) || 0;
          const outpostTimeoutHours = Number(fullConfig.universe.colonization_outpost_timeout_hours) || 0;
          const startedAtMs = new Date(fresh.startedAt).getTime();
          const nowMs = Date.now();
          const gracePeriodEnded = nowMs >= startedAtMs + gracePeriodHours * 60 * 60 * 1000;
          const outpostTimeoutExceeded =
            !fresh.outpostEstablished &&
            outpostTimeoutHours > 0 &&
            nowMs >= startedAtMs + outpostTimeoutHours * 60 * 60 * 1000;

          // 5. Check completion (0.995 threshold to avoid floating-point near-miss)
          if (fresh.progress >= 0.995) {
            await colonizationService.finalize(process.id);
            publishNotification(redis, process.userId, {
              type: 'colonization-complete',
              payload: { planetId: process.planetId },
            });
          } else if (outpostTimeoutExceeded || (fresh.outpostEstablished && gracePeriodEnded && fresh.progress <= 0)) {
            // 6. Handle failure -- return colony ship to origin
            const result = await colonizationService.fail(process.id);
            if (result) {
              const config = await gameConfigService.getFullConfig();
              const colonyShipEntry = Object.entries(config.ships).find(
                ([, s]) => s.role === 'colonization',
              );

              if (!colonyShipEntry) {
                console.error(`[colonization] Colony ship definition not found in config — ship lost for user ${result.userId}`);
              }

              if (colonyShipEntry && result.originPlanetId) {
                const [originPlanet] = await db
                  .select()
                  .from(planets)
                  .where(eq(planets.id, result.originPlanetId))
                  .limit(1);

                if (!originPlanet) {
                  console.error(`[colonization] Origin planet ${result.originPlanetId} not found — colony ship lost for user ${result.userId}`);
                }

                if (originPlanet) {
                  const now = new Date();
                  const arrivalTime = new Date(now.getTime() + 60_000); // 1 min symbolic return
                  const [returnEvent] = await db
                    .insert(fleetEvents)
                    .values({
                      userId: result.userId,
                      originPlanetId: result.originPlanetId,
                      targetGalaxy: originPlanet.galaxy,
                      targetSystem: originPlanet.system,
                      targetPosition: originPlanet.position,
                      mission: 'transport',
                      phase: 'return',
                      status: 'active',
                      departureTime: now,
                      arrivalTime,
                      ships: { [colonyShipEntry[0]]: 1 },
                    })
                    .returning();

                  await fleetQueue.add(
                    'return',
                    { fleetEventId: returnEvent.id },
                    { delay: 60_000, jobId: `fleet-return-${returnEvent.id}` },
                  );
                }
              }

              publishNotification(redis, result.userId, {
                type: 'colonization-failed',
                payload: { originPlanetId: result.originPlanetId },
              });
            }
          }
        } catch (err) {
          console.error(`[colonization] Error processing ${process.id}:`, err);
        }
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[colonization] Job ${job?.id} failed:`, err);
  });

  return worker;
}

/** Create a pirate raid fleet event and schedule its arrival */
async function createRaidFleetEvent(
  db: Database,
  gameConfigService: GameConfigService,
  fleetQueue: Queue,
  redis: Redis,
  userId: string,
  processId: string,
  raidInfo: {
    targetFP: number;
    travelTime: number;
    planetId: string;
    coordinates: { galaxy: number; system: number; position: number };
  },
) {
  const config = await gameConfigService.getFullConfig();

  // Build ship combat stats for fleet scaling
  const shipStats: Record<string, UnitCombatStats> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    shipStats[id] = {
      weapons: ship.weapons,
      shotCount: ship.shotCount ?? 1,
      shield: ship.shield,
      hull: ship.hull,
    };
  }
  const fpConfig: FPConfig = {
    shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
    divisor: Number(config.universe.fp_divisor) || 100,
  };

  // Scale pirate fleet to target FP using default template
  const pirateFleet = scaleFleetToFP(DEFAULT_PIRATE_TEMPLATE, raidInfo.targetFP, shipStats, fpConfig);

  const now = new Date();
  const arrivalTime = new Date(now.getTime() + raidInfo.travelTime * 1000);

  // Create fleet event for the inbound pirate raid.
  // userId references the colonizer (target), but the raid is hostile and
  // must never appear in their active movements / be recallable — filtered
  // out downstream by mission. detectedAt + high score surface it as an
  // inbound hostile at max tier.
  const [raidEvent] = await db
    .insert(fleetEvents)
    .values({
      userId,
      originPlanetId: null,
      targetPlanetId: raidInfo.planetId,
      targetGalaxy: raidInfo.coordinates.galaxy,
      targetSystem: raidInfo.coordinates.system,
      targetPosition: raidInfo.coordinates.position,
      mission: 'colonization_raid',
      phase: 'outbound',
      status: 'active',
      departureTime: now,
      arrivalTime,
      ships: pirateFleet,
      metadata: { colonizationRaid: true, processId },
      detectedAt: now,
      detectionScore: 9999,
    })
    .returning();

  // Schedule fleet arrival processing
  await fleetQueue.add(
    'arrive',
    { fleetEventId: raidEvent.id },
    { delay: raidInfo.travelTime * 1000, jobId: `fleet-arrive-${raidEvent.id}` },
  );

  // Notify the player about the incoming raid
  publishNotification(redis, userId, {
    type: 'colonization-raid',
    payload: {
      planetId: raidInfo.planetId,
      arrivalTime: arrivalTime.toISOString(),
      ships: pirateFleet,
    },
  });
}
