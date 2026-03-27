import { lte, eq, and } from 'drizzle-orm';
import { buildQueue, fleetEvents } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { Queue } from 'bullmq';
import { buildCompletionQueue, fleetQueue } from '../queues/queues.js';

const fleetPhaseToJobName: Record<string, string> = {
  outbound: 'arrive',
  return: 'return',
  prospecting: 'prospect-done',
  mining: 'mine-done',
};

async function ensureJobQueued(queue: Queue, jobName: string, data: Record<string, string>, jobId: string): Promise<boolean> {
  const existingJob = await queue.getJob(jobId);
  if (!existingJob) {
    await queue.add(jobName, data, { jobId });
    return true;
  }
  const state = await existingJob.getState();
  if (state === 'completed' || state === 'failed') {
    await existingJob.remove();
    await queue.add(jobName, data, { jobId });
    return true;
  }
  return false;
}

export async function eventCatchup(db: Database) {
  const now = new Date();

  // Build queue catchup
  const expiredEntries = await db
    .select()
    .from(buildQueue)
    .where(and(eq(buildQueue.status, 'active'), lte(buildQueue.endTime, now)));

  for (const entry of expiredEntries) {
    let jobName: string;
    let jobId: string;

    if (entry.type === 'building') {
      jobName = 'building';
      jobId = `building-${entry.id}`;
    } else if (entry.type === 'research') {
      jobName = 'research';
      jobId = `research-${entry.id}`;
    } else {
      jobName = 'shipyard-unit';
      jobId = `shipyard-${entry.id}-${entry.completedCount + 1}`;
    }

    const requeued = await ensureJobQueued(buildCompletionQueue, jobName, { buildQueueId: entry.id }, jobId);
    if (requeued) {
      console.log(`[event-catchup] Re-queuing expired ${entry.type} ${entry.id}`);
    }
  }

  // Fleet events catchup
  const expiredFleets = await db
    .select()
    .from(fleetEvents)
    .where(and(eq(fleetEvents.status, 'active'), lte(fleetEvents.arrivalTime, now)));

  for (const fleet of expiredFleets) {
    const jobName = fleetPhaseToJobName[fleet.phase] ?? 'arrive';
    const jobId = `fleet-${jobName}-${fleet.id}`;

    const requeued = await ensureJobQueued(fleetQueue, jobName, { fleetEventId: fleet.id }, jobId);
    if (requeued) {
      console.log(`[event-catchup] Re-queuing expired fleet ${fleet.id} (${fleet.phase})`);
    }
  }

  const totalExpired = expiredEntries.length + expiredFleets.length;
  if (totalExpired > 0) {
    console.log(`[event-catchup] Found ${totalExpired} expired entries`);
  }
}
