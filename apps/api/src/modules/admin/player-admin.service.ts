import { eq, and, like, or, sql, count, inArray } from 'drizzle-orm';
import { users, planets, userResearch, planetShips, planetDefenses, rankings, planetBuildings, flagships, userExilium, flagshipTalents, fleetEvents } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { Queue } from 'bullmq';

export function createPlayerAdminService(db: Database, fleetQueue?: Queue) {
  return {
    async listPlayers(offset: number, limit: number, search?: string) {
      const conditions = search
        ? or(
            like(users.username, `%${search}%`),
            like(users.email, `%${search}%`),
          )
        : undefined;

      const [playerRows, [countResult]] = await Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            username: users.username,
            isAdmin: users.isAdmin,
            bannedAt: users.bannedAt,
            createdAt: users.createdAt,
            planetsCount: sql<number>`count(distinct ${planets.id})`.as('planets_count'),
            totalPoints: rankings.totalPoints,
            rank: rankings.rank,
          })
          .from(users)
          .leftJoin(planets, eq(planets.userId, users.id))
          .leftJoin(rankings, eq(rankings.userId, users.id))
          .where(conditions)
          .groupBy(users.id, rankings.totalPoints, rankings.rank)
          .orderBy(users.createdAt)
          .offset(offset)
          .limit(limit),
        db
          .select({ total: count() })
          .from(users)
          .where(conditions),
      ]);

      return { players: playerRows, total: countResult?.total ?? 0 };
    },

    async getPlayerDetail(userId: string) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return null;

      const [playerPlanets, research, ranking] = await Promise.all([
        db.select().from(planets).where(eq(planets.userId, userId)),
        db.select().from(userResearch).where(eq(userResearch.userId, userId)),
        db.select().from(rankings).where(eq(rankings.userId, userId)),
      ]);

      // Load ships, defenses, and building levels for each planet
      const planetsWithUnits = await Promise.all(
        playerPlanets.map(async (planet) => {
          const [ships, defenses, buildingRows] = await Promise.all([
            db.select().from(planetShips).where(eq(planetShips.planetId, planet.id)),
            db.select().from(planetDefenses).where(eq(planetDefenses.planetId, planet.id)),
            db.select().from(planetBuildings).where(eq(planetBuildings.planetId, planet.id)),
          ]);
          const buildingLevels: Record<string, number> = {};
          for (const row of buildingRows) {
            buildingLevels[row.buildingId] = row.level;
          }
          return { ...planet, ships: ships[0] ?? null, defenses: defenses[0] ?? null, buildingLevels };
        })
      );

      // Load flagship, exilium balance, and talents
      const [flagshipRow] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
      const [exiliumRow] = await db.select().from(userExilium).where(eq(userExilium.userId, userId)).limit(1);
      const talentRows = flagshipRow
        ? await db.select().from(flagshipTalents).where(eq(flagshipTalents.flagshipId, flagshipRow.id))
        : [];

      return {
        user: { id: user.id, email: user.email, username: user.username, isAdmin: user.isAdmin, bannedAt: user.bannedAt, createdAt: user.createdAt },
        planets: planetsWithUnits,
        research: research[0] ?? null,
        ranking: ranking[0] ?? null,
        flagship: flagshipRow ?? null,
        exilium: exiliumRow ?? null,
        flagshipTalents: talentRows,
      };
    },

    async updatePlayerResources(planetId: string, resources: { minerai?: string; silicium?: string; hydrogene?: string }) {
      await db.update(planets).set(resources).where(eq(planets.id, planetId));
    },

    async updatePlayerBuildingLevel(planetId: string, buildingId: string, level: number) {
      await db
        .insert(planetBuildings)
        .values({ planetId, buildingId, level })
        .onConflictDoUpdate({
          target: [planetBuildings.planetId, planetBuildings.buildingId],
          set: { level },
        });
    },

    async updatePlayerResearchLevel(userId: string, levelColumn: string, level: number) {
      await db.update(userResearch).set({ [levelColumn]: level }).where(eq(userResearch.userId, userId));
    },

    async banPlayer(userId: string) {
      await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, userId));
    },

    async unbanPlayer(userId: string) {
      await db.update(users).set({ bannedAt: null }).where(eq(users.id, userId));
    },

    async deletePlayer(userId: string) {
      await db.delete(users).where(eq(users.id, userId));
    },

    async updateFlagshipStats(userId: string, stats: Partial<{
      weapons: number; shield: number; hull: number; baseArmor: number;
      shotCount: number; baseSpeed: number; fuelConsumption: number;
      cargoCapacity: number; driveType: string; combatCategoryId: string;
      status: string; name: string; description: string; flagshipImageIndex: number;
    }>) {
      await db.update(flagships).set({ ...stats, updatedAt: new Date() }).where(eq(flagships.userId, userId));
    },

    async repairFlagship(userId: string) {
      await db.update(flagships).set({ status: 'active', repairEndsAt: null, updatedAt: new Date() }).where(eq(flagships.userId, userId));
    },

    async setExiliumBalance(userId: string, balance: number) {
      await db.update(userExilium).set({ balance, updatedAt: new Date() }).where(eq(userExilium.userId, userId));
    },

    async updatePlanetCoordinates(planetId: string, galaxy: number, system: number, position: number) {
      // Recall all active outbound fleets from this planet before moving it.
      // Without this, fleets would continue traveling to/from the old coordinates.
      const activeFleets = await db
        .select({ id: fleetEvents.id, phase: fleetEvents.phase })
        .from(fleetEvents)
        .where(
          and(
            eq(fleetEvents.originPlanetId, planetId),
            eq(fleetEvents.status, 'active'),
            inArray(fleetEvents.phase, ['outbound', 'prospecting', 'mining', 'exploring']),
          ),
        );

      for (const fleet of activeFleets) {
        // Switch phase to return with immediate arrival
        await db
          .update(fleetEvents)
          .set({ phase: 'return' })
          .where(eq(fleetEvents.id, fleet.id));

        // Cancel any pending arrival/phase job and schedule immediate return
        if (fleetQueue) {
          await fleetQueue.remove(`fleet-arrive-${fleet.id}`).catch(() => {});
          await fleetQueue.remove(`fleet-phase-${fleet.id}`).catch(() => {});
          await fleetQueue.add('return', { fleetEventId: fleet.id }, {
            delay: 1000, // 1 second — nearly instant
            jobId: `fleet-return-${fleet.id}`,
          });
        }
      }

      // Now move the planet
      await db.update(planets).set({ galaxy, system, position }).where(eq(planets.id, planetId));
    },

    async resetFlagshipTalents(flagshipId: string) {
      await db.delete(flagshipTalents).where(eq(flagshipTalents.flagshipId, flagshipId));
    },
  };
}

export type PlayerAdminService = ReturnType<typeof createPlayerAdminService>;
