import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetBuildings } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  calculateMaxTemp,
  calculateMinTemp,
  calculateDiameter,
  calculateMaxFields,
} from '@ogame-clone/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';
import { getRandomPlanetImageIndex } from '../../lib/planet-image.util.js';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createPlanetService(db: Database, gameConfigService: GameConfigService, assetsDir: string) {
  return {
    async createHomePlanet(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const universe = config.universe;

      const galaxies = Number(universe.galaxies) || 9;
      const systems = Number(universe.systems) || 499;

      const galaxy = randomInt(1, galaxies);
      const system = randomInt(1, systems);
      const position = randomInt(4, 12);

      const randomOffset = randomInt(-20, 20);
      const maxTemp = calculateMaxTemp(position, randomOffset);
      const minTemp = calculateMinTemp(maxTemp);
      const diameter = 12000;
      const maxFields = calculateMaxFields(diameter);

      const startingMinerai = Number(universe.startingMinerai) ?? 500;
      const startingSilicium = Number(universe.startingSilicium) ?? 300;
      const startingHydrogene = Number(universe.startingHydrogene) ?? 100;

      const [planet] = await db
        .insert(planets)
        .values({
          userId,
          name: 'Homeworld',
          galaxy,
          system,
          position,
          planetType: 'planet',
          planetClassId: 'homeworld',
          diameter,
          maxFields,
          minTemp,
          maxTemp,
          minerai: String(startingMinerai),
          silicium: String(startingSilicium),
          hydrogene: String(startingHydrogene),
          planetImageIndex: getRandomPlanetImageIndex('homeworld', assetsDir),
        })
        .returning();

      // Initialize building levels at 0 for all buildings
      const buildingIds = Object.keys(config.buildings);
      if (buildingIds.length > 0) {
        await db.insert(planetBuildings).values(
          buildingIds.map((buildingId) => ({
            planetId: planet.id,
            buildingId,
            level: 0,
          })),
        );
      }

      return planet;
    },

    async listPlanets(userId: string) {
      return db
        .select()
        .from(planets)
        .where(eq(planets.userId, userId))
        .orderBy(asc(planets.createdAt));
    },

    async getPlanet(userId: string, planetId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, planetId))
        .limit(1);

      if (!planet || planet.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return planet;
    },

    async rename(userId: string, planetId: string, name: string) {
      const planet = await this.getPlanet(userId, planetId);
      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });
      if (planet.renamed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Planète déjà renommée' });

      await db
        .update(planets)
        .set({ name, renamed: true })
        .where(eq(planets.id, planetId));

      return { ok: true };
    },
  };
}
