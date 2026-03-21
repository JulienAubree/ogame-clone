import { eq } from 'drizzle-orm';
import { planets, planetTypes, planetBuildings, planetShips } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { calculateResources } from '@ogame-clone/game-engine';

export async function resourceTick(db: Database) {
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

  let updated = 0;
  for (const planet of allPlanets) {
    const bonus = planet.planetClassId ? ptMap.get(planet.planetClassId) : undefined;
    const buildingLevels = buildingLevelsMap.get(planet.id) ?? {};
    const resources = calculateResources(
      {
        minerai: Number(planet.minerai),
        silicium: Number(planet.silicium),
        hydrogene: Number(planet.hydrogene),
        mineraiMineLevel: buildingLevels['mineraiMine'] ?? 0,
        siliciumMineLevel: buildingLevels['siliciumMine'] ?? 0,
        hydrogeneSynthLevel: buildingLevels['hydrogeneSynth'] ?? 0,
        solarPlantLevel: buildingLevels['solarPlant'] ?? 0,
        storageMineraiLevel: buildingLevels['storageMinerai'] ?? 0,
        storageSiliciumLevel: buildingLevels['storageSilicium'] ?? 0,
        storageHydrogeneLevel: buildingLevels['storageHydrogene'] ?? 0,
        maxTemp: planet.maxTemp,
        solarSatelliteCount: satCountMap.get(planet.id) ?? 0,
        isHomePlanet: planet.planetClassId === 'homeworld',
        mineraiMinePercent: planet.mineraiMinePercent,
        siliciumMinePercent: planet.siliciumMinePercent,
        hydrogeneSynthPercent: planet.hydrogeneSynthPercent,
      },
      planet.resourcesUpdatedAt,
      now,
      bonus,
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
