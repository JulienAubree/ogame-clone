import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb, buildQueue, gameEvents, planets } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createResearchService } from '../modules/research/research.service.js';
import { createGameConfigService } from '../modules/admin/game-config.service.js';
import { researchCompletionQueue } from '../queues/queue.js';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';

export function startResearchCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const gameConfigService = createGameConfigService(db);
  const researchService = createResearchService(db, resourceService, researchCompletionQueue, gameConfigService);
  const redis = new Redis(env.REDIS_URL);

  const worker = new Worker(
    'research-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[research-completion] Processing job ${job.id}`);

      const [entry] = await db
        .select({ userId: buildQueue.userId, planetId: buildQueue.planetId })
        .from(buildQueue)
        .where(eq(buildQueue.id, buildQueueId))
        .limit(1);

      const result = await researchService.completeResearch(buildQueueId);
      if (result) {
        console.log(`[research-completion] ${result.researchId} upgraded to level ${result.newLevel}`);
        if (entry) {
          const [planet] = await db
            .select({ name: planets.name })
            .from(planets)
            .where(eq(planets.id, entry.planetId))
            .limit(1);

          const config = await gameConfigService.getFullConfig();
          const techName = config.research[result.researchId]?.name ?? result.researchId;

          publishNotification(redis, entry.userId, {
            type: 'research-done',
            payload: { techId: result.researchId, name: techName, level: result.newLevel },
          });

          await db.insert(gameEvents).values({
            userId: entry.userId,
            planetId: entry.planetId,
            type: 'research-done',
            payload: { techId: result.researchId, name: techName, level: result.newLevel, planetName: planet?.name ?? 'Planète' },
          });
        }
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[research-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
