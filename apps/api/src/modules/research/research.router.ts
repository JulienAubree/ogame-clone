import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createResearchService } from './research.service.js';
import type { ResearchId } from '@ogame-clone/game-engine';

const researchIds = [
  'espionageTech', 'computerTech', 'energyTech',
  'combustion', 'impulse', 'hyperspaceDrive',
  'weapons', 'shielding', 'armor', 'rockFracturing',
  'deepSpaceRefining',
] as const;

export function createResearchRouter(researchService: ReturnType<typeof createResearchService>) {
  return router({
    list: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return researchService.listResearch(ctx.userId!, input.planetId);
      }),

    start: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        researchId: z.enum(researchIds),
      }))
      .mutation(async ({ ctx, input }) => {
        return researchService.startResearch(ctx.userId!, input.planetId, input.researchId as ResearchId);
      }),

    cancel: protectedProcedure
      .mutation(async ({ ctx }) => {
        return researchService.cancelResearch(ctx.userId!);
      }),
  });
}
