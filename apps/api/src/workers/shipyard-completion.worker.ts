import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb, buildQueue, gameEvents, planets } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createShipyardService } from '../modules/shipyard/shipyard.service.js';
import { createGameConfigService } from '../modules/admin/game-config.service.js';
import { shipyardCompletionQueue } from '../queues/queue.js';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';

export function startShipyardCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const gameConfigService = createGameConfigService(db);
  const shipyardService = createShipyardService(db, resourceService, shipyardCompletionQueue, gameConfigService);
  const redis = new Redis(env.REDIS_URL);

  const worker = new Worker(
    'shipyard-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[shipyard-completion] Processing job ${job.id}`);

      const [entry] = await db
        .select({ userId: buildQueue.userId, planetId: buildQueue.planetId })
        .from(buildQueue)
        .where(eq(buildQueue.id, buildQueueId))
        .limit(1);

      const result = await shipyardService.completeUnit(buildQueueId);
      if (result) {
        console.log(`[shipyard-completion] ${result.itemId}: ${result.totalCompleted} completed, done=${result.completed}`);
        if (entry && result.completed) {
          const [planet] = await db
            .select({ name: planets.name })
            .from(planets)
            .where(eq(planets.id, entry.planetId))
            .limit(1);

          const config = await gameConfigService.getFullConfig();
          const unitName = config.ships[result.itemId]?.name ?? config.defenses[result.itemId]?.name ?? result.itemId;

          publishNotification(redis, entry.userId, {
            type: 'shipyard-done',
            payload: { planetId: entry.planetId, unitId: result.itemId, name: unitName, count: result.totalCompleted },
          });

          await db.insert(gameEvents).values({
            userId: entry.userId,
            planetId: entry.planetId,
            type: 'shipyard-done',
            payload: { unitId: result.itemId, name: unitName, count: result.totalCompleted, planetName: planet?.name ?? 'Planète' },
          });
        }
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[shipyard-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
