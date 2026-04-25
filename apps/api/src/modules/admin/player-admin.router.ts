import { z } from 'zod';
import { nonNegativeInt, optionalInt } from '../../lib/zod-schemas.js';
import { router } from '../../trpc/router.js';
import type { PlayerAdminService } from './player-admin.service.js';

export function createPlayerAdminRouter(
  playerAdminService: PlayerAdminService,
  adminProcedure: ReturnType<typeof import('../../trpc/router.js').createAdminProcedure>,
) {
  return router({
    list: adminProcedure
      .input(z.object({
        offset: nonNegativeInt.default(0),
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
        level: nonNegativeInt,
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.updatePlayerBuildingLevel(input.planetId, input.buildingId, input.level);
        return { success: true };
      }),

    updateResearchLevel: adminProcedure
      .input(z.object({
        userId: z.string().uuid(),
        levelColumn: z.string(),
        level: nonNegativeInt,
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

    updateFlagshipStats: adminProcedure
      .input(z.object({
        userId: z.string().uuid(),
        stats: z.object({
          weapons: optionalInt,
          shield: optionalInt,
          hull: optionalInt,
          baseArmor: optionalInt,
          shotCount: optionalInt,
          baseSpeed: optionalInt,
          fuelConsumption: optionalInt,
          cargoCapacity: optionalInt,
          driveType: z.string().optional(),
          combatCategoryId: z.string().optional(),
          status: z.string().optional(),
          name: z.string().optional(),
          description: z.string().optional(),
          flagshipImageIndex: optionalInt,
        }),
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.updateFlagshipStats(input.userId, input.stats);
        return { success: true };
      }),

    repairFlagship: adminProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await playerAdminService.repairFlagship(input.userId);
        return { success: true };
      }),

    setExiliumBalance: adminProcedure
      .input(z.object({
        userId: z.string().uuid(),
        balance: nonNegativeInt,
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.setExiliumBalance(input.userId, input.balance);
        return { success: true };
      }),

    updatePlanetCoordinates: adminProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        galaxy: z.number().int().min(1),
        system: z.number().int().min(1),
        position: z.number().int().min(1),
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.updatePlanetCoordinates(input.planetId, input.galaxy, input.system, input.position);
        return { success: true };
      }),

    setCapital: adminProcedure
      .input(z.object({
        userId: z.string().uuid(),
        planetId: z.string().uuid(),
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.setCapital(input.userId, input.planetId);
        return { success: true };
      }),

    resetFlagshipTalents: adminProcedure
      .input(z.object({ flagshipId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await playerAdminService.resetFlagshipTalents(input.flagshipId);
        return { success: true };
      }),

    updatePlanetShips: adminProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        ships: z.record(z.string(), nonNegativeInt),
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.updatePlanetShips(input.planetId, input.ships);
        return { success: true };
      }),

    updatePlanetDefenses: adminProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        defenses: z.record(z.string(), nonNegativeInt),
      }))
      .mutation(async ({ input }) => {
        await playerAdminService.updatePlanetDefenses(input.planetId, input.defenses);
        return { success: true };
      }),
  });
}
