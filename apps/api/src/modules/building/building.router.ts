import { z } from 'zod';
import { idSchema } from '../../lib/zod-schemas.js';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createBuildingService } from './building.service.js';

export function createBuildingRouter(buildingService: ReturnType<typeof createBuildingService>) {
  return router({
    list: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return buildingService.listBuildings(ctx.userId!, input.planetId);
      }),

    upgrade: protectedProcedure
      .input(
        z.object({
          planetId: z.string().uuid(),
          buildingId: idSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return buildingService.startUpgrade(
          ctx.userId!,
          input.planetId,
          input.buildingId,
        );
      }),

    cancel: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return buildingService.cancelUpgrade(ctx.userId!, input.planetId);
      }),
  });
}
