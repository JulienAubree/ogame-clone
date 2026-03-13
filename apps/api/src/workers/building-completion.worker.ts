import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createBuildingService } from '../modules/building/building.service.js';
import { buildingCompletionQueue } from '../queues/queue.js';
import { env } from '../config/env.js';

export function startBuildingCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const buildingService = createBuildingService(db, resourceService, buildingCompletionQueue);

  const worker = new Worker(
    'building-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[building-completion] Processing job ${job.id}, buildQueueId: ${buildQueueId}`);

      const result = await buildingService.completeUpgrade(buildQueueId);
      if (result) {
        console.log(
          `[building-completion] ${result.buildingId} upgraded to level ${result.newLevel}`,
        );
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
