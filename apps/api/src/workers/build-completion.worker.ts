import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { Database } from '@exilium/db';
import { gameEvents } from '@exilium/db';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';
import type { BuildCompletionResult } from './completion.types.js';
import type { createBuildingService } from '../modules/building/building.service.js';
import type { createResearchService } from '../modules/research/research.service.js';
import type { createShipyardService } from '../modules/shipyard/shipyard.service.js';
import type { createTutorialService } from '../modules/tutorial/tutorial.service.js';
import type { createPushService } from '../modules/push/push.service.js';
import type { createDailyQuestService } from '../modules/daily-quest/daily-quest.service.js';

type Services = {
  buildingService: ReturnType<typeof createBuildingService>;
  researchService: ReturnType<typeof createResearchService>;
  shipyardService: ReturnType<typeof createShipyardService>;
  tutorialService: ReturnType<typeof createTutorialService>;
  pushService: ReturnType<typeof createPushService>;
  dailyQuestService?: ReturnType<typeof createDailyQuestService>;
};

export function startBuildCompletionWorker(db: Database, redis: Redis, services: Services) {
  const { buildingService, researchService, shipyardService, tutorialService } = services;

  const handlers: Record<string, (id: string) => Promise<BuildCompletionResult>> = {
    'building':      (id) => buildingService.completeUpgrade(id),
    'research':      (id) => researchService.completeResearch(id),
    'shipyard-unit': (id) => shipyardService.completeUnit(id),
  };

  const worker = new Worker(
    'build-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[build-completion] Processing ${job.name} job ${job.id}`);

      const handler = handlers[job.name];
      if (!handler) {
        console.error(`[build-completion] Unknown job name: ${job.name}`);
        return;
      }

      const result = await handler(buildQueueId);
      if (!result) {
        console.log(`[build-completion] Entry ${buildQueueId} not found or already completed`);
        return;
      }

      // Post-completion pipeline
      publishNotification(redis, result.userId, {
        type: result.eventType,
        payload: result.notificationPayload,
      });

      // Push notification
      const categoryMap: Record<string, 'building' | 'research' | 'shipyard'> = {
        'building': 'building',
        'research': 'research',
        'shipyard-unit': 'shipyard',
      };
      const pushCategory = categoryMap[job.name];
      if (pushCategory) {
        const name = String(result.notificationPayload.name ?? result.notificationPayload.buildingId ?? result.notificationPayload.techId ?? result.notificationPayload.unitId);
        const level = result.notificationPayload.level ? ` niv. ${result.notificationPayload.level}` : '';
        const labels: Record<string, string> = { building: 'Construction terminée', research: 'Recherche terminée', shipyard: 'Production terminée' };
        const planetName = result.notificationPayload.planetName as string | undefined;
        const titlePrefix = planetName ? `[${planetName}] ` : '';
        await services.pushService.sendToUser(result.userId, pushCategory, {
          title: `${titlePrefix}${labels[pushCategory]}`,
          body: `${name}${level}`,
          url: pushCategory === 'building' ? '/buildings' : pushCategory === 'research' ? '/research' : '/shipyard',
        }, result.eventType);
      }

      await db.insert(gameEvents).values({
        userId: result.userId,
        planetId: result.planetId,
        type: result.eventType,
        payload: result.eventPayload,
      });

      if (result.tutorialCheck) {
        const tutorialResult = await tutorialService.checkAndComplete(result.userId, {
          type: result.tutorialCheck.type,
          targetId: result.tutorialCheck.targetId,
          targetValue: result.tutorialCheck.targetValue,
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

      // Hook: daily quest detection for construction/research completion
      if (services.dailyQuestService) {
        await services.dailyQuestService.processEvent({
          type: 'construction:completed',
          userId: result.userId,
          payload: { buildingId: result.notificationPayload.buildingId ?? result.notificationPayload.techId ?? result.notificationPayload.unitId },
        }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
      }

      console.log(`[build-completion] ${job.name} completed for ${buildQueueId}`);
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[build-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
