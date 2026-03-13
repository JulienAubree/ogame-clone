import { lte, eq, and } from 'drizzle-orm';
import { buildQueue } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { buildingCompletionQueue, researchCompletionQueue, shipyardCompletionQueue } from '../queues/queue.js';

export async function eventCatchup(db: Database) {
  const now = new Date();

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

  if (expiredEntries.length > 0) {
    console.log(`[event-catchup] Found ${expiredEntries.length} expired entries`);
  }
}
