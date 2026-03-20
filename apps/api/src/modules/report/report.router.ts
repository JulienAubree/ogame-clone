import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createReportService } from './report.service.js';

const missionTypeEnum = z.enum(['mine', 'transport', 'spy', 'attack', 'pirate', 'colonize', 'recycle', 'station']);

export function createReportRouter(reportService: ReturnType<typeof createReportService>) {
  return router({
    list: protectedProcedure
      .input(z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        missionTypes: z.array(missionTypeEnum).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return reportService.list(ctx.userId!, {
          cursor: input?.cursor,
          limit: input?.limit,
          missionTypes: input?.missionTypes,
        });
      }),

    detail: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return reportService.getById(ctx.userId!, input.id);
      }),

    byMessage: protectedProcedure
      .input(z.object({ messageId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return reportService.getByMessageId(ctx.userId!, input.messageId);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return reportService.deleteReport(ctx.userId!, input.id);
      }),

    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        const count = await reportService.countUnread(ctx.userId!);
        return { count };
      }),
  });
}
