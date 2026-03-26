import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createPveService } from './pve.service.js';
import type { createAsteroidBeltService } from './asteroid-belt.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';

export function createPveRouter(
  pveService: ReturnType<typeof createPveService>,
  asteroidBeltService: ReturnType<typeof createAsteroidBeltService>,
  gameConfigService: GameConfigService,
) {
  return router({
    getMissions: protectedProcedure.query(async ({ ctx }) => {
      const centerLevel = await pveService.getMissionCenterLevel(ctx.userId!);
      if (centerLevel > 0) {
        await pveService.materializeDiscoveries(ctx.userId!);
      }
      const missions = await pveService.getMissions(ctx.userId!);
      const discoveryState = await pveService.getDiscoveryState(ctx.userId!);
      const config = await gameConfigService.getFullConfig();

      // Build template lookup for pirate missions
      const templateMap = new Map(config.pirateTemplates.map(t => [t.id, t]));

      const enrichedMissions = missions.map(m => {
        if (m.missionType === 'pirate') {
          const params = m.parameters as { templateId?: string };
          const template = params.templateId ? templateMap.get(params.templateId) : undefined;
          return { ...m, enemyShips: template?.ships ?? null };
        }
        return { ...m, enemyShips: null };
      });

      return {
        missions: enrichedMissions,
        centerLevel,
        nextDiscoveryAt: discoveryState?.nextDiscoveryAt?.toISOString() ?? null,
      };
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
