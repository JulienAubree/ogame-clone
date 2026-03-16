import { z } from 'zod';
import { router, publicProcedure } from '../../trpc/router.js';
import type { GameConfigService } from './game-config.service.js';

export function createGameConfigRouter(
  gameConfigService: GameConfigService,
  adminProcedure: ReturnType<typeof import('../../trpc/router.js').createAdminProcedure>,
) {
  const adminRouter = router({
    createCategory: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        entityType: z.enum(['building', 'research', 'ship', 'defense']),
        name: z.string().min(1),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createCategory(input);
        return { success: true };
      }),

    updateCategory: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          sortOrder: z.number().int().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateCategory(input.id, input.data);
        return { success: true };
      }),

    deleteCategory: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteCategory(input.id);
        return { success: true };
      }),

    updateBuilding: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          baseCostMinerai: z.number().int().optional(),
          baseCostSilicium: z.number().int().optional(),
          baseCostHydrogene: z.number().int().optional(),
          costFactor: z.number().optional(),
          baseTime: z.number().int().optional(),
          categoryId: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateBuilding(input.id, input.data);
        return { success: true };
      }),

    updateBuildingPrerequisites: adminProcedure
      .input(z.object({
        buildingId: z.string(),
        prerequisites: z.array(z.object({
          requiredBuildingId: z.string(),
          requiredLevel: z.number().int(),
        })),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateBuildingPrerequisites(input.buildingId, input.prerequisites);
        return { success: true };
      }),

    updateResearch: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          baseCostMinerai: z.number().int().optional(),
          baseCostSilicium: z.number().int().optional(),
          baseCostHydrogene: z.number().int().optional(),
          costFactor: z.number().optional(),
          categoryId: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateResearch(input.id, input.data);
        return { success: true };
      }),

    updateResearchPrerequisites: adminProcedure
      .input(z.object({
        researchId: z.string(),
        prerequisites: z.array(z.object({
          requiredBuildingId: z.string().optional(),
          requiredResearchId: z.string().optional(),
          requiredLevel: z.number().int(),
        })),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateResearchPrerequisites(input.researchId, input.prerequisites);
        return { success: true };
      }),

    updateShip: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          costMinerai: z.number().int().optional(),
          costSilicium: z.number().int().optional(),
          costHydrogene: z.number().int().optional(),
          baseSpeed: z.number().int().optional(),
          fuelConsumption: z.number().int().optional(),
          cargoCapacity: z.number().int().optional(),
          driveType: z.string().optional(),
          weapons: z.number().int().optional(),
          shield: z.number().int().optional(),
          armor: z.number().int().optional(),
          categoryId: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateShip(input.id, input.data);
        return { success: true };
      }),

    updateShipPrerequisites: adminProcedure
      .input(z.object({
        shipId: z.string(),
        prerequisites: z.array(z.object({
          requiredBuildingId: z.string().optional(),
          requiredResearchId: z.string().optional(),
          requiredLevel: z.number().int(),
        })),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateShipPrerequisites(input.shipId, input.prerequisites);
        return { success: true };
      }),

    updateDefense: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          costMinerai: z.number().int().optional(),
          costSilicium: z.number().int().optional(),
          costHydrogene: z.number().int().optional(),
          weapons: z.number().int().optional(),
          shield: z.number().int().optional(),
          armor: z.number().int().optional(),
          maxPerPlanet: z.number().int().nullable().optional(),
          categoryId: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateDefense(input.id, input.data);
        return { success: true };
      }),

    updateDefensePrerequisites: adminProcedure
      .input(z.object({
        defenseId: z.string(),
        prerequisites: z.array(z.object({
          requiredBuildingId: z.string().optional(),
          requiredResearchId: z.string().optional(),
          requiredLevel: z.number().int(),
        })),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateDefensePrerequisites(input.defenseId, input.prerequisites);
        return { success: true };
      }),

    updateRapidFire: adminProcedure
      .input(z.object({
        attackerId: z.string(),
        targetId: z.string(),
        value: z.number().int(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateRapidFire(input.attackerId, input.targetId, input.value);
        return { success: true };
      }),

    updateProductionConfig: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          baseProduction: z.number().optional(),
          exponentBase: z.number().optional(),
          energyConsumption: z.number().nullable().optional(),
          storageBase: z.number().nullable().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateProductionConfig(input.id, input.data);
        return { success: true };
      }),

    updateUniverseConfig: adminProcedure
      .input(z.object({
        key: z.string(),
        value: z.unknown(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateUniverseConfig(input.key, input.value);
        return { success: true };
      }),
  });

  return router({
    getAll: publicProcedure.query(async () => {
      return gameConfigService.getFullConfig();
    }),
    admin: adminRouter,
  });
}
