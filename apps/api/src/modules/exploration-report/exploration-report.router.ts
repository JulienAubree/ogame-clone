import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createExplorationReportService } from './exploration-report.service.js';

export function createExplorationReportRouter(
  reportService: ReturnType<typeof createExplorationReportService>,
) {
  return router({
    create: protectedProcedure
      .input(
        z.object({
          planetId: z.string().uuid(),
          galaxy: z.number().int(),
          system: z.number().int(),
          position: z.number().int(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return reportService.create(ctx.userId!, input.planetId, input);
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return reportService.list(ctx.userId!);
    }),

    remove: protectedProcedure
      .input(z.object({ reportId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return reportService.remove(input.reportId, ctx.userId!);
      }),

    canCreate: protectedProcedure
      .input(
        z.object({
          galaxy: z.number().int(),
          system: z.number().int(),
          position: z.number().int(),
        }),
      )
      .query(async ({ ctx, input }) => {
        return reportService.canCreate(ctx.userId!, input);
      }),
  });
}
