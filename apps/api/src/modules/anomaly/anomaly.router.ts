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
        ships: z.record(z.string(), z.number().int().min(0)).optional().default({}),
        tier: z.number().int().min(1).max(1000).default(1),  // V5-Tiers
      }))
      .mutation(async ({ ctx, input }) => {
        return anomalyService.engage(ctx.userId!, { ships: input.ships ?? {}, tier: input.tier });
      }),

    advance: protectedProcedure.mutation(async ({ ctx }) => {
      return anomalyService.advance(ctx.userId!);
    }),

    resolveEvent: protectedProcedure
      .input(z.object({ choiceIndex: z.number().int().min(0).max(2) }))
      .mutation(async ({ ctx, input }) => {
        return anomalyService.resolveEvent(ctx.userId!, input);
      }),

    retreat: protectedProcedure.mutation(async ({ ctx }) => {
      return anomalyService.retreat(ctx.userId!);
    }),

    activateEpic: protectedProcedure
      .input(z.object({ hullId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return anomalyService.activateEpic(ctx.userId!, input.hullId);
      }),

    useRepairCharge: protectedProcedure.mutation(async ({ ctx }) => {
      return anomalyService.useRepairCharge(ctx.userId!);
    }),

    history: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
      .query(async ({ ctx, input }) => {
        return anomalyService.history(ctx.userId!, input?.limit);
      }),

    leaderboard: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
      .query(async ({ input }) => {
        return anomalyService.getLeaderboard(input?.limit ?? 50);
      }),
  });
}
