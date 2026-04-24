import { sql, eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import type { Database } from '@exilium/db';
import { users, planets, alliances, fleetEvents, buildQueue, gameEvents, loginEvents } from '@exilium/db';

export interface DashboardStats {
  users: { total: number; active1h: number; active24h: number; active7d: number; banned: number };
  world: { planets: number; alliances: number; activeFleets: number; activeBuilds: number };
  activity24h: { fleetsSent: number; buildsCompleted: number; loginsSuccess: number; loginsFailed: number };
  queues: Array<{ name: string; active: number; waiting: number; delayed: number; failed: number; completed: number }>;
  timestamp: string;
}

export function createDashboardService(db: Database, queues: Record<string, Queue>) {
  async function getStats(): Promise<DashboardStats> {
    const now = new Date();
    // postgres-js in this project can't bind Date as a parameter in some contexts
    // (hits a crypto-internal 'string'-required check). ISO strings work reliably
    // because Postgres implicitly casts them to timestamptz.
    const h1 = new Date(now.getTime() - 60 * 60_000).toISOString();
    const h24 = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();

    // Small separate queries in parallel — simpler (and more portable) than
    // packing everything into one Postgres-specific subquery select.
    const [
      userAgg,
      planetsCount,
      alliancesCount,
      activeFleetsCount,
      activeBuildsCount,
      fleetsSent,
      buildsCompleted,
      loginsSuccess,
      loginsFailed,
      ...queueStats
    ] = await Promise.all([
      db.select({
        total: sql<number>`count(*)::int`,
        active1h: sql<number>`count(*) filter (where ${users.lastLoginAt} > ${h1})::int`,
        active24h: sql<number>`count(*) filter (where ${users.lastLoginAt} > ${h24})::int`,
        active7d: sql<number>`count(*) filter (where ${users.lastLoginAt} > ${d7})::int`,
        banned: sql<number>`count(*) filter (where ${users.bannedAt} is not null)::int`,
      }).from(users),

      db.select({ n: sql<number>`count(*)::int` }).from(planets),
      db.select({ n: sql<number>`count(*)::int` }).from(alliances),
      db.select({ n: sql<number>`count(*)::int` }).from(fleetEvents).where(eq(fleetEvents.status, 'active')),
      db.select({ n: sql<number>`count(*)::int` }).from(buildQueue).where(sql`${buildQueue.status} in ('active','queued')`),

      db.select({ n: sql<number>`count(*)::int` }).from(fleetEvents).where(sql`${fleetEvents.departureTime} > ${h24}`),
      db.select({ n: sql<number>`count(*)::int` }).from(gameEvents).where(sql`${gameEvents.type} in ('building-done','shipyard-done','research-done') and ${gameEvents.createdAt} > ${h24}`),
      db.select({ n: sql<number>`count(*)::int` }).from(loginEvents).where(sql`${loginEvents.success} = true and ${loginEvents.createdAt} > ${h24}`),
      db.select({ n: sql<number>`count(*)::int` }).from(loginEvents).where(sql`${loginEvents.success} = false and ${loginEvents.createdAt} > ${h24}`),

      ...Object.entries(queues).map(async ([name, q]) => {
        const counts = await q.getJobCounts('active', 'waiting', 'delayed', 'failed', 'completed');
        return {
          name,
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
        };
      }),
    ]);

    const u = userAgg[0] ?? { total: 0, active1h: 0, active24h: 0, active7d: 0, banned: 0 };

    return {
      users: u,
      world: {
        planets: planetsCount[0]?.n ?? 0,
        alliances: alliancesCount[0]?.n ?? 0,
        activeFleets: activeFleetsCount[0]?.n ?? 0,
        activeBuilds: activeBuildsCount[0]?.n ?? 0,
      },
      activity24h: {
        fleetsSent: fleetsSent[0]?.n ?? 0,
        buildsCompleted: buildsCompleted[0]?.n ?? 0,
        loginsSuccess: loginsSuccess[0]?.n ?? 0,
        loginsFailed: loginsFailed[0]?.n ?? 0,
      },
      queues: queueStats,
      timestamp: now.toISOString(),
    };
  }

  async function getRecentErrors(limit = 20) {
    const h24 = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const rows = await db
      .select({
        email: loginEvents.email,
        reason: loginEvents.reason,
        ipAddress: loginEvents.ipAddress,
        createdAt: loginEvents.createdAt,
      })
      .from(loginEvents)
      .where(sql`${loginEvents.createdAt} > ${h24} and ${loginEvents.success} = false`)
      .orderBy(sql`${loginEvents.createdAt} desc`)
      .limit(limit);
    return rows;
  }

  return { getStats, getRecentErrors };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
