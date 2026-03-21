import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetTypes, planetBuildings, planetShips } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  calculateResources,
  calculateProductionRates,
  type ResourceCost,
  type PlanetTypeBonus,
} from '@ogame-clone/game-engine';

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

async function buildPlanetLevels(db: Database, planetId: string, planet: {
  maxTemp: number;
  mineraiMinePercent: number;
  siliciumMinePercent: number;
  hydrogeneSynthPercent: number;
  planetClassId?: string | null;
}) {
  const [buildingLevels, solarSatelliteCount] = await Promise.all([
    getBuildingLevels(db, planetId),
    getSolarSatelliteCount(db, planetId),
  ]);
  return {
    mineraiMineLevel: buildingLevels['mineraiMine'] ?? 0,
    siliciumMineLevel: buildingLevels['siliciumMine'] ?? 0,
    hydrogeneSynthLevel: buildingLevels['hydrogeneSynth'] ?? 0,
    solarPlantLevel: buildingLevels['solarPlant'] ?? 0,
    storageMineraiLevel: buildingLevels['storageMinerai'] ?? 0,
    storageSiliciumLevel: buildingLevels['storageSilicium'] ?? 0,
    storageHydrogeneLevel: buildingLevels['storageHydrogene'] ?? 0,
    maxTemp: planet.maxTemp,
    solarSatelliteCount,
    isHomePlanet: planet.planetClassId === 'homeworld',
    mineraiMinePercent: planet.mineraiMinePercent,
    siliciumMinePercent: planet.siliciumMinePercent,
    hydrogeneSynthPercent: planet.hydrogeneSynthPercent,
  };
}

export function createResourceService(db: Database) {
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

      const bonus = await loadPlanetTypeBonus(db, planet.planetClassId);
      const levels = await buildPlanetLevels(db, planetId, planet);

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
      const levels = await buildPlanetLevels(db, planetId, planet);

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
      planetClassId?: string | null;
    }, bonus?: PlanetTypeBonus) {
      const levels = await buildPlanetLevels(db, planetId, planet);
      return calculateProductionRates(levels, bonus);
    },
  };
}
