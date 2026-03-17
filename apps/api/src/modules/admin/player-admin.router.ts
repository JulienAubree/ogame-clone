import { z } from 'zod';
import { router } from '../../trpc/router.js';
import type { PlayerAdminService } from './player-admin.service.js';

export function createPlayerAdminRouter(
  playerAdminService: PlayerAdminService,
  adminProcedure: ReturnType<typeof import('../../trpc/router.js').createAdminProcedure>,
) {
  return router({
    list: adminProcedure
      .input(z.object({
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return playerAdminService.listPlayers(input.offset, input.limit, input.search);
      }),

    detail: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ input }) => {
        return playerAdminService.getPlayerDetail(input.userId);
      }),

    updateResources: adminProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        minerai: z.string().optional(),
        silicium: z.string().optional(),
        hydrogene: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { planetId, ...resources } = input;
        await playerAdminService.updatePlayerResources(planetId, resources);
        return { success: true };
      }),

    updateBuildingLevel: adminProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        buildingId: z.string(),
        level: z.number().int().min(0),
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.updatePlayerBuildingLevel(input.planetId, input.buildingId, input.level);
        return { success: true };
      }),

    updateResearchLevel: adminProcedure
      .input(z.object({
        userId: z.string().uuid(),
        levelColumn: z.string(),
        level: z.number().int().min(0),
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.updatePlayerResearchLevel(input.userId, input.levelColumn, input.level);
        return { success: true };
      }),

    ban: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await playerAdminService.banPlayer(input.userId);
        return { success: true };
      }),

    unban: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await playerAdminService.unbanPlayer(input.userId);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await playerAdminService.deletePlayer(input.userId);
        return { success: true };
      }),
  });
}
