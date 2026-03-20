import { eq, and, desc, lt, inArray, sql } from 'drizzle-orm';
import { missionReports } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

export function createReportService(db: Database) {
  return {
    async create(data: {
      userId: string;
      fleetEventId?: string;
      pveMissionId?: string;
      messageId?: string;
      missionType: string;
      title: string;
      coordinates: { galaxy: number; system: number; position: number };
      originCoordinates?: { galaxy: number; system: number; position: number; planetName: string };
      fleet: { ships: Record<string, number>; totalCargo: number };
      departureTime: Date;
      completionTime: Date;
      result: Record<string, unknown>;
    }) {
      const [report] = await db
        .insert(missionReports)
        .values({
          userId: data.userId,
          fleetEventId: data.fleetEventId ?? null,
          pveMissionId: data.pveMissionId ?? null,
          messageId: data.messageId ?? null,
          missionType: data.missionType as typeof missionReports.$inferInsert.missionType,
          title: data.title,
          coordinates: data.coordinates,
          originCoordinates: data.originCoordinates ?? null,
          fleet: data.fleet,
          departureTime: data.departureTime,
          completionTime: data.completionTime,
          result: data.result,
        })
        .returning();
      return report;
    },

    async list(userId: string, options?: { cursor?: string; limit?: number; missionTypes?: string[] }) {
      const limit = options?.limit ?? 20;
      const conditions = [eq(missionReports.userId, userId)];

      if (options?.cursor) {
        const [cursorReport] = await db
          .select({ createdAt: missionReports.createdAt })
          .from(missionReports)
          .where(eq(missionReports.id, options.cursor))
          .limit(1);
        if (cursorReport) {
          conditions.push(lt(missionReports.createdAt, cursorReport.createdAt));
        }
      }

      if (options?.missionTypes && options.missionTypes.length > 0) {
        conditions.push(
          inArray(missionReports.missionType, options.missionTypes as ['mine' | 'transport' | 'spy' | 'attack' | 'pirate' | 'colonize' | 'recycle' | 'station', ...('mine' | 'transport' | 'spy' | 'attack' | 'pirate' | 'colonize' | 'recycle' | 'station')[]]),
        );
      }

      const reports = await db
        .select()
        .from(missionReports)
        .where(and(...conditions))
        .orderBy(desc(missionReports.createdAt))
        .limit(limit + 1);

      const hasMore = reports.length > limit;
      const results = hasMore ? reports.slice(0, limit) : reports;
      const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

      return { reports: results, nextCursor };
    },

    async getById(userId: string, reportId: string) {
      const [report] = await db
        .select()
        .from(missionReports)
        .where(and(eq(missionReports.id, reportId), eq(missionReports.userId, userId)))
        .limit(1);

      if (report && !report.read) {
        await db
          .update(missionReports)
          .set({ read: true })
          .where(eq(missionReports.id, reportId));
      }

      return report ?? null;
    },

    async getByMessageId(userId: string, messageId: string) {
      const [report] = await db
        .select()
        .from(missionReports)
        .where(and(eq(missionReports.messageId, messageId), eq(missionReports.userId, userId)))
        .limit(1);
      return report ?? null;
    },

    async deleteReport(userId: string, reportId: string) {
      await db
        .delete(missionReports)
        .where(and(eq(missionReports.id, reportId), eq(missionReports.userId, userId)));
      return { success: true };
    },

    async countUnread(userId: string) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(missionReports)
        .where(and(eq(missionReports.userId, userId), eq(missionReports.read, false)));
      return result?.count ?? 0;
    },
  };
}
