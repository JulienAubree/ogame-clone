import { eq, and } from 'drizzle-orm';
import { planets, users, debrisFields, allianceMembers, alliances } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import type { GameConfigService } from '../admin/game-config.service.js';

export function createGalaxyService(db: Database, gameConfigService: GameConfigService) {
  return {
    async getSystem(galaxy: number, system: number, _currentUserId?: string) {
      const config = await gameConfigService.getFullConfig();
      const positions = Number(config.universe.positions) || 16;
      const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];

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

      const slots: (typeof systemPlanets[number] | { type: 'belt'; position: number } | null)[] = Array(positions).fill(null);

      // Mark belt positions
      for (const pos of beltPositions) {
        slots[pos - 1] = { type: 'belt', position: pos };
      }

      for (const planet of systemPlanets) {
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
