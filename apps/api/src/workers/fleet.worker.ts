import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { Database } from '@ogame-clone/db';
import { gameEvents } from '@ogame-clone/db';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';
import type { FleetCompletionResult } from './completion.types.js';
import type { createFleetService } from '../modules/fleet/fleet.service.js';
import type { createTutorialService } from '../modules/tutorial/tutorial.service.js';

type Services = {
  fleetService: ReturnType<typeof createFleetService>;
  tutorialService: ReturnType<typeof createTutorialService>;
};

export function startFleetWorker(db: Database, redis: Redis, services: Services) {
  const { fleetService, tutorialService } = services;

  const handlers: Record<string, (id: string) => Promise<FleetCompletionResult>> = {
    'arrive':        (id) => fleetService.processArrival(id),
    'return':        (id) => fleetService.processReturn(id),
    'prospect-done': (id) => fleetService.processProspectDone(id),
    'mine-done':     (id) => fleetService.processMineDone(id),
  };

  const worker = new Worker(
    'fleet',
    async (job) => {
      const { fleetEventId } = job.data as { fleetEventId: string };
      console.log(`[fleet] Processing ${job.name} job ${job.id}`);

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

        await db.insert(gameEvents).values({
          userId: result.userId,
          planetId: result.planetId,
          type: result.eventType,
          payload: result.eventPayload,
        });

        // Extra events (e.g. pve-mission-done)
        if (result.extraEvents) {
          for (const extra of result.extraEvents) {
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
                type: 'tutorial-quest-complete',
                payload: {
                  questId: tutorialResult.completedQuest.id,
                  questTitle: tutorialResult.completedQuest.title,
                  reward: tutorialResult.reward,
                  nextQuest: tutorialResult.nextQuest
                    ? { id: tutorialResult.nextQuest.id, title: tutorialResult.nextQuest.title }
                    : null,
                  tutorialComplete: tutorialResult.tutorialComplete,
                },
              });

              await db.insert(gameEvents).values({
                userId: result.userId,
                planetId: result.planetId,
                type: 'tutorial-quest-done',
                payload: {
                  questId: tutorialResult.completedQuest.id,
                  questTitle: tutorialResult.completedQuest.title,
                  reward: tutorialResult.reward,
                  tutorialComplete: tutorialResult.tutorialComplete,
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
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[fleet] Job ${job?.id} failed:`, err);
  });

  return worker;
}
