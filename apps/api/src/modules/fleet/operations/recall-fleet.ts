import { eq, and, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { fleetEvents } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { Queue } from 'bullmq';
import type { createPveService } from '../../pve/pve.service.js';

export interface RecallFleetDeps {
  db: Database;
  fleetQueue: Queue;
  pveService?: ReturnType<typeof createPveService>;
}

/**
 * Turn an outbound fleet around. Only fleets currently heading out (or mid-PvE
 * in prospecting/mining phases) can be recalled; trade fleets are locked by
 * the market contract and can't be recalled.
 *
 * Cancels the pending phase job (arrive/prospect/mine) and the detection job,
 * then schedules a return job either immediately (instant-cancel for PvE mine
 * and pirate in outbound) or after the mirror of the elapsed outbound time.
 */
export function createRecallFleet(deps: RecallFleetDeps) {
  const { db, fleetQueue, pveService } = deps;

  return async function recallFleet(userId: string, fleetEventId: string) {
    const [event] = await db
      .select()
      .from(fleetEvents)
      .where(
        and(
          eq(fleetEvents.id, fleetEventId),
          eq(fleetEvents.userId, userId),
          eq(fleetEvents.status, 'active'),
          inArray(fleetEvents.phase, ['outbound', 'prospecting', 'mining']),
        ),
      )
      .limit(1);

    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Flotte non trouvée ou non rappelable' });
    }

    if (event.mission === 'trade') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Les flottes de commerce ne peuvent pas être rappelées' });
    }

    if (event.mission === 'colonization_raid') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Un raid pirate ne peut pas être rappelé' });
    }

    const now = new Date();

    // Cancel the pending job for the current phase + detection job
    const jobIdMap: Record<string, string> = {
      outbound: `fleet-arrive-${event.id}`,
      prospecting: `fleet-prospect-${event.id}`,
      mining: `fleet-mine-${event.id}`,
    };
    const jobId = jobIdMap[event.phase];
    if (jobId) await fleetQueue.remove(jobId);
    await fleetQueue.remove(`fleet-detected-${event.id}`);

    // Release PvE mission back to available on recall
    if (event.pveMissionId && pveService) {
      await pveService.releaseMission(event.pveMissionId);
    }

    // PvE missions (mine, pirate) in outbound phase cancel instantly.
    const instantCancel = (event.mission === 'mine' || event.mission === 'pirate') && event.phase === 'outbound';

    if (instantCancel) {
      await db
        .update(fleetEvents)
        .set({ phase: 'return', departureTime: now, arrivalTime: now })
        .where(eq(fleetEvents.id, event.id));

      await fleetQueue.add(
        'return',
        { fleetEventId: event.id },
        { delay: 0, jobId: `fleet-return-${event.id}` },
      );

      return { recalled: true, returnTime: now.toISOString() };
    }

    // Non-PvE recall: return takes the same time as the elapsed outbound leg.
    const elapsed = now.getTime() - event.departureTime.getTime();
    const returnTime = new Date(now.getTime() + elapsed);

    await db
      .update(fleetEvents)
      .set({ phase: 'return', departureTime: now, arrivalTime: returnTime })
      .where(eq(fleetEvents.id, event.id));

    await fleetQueue.add(
      'return',
      { fleetEventId: event.id },
      { delay: elapsed, jobId: `fleet-return-${event.id}` },
    );

    return { recalled: true, returnTime: returnTime.toISOString() };
  };
}
