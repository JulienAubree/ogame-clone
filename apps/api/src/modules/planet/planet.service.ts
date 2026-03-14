import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  calculateMaxTemp,
  calculateMinTemp,
  calculateDiameter,
  calculateMaxFields,
} from '@ogame-clone/game-engine';
import { UNIVERSE_CONFIG } from '../universe/universe.config.js';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createPlanetService(db: Database) {
  return {
    async createHomePlanet(userId: string) {
      const galaxy = randomInt(1, UNIVERSE_CONFIG.galaxies);
      const system = randomInt(1, UNIVERSE_CONFIG.systems);
      const position = randomInt(4, 12);

      const randomOffset = randomInt(-20, 20);
      const maxTemp = calculateMaxTemp(position, randomOffset);
      const minTemp = calculateMinTemp(maxTemp);
      const diameter = calculateDiameter(position, Math.random());
      const maxFields = calculateMaxFields(diameter);

      const [planet] = await db
        .insert(planets)
        .values({
          userId,
          name: 'Homeworld',
          galaxy,
          system,
          position,
          planetType: 'planet',
          diameter,
          maxFields,
          minTemp,
          maxTemp,
        })
        .returning();

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

      await db
        .update(planets)
        .set({ name })
        .where(eq(planets.id, planetId));

      return { ok: true };
    },
  };
}
