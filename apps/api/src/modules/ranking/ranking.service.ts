import { eq } from 'drizzle-orm';
import { users, planets, userResearch, planetShips, planetDefenses, rankings, planetBuildings } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  calculateBuildingPoints,
  calculateResearchPoints,
  calculateFleetPoints,
  calculateDefensePoints,
  calculateTotalPoints,
} from '@ogame-clone/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';

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

export function createRankingService(db: Database, gameConfigService: GameConfigService) {
  return {
    async recalculateAll() {
      const allUsers = await db.select({ id: users.id }).from(users);
      const config = await gameConfigService.getFullConfig();
      const pointsDivisor = Number(config.universe.ranking_points_divisor) || 1000;

      const pointsPerUser: { userId: string; totalPoints: number }[] = [];

      for (const user of allUsers) {
        const userPlanets = await db.select().from(planets).where(eq(planets.userId, user.id));
        let buildingPoints = 0;
        for (const planet of userPlanets) {
          const buildingLevels = await getBuildingLevels(db, planet.id);
          buildingPoints += calculateBuildingPoints(buildingLevels, config.buildings, pointsDivisor);
        }

        const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, user.id)).limit(1);
        const researchPoints = research
          ? (() => {
              const { userId: _, ...levels } = research;
              return calculateResearchPoints(levels as Record<string, number>, config.research, pointsDivisor);
            })()
          : 0;

        let fleetPoints = 0;
        for (const planet of userPlanets) {
          const [ships] = await db.select().from(planetShips).where(eq(planetShips.planetId, planet.id)).limit(1);
          if (ships) {
            const { planetId: _, ...counts } = ships;
            fleetPoints += calculateFleetPoints(counts as Record<string, number>, config.ships, pointsDivisor);
          }
        }

        let defensePoints = 0;
        for (const planet of userPlanets) {
          const [defenses] = await db.select().from(planetDefenses).where(eq(planetDefenses.planetId, planet.id)).limit(1);
          if (defenses) {
            const { planetId: _, ...counts } = defenses;
            defensePoints += calculateDefensePoints(counts as Record<string, number>, config.defenses, pointsDivisor);
          }
        }

        const total = calculateTotalPoints(buildingPoints, researchPoints, fleetPoints, defensePoints);
        pointsPerUser.push({ userId: user.id, totalPoints: total });
      }

      pointsPerUser.sort((a, b) => b.totalPoints - a.totalPoints);

      const now = new Date();
      for (let i = 0; i < pointsPerUser.length; i++) {
        const { userId, totalPoints } = pointsPerUser[i];
        const rank = i + 1;

        await db
          .insert(rankings)
          .values({ userId, totalPoints, rank, calculatedAt: now })
          .onConflictDoUpdate({
            target: rankings.userId,
            set: { totalPoints, rank, calculatedAt: now },
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
