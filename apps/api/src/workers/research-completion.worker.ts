import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createResearchService } from '../modules/research/research.service.js';
import { researchCompletionQueue } from '../queues/queue.js';
import { env } from '../config/env.js';

export function startResearchCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const researchService = createResearchService(db, resourceService, researchCompletionQueue);

  const worker = new Worker(
    'research-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[research-completion] Processing job ${job.id}`);
      const result = await researchService.completeResearch(buildQueueId);
      if (result) {
        console.log(`[research-completion] ${result.researchId} upgraded to level ${result.newLevel}`);
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[research-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
