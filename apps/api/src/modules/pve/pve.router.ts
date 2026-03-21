import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createPveService } from './pve.service.js';
import type { createAsteroidBeltService } from './asteroid-belt.service.js';

export function createPveRouter(
  pveService: ReturnType<typeof createPveService>,
  asteroidBeltService: ReturnType<typeof createAsteroidBeltService>,
) {
  return router({
    getMissions: protectedProcedure.query(async ({ ctx }) => {
      const centerLevel = await pveService.getMissionCenterLevel(ctx.userId!);
      if (centerLevel > 0) {
        await pveService.materializeDiscoveries(ctx.userId!);
      }
      const missions = await pveService.getMissions(ctx.userId!);
      return { missions, centerLevel };
    }),

    getMissionById: protectedProcedure
      .input(z.object({ missionId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return pveService.getMissionById(ctx.userId!, input.missionId);
      }),

    dismissMission: protectedProcedure
      .input(z.object({ missionId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await pveService.dismissMission(ctx.userId!, input.missionId);
        return { success: true };
      }),

    getSystemBelts: protectedProcedure
      .input(z.object({
        galaxy: z.number().int().min(1).max(9),
        system: z.number().int().min(1).max(499),
      }))
      .query(async ({ ctx, input }) => {
        const centerLevel = await pveService.getMissionCenterLevel(ctx.userId!);
        if (centerLevel === 0) return {};
        return asteroidBeltService.getSystemDeposits(input.galaxy, input.system);
      }),
  });
}
