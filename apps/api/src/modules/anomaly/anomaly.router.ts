import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createAnomalyService } from './anomaly.service.js';

export function createAnomalyRouter(anomalyService: ReturnType<typeof createAnomalyService>) {
  return router({
    current: protectedProcedure.query(async ({ ctx }) => {
      return anomalyService.current(ctx.userId!);
    }),

    engage: protectedProcedure
      .input(z.object({
        ships: z.record(z.string(), z.number().int().min(0)),
      }))
      .mutation(async ({ ctx, input }) => {
        return anomalyService.engage(ctx.userId!, input);
      }),

    advance: protectedProcedure.mutation(async ({ ctx }) => {
      return anomalyService.advance(ctx.userId!);
    }),

    retreat: protectedProcedure.mutation(async ({ ctx }) => {
      return anomalyService.retreat(ctx.userId!);
    }),

    history: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
      .query(async ({ ctx, input }) => {
        return anomalyService.history(ctx.userId!, input?.limit);
      }),
  });
}
