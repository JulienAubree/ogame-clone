import { z } from 'zod';
import { router, publicProcedure } from '../../trpc/router.js';
import type { GameConfigService } from './game-config.service.js';

const weaponProfileSchema = z.object({
  damage: z.number(),
  shots: z.number().int().min(0),
  targetCategory: z.string().min(1),
  rafale: z.object({ category: z.string().min(1), count: z.number().int().min(0) }).optional(),
  hasChainKill: z.boolean().optional(),
});

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

    createBuilding: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        baseCostMinerai: z.number().int().optional(),
        baseCostSilicium: z.number().int().optional(),
        baseCostHydrogene: z.number().int().optional(),
        costFactor: z.number().optional(),
        baseTime: z.number().int().optional(),
        flavorText: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        role: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createBuilding(input);
        return { success: true };
      }),

    deleteBuilding: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteBuilding(input.id);
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
          flavorText: z.string().nullable().optional(),
          categoryId: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
          role: z.string().nullable().optional(),
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

    createResearch: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        baseCostMinerai: z.number().int().optional(),
        baseCostSilicium: z.number().int().optional(),
        baseCostHydrogene: z.number().int().optional(),
        costFactor: z.number().optional(),
        flavorText: z.string().nullable().optional(),
        effectDescription: z.string().nullable().optional(),
        levelColumn: z.string().min(1),
        categoryId: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createResearch(input);
        return { success: true };
      }),

    deleteResearch: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteResearch(input.id);
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
          flavorText: z.string().nullable().optional(),
          effectDescription: z.string().nullable().optional(),
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

    createShip: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        costMinerai: z.number().int().optional(),
        costSilicium: z.number().int().optional(),
        costHydrogene: z.number().int().optional(),
        countColumn: z.string().min(1),
        baseSpeed: z.number().int().optional(),
        fuelConsumption: z.number().int().optional(),
        cargoCapacity: z.number().int().optional(),
        driveType: z.string().optional(),
        weapons: z.number().int().optional(),
        shield: z.number().int().optional(),
        hull: z.number().int().optional(),
        weaponProfiles: z.array(weaponProfileSchema).optional(),
        flavorText: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        role: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createShip(input);
        return { success: true };
      }),

    deleteShip: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteShip(input.id);
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
          hull: z.number().int().optional(),
          weaponProfiles: z.array(weaponProfileSchema).optional(),
          flavorText: z.string().nullable().optional(),
          categoryId: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
          role: z.string().nullable().optional(),
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

    createDefense: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        costMinerai: z.number().int().optional(),
        costSilicium: z.number().int().optional(),
        costHydrogene: z.number().int().optional(),
        countColumn: z.string().min(1),
        weapons: z.number().int().optional(),
        shield: z.number().int().optional(),
        hull: z.number().int().optional(),
        weaponProfiles: z.array(weaponProfileSchema).optional(),
        maxPerPlanet: z.number().int().nullable().optional(),
        flavorText: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createDefense(input);
        return { success: true };
      }),

    deleteDefense: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteDefense(input.id);
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
          hull: z.number().int().optional(),
          weaponProfiles: z.array(weaponProfileSchema).optional(),
          maxPerPlanet: z.number().int().nullable().optional(),
          flavorText: z.string().nullable().optional(),
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

    updateProductionConfig: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          baseProduction: z.number().optional(),
          exponentBase: z.number().optional(),
          energyConsumption: z.number().nullable().optional(),
          storageBase: z.number().nullable().optional(),
          tempCoeffA: z.number().nullable().optional(),
          tempCoeffB: z.number().nullable().optional(),
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

    createPlanetType: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        positions: z.array(z.number().int()),
        mineraiBonus: z.number().optional(),
        siliciumBonus: z.number().optional(),
        hydrogeneBonus: z.number().optional(),
        diameterMin: z.number().int(),
        diameterMax: z.number().int(),
        sortOrder: z.number().int().optional(),
        role: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createPlanetType(input);
        return { success: true };
      }),

    updatePlanetType: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          positions: z.array(z.number().int()).optional(),
          mineraiBonus: z.number().optional(),
          siliciumBonus: z.number().optional(),
          hydrogeneBonus: z.number().optional(),
          diameterMin: z.number().int().optional(),
          diameterMax: z.number().int().optional(),
          sortOrder: z.number().int().optional(),
          role: z.string().nullable().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updatePlanetType(input.id, input.data);
        return { success: true };
      }),

    deletePlanetType: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deletePlanetType(input.id);
        return { success: true };
      }),

    // ── Pirate templates ──

    createPirateTemplate: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        tier: z.enum(['easy', 'medium', 'hard']),
        ships: z.record(z.string(), z.number().int()),
        rewards: z.object({
          minerai: z.number().int(),
          silicium: z.number().int(),
          hydrogene: z.number().int(),
          bonusShips: z.array(z.object({
            shipId: z.string(),
            count: z.number().int(),
            chance: z.number(),
          })),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createPirateTemplate(input);
        return { success: true };
      }),

    updatePirateTemplate: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          tier: z.enum(['easy', 'medium', 'hard']).optional(),
          ships: z.record(z.string(), z.number().int()).optional(),
          rewards: z.object({
            minerai: z.number().int(),
            silicium: z.number().int(),
            hydrogene: z.number().int(),
            bonusShips: z.array(z.object({
              shipId: z.string(),
              count: z.number().int(),
              chance: z.number(),
            })),
          }).optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updatePirateTemplate(input.id, input.data);
        return { success: true };
      }),

    deletePirateTemplate: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deletePirateTemplate(input.id);
        return { success: true };
      }),

    // ── Tutorial quests ──

    createTutorialQuest: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        order: z.number().int(),
        title: z.string().min(1),
        narrativeText: z.string().min(1),
        conditionType: z.enum(['building_level', 'ship_count', 'mission_complete', 'research_level', 'fleet_return']),
        conditionTargetId: z.string().min(1),
        conditionTargetValue: z.number().int(),
        rewardMinerai: z.number().int().optional(),
        rewardSilicium: z.number().int().optional(),
        rewardHydrogene: z.number().int().optional(),
        conditionLabel: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createTutorialQuest(input);
        return { success: true };
      }),

    updateTutorialQuest: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          order: z.number().int().optional(),
          title: z.string().optional(),
          narrativeText: z.string().optional(),
          conditionType: z.enum(['building_level', 'ship_count', 'mission_complete', 'research_level', 'fleet_return']).optional(),
          conditionTargetId: z.string().optional(),
          conditionTargetValue: z.number().int().optional(),
          rewardMinerai: z.number().int().optional(),
          rewardSilicium: z.number().int().optional(),
          rewardHydrogene: z.number().int().optional(),
          conditionLabel: z.string().nullable().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateTutorialQuest(input.id, input.data);
        return { success: true };
      }),

    deleteTutorialQuest: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteTutorialQuest(input.id);
        return { success: true };
      }),

    // ── Bonus definitions ──

    createBonus: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        sourceType: z.enum(['building', 'research']),
        sourceId: z.string().min(1),
        stat: z.string().min(1),
        percentPerLevel: z.number(),
        category: z.string().nullable().optional(),
        statLabel: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createBonus(input);
        return { success: true };
      }),

    updateBonus: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          stat: z.string().optional(),
          percentPerLevel: z.number().optional(),
          category: z.string().nullable().optional(),
          statLabel: z.string().nullable().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateBonus(input.id, input.data);
        return { success: true };
      }),

    deleteBonus: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteBonus(input.id);
        return { success: true };
      }),

    // ── Missions ──

    createMission: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        hint: z.string().optional(),
        buttonLabel: z.string().optional(),
        color: z.string().optional(),
        sortOrder: z.number().int().optional(),
        dangerous: z.boolean().optional(),
        requiredShipRoles: z.array(z.string()).nullable().optional(),
        exclusive: z.boolean().optional(),
        recommendedShipRoles: z.array(z.string()).nullable().optional(),
        requiresPveMission: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createMission(input);
        return { success: true };
      }),

    updateMission: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          label: z.string().min(1).optional(),
          hint: z.string().optional(),
          buttonLabel: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().int().optional(),
          dangerous: z.boolean().optional(),
          requiredShipRoles: z.array(z.string()).nullable().optional(),
          exclusive: z.boolean().optional(),
          recommendedShipRoles: z.array(z.string()).nullable().optional(),
          requiresPveMission: z.boolean().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateMission(input.id, input.data);
        return { success: true };
      }),

    deleteMission: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteMission(input.id);
        return { success: true };
      }),

    // ── Talent Branches ──

    createTalentBranch: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().min(1),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createTalentBranch(input);
        return { success: true };
      }),

    updateTalentBranch: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().int().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateTalentBranch(input.id, input.data);
        return { success: true };
      }),

    deleteTalentBranch: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteTalentBranch(input.id);
        return { success: true };
      }),

    // ── Talents ──

    createTalent: adminProcedure
      .input(z.object({
        id: z.string().min(1),
        branchId: z.string().min(1),
        tier: z.number().int().min(1),
        position: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        maxRanks: z.number().int().min(1).default(1),
        prerequisiteId: z.string().nullable().optional(),
        effectType: z.string().min(1),
        effectParams: z.record(z.unknown()),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createTalent(input);
        return { success: true };
      }),

    updateTalent: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          branchId: z.string().optional(),
          tier: z.number().int().optional(),
          position: z.string().optional(),
          name: z.string().optional(),
          description: z.string().optional(),
          maxRanks: z.number().int().optional(),
          prerequisiteId: z.string().nullable().optional(),
          effectType: z.string().optional(),
          effectParams: z.unknown().optional(),
          sortOrder: z.number().int().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateTalent(input.id, input.data);
        return { success: true };
      }),

    deleteTalent: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteTalent(input.id);
        return { success: true };
      }),

    // ── Labels ──

    createLabel: adminProcedure
      .input(z.object({ key: z.string().min(1), label: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await gameConfigService.createLabel(input);
        return { success: true };
      }),

    updateLabel: adminProcedure
      .input(z.object({ key: z.string(), data: z.object({ label: z.string().min(1) }) }))
      .mutation(async ({ input }) => {
        await gameConfigService.updateLabel(input.key, input.data);
        return { success: true };
      }),

    deleteLabel: adminProcedure
      .input(z.object({ key: z.string() }))
      .mutation(async ({ input }) => {
        await gameConfigService.deleteLabel(input.key);
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
