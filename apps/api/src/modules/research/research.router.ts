import { z } from 'zod';
import { idSchema } from '../../lib/zod-schemas.js';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createResearchService } from './research.service.js';

export function createResearchRouter(researchService: ReturnType<typeof createResearchService>) {
  return router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return researchService.listResearch(ctx.userId!);
      }),

    start: protectedProcedure
      .input(z.object({
        researchId: idSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        return researchService.startResearch(ctx.userId!, input.researchId);
      }),

    cancel: protectedProcedure
      .mutation(async ({ ctx }) => {
        return researchService.cancelResearch(ctx.userId!);
      }),
  });
}
