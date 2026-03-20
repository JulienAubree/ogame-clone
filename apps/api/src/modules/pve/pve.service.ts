import { eq, and, sql, asc } from 'drizzle-orm';
import { pveMissions, planets } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { accumulationCap } from '@ogame-clone/game-engine';
import type { createAsteroidBeltService } from './asteroid-belt.service.js';
import type { createPirateService } from './pirate.service.js';

export function createPveService(
  db: Database,
  asteroidBeltService: ReturnType<typeof createAsteroidBeltService>,
  pirateService: ReturnType<typeof createPirateService>,
) {
  return {
    async getMissions(userId: string) {
      return db.select().from(pveMissions)
        .where(and(
          eq(pveMissions.userId, userId),
          eq(pveMissions.status, 'available'),
        ))
        .orderBy(asc(pveMissions.createdAt));
    },

    async getMissionById(userId: string, missionId: string) {
      const [mission] = await db.select().from(pveMissions)
        .where(and(
          eq(pveMissions.id, missionId),
          eq(pveMissions.userId, userId),
        ))
        .limit(1);
      return mission ?? null;
    },

    async getMissionCenterLevel(userId: string): Promise<number> {
      const result = await db.execute(sql`
        SELECT COALESCE(MAX(pb.level), 0) as max_level
        FROM planet_buildings pb
        JOIN planets p ON p.id = pb.planet_id
        WHERE p.user_id = ${userId}
          AND pb.building_id = 'missionCenter'
      `);
      return Number(result[0]?.max_level ?? 0);
    },

    async startMission(missionId: string) {
      await db.update(pveMissions)
        .set({ status: 'in_progress' })
        .where(eq(pveMissions.id, missionId));
    },

    async completeMission(missionId: string) {
      await db.update(pveMissions)
        .set({ status: 'completed' })
        .where(eq(pveMissions.id, missionId));
    },

    async releaseMission(missionId: string) {
      await db.update(pveMissions)
        .set({ status: 'available' })
        .where(eq(pveMissions.id, missionId));
    },

    async refreshPool(userId: string) {
      const centerLevel = await this.getMissionCenterLevel(userId);
      if (centerLevel === 0) return;

      const cap = accumulationCap(centerLevel);

      const countResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM pve_missions
        WHERE user_id = ${userId} AND status = 'available'
      `);
      const currentCount = Number(countResult[0]?.count ?? 0);

      if (currentCount >= cap) {
        // At cap: FIFO replace oldest
        const oldest = await db.select({ id: pveMissions.id }).from(pveMissions)
          .where(and(
            eq(pveMissions.userId, userId),
            eq(pveMissions.status, 'available'),
          ))
          .orderBy(asc(pveMissions.createdAt))
          .limit(1);

        if (oldest.length > 0) {
          await db.delete(pveMissions).where(eq(pveMissions.id, oldest[0].id));
        }
      }

      // Get player's planets to find their systems
      const playerPlanets = await db.select({
        galaxy: planets.galaxy,
        system: planets.system,
      }).from(planets)
        .where(eq(planets.userId, userId));

      if (playerPlanets.length === 0) return;

      const planet = playerPlanets[Math.floor(Math.random() * playerPlanets.length)];

      // Weighted random: 60% mining, 40% combat
      const isMining = Math.random() < 0.6;

      if (isMining && centerLevel >= 1) {
        await this.generateMiningMission(userId, planet.galaxy, planet.system, centerLevel);
      } else if (!isMining && centerLevel >= 3) {
        await this.generatePirateMission(userId, planet.galaxy, planet.system, centerLevel);
      } else if (centerLevel >= 1) {
        await this.generateMiningMission(userId, planet.galaxy, planet.system, centerLevel);
      }
    },

    async generateMiningMission(userId: string, galaxy: number, system: number, centerLevel: number) {
      const availablePositions: (8 | 16)[] = centerLevel >= 2 ? [8, 16] : [8];
      const position = availablePositions[Math.floor(Math.random() * availablePositions.length)];

      const belt = await asteroidBeltService.getOrCreateBelt(galaxy, system, position);
      const deposits = await asteroidBeltService.getDeposits(belt.id);

      const available = deposits.filter(d =>
        Number(d.mineraiRemaining) + Number(d.siliciumRemaining) + Number(d.hydrogeneRemaining) > 0,
      );
      if (available.length === 0) return;

      const deposit = available[Math.floor(Math.random() * available.length)];

      const resources: Record<string, number> = {};
      if (Number(deposit.mineraiRemaining) > 0) resources.minerai = Number(deposit.mineraiRemaining);
      if (Number(deposit.siliciumRemaining) > 0) resources.silicium = Number(deposit.siliciumRemaining);
      if (Number(deposit.hydrogeneRemaining) > 0) resources.hydrogene = Number(deposit.hydrogeneRemaining);

      await db.insert(pveMissions).values({
        userId,
        missionType: 'mine',
        parameters: {
          galaxy, system, position,
          beltId: belt.id,
          depositId: deposit.id,
          resources,
        },
        rewards: { ...resources },
        status: 'available',
      });
    },

    async generatePirateMission(userId: string, galaxy: number, system: number, centerLevel: number) {
      let availableTiers: ('easy' | 'medium' | 'hard')[] = ['easy'];
      if (centerLevel >= 4) availableTiers.push('medium');
      if (centerLevel >= 6) availableTiers.push('hard');

      const tier = availableTiers[Math.floor(Math.random() * availableTiers.length)];
      const template = await pirateService.pickTemplate(centerLevel, tier);
      if (!template) return;

      // Random position in system (exclude belt positions)
      let position: number;
      do {
        position = 1 + Math.floor(Math.random() * 16);
      } while (position === 8 || position === 16);

      const rewards = template.rewards as {
        minerai: number; silicium: number; hydrogene: number;
        bonusShips: { shipId: string; count: number; chance: number }[];
      };

      await db.insert(pveMissions).values({
        userId,
        missionType: 'pirate',
        parameters: {
          galaxy, system, position,
          templateId: template.id,
        },
        rewards,
        difficultyTier: tier,
        status: 'available',
      });
    },

    async expireOldMissions() {
      await db.execute(sql`
        DELETE FROM pve_missions
        WHERE status = 'available'
          AND created_at < NOW() - INTERVAL '7 days'
      `);
    },
  };
}
