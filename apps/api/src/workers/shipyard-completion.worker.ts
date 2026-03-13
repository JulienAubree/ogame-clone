import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createShipyardService } from '../modules/shipyard/shipyard.service.js';
import { shipyardCompletionQueue } from '../queues/queue.js';
import { env } from '../config/env.js';

export function startShipyardCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const shipyardService = createShipyardService(db, resourceService, shipyardCompletionQueue);

  const worker = new Worker(
    'shipyard-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[shipyard-completion] Processing job ${job.id}`);
      const result = await shipyardService.completeUnit(buildQueueId);
      if (result) {
        console.log(`[shipyard-completion] ${result.itemId}: ${result.totalCompleted} completed, done=${result.completed}`);
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[shipyard-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
