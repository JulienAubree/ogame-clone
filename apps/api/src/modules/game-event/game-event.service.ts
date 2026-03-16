// apps/api/src/modules/game-event/game-event.service.ts
import { eq, and, desc, lt, sql, inArray } from 'drizzle-orm';
import { gameEvents } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

export type GameEventType = 'building-done' | 'research-done' | 'shipyard-done' | 'fleet-arrived' | 'fleet-returned';

export function createGameEventService(db: Database) {
  return {
    async insert(userId: string, planetId: string | null, type: GameEventType, payload: Record<string, unknown>) {
      await db.insert(gameEvents).values({ userId, planetId, type, payload });
    },

    async getRecent(userId: string, limit = 10) {
      return db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.userId, userId))
        .orderBy(desc(gameEvents.createdAt))
        .limit(limit);
    },

    async getUnreadCount(userId: string) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(gameEvents)
        .where(and(eq(gameEvents.userId, userId), eq(gameEvents.read, false)));
      return result?.count ?? 0;
    },

    async markAllRead(userId: string) {
      const rows = await db
        .update(gameEvents)
        .set({ read: true })
        .where(and(eq(gameEvents.userId, userId), eq(gameEvents.read, false)))
        .returning({ id: gameEvents.id });
      return rows.length;
    },

    async getByPlanet(userId: string, planetId: string, limit = 10) {
      return db
        .select()
        .from(gameEvents)
        .where(and(eq(gameEvents.userId, userId), eq(gameEvents.planetId, planetId)))
        .orderBy(desc(gameEvents.createdAt))
        .limit(limit);
    },

    async getHistory(userId: string, options: { cursor?: string; limit?: number; types?: GameEventType[] }) {
      const limit = options.limit ?? 20;
      const conditions = [eq(gameEvents.userId, userId)];

      if (options.cursor) {
        const [cursorEvent] = await db
          .select({ createdAt: gameEvents.createdAt })
          .from(gameEvents)
          .where(eq(gameEvents.id, options.cursor))
          .limit(1);
        if (cursorEvent) {
          conditions.push(lt(gameEvents.createdAt, cursorEvent.createdAt));
        }
      }

      if (options.types && options.types.length > 0) {
        conditions.push(inArray(gameEvents.type, options.types));
      }

      const events = await db
        .select()
        .from(gameEvents)
        .where(and(...conditions))
        .orderBy(desc(gameEvents.createdAt))
        .limit(limit + 1);

      const hasMore = events.length > limit;
      const results = hasMore ? events.slice(0, limit) : events;
      const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

      return { events: results, nextCursor };
    },

    async cleanup(retentionDays = 30) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);
      const rows = await db
        .delete(gameEvents)
        .where(lt(gameEvents.createdAt, cutoff))
        .returning({ id: gameEvents.id });
      return rows.length;
    },
  };
}
