import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { Database } from '@exilium/db';
import { gameEvents } from '@exilium/db';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';
import type { FleetCompletionResult } from './completion.types.js';
import type { createFleetService } from '../modules/fleet/fleet.service.js';
import type { createTutorialService } from '../modules/tutorial/tutorial.service.js';
import type { createPushService } from '../modules/push/push.service.js';

type Services = {
  fleetService: ReturnType<typeof createFleetService>;
  tutorialService: ReturnType<typeof createTutorialService>;
  pushService: ReturnType<typeof createPushService>;
};

export function startFleetWorker(db: Database, redis: Redis, services: Services) {
  const { fleetService, tutorialService } = services;

  const handlers: Record<string, (id: string) => Promise<FleetCompletionResult>> = {
    'arrive':        (id) => fleetService.processArrival(id),
    // Legacy alias: some producers enqueued 'arrival' before the naming was unified.
    // Keep this until we are confident no stale jobs remain in Redis.
    'arrival':       (id) => fleetService.processArrival(id),
    'return':        (id) => fleetService.processReturn(id),
    'prospect-done': (id) => fleetService.processProspectDone(id),
    'mine-done':     (id) => fleetService.processMineDone(id),
    'explore-done':  (id) => fleetService.processExploreDone(id),
  };

  const worker = new Worker(
    'fleet',
    async (job) => {
      const { fleetEventId } = job.data as { fleetEventId: string };
      console.log(`[fleet] Processing ${job.name} job ${job.id}`);

      // Detection jobs have extra data and no completion result
      if (job.name === 'fleet-detected') {
        const { defenderId } = job.data as { fleetEventId: string; defenderId: string };
        await fleetService.processDetection(fleetEventId, defenderId);
        console.log(`[fleet] Detection fired for ${fleetEventId}`);
        return;
      }

      const handler = handlers[job.name];
      if (!handler) {
        console.error(`[fleet] Unknown job name: ${job.name}`);
        return;
      }

      const result = await handler(fleetEventId);
      if (!result) {
        console.log(`[fleet] Event ${fleetEventId} not found, already completed, or phase-only`);
        return;
      }

      // Post-completion pipeline
      if (result.userId) {
        publishNotification(redis, result.userId, {
          type: result.eventType,
          payload: result.notificationPayload,
        });

        // Push notification
        const fleetCombatTypes = ['fleet-attack-landed', 'fleet-hostile-inbound'];
        const pushCategory = fleetCombatTypes.includes(result.eventType) ? 'combat' as const : 'fleet' as const;
        const planetForOwner = (result.notificationPayload.originName ?? result.notificationPayload.targetPlanetName) as string | undefined;
        const ownerPrefix = planetForOwner ? `[${planetForOwner}] ` : '';
        await services.pushService.sendToUser(result.userId, pushCategory, {
          title: `${ownerPrefix}${result.eventType.includes('arrive') ? 'Flotte arrivée' : result.eventType.includes('return') ? 'Flotte de retour' : 'Événement de flotte'}`,
          body: String(result.notificationPayload.targetCoords ?? result.notificationPayload.originName ?? ''),
          url: '/fleet',
        }, result.eventType);

        await db.insert(gameEvents).values({
          userId: result.userId,
          planetId: result.planetId,
          type: result.eventType,
          payload: result.eventPayload,
        });

        // Notify other users (e.g. defender on attack)
        if (result.notifyUsers) {
          for (const notify of result.notifyUsers) {
            publishNotification(redis, notify.userId, {
              type: notify.type,
              payload: notify.payload,
            });

            const cat = notify.type.includes('attack') || notify.type.includes('hostile') ? 'combat' as const : 'fleet' as const;
            const notifyPlanetName = notify.payload.targetPlanetName as string | undefined;
            const notifyPrefix = notifyPlanetName ? `[${notifyPlanetName}] ` : '';
            await services.pushService.sendToUser(notify.userId, cat, {
              title: `${notifyPrefix}${notify.type.includes('attack') ? 'Planète attaquée !' : 'Flotte en approche'}`,
              body: String(notify.payload.targetCoords ?? ''),
              url: notify.type.includes('attack') ? '/reports' : '/fleet',
            }, notify.type);
          }
        }

        // Extra events (e.g. pve-mission-done)
        if (result.extraEvents) {
          for (const extra of result.extraEvents) {
            publishNotification(redis, result.userId, {
              type: extra.type,
              payload: extra.payload,
            });
            await db.insert(gameEvents).values({
              userId: result.userId,
              planetId: result.planetId,
              type: extra.type,
              payload: extra.payload,
            });
          }
        }

        // Tutorial checks (can be multiple)
        if (result.tutorialChecks) {
          for (const check of result.tutorialChecks) {
            const tutorialResult = await tutorialService.checkAndComplete(result.userId, {
              type: check.type,
              targetId: check.targetId,
              targetValue: check.targetValue,
            });
            if (tutorialResult) {
              publishNotification(redis, result.userId, {
                type: 'tutorial-quest-pending',
                payload: {
                  questId: tutorialResult.questId,
                  pendingCompletion: true,
                },
              });
            }
          }
        }
      }

      console.log(`[fleet] ${job.name} completed for ${fleetEventId}`);
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[fleet] Job ${job?.id} failed:`, err);
  });

  return worker;
}
