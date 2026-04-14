import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { Database } from '@exilium/db';
import { colonizationProcesses, fleetEvents, planets } from '@exilium/db';
import { eq } from 'drizzle-orm';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';
import type { createColonizationService } from '../modules/colonization/colonization.service.js';
import type { GameConfigService } from '../modules/admin/game-config.service.js';
import type { Queue } from 'bullmq';

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
          // 1. Expire overdue events and apply penalties
          await colonizationService.expireEvents(process.id);

          // 2. Advance passive progress
          const updated = await colonizationService.tick(process.id);
          if (!updated) continue;

          // 3. Maybe generate a new event
          const newEvent = await colonizationService.maybeGenerateEvent(process.id);
          if (newEvent) {
            publishNotification(redis, process.userId, {
              type: 'colonization-event',
              payload: {
                planetId: process.planetId,
                eventType: newEvent.eventType,
                expiresAt: newEvent.expiresAt,
              },
            });
          }

          // 4. Re-read progress after tick + possible penalty
          const [fresh] = await db
            .select()
            .from(colonizationProcesses)
            .where(eq(colonizationProcesses.id, process.id));

          if (!fresh || fresh.status !== 'active') continue;

          // 5. Check completion (0.995 threshold to avoid floating-point near-miss)
          if (fresh.progress >= 0.995) {
            await colonizationService.finalize(process.id);
            publishNotification(redis, process.userId, {
              type: 'colonization-complete',
              payload: { planetId: process.planetId },
            });
          } else if (fresh.progress <= 0) {
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
