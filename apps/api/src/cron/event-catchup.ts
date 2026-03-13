import { lte, eq, and } from 'drizzle-orm';
import { buildQueue, fleetEvents } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { buildingCompletionQueue, researchCompletionQueue, shipyardCompletionQueue, fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';

export async function eventCatchup(db: Database) {
  const now = new Date();

  // Build queue catchup
  const expiredEntries = await db
    .select()
    .from(buildQueue)
    .where(and(eq(buildQueue.status, 'active'), lte(buildQueue.endTime, now)));

  for (const entry of expiredEntries) {
    let queue;
    let jobId: string;

    if (entry.type === 'building') {
      queue = buildingCompletionQueue;
      jobId = `building-${entry.id}`;
    } else if (entry.type === 'research') {
      queue = researchCompletionQueue;
      jobId = `research-${entry.id}`;
    } else {
      queue = shipyardCompletionQueue;
      jobId = `shipyard-${entry.id}-${entry.completedCount + 1}`;
    }

    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      console.log(`[event-catchup] Re-queuing expired ${entry.type} ${entry.id}`);
      await queue.add('complete', { buildQueueId: entry.id }, { jobId });
    }
  }

  // Fleet events catchup
  const expiredFleets = await db
    .select()
    .from(fleetEvents)
    .where(and(eq(fleetEvents.status, 'active'), lte(fleetEvents.arrivalTime, now)));

  for (const fleet of expiredFleets) {
    const queue = fleet.phase === 'return' ? fleetReturnQueue : fleetArrivalQueue;
    const jobId = fleet.phase === 'return'
      ? `fleet-return-${fleet.id}`
      : `fleet-arrive-${fleet.id}`;

    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      console.log(`[event-catchup] Re-queuing expired fleet ${fleet.id} (${fleet.phase})`);
      await queue.add(fleet.phase === 'return' ? 'return' : 'arrive', { fleetEventId: fleet.id }, { jobId });
    }
  }

  const totalExpired = expiredEntries.length + expiredFleets.length;
  if (totalExpired > 0) {
    console.log(`[event-catchup] Found ${totalExpired} expired entries`);
  }
}
