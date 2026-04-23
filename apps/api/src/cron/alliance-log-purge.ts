import { lt } from 'drizzle-orm';
import { allianceLogs, type Database } from '@exilium/db';

const RETENTION_DAYS = 30;

/** Pure helper kept exported for tests. */
export function buildPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export async function allianceLogPurge(db: Database, now: Date = new Date()): Promise<{ deleted: number }> {
  const cutoff = buildPurgeCutoff(now);
  const result = await db.delete(allianceLogs).where(lt(allianceLogs.createdAt, cutoff));
  const deleted = (result as unknown as { count?: number }).count ?? 0;
  return { deleted };
}
