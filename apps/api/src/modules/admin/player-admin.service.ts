import { eq, and, like, or, sql, count, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { users, planets, userResearch, planetShips, planetDefenses, rankings, planetBuildings, flagships, userExilium, fleetEvents } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { Queue } from 'bullmq';
import type { createPlanetService } from '../planet/planet.service.js';

type PlanetServiceDep = Pick<ReturnType<typeof createPlanetService>, 'createHomePlanet'>;

export function createPlayerAdminService(
  db: Database,
  fleetQueue?: Queue,
  planetService?: PlanetServiceDep,
) {
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

      // Batch-load ships, defenses, and building levels across all planets in
      // 3 queries instead of 3×N.
      const planetIds = playerPlanets.map((p) => p.id);
      const [shipsRows, defensesRows, buildingRows] = planetIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            db.select().from(planetShips).where(inArray(planetShips.planetId, planetIds)),
            db.select().from(planetDefenses).where(inArray(planetDefenses.planetId, planetIds)),
            db.select().from(planetBuildings).where(inArray(planetBuildings.planetId, planetIds)),
          ]);

      const shipsByPlanet = new Map(shipsRows.map((r) => [r.planetId, r]));
      const defensesByPlanet = new Map(defensesRows.map((r) => [r.planetId, r]));
      const buildingsByPlanet = new Map<string, Record<string, number>>();
      for (const row of buildingRows) {
        let levels = buildingsByPlanet.get(row.planetId);
        if (!levels) {
          levels = {};
          buildingsByPlanet.set(row.planetId, levels);
        }
        levels[row.buildingId] = row.level;
      }

      const planetsWithUnits = playerPlanets.map((planet) => ({
        ...planet,
        ships: shipsByPlanet.get(planet.id) ?? null,
        defenses: defensesByPlanet.get(planet.id) ?? null,
        buildingLevels: buildingsByPlanet.get(planet.id) ?? {},
      }));

      // Load flagship + exilium balance (talents removed 2026-05-03 — see Task 7 for admin UI cleanup)
      const [flagshipRow] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
      const [exiliumRow] = await db.select().from(userExilium).where(eq(userExilium.userId, userId)).limit(1);

      return {
        user: { id: user.id, email: user.email, username: user.username, isAdmin: user.isAdmin, bannedAt: user.bannedAt, createdAt: user.createdAt },
        planets: planetsWithUnits,
        research: research[0] ?? null,
        ranking: ranking[0] ?? null,
        flagship: flagshipRow ?? null,
        exilium: exiliumRow ?? null,
        flagshipTalents: [] as { talentId: string; currentRank: number }[],
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

    async updatePlanetShips(planetId: string, ships: Record<string, number>) {
      await db
        .insert(planetShips)
        .values({ planetId, ...ships })
        .onConflictDoUpdate({
          target: [planetShips.planetId],
          set: ships,
        });
    },

    async updatePlanetDefenses(planetId: string, defenses: Record<string, number>) {
      await db
        .insert(planetDefenses)
        .values({ planetId, ...defenses })
        .onConflictDoUpdate({
          target: [planetDefenses.planetId],
          set: defenses,
        });
    },

    async setCapital(userId: string, newCapitalPlanetId: string) {
      const [currentHomeworld] = await db
        .select({ id: planets.id, planetClassId: planets.planetClassId })
        .from(planets)
        .where(and(eq(planets.userId, userId), eq(planets.planetClassId, 'homeworld')))
        .limit(1);

      const [newCapital] = await db
        .select({ id: planets.id, planetClassId: planets.planetClassId })
        .from(planets)
        .where(and(eq(planets.id, newCapitalPlanetId), eq(planets.userId, userId)))
        .limit(1);

      if (!newCapital) throw new Error('Planet not found');
      if (newCapital.planetClassId === 'homeworld') return;

      if (currentHomeworld) {
        // Old homeworld gets the new capital's type
        await db.update(planets)
          .set({ planetClassId: newCapital.planetClassId })
          .where(eq(planets.id, currentHomeworld.id));

        // Remove IPC from old homeworld
        await db.delete(planetBuildings)
          .where(and(
            eq(planetBuildings.planetId, currentHomeworld.id),
            eq(planetBuildings.buildingId, 'imperialPowerCenter'),
          ));
      }

      await db.update(planets)
        .set({ planetClassId: 'homeworld' })
        .where(eq(planets.id, newCapitalPlanetId));
    },

    async resetFlagshipTalents(_flagshipId: string) {
      // No-op (talents removed 2026-05-03). Router endpoint kept until Task 7 strips the admin UI.
    },

    /**
     * Recover a user that registered successfully but lost their homeworld
     * insertion (atomicity bug pre-2026-05-02 fix). Refuses to operate if the
     * user already owns at least one planet — admins should investigate
     * first rather than spawn a duplicate.
     */
    async repairOrphanHomeworld(userId: string) {
      if (!planetService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'planetService not wired into playerAdminService',
        });
      }

      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!existingUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Utilisateur introuvable' });
      }

      const userPlanets = await db
        .select({ id: planets.id })
        .from(planets)
        .where(eq(planets.userId, userId));
      if (userPlanets.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `L'utilisateur possède déjà ${userPlanets.length} planète(s). Réparation refusée.`,
        });
      }

      const planet = await planetService.createHomePlanet(userId);
      return { planetId: planet.id, galaxy: planet.galaxy, system: planet.system, position: planet.position };
    },
  };
}

export type PlayerAdminService = ReturnType<typeof createPlayerAdminService>;
