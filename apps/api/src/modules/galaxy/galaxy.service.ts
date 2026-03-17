import { eq, and } from 'drizzle-orm';
import { planets, users, debrisFields, allianceMembers, alliances } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { BELT_POSITIONS } from '../universe/universe.config.js';

export function createGalaxyService(db: Database) {
  return {
    async getSystem(galaxy: number, system: number, currentUserId?: string) {
      const systemPlanets = await db
        .select({
          position: planets.position,
          planetId: planets.id,
          planetName: planets.name,
          planetType: planets.planetType,
          userId: planets.userId,
          username: users.username,
          allianceTag: alliances.tag,
          planetClassId: planets.planetClassId,
        })
        .from(planets)
        .leftJoin(users, eq(users.id, planets.userId))
        .leftJoin(allianceMembers, eq(allianceMembers.userId, planets.userId))
        .leftJoin(alliances, eq(alliances.id, allianceMembers.allianceId))
        .where(and(eq(planets.galaxy, galaxy), eq(planets.system, system)));

      const slots: (typeof systemPlanets[number] | { type: 'belt'; position: number } | null)[] = Array(16).fill(null);

      // Mark belt positions
      for (const pos of BELT_POSITIONS) {
        slots[pos - 1] = { type: 'belt', position: pos };
      }

      for (const planet of systemPlanets) {
        // Only show planetClassId for the current user's own planets
        if (planet.userId !== currentUserId) {
          planet.planetClassId = null;
        }
        slots[planet.position - 1] = planet;
      }

      const debris = await db
        .select()
        .from(debrisFields)
        .where(
          and(
            eq(debrisFields.galaxy, galaxy),
            eq(debrisFields.system, system),
          ),
        );

      for (const d of debris) {
        const slot = slots[d.position - 1];
        if (slot) {
          (slot as any).debris = { minerai: Number(d.minerai), silicium: Number(d.silicium) };
        }
      }

      return { galaxy, system, slots };
    },
  };
}
