import { sql } from 'drizzle-orm';
import { users, planets, userResearch, planetShips, planetDefenses, rankings, planetBuildings } from '@exilium/db';
import { eq } from 'drizzle-orm';
import type { Database } from '@exilium/db';
import {
  calculateBuildingPoints,
  calculateResearchPoints,
  calculateFleetPoints,
  calculateDefensePoints,
  calculateTotalPoints,
} from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';

export function createRankingService(db: Database, gameConfigService: GameConfigService) {
  return {
    async recalculateAll() {
      const config = await gameConfigService.getFullConfig();
      const pointsDivisor = Number(config.universe.ranking_points_divisor) || 1000;

      // Load every row we need in 5 queries instead of N×M. We group by
      // owner/planet in memory, then score each user from the pre-built maps.
      const [allUsers, allPlanets, allBuildings, allResearch, allShips, allDefenses] = await Promise.all([
        db.select({ id: users.id }).from(users),
        db.select({ id: planets.id, userId: planets.userId }).from(planets),
        db.select({ planetId: planetBuildings.planetId, buildingId: planetBuildings.buildingId, level: planetBuildings.level }).from(planetBuildings),
        db.select().from(userResearch),
        db.select().from(planetShips),
        db.select().from(planetDefenses),
      ]);

      const planetsByUser = new Map<string, string[]>();
      for (const p of allPlanets) {
        const list = planetsByUser.get(p.userId);
        if (list) list.push(p.id);
        else planetsByUser.set(p.userId, [p.id]);
      }

      const buildingsByPlanet = new Map<string, Record<string, number>>();
      for (const row of allBuildings) {
        let levels = buildingsByPlanet.get(row.planetId);
        if (!levels) {
          levels = {};
          buildingsByPlanet.set(row.planetId, levels);
        }
        levels[row.buildingId] = row.level;
      }

      const researchByUser = new Map<string, Record<string, number>>();
      for (const row of allResearch) {
        const { userId, ...levels } = row;
        researchByUser.set(userId, levels as Record<string, number>);
      }

      const shipsByPlanet = new Map<string, Record<string, number>>();
      for (const row of allShips) {
        const { planetId, ...counts } = row;
        shipsByPlanet.set(planetId, counts as Record<string, number>);
      }

      const defensesByPlanet = new Map<string, Record<string, number>>();
      for (const row of allDefenses) {
        const { planetId, ...counts } = row;
        defensesByPlanet.set(planetId, counts as Record<string, number>);
      }

      const pointsPerUser: { userId: string; totalPoints: number }[] = [];
      for (const user of allUsers) {
        const userPlanetIds = planetsByUser.get(user.id) ?? [];

        let buildingPoints = 0;
        let fleetPoints = 0;
        let defensePoints = 0;
        for (const planetId of userPlanetIds) {
          const levels = buildingsByPlanet.get(planetId);
          if (levels) buildingPoints += calculateBuildingPoints(levels, config.buildings, pointsDivisor);
          const ships = shipsByPlanet.get(planetId);
          if (ships) fleetPoints += calculateFleetPoints(ships, config.ships, pointsDivisor);
          const defenses = defensesByPlanet.get(planetId);
          if (defenses) defensePoints += calculateDefensePoints(defenses, config.defenses, pointsDivisor);
        }

        const research = researchByUser.get(user.id);
        const researchPoints = research ? calculateResearchPoints(research, config.research, pointsDivisor) : 0;

        const total = calculateTotalPoints(buildingPoints, researchPoints, fleetPoints, defensePoints);
        pointsPerUser.push({ userId: user.id, totalPoints: total });
      }

      pointsPerUser.sort((a, b) => b.totalPoints - a.totalPoints);

      if (pointsPerUser.length === 0) {
        console.log('[ranking] No users to rank');
        return;
      }

      const now = new Date();
      const rows = pointsPerUser.map((p, i) => ({
        userId: p.userId,
        totalPoints: p.totalPoints,
        rank: i + 1,
        calculatedAt: now,
      }));

      // Batched upsert. excluded.* refers to the incoming row. Caps the bind
      // parameter count so that 10k+ users don't push a single 3MB query and
      // blow past Postgres's `max_locks_per_transaction` / planner limits.
      const BATCH = 2000;
      for (let i = 0; i < rows.length; i += BATCH) {
        await db
          .insert(rankings)
          .values(rows.slice(i, i + BATCH))
          .onConflictDoUpdate({
            target: rankings.userId,
            set: {
              totalPoints: sql`excluded.total_points`,
              rank: sql`excluded.rank`,
              calculatedAt: sql`excluded.calculated_at`,
            },
          });
      }

      console.log(`[ranking] Recalculated rankings for ${pointsPerUser.length} users`);
    },

    async getRankings(page: number = 1, limit: number = 20) {
      const offset = (page - 1) * limit;
      return db
        .select({
          rank: rankings.rank,
          userId: rankings.userId,
          username: users.username,
          totalPoints: rankings.totalPoints,
          calculatedAt: rankings.calculatedAt,
        })
        .from(rankings)
        .innerJoin(users, eq(users.id, rankings.userId))
        .orderBy(rankings.rank)
        .limit(limit)
        .offset(offset);
    },

    async getPlayerRank(userId: string) {
      const [result] = await db
        .select()
        .from(rankings)
        .where(eq(rankings.userId, userId))
        .limit(1);

      return result ?? { totalPoints: 0, rank: 0 };
    },
  };
}
