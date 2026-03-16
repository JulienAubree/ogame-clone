import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb, buildQueue, gameEvents, planets } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createBuildingService } from '../modules/building/building.service.js';
import { createGameConfigService } from '../modules/admin/game-config.service.js';
import { buildingCompletionQueue } from '../queues/queue.js';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';

export function startBuildingCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const gameConfigService = createGameConfigService(db);
  const buildingService = createBuildingService(db, resourceService, buildingCompletionQueue, gameConfigService);
  const redis = new Redis(env.REDIS_URL);

  const worker = new Worker(
    'building-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[building-completion] Processing job ${job.id}, buildQueueId: ${buildQueueId}`);

      const [entry] = await db
        .select({ userId: buildQueue.userId, planetId: buildQueue.planetId })
        .from(buildQueue)
        .where(eq(buildQueue.id, buildQueueId))
        .limit(1);

      const result = await buildingService.completeUpgrade(buildQueueId);
      if (result) {
        console.log(
          `[building-completion] ${result.buildingId} upgraded to level ${result.newLevel}`,
        );
        if (entry) {
          const [planet] = await db
            .select({ name: planets.name })
            .from(planets)
            .where(eq(planets.id, entry.planetId))
            .limit(1);

          const config = await gameConfigService.getFullConfig();
          const buildingName = config.buildings[result.buildingId]?.name ?? result.buildingId;

          publishNotification(redis, entry.userId, {
            type: 'building-done',
            payload: { planetId: entry.planetId, buildingId: result.buildingId, name: buildingName, level: result.newLevel },
          });

          await db.insert(gameEvents).values({
            userId: entry.userId,
            planetId: entry.planetId,
            type: 'building-done',
            payload: { buildingId: result.buildingId, name: buildingName, level: result.newLevel, planetName: planet?.name ?? 'Planète' },
          });
        }
      } else {
        console.log(
          `[building-completion] Build queue entry ${buildQueueId} not found or already completed`,
        );
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[building-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
