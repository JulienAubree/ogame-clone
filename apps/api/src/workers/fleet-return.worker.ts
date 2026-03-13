import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createFleetService } from '../modules/fleet/fleet.service.js';
import { fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';
import { env } from '../config/env.js';
import { UNIVERSE_CONFIG } from '../modules/universe/universe.config.js';

export function startFleetReturnWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed);

  const worker = new Worker(
    'fleet-return',
    async (job) => {
      const { fleetEventId } = job.data as { fleetEventId: string };
      console.log(`[fleet-return] Processing job ${job.id}`);
      const result = await fleetService.processReturn(fleetEventId);
      if (result) {
        console.log(`[fleet-return] Fleet returned with ${Object.keys(result.ships).length} ship types`);
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[fleet-return] Job ${job?.id} failed:`, err);
  });

  return worker;
}
