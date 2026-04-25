import { z } from 'zod';
import { router, publicProcedure } from '../../trpc/router.js';
import type { GameConfigService } from './game-config.service.js';
import {
  idSchema,
  nonEmptyString,
  optionalInt,
  optionalNullableString,
  optionalNullableInt,
  weaponProfileSchema,
} from '../../lib/zod-schemas.js';

export function createGameConfigRouter(
  gameConfigService: GameConfigService,
  adminProcedure: ReturnType<typeof import('../../trpc/router.js').createAdminProcedure>,
) {
  const adminRouter = router({
    createCategory: adminProcedure
      .input(z.object({
        id: nonEmptyString,
        entityType: z.enum(['building', 'research', 'ship', 'defense']),
        name: nonEmptyString,
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
          sortOrder: optionalInt,
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
        id: nonEmptyString,
        name: nonEmptyString,
        description: z.string().optional(),
        baseCostMinerai: optionalInt,
        baseCostSilicium: optionalInt,
        baseCostHydrogene: optionalInt,
        costFactor: z.number().optional(),
        baseTime: optionalInt,
        flavorText: optionalNullableString,
        categoryId: optionalNullableString,
        sortOrder: optionalInt,
        role: optionalNullableString,
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
          baseCostMinerai: optionalInt,
          baseCostSilicium: optionalInt,
          baseCostHydrogene: optionalInt,
          costFactor: z.number().optional(),
          baseTime: optionalInt,
          flavorText: optionalNullableString,
          categoryId: optionalNullableString,
          sortOrder: optionalInt,
          role: optionalNullableString,
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
        id: nonEmptyString,
        name: nonEmptyString,
        description: z.string().optional(),
        baseCostMinerai: optionalInt,
        baseCostSilicium: optionalInt,
        baseCostHydrogene: optionalInt,
        costFactor: z.number().optional(),
        flavorText: optionalNullableString,
        effectDescription: optionalNullableString,
        levelColumn: nonEmptyString,
        categoryId: optionalNullableString,
        sortOrder: optionalInt,
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
          baseCostMinerai: optionalInt,
          baseCostSilicium: optionalInt,
          baseCostHydrogene: optionalInt,
          costFactor: z.number().optional(),
          flavorText: optionalNullableString,
          effectDescription: optionalNullableString,
          categoryId: optionalNullableString,
          sortOrder: optionalInt,
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
        id: nonEmptyString,
        name: nonEmptyString,
        description: z.string().optional(),
        costMinerai: optionalInt,
        costSilicium: optionalInt,
        costHydrogene: optionalInt,
        countColumn: nonEmptyString,
        baseSpeed: optionalInt,
        fuelConsumption: optionalInt,
        cargoCapacity: optionalInt,
        driveType: z.string().optional(),
        weapons: optionalInt,
        shield: optionalInt,
        hull: optionalInt,
        weaponProfiles: z.array(weaponProfileSchema).optional(),
        flavorText: optionalNullableString,
        categoryId: optionalNullableString,
        sortOrder: optionalInt,
        role: optionalNullableString,
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
          costMinerai: optionalInt,
          costSilicium: optionalInt,
          costHydrogene: optionalInt,
          baseSpeed: optionalInt,
          fuelConsumption: optionalInt,
          cargoCapacity: optionalInt,
          driveType: z.string().optional(),
          weapons: optionalInt,
          shield: optionalInt,
          hull: optionalInt,
          weaponProfiles: z.array(weaponProfileSchema).optional(),
          flavorText: optionalNullableString,
          categoryId: optionalNullableString,
          sortOrder: optionalInt,
          role: optionalNullableString,
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
        id: nonEmptyString,
        name: nonEmptyString,
        description: z.string().optional(),
        costMinerai: optionalInt,
        costSilicium: optionalInt,
        costHydrogene: optionalInt,
        countColumn: nonEmptyString,
        weapons: optionalInt,
        shield: optionalInt,
        hull: optionalInt,
        weaponProfiles: z.array(weaponProfileSchema).optional(),
        maxPerPlanet: optionalNullableInt,
        flavorText: optionalNullableString,
        categoryId: optionalNullableString,
        sortOrder: optionalInt,
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
          costMinerai: optionalInt,
          costSilicium: optionalInt,
          costHydrogene: optionalInt,
          weapons: optionalInt,
          shield: optionalInt,
          hull: optionalInt,
          weaponProfiles: z.array(weaponProfileSchema).optional(),
          maxPerPlanet: optionalNullableInt,
          flavorText: optionalNullableString,
          categoryId: optionalNullableString,
          sortOrder: optionalInt,
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
        id: nonEmptyString,
        name: nonEmptyString,
        description: z.string().optional(),
        positions: z.array(z.number().int()),
        mineraiBonus: z.number().optional(),
        siliciumBonus: z.number().optional(),
        hydrogeneBonus: z.number().optional(),
        diameterMin: z.number().int(),
        diameterMax: z.number().int(),
        sortOrder: optionalInt,
        role: optionalNullableString,
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
          diameterMin: optionalInt,
          diameterMax: optionalInt,
          sortOrder: optionalInt,
          role: optionalNullableString,
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
        id: nonEmptyString,
        name: nonEmptyString,
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
        id: nonEmptyString,
        order: z.number().int(),
        title: nonEmptyString,
        narrativeText: nonEmptyString,
        conditionType: z.enum(['building_level', 'ship_count', 'mission_complete', 'research_level', 'fleet_return']),
        conditionTargetId: nonEmptyString,
        conditionTargetValue: z.number().int(),
        rewardMinerai: optionalInt,
        rewardSilicium: optionalInt,
        rewardHydrogene: optionalInt,
        conditionLabel: optionalNullableString,
      }))
      .mutation(async ({ input }) => {
        await gameConfigService.createTutorialQuest(input);
        return { success: true };
      }),

    updateTutorialQuest: adminProcedure
      .input(z.object({
        id: z.string(),
        data: z.object({
          order: optionalInt,
          title: z.string().optional(),
          narrativeText: z.string().optional(),
          conditionType: z.enum(['building_level', 'ship_count', 'mission_complete', 'research_level', 'fleet_return']).optional(),
          conditionTargetId: z.string().optional(),
          conditionTargetValue: optionalInt,
          rewardMinerai: optionalInt,
          rewardSilicium: optionalInt,
          rewardHydrogene: optionalInt,
          conditionLabel: optionalNullableString,
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
        id: nonEmptyString,
        sourceType: z.enum(['building', 'research']),
        sourceId: nonEmptyString,
        stat: nonEmptyString,
        percentPerLevel: z.number(),
        category: optionalNullableString,
        statLabel: optionalNullableString,
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
          category: optionalNullableString,
          statLabel: optionalNullableString,
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
        id: nonEmptyString,
        label: nonEmptyString,
        hint: z.string().optional(),
        buttonLabel: z.string().optional(),
        color: z.string().optional(),
        sortOrder: optionalInt,
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
          label: nonEmptyString.optional(),
          hint: z.string().optional(),
          buttonLabel: z.string().optional(),
          color: z.string().optional(),
          sortOrder: optionalInt,
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
        id: nonEmptyString,
        name: nonEmptyString,
        description: z.string().optional(),
        color: nonEmptyString,
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
          sortOrder: optionalInt,
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
        id: nonEmptyString,
        branchId: nonEmptyString,
        tier: z.number().int().min(1),
        position: nonEmptyString,
        name: nonEmptyString,
        description: z.string().optional(),
        maxRanks: z.number().int().min(1).default(1),
        prerequisiteId: optionalNullableString,
        effectType: nonEmptyString,
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
          tier: optionalInt,
          position: z.string().optional(),
          name: z.string().optional(),
          description: z.string().optional(),
          maxRanks: optionalInt,
          prerequisiteId: optionalNullableString,
          effectType: z.string().optional(),
          effectParams: z.unknown().optional(),
          sortOrder: optionalInt,
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
      .input(z.object({ key: nonEmptyString, label: nonEmptyString }))
      .mutation(async ({ input }) => {
        await gameConfigService.createLabel(input);
        return { success: true };
      }),

    updateLabel: adminProcedure
      .input(z.object({ key: z.string(), data: z.object({ label: nonEmptyString }) }))
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
