import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFlagshipService } from './flagship.service.js';
import type { createTutorialService } from '../tutorial/tutorial.service.js';

export function createFlagshipRouter(
  flagshipService: ReturnType<typeof createFlagshipService>,
  tutorialService: ReturnType<typeof createTutorialService>,
) {
  return router({
    get: protectedProcedure
      .query(async ({ ctx }) => {
        return flagshipService.get(ctx.userId!);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(2).max(32),
        description: z.string().max(256).optional(),
        hullId: z.enum(['combat', 'industrial', 'scientific']),
      }))
      .mutation(async ({ ctx, input }) => {
        const flagship = await flagshipService.create(ctx.userId!, input.name, input.hullId, input.description);

        // Declencher la completion du tutoriel
        const tutorialResult = await tutorialService.checkAndComplete(ctx.userId!, {
          type: 'flagship_named',
          targetId: 'any',
          targetValue: 1,
        });

        return { flagship, tutorialResult };
      }),

    rename: protectedProcedure
      .input(z.object({
        name: z.string().min(2).max(32),
        description: z.string().max(256).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return flagshipService.rename(ctx.userId!, input.name, input.description);
      }),

    repair: protectedProcedure
      .mutation(async ({ ctx }) => {
        return flagshipService.repair(ctx.userId!);
      }),

    listImages: protectedProcedure
      .input(z.object({ hullId: z.string() }))
      .query(async ({ input }) => {
        return flagshipService.listImages(input.hullId);
      }),

    updateImage: protectedProcedure
      .input(z.object({ imageIndex: z.number().int().min(1) }))
      .mutation(async ({ ctx, input }) => {
        return flagshipService.updateImage(ctx.userId!, input.imageIndex);
      }),

    changeHull: protectedProcedure
      .input(z.object({
        hullId: z.enum(['combat', 'industrial', 'scientific']),
      }))
      .mutation(async ({ ctx, input }) => {
        return flagshipService.changeHull(ctx.userId!, input.hullId);
      }),
  });
}
