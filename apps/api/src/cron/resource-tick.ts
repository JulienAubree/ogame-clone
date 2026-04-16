import { eq } from 'drizzle-orm';
import { planets, planetTypes, planetBuildings, planetShips, userResearch } from '@exilium/db';
import type { Database } from '@exilium/db';
import { calculateResources, resolveBonus, calculateGovernancePenalty } from '@exilium/game-engine';
import { findBuildingByRole, findPlanetTypeByRole } from '../lib/config-helpers.js';
import { buildProductionConfig } from '../lib/production-config.js';
import type { GameConfigService } from '../modules/admin/game-config.service.js';

export async function resourceTick(db: Database, gameConfigService: GameConfigService) {
  const now = new Date();
  const allPlanets = await db.select().from(planets);

  // Pre-load all planet types for bonus lookup
  const ptRows = await db.select().from(planetTypes);
  const ptMap = new Map(ptRows.map(pt => [pt.id, { mineraiBonus: pt.mineraiBonus, siliciumBonus: pt.siliciumBonus, hydrogeneBonus: pt.hydrogeneBonus }]));

  // Pre-load all building levels
  const allBuildingRows = await db.select().from(planetBuildings);
  const buildingLevelsMap = new Map<string, Record<string, number>>();
  for (const row of allBuildingRows) {
    if (!buildingLevelsMap.has(row.planetId)) {
      buildingLevelsMap.set(row.planetId, {});
    }
    buildingLevelsMap.get(row.planetId)![row.buildingId] = row.level;
  }

  // Pre-load solar satellite counts
  const allShipRows = await db.select({ planetId: planetShips.planetId, solarSatellite: planetShips.solarSatellite }).from(planetShips);
  const satCountMap = new Map<string, number>();
  for (const row of allShipRows) {
    satCountMap.set(row.planetId, row.solarSatellite);
  }

  // Pre-load user research levels
  const allResearch = await db.select().from(userResearch);
  const researchByUser = new Map<string, Record<string, number>>();
  for (const r of allResearch) {
    const levels: Record<string, number> = {};
    for (const [key, value] of Object.entries(r)) {
      if (key !== 'userId' && typeof value === 'number') levels[key] = value;
    }
    researchByUser.set(r.userId, levels);
  }

  // Resolve building IDs by role
  const config = await gameConfigService.getFullConfig();
  const prodConfig = buildProductionConfig(config);
  const mineraiMineId = findBuildingByRole(config, 'producer_minerai').id;
  const siliciumMineId = findBuildingByRole(config, 'producer_silicium').id;
  const hydrogeneSynthId = findBuildingByRole(config, 'producer_hydrogene').id;
  const solarPlantId = findBuildingByRole(config, 'producer_energy').id;
  const storageMineraiId = findBuildingByRole(config, 'storage_minerai').id;
  const storageSiliciumId = findBuildingByRole(config, 'storage_silicium').id;
  const storageHydrogeneId = findBuildingByRole(config, 'storage_hydrogene').id;
  const homeworldTypeId = findPlanetTypeByRole(config, 'homeworld').id;

  // Pre-compute governance data per user
  const activePlanetCountByUser = new Map<string, number>();
  const ipcLevelByUser = new Map<string, number>();
  for (const planet of allPlanets) {
    if (planet.status === 'active') {
      activePlanetCountByUser.set(planet.userId, (activePlanetCountByUser.get(planet.userId) ?? 0) + 1);
    }
    const ipcLevel = buildingLevelsMap.get(planet.id)?.['imperialPowerCenter'] ?? 0;
    if (ipcLevel > (ipcLevelByUser.get(planet.userId) ?? 0)) {
      ipcLevelByUser.set(planet.userId, ipcLevel);
    }
  }
  const harvestPenalties = (config.universe.governance_penalty_harvest as number[]) ?? [0.15, 0.35, 0.60];
  const constructionPenalties = (config.universe.governance_penalty_construction as number[]) ?? [0.15, 0.35, 0.60];

  let updated = 0;
  for (const planet of allPlanets) {
    const bonus = planet.planetClassId ? ptMap.get(planet.planetClassId) : undefined;
    const buildingLevels = buildingLevelsMap.get(planet.id) ?? {};

    // Build talentBonuses with research production bonuses + governance penalty
    const talentBonuses: Record<string, number> = {};
    const researchLevels = researchByUser.get(planet.userId) ?? {};

    // Research production bonuses
    const mBonus = resolveBonus('production_minerai', null, researchLevels, config.bonuses);
    if (mBonus > 1) talentBonuses['production_minerai'] = mBonus - 1;
    const sBonus = resolveBonus('production_silicium', null, researchLevels, config.bonuses);
    if (sBonus > 1) talentBonuses['production_silicium'] = sBonus - 1;
    const hBonus = resolveBonus('production_hydrogene', null, researchLevels, config.bonuses);
    if (hBonus > 1) talentBonuses['production_hydrogene'] = hBonus - 1;
    const eBonus = resolveBonus('energy_consumption', null, researchLevels, config.bonuses);
    if (eBonus < 1) talentBonuses['energy_consumption'] = eBonus - 1;

    // Governance harvest penalty (homeworld exempt)
    if (planet.planetClassId !== homeworldTypeId) {
      const colonyCount = Math.max(0, (activePlanetCountByUser.get(planet.userId) ?? 1) - 1);
      const capacity = 1 + (ipcLevelByUser.get(planet.userId) ?? 0);
      const penalty = calculateGovernancePenalty(colonyCount, capacity, harvestPenalties, constructionPenalties);
      if (penalty.harvestMalus > 0) {
        talentBonuses['production_minerai'] = (talentBonuses['production_minerai'] ?? 0) - penalty.harvestMalus;
        talentBonuses['production_silicium'] = (talentBonuses['production_silicium'] ?? 0) - penalty.harvestMalus;
        talentBonuses['production_hydrogene'] = (talentBonuses['production_hydrogene'] ?? 0) - penalty.harvestMalus;
      }
    }

    const resources = calculateResources(
      {
        minerai: Number(planet.minerai),
        silicium: Number(planet.silicium),
        hydrogene: Number(planet.hydrogene),
        mineraiMineLevel: buildingLevels[mineraiMineId] ?? 0,
        siliciumMineLevel: buildingLevels[siliciumMineId] ?? 0,
        hydrogeneSynthLevel: buildingLevels[hydrogeneSynthId] ?? 0,
        solarPlantLevel: buildingLevels[solarPlantId] ?? 0,
        storageMineraiLevel: buildingLevels[storageMineraiId] ?? 0,
        storageSiliciumLevel: buildingLevels[storageSiliciumId] ?? 0,
        storageHydrogeneLevel: buildingLevels[storageHydrogeneId] ?? 0,
        maxTemp: planet.maxTemp,
        solarSatelliteCount: satCountMap.get(planet.id) ?? 0,
        isHomePlanet: planet.planetClassId === homeworldTypeId,
        mineraiMinePercent: planet.mineraiMinePercent,
        siliciumMinePercent: planet.siliciumMinePercent,
        hydrogeneSynthPercent: planet.hydrogeneSynthPercent,
      },
      planet.resourcesUpdatedAt,
      now,
      bonus,
      prodConfig,
      talentBonuses,
    );

    await db
      .update(planets)
      .set({
        minerai: String(resources.minerai),
        silicium: String(resources.silicium),
        hydrogene: String(resources.hydrogene),
        resourcesUpdatedAt: now,
      })
      .where(eq(planets.id, planet.id));

    updated++;
  }

  console.log(`[resource-tick] Materialized resources for ${updated} planets`);
}
