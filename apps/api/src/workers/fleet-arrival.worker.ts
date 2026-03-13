import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createFleetService } from '../modules/fleet/fleet.service.js';
import { fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';
import { env } from '../config/env.js';
import { UNIVERSE_CONFIG } from '../modules/universe/universe.config.js';

export function startFleetArrivalWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed);

  const worker = new Worker(
    'fleet-arrival',
    async (job) => {
      const { fleetEventId } = job.data as { fleetEventId: string };
      console.log(`[fleet-arrival] Processing job ${job.id}`);
      const result = await fleetService.processArrival(fleetEventId);
      if (result) {
        console.log(`[fleet-arrival] Mission ${result.mission} processed`);
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[fleet-arrival] Job ${job?.id} failed:`, err);
  });

  return worker;
}
