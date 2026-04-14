import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetTypes, planetBuildings, planetShips, userResearch, planetBiomes, biomeDefinitions } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  calculateResources,
  calculateProductionRates,
  resolveBonus,
  aggregateBiomeBonuses,
  type ResourceCost,
  type PlanetTypeBonus,
  type BiomeEffect,
} from '@exilium/game-engine';
import { findBuildingByRole, findPlanetTypeByRole } from '../../lib/config-helpers.js';
import { buildProductionConfig } from '../../lib/production-config.js';
import { getGovernancePenalty } from '../../lib/governance.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createDailyQuestService } from '../daily-quest/daily-quest.service.js';

async function loadPlanetTypeBonus(db: Database, planetClassId: string | null): Promise<PlanetTypeBonus | undefined> {
  if (!planetClassId) return undefined;
  const [pt] = await db.select({
    mineraiBonus: planetTypes.mineraiBonus,
    siliciumBonus: planetTypes.siliciumBonus,
    hydrogeneBonus: planetTypes.hydrogeneBonus,
  }).from(planetTypes).where(eq(planetTypes.id, planetClassId)).limit(1);
  return pt ?? undefined;
}

async function getBuildingLevels(db: Database, planetId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
    .from(planetBuildings)
    .where(eq(planetBuildings.planetId, planetId));
  const levels: Record<string, number> = {};
  for (const row of rows) {
    levels[row.buildingId] = row.level;
  }
  return levels;
}

async function getSolarSatelliteCount(db: Database, planetId: string): Promise<number> {
  const [row] = await db
    .select({ solarSatellite: planetShips.solarSatellite })
    .from(planetShips)
    .where(eq(planetShips.planetId, planetId))
    .limit(1);
  return row?.solarSatellite ?? 0;
}

async function loadBiomeBonuses(db: Database, planetId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ effects: biomeDefinitions.effects })
    .from(planetBiomes)
    .innerJoin(biomeDefinitions, eq(biomeDefinitions.id, planetBiomes.biomeId))
    .where(and(eq(planetBiomes.planetId, planetId), eq(planetBiomes.active, true)));

  const allEffects: BiomeEffect[] = rows.flatMap(r => r.effects as BiomeEffect[]);
  return aggregateBiomeBonuses(allEffects);
}

async function buildPlanetLevels(
  db: Database,
  planetId: string,
  planet: {
    maxTemp: number;
    mineraiMinePercent: number;
    siliciumMinePercent: number;
    hydrogeneSynthPercent: number;
    shieldPercent?: number | null;
    planetClassId?: string | null;
  },
  roleMap: {
    producerMinerai: string;
    producerSilicium: string;
    producerHydrogene: string;
    producerEnergy: string;
    storageMinerai: string;
    storageSilicium: string;
    storageHydrogene: string;
    homeworldTypeId: string;
  },
) {
  const [buildingLevels, solarSatelliteCount] = await Promise.all([
    getBuildingLevels(db, planetId),
    getSolarSatelliteCount(db, planetId),
  ]);
  return {
    mineraiMineLevel: buildingLevels[roleMap.producerMinerai] ?? 0,
    siliciumMineLevel: buildingLevels[roleMap.producerSilicium] ?? 0,
    hydrogeneSynthLevel: buildingLevels[roleMap.producerHydrogene] ?? 0,
    solarPlantLevel: buildingLevels[roleMap.producerEnergy] ?? 0,
    storageMineraiLevel: buildingLevels[roleMap.storageMinerai] ?? 0,
    storageSiliciumLevel: buildingLevels[roleMap.storageSilicium] ?? 0,
    storageHydrogeneLevel: buildingLevels[roleMap.storageHydrogene] ?? 0,
    maxTemp: planet.maxTemp,
    solarSatelliteCount,
    isHomePlanet: planet.planetClassId === roleMap.homeworldTypeId,
    mineraiMinePercent: planet.mineraiMinePercent,
    siliciumMinePercent: planet.siliciumMinePercent,
    hydrogeneSynthPercent: planet.hydrogeneSynthPercent,
    planetaryShieldLevel: buildingLevels['planetaryShield'] ?? 0,
    shieldPercent: planet.shieldPercent ?? 100,
  };
}

export function createResourceService(
  db: Database,
  gameConfigService: GameConfigService,
  dailyQuestService?: ReturnType<typeof createDailyQuestService>,
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
) {
  async function getRoleMap() {
    const config = await gameConfigService.getFullConfig();
    return {
      producerMinerai: findBuildingByRole(config, 'producer_minerai').id,
      producerSilicium: findBuildingByRole(config, 'producer_silicium').id,
      producerHydrogene: findBuildingByRole(config, 'producer_hydrogene').id,
      producerEnergy: findBuildingByRole(config, 'producer_energy').id,
      storageMinerai: findBuildingByRole(config, 'storage_minerai').id,
      storageSilicium: findBuildingByRole(config, 'storage_silicium').id,
      storageHydrogene: findBuildingByRole(config, 'storage_hydrogene').id,
      homeworldTypeId: findPlanetTypeByRole(config, 'homeworld').id,
    };
  }

  return {
    async getBuildingLevels(planetId: string): Promise<Record<string, number>> {
      return getBuildingLevels(db, planetId);
    },

    async materializeResources(planetId: string, userId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      if (planet.status === 'colonizing') {
        return planet; // No resource production on colonizing planets
      }

      const bonus = await loadPlanetTypeBonus(db, planet.planetClassId);
      const roleMap = await getRoleMap();
      const levels = await buildPlanetLevels(db, planetId, planet, roleMap);
      const config = await gameConfigService.getFullConfig();
      const prodConfig = buildProductionConfig(config);
      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const biomeBonuses = await loadBiomeBonuses(db, planetId);
      for (const [key, value] of Object.entries(biomeBonuses)) {
        talentCtx[key] = (talentCtx[key] ?? 0) + value;
      }
      levels.planetaryShieldLevel += talentCtx['shield_level_bonus'] ?? 0;

      // Inject production research bonuses into context
      const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, userId)).limit(1);
      if (research) {
        const researchLevels: Record<string, number> = {};
        for (const [key, value] of Object.entries(research)) {
          if (key !== 'userId' && typeof value === 'number') researchLevels[key] = value;
        }
        const mineraiBonus = resolveBonus('production_minerai', null, researchLevels, config.bonuses);
        if (mineraiBonus > 1) talentCtx['production_minerai'] = (talentCtx['production_minerai'] ?? 0) + (mineraiBonus - 1);
        const siliciumBonus = resolveBonus('production_silicium', null, researchLevels, config.bonuses);
        if (siliciumBonus > 1) talentCtx['production_silicium'] = (talentCtx['production_silicium'] ?? 0) + (siliciumBonus - 1);
        const hydrogeneBonus = resolveBonus('production_hydrogene', null, researchLevels, config.bonuses);
        if (hydrogeneBonus > 1) talentCtx['production_hydrogene'] = (talentCtx['production_hydrogene'] ?? 0) + (hydrogeneBonus - 1);
      }

      // Governance harvest penalty (non-homeworld only)
      const govPenalty = await getGovernancePenalty(db, userId, planet.planetClassId, config);
      if (govPenalty.harvestMalus > 0) {
        for (const key of ['production_minerai', 'production_silicium', 'production_hydrogene'] as const) {
          talentCtx[key] = (talentCtx[key] ?? 0) - govPenalty.harvestMalus;
        }
      }

      const now = new Date();
      const resources = calculateResources(
        {
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
          ...levels,
        },
        planet.resourcesUpdatedAt,
        now,
        bonus,
        prodConfig,
        talentCtx,
      );

      const [updated] = await db
        .update(planets)
        .set({
          minerai: String(resources.minerai),
          silicium: String(resources.silicium),
          hydrogene: String(resources.hydrogene),
          resourcesUpdatedAt: now,
        })
        .where(eq(planets.id, planetId))
        .returning();

      // Hook: daily quest detection for resource collection
      const totalCollected = Math.floor(
        (resources.minerai - Number(planet.minerai)) +
        (resources.silicium - Number(planet.silicium)) +
        (resources.hydrogene - Number(planet.hydrogene))
      );
      if (dailyQuestService && totalCollected > 0) {
        await dailyQuestService.processEvent({
          type: 'resources:collected',
          userId,
          payload: { totalCollected },
        }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
      }

      return updated;
    },

    async spendResources(planetId: string, userId: string, cost: ResourceCost) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const bonus = await loadPlanetTypeBonus(db, planet.planetClassId);
      const roleMap = await getRoleMap();
      const levels = await buildPlanetLevels(db, planetId, planet, roleMap);
      const config = await gameConfigService.getFullConfig();
      const prodConfig = buildProductionConfig(config);
      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const biomeBonuses = await loadBiomeBonuses(db, planetId);
      for (const [key, value] of Object.entries(biomeBonuses)) {
        talentCtx[key] = (talentCtx[key] ?? 0) + value;
      }
      levels.planetaryShieldLevel += talentCtx['shield_level_bonus'] ?? 0;

      // Inject production research bonuses into context
      const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, userId)).limit(1);
      if (research) {
        const researchLevels: Record<string, number> = {};
        for (const [key, value] of Object.entries(research)) {
          if (key !== 'userId' && typeof value === 'number') researchLevels[key] = value;
        }
        const mineraiBonus = resolveBonus('production_minerai', null, researchLevels, config.bonuses);
        if (mineraiBonus > 1) talentCtx['production_minerai'] = (talentCtx['production_minerai'] ?? 0) + (mineraiBonus - 1);
        const siliciumBonus = resolveBonus('production_silicium', null, researchLevels, config.bonuses);
        if (siliciumBonus > 1) talentCtx['production_silicium'] = (talentCtx['production_silicium'] ?? 0) + (siliciumBonus - 1);
        const hydrogeneBonus = resolveBonus('production_hydrogene', null, researchLevels, config.bonuses);
        if (hydrogeneBonus > 1) talentCtx['production_hydrogene'] = (talentCtx['production_hydrogene'] ?? 0) + (hydrogeneBonus - 1);
      }

      // Governance harvest penalty (non-homeworld only)
      const govPenalty = await getGovernancePenalty(db, userId, planet.planetClassId, config);
      if (govPenalty.harvestMalus > 0) {
        for (const key of ['production_minerai', 'production_silicium', 'production_hydrogene'] as const) {
          talentCtx[key] = (talentCtx[key] ?? 0) - govPenalty.harvestMalus;
        }
      }

      const now = new Date();
      const produced = calculateResources(
        {
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
          ...levels,
        },
        planet.resourcesUpdatedAt,
        now,
        bonus,
        prodConfig,
        talentCtx,
      );

      if (produced.minerai < cost.minerai || produced.silicium < cost.silicium || produced.hydrogene < cost.hydrogene) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ressources insuffisantes' });
      }

      const [result] = await db
        .update(planets)
        .set({
          minerai: String(produced.minerai - cost.minerai),
          silicium: String(produced.silicium - cost.silicium),
          hydrogene: String(produced.hydrogene - cost.hydrogene),
          resourcesUpdatedAt: now,
        })
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .returning();

      if (!result) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ressources insuffisantes' });
      }

      return result;
    },

    async setProductionPercent(
      planetId: string,
      userId: string,
      percents: { mineraiMinePercent?: number; siliciumMinePercent?: number; hydrogeneSynthPercent?: number },
    ) {
      // Materialize resources first so accumulated production with old % isn't lost
      await this.materializeResources(planetId, userId);

      const updates: Partial<{ mineraiMinePercent: number; siliciumMinePercent: number; hydrogeneSynthPercent: number }> = {};
      if (percents.mineraiMinePercent !== undefined) updates.mineraiMinePercent = percents.mineraiMinePercent;
      if (percents.siliciumMinePercent !== undefined) updates.siliciumMinePercent = percents.siliciumMinePercent;
      if (percents.hydrogeneSynthPercent !== undefined) updates.hydrogeneSynthPercent = percents.hydrogeneSynthPercent;

      if (Object.keys(updates).length === 0) return;

      await db
        .update(planets)
        .set(updates)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)));
    },

    async getProductionRates(planetId: string, planet: {
      maxTemp: number;
      mineraiMinePercent: number;
      siliciumMinePercent: number;
      hydrogeneSynthPercent: number;
      shieldPercent?: number | null;
      planetClassId?: string | null;
      sortOrder?: number;
      status?: string | null;
    }, bonus?: PlanetTypeBonus, userId?: string) {
      if (planet.status === 'colonizing') {
        return {
          mineraiPerHour: 0,
          siliciumPerHour: 0,
          hydrogenePerHour: 0,
          productionFactor: 0,
          energyProduced: 0,
          energyConsumed: 0,
          mineraiMineEnergyConsumption: 0,
          siliciumMineEnergyConsumption: 0,
          hydrogeneSynthEnergyConsumption: 0,
          shieldEnergyConsumption: 0,
          shieldPercent: 0,
          mineraiMinePercent: 0,
          siliciumMinePercent: 0,
          hydrogeneSynthPercent: 0,
          storageMineraiCapacity: 0,
          storageSiliciumCapacity: 0,
          storageHydrogeneCapacity: 0,
          shieldLevelBonus: 0,
        };
      }

      const roleMap = await getRoleMap();
      const levels = await buildPlanetLevels(db, planetId, planet, roleMap);
      const config = await gameConfigService.getFullConfig();
      const prodConfig = buildProductionConfig(config);
      const talentCtx: Record<string, number> = talentService && userId ? await talentService.computeTalentContext(userId, planetId) : {};
      const biomeBonuses = await loadBiomeBonuses(db, planetId);
      for (const [key, value] of Object.entries(biomeBonuses)) {
        talentCtx[key] = (talentCtx[key] ?? 0) + value;
      }

      // Apply shield level bonus from talents
      levels.planetaryShieldLevel += talentCtx['shield_level_bonus'] ?? 0;

      // Inject energy and production research bonuses into context
      if (userId) {
        const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, userId)).limit(1);
        if (research) {
          const researchLevels: Record<string, number> = {};
          for (const [key, value] of Object.entries(research)) {
            if (key !== 'userId' && typeof value === 'number') researchLevels[key] = value;
          }
          const energyMult = resolveBonus('energy_production', null, researchLevels, config.bonuses);
          if (energyMult > 1) talentCtx['energy_production'] = (talentCtx['energy_production'] ?? 0) + (energyMult - 1);
          const energyEfficiency = resolveBonus('energy_consumption', null, researchLevels, config.bonuses);
          if (energyEfficiency < 1) talentCtx['energy_consumption'] = (talentCtx['energy_consumption'] ?? 0) + (energyEfficiency - 1);
          const mineraiBonus = resolveBonus('production_minerai', null, researchLevels, config.bonuses);
          if (mineraiBonus > 1) talentCtx['production_minerai'] = (talentCtx['production_minerai'] ?? 0) + (mineraiBonus - 1);
          const siliciumBonus = resolveBonus('production_silicium', null, researchLevels, config.bonuses);
          if (siliciumBonus > 1) talentCtx['production_silicium'] = (talentCtx['production_silicium'] ?? 0) + (siliciumBonus - 1);
          const hydrogeneBonus = resolveBonus('production_hydrogene', null, researchLevels, config.bonuses);
          if (hydrogeneBonus > 1) talentCtx['production_hydrogene'] = (talentCtx['production_hydrogene'] ?? 0) + (hydrogeneBonus - 1);
        }
      }

      // Governance harvest penalty (non-homeworld only)
      if (userId && planet.sortOrder != null) {
        const govPenalty = await getGovernancePenalty(db, userId, planet.planetClassId ?? null, config);
        if (govPenalty.harvestMalus > 0) {
          for (const key of ['production_minerai', 'production_silicium', 'production_hydrogene'] as const) {
            talentCtx[key] = (talentCtx[key] ?? 0) - govPenalty.harvestMalus;
          }
        }
      }

      const rates = calculateProductionRates(levels, bonus, prodConfig, talentCtx);
      return { ...rates, shieldLevelBonus: talentCtx['shield_level_bonus'] ?? 0 };
    },
  };
}
