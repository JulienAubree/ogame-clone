import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  calculateResources,
  calculateProductionRates,
  type ResourceCost,
} from '@ogame-clone/game-engine';

export function createResourceService(db: Database) {
  return {
    async materializeResources(planetId: string, userId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const now = new Date();
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

      const [updated] = await db
        .update(planets)
        .set({
          metal: String(resources.metal),
          crystal: String(resources.crystal),
          deuterium: String(resources.deuterium),
          resourcesUpdatedAt: now,
        })
        .where(eq(planets.id, planetId))
        .returning();

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

      const now = new Date();
      const produced = calculateResources(
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

      if (produced.metal < cost.metal || produced.crystal < cost.crystal || produced.deuterium < cost.deuterium) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ressources insuffisantes' });
      }

      const [result] = await db
        .update(planets)
        .set({
          metal: String(produced.metal - cost.metal),
          crystal: String(produced.crystal - cost.crystal),
          deuterium: String(produced.deuterium - cost.deuterium),
          resourcesUpdatedAt: now,
        })
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .returning();

      if (!result) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ressources insuffisantes' });
      }

      return result;
    },

    getProductionRates(planet: {
      metalMineLevel: number;
      crystalMineLevel: number;
      deutSynthLevel: number;
      solarPlantLevel: number;
      storageMetalLevel: number;
      storageCrystalLevel: number;
      storageDeutLevel: number;
      maxTemp: number;
    }) {
      return calculateProductionRates(planet);
    },
  };
}
