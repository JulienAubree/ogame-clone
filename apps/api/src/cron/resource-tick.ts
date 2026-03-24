import { eq } from 'drizzle-orm';
import { planets, planetTypes, planetBuildings, planetShips } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { calculateResources } from '@ogame-clone/game-engine';
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

  let updated = 0;
  for (const planet of allPlanets) {
    const bonus = planet.planetClassId ? ptMap.get(planet.planetClassId) : undefined;
    const buildingLevels = buildingLevelsMap.get(planet.id) ?? {};
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
