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
  exploring: 'explore-done',
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
  if (state === 'delayed') {
    await existingJob.promote();
    return true;
  }
  return false;
}

/**
 * Run a list of promise-producing tasks with bounded concurrency. Replaces
 * the naive `for (…) await …` pattern which serialized all Redis round-trips
 * — at 10k expired events that's 10k sequential RTTs per tick.
 */
async function runWithConcurrency<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

export async function eventCatchup(db: Database) {
  const now = new Date();

  // Build queue catchup
  const expiredEntries = await db
    .select()
    .from(buildQueue)
    .where(and(eq(buildQueue.status, 'active'), lte(buildQueue.endTime, now)));

  await runWithConcurrency(expiredEntries, 16, async (entry) => {
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
  });

  // Fleet events catchup
  const expiredFleets = await db
    .select()
    .from(fleetEvents)
    .where(and(eq(fleetEvents.status, 'active'), lte(fleetEvents.arrivalTime, now)));

  await runWithConcurrency(expiredFleets, 16, async (fleet) => {
    const jobName = fleetPhaseToJobName[fleet.phase] ?? 'arrive';
    const jobId = `fleet-${jobName}-${fleet.id}`;

    const requeued = await ensureJobQueued(fleetQueue, jobName, { fleetEventId: fleet.id }, jobId);
    if (requeued) {
      console.log(`[event-catchup] Re-queuing expired fleet ${fleet.id} (${fleet.phase})`);
    }
  });

  const totalExpired = expiredEntries.length + expiredFleets.length;
  if (totalExpired > 0) {
    console.log(`[event-catchup] Found ${totalExpired} expired entries`);
  }
}
