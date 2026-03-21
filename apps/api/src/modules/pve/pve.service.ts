import { eq, and, sql, asc } from 'drizzle-orm';
import { pveMissions, planets, missionCenterState, fleetEvents } from '@ogame-clone/db';
import { TRPCError } from '@trpc/server';
import type { Database } from '@ogame-clone/db';
import { discoveryCooldown, depositSize, depositComposition } from '@ogame-clone/game-engine';
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

    async materializeDiscoveries(userId: string) {
      const centerLevel = await this.getMissionCenterLevel(userId);
      if (centerLevel === 0) return;

      const now = new Date();

      // Get or create state
      let [state] = await db.select().from(missionCenterState)
        .where(eq(missionCenterState.userId, userId)).limit(1);

      if (!state) {
        const cooldownMs = discoveryCooldown(centerLevel) * 3600 * 1000;
        const [created] = await db.insert(missionCenterState).values({
          userId,
          nextDiscoveryAt: new Date(now.getTime() + cooldownMs),
          updatedAt: now,
        }).onConflictDoNothing().returning();
        // If conflict (race condition), re-read
        if (!created) {
          [state] = await db.select().from(missionCenterState)
            .where(eq(missionCenterState.userId, userId)).limit(1);
        } else {
          return; // Just created — first discovery is in the future
        }
      }

      if (!state || state.nextDiscoveryAt > now) return;

      const cooldownMs = discoveryCooldown(centerLevel) * 3600 * 1000;
      const elapsed = now.getTime() - state.nextDiscoveryAt.getTime();
      // +1 because the discovery at nextDiscoveryAt itself counts as the first one
      const n = Math.floor(elapsed / cooldownMs) + 1;

      // Count current available missions
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pveMissions)
        .where(and(eq(pveMissions.userId, userId), eq(pveMissions.status, 'available')));
      const currentCount = countResult?.count ?? 0;

      const CAP = 3;
      const toCreate = Math.min(n, CAP - currentCount);

      // Get player's home planet for coordinates
      const [homePlanet] = await db.select({
        galaxy: planets.galaxy,
        system: planets.system,
      }).from(planets).where(eq(planets.userId, userId)).limit(1);

      if (homePlanet) {
        for (let i = 0; i < toCreate; i++) {
          await this.generateDiscoveredMission(userId, homePlanet.galaxy, homePlanet.system, centerLevel);
        }
      }

      // Advance timer by n * cooldown
      const newNextDiscovery = new Date(state.nextDiscoveryAt.getTime() + n * cooldownMs);
      await db.update(missionCenterState).set({
        nextDiscoveryAt: newNextDiscovery,
        updatedAt: now,
      }).where(eq(missionCenterState.userId, userId));
    },

    async generateDiscoveredMission(userId: string, galaxy: number, system: number, centerLevel: number) {
      // Position selection: level 1-2 = only 8, level 3+ = 8 or 16
      const position = centerLevel >= 3 && Math.random() < 0.5 ? 16 : 8;

      const belt = await asteroidBeltService.getOrCreateBelt(galaxy, system, position);

      // RNG: size and composition
      const varianceMultiplier = 0.6 + Math.random() * 1.0; // 0.6 to 1.6
      const totalQuantity = depositSize(centerLevel, varianceMultiplier);
      const mineraiOffset = (Math.random() * 0.30) - 0.15; // -0.15 to +0.15
      const siliciumOffset = (Math.random() * 0.20) - 0.10; // -0.10 to +0.10
      const composition = depositComposition(mineraiOffset, siliciumOffset);

      const deposit = await asteroidBeltService.generateDiscoveredDeposit(
        belt.id, totalQuantity, composition,
      );

      const minerai = Math.floor(totalQuantity * composition.minerai);
      const silicium = Math.floor(totalQuantity * composition.silicium);
      const hydrogene = totalQuantity - minerai - silicium;

      // rewards = total deposit size (for display to the player, not per-trip extraction)
      await db.insert(pveMissions).values({
        userId,
        missionType: 'mine',
        parameters: { galaxy, system, position, beltId: belt.id, depositId: deposit.id },
        rewards: { minerai, silicium, hydrogene },
        status: 'available',
      });
    },

    async dismissMission(userId: string, missionId: string) {
      // Check cooldown
      const [state] = await db.select().from(missionCenterState)
        .where(eq(missionCenterState.userId, userId)).limit(1);

      if (state?.lastDismissAt) {
        const hoursSinceLastDismiss = (Date.now() - state.lastDismissAt.getTime()) / (3600 * 1000);
        if (hoursSinceLastDismiss < 24) {
          const remainingHours = Math.ceil(24 - hoursSinceLastDismiss);
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `Vous devez attendre encore ${remainingHours}h avant de pouvoir annuler un gisement`,
          });
        }
      }

      // Check mission exists and belongs to user
      const [mission] = await db.select().from(pveMissions)
        .where(and(eq(pveMissions.id, missionId), eq(pveMissions.userId, userId)))
        .limit(1);

      if (!mission) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Mission non trouvée' });
      }
      if (mission.status !== 'available') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seules les missions disponibles peuvent être annulées' });
      }

      // Check no fleet is currently in flight for this mission
      const [activeFleet] = await db.select({ id: fleetEvents.id }).from(fleetEvents)
        .where(and(
          eq(fleetEvents.pveMissionId, missionId),
          eq(fleetEvents.status, 'active'),
        ))
        .limit(1);
      if (activeFleet) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Une flotte est en cours pour cette mission' });
      }

      // Expire mission and update dismiss timestamp
      await db.update(pveMissions)
        .set({ status: 'expired' })
        .where(eq(pveMissions.id, missionId));

      await db.update(missionCenterState)
        .set({ lastDismissAt: new Date() })
        .where(eq(missionCenterState.userId, userId));
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
