import { eq } from 'drizzle-orm';
import { planets } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { calculateResources } from '@ogame-clone/game-engine';

export async function resourceTick(db: Database) {
  const now = new Date();
  const allPlanets = await db.select().from(planets);

  let updated = 0;
  for (const planet of allPlanets) {
    const resources = calculateResources(
      {
        metal: Number(planet.metal),
        crystal: Number(planet.crystal),
        deuterium: Number(planet.deuterium),
        metalMineLevel: planet.metalMineLevel,
        crystalMineLevel: planet.crystalMineLevel,
        deutSynthLevel: planet.deutSynthLevel,
        solarPlantLevel: planet.solarPlantLevel,
        storageMetalLevel: planet.storageMetalLevel,
        storageCrystalLevel: planet.storageCrystalLevel,
        storageDeutLevel: planet.storageDeutLevel,
        maxTemp: planet.maxTemp,
      },
      planet.resourcesUpdatedAt,
      now,
    );

    await db
      .update(planets)
      .set({
        metal: String(resources.metal),
        crystal: String(resources.crystal),
        deuterium: String(resources.deuterium),
        resourcesUpdatedAt: now,
      })
      .where(eq(planets.id, planet.id));

    updated++;
  }

  console.log(`[resource-tick] Materialized resources for ${updated} planets`);
}
