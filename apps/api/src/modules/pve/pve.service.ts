import { eq, and, sql, asc } from 'drizzle-orm';
import { pveMissions, planets, missionCenterState, fleetEvents, planetShips } from '@exilium/db';
import { TRPCError } from '@trpc/server';
import type { Database } from '@exilium/db';
import { discoveryCooldown, depositSize, depositComposition, computeFleetFP, type UnitCombatStats, type FPConfig } from '@exilium/game-engine';
import type { createAsteroidBeltService } from './asteroid-belt.service.js';
import type { createPirateService } from './pirate.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import { findBuildingByRole } from '../../lib/config-helpers.js';

export function createPveService(
  db: Database,
  asteroidBeltService: ReturnType<typeof createAsteroidBeltService>,
  pirateService: ReturnType<typeof createPirateService>,
  gameConfigService: GameConfigService,
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
      const config = await gameConfigService.getFullConfig();
      const missionCenterDef = findBuildingByRole(config, 'mission_center');
      const result = await db.execute(sql`
        SELECT COALESCE(MAX(pb.level), 0) as max_level
        FROM planet_buildings pb
        JOIN planets p ON p.id = pb.planet_id
        WHERE p.user_id = ${userId}
          AND pb.building_id = ${missionCenterDef.id}
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

    async getDiscoveryState(userId: string) {
      const [state] = await db.select().from(missionCenterState)
        .where(eq(missionCenterState.userId, userId)).limit(1);
      return state ?? null;
    },

    async materializeDiscoveries(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const centerLevel = await this.getMissionCenterLevel(userId);
      if (centerLevel === 0) return;

      const now = new Date();
      const cooldownBase = Number(config.universe.pve_discovery_cooldown_base) || 7;
      const cooldownMs = discoveryCooldown(centerLevel, { base: cooldownBase, minimum: 1 }) * 3600 * 1000;
      // Pirate timer offset: 50% of cooldown so they never spawn at the same time as mining
      const pirateOffsetMs = Math.floor(cooldownMs / 2);

      // Get or create state
      let [state] = await db.select().from(missionCenterState)
        .where(eq(missionCenterState.userId, userId)).limit(1);

      if (!state) {
        const [created] = await db.insert(missionCenterState).values({
          userId,
          nextDiscoveryAt: now,
          nextPirateDiscoveryAt: now,
          updatedAt: now,
        }).onConflictDoNothing().returning();
        if (!created) {
          [state] = await db.select().from(missionCenterState)
            .where(eq(missionCenterState.userId, userId)).limit(1);
        } else {
          const [homePlanet] = await db.select({
            galaxy: planets.galaxy,
            system: planets.system,
          }).from(planets).where(eq(planets.userId, userId)).limit(1);
          if (homePlanet) {
            await this.generateDiscoveredMission(userId, homePlanet.galaxy, homePlanet.system, centerLevel);
            await this.generatePirateMission(userId, homePlanet.galaxy, homePlanet.system, centerLevel);
          }
          await db.update(missionCenterState).set({
            nextDiscoveryAt: new Date(now.getTime() + cooldownMs),
            nextPirateDiscoveryAt: new Date(now.getTime() + cooldownMs + pirateOffsetMs),
          }).where(eq(missionCenterState.userId, userId));
          return;
        }
      }

      if (!state) return;

      // Count current available missions by type (single query)
      const missionCounts = await db
        .select({
          missionType: pveMissions.missionType,
          count: sql<number>`count(*)::int`,
        })
        .from(pveMissions)
        .where(and(eq(pveMissions.userId, userId), eq(pveMissions.status, 'available')))
        .groupBy(pveMissions.missionType);

      const countByType: Record<string, number> = {};
      for (const row of missionCounts) countByType[row.missionType] = row.count;

      const MINING_CAP = Number(config.universe.pve_max_concurrent_missions) || 3;
      const PIRATE_CAP = Number(config.universe.pve_max_pirate_missions) || 2;

      // Get player's home planet for coordinates
      const [homePlanet] = await db.select({
        galaxy: planets.galaxy,
        system: planets.system,
      }).from(planets).where(eq(planets.userId, userId)).limit(1);

      const updates: Partial<typeof missionCenterState.$inferInsert> = { updatedAt: now };

      // ── Mining timer ──
      if (state.nextDiscoveryAt <= now) {
        const elapsed = now.getTime() - state.nextDiscoveryAt.getTime();
        const n = Math.floor(elapsed / cooldownMs) + 1;
        const miningToCreate = Math.min(n, MINING_CAP - (countByType['mine'] ?? 0));
        if (homePlanet) {
          for (let i = 0; i < miningToCreate; i++) {
            await this.generateDiscoveredMission(userId, homePlanet.galaxy, homePlanet.system, centerLevel);
          }
        }
        updates.nextDiscoveryAt = new Date(state.nextDiscoveryAt.getTime() + n * cooldownMs);
      }

      // ── Pirate timer ──
      // Backfill: existing rows without nextPirateDiscoveryAt get an offset from now
      const pirateNextAt = state.nextPirateDiscoveryAt ?? new Date(now.getTime() + pirateOffsetMs);
      if (pirateNextAt <= now) {
        const elapsed = now.getTime() - pirateNextAt.getTime();
        const n = Math.floor(elapsed / cooldownMs) + 1;
        const pirateToCreate = Math.min(n, PIRATE_CAP - (countByType['pirate'] ?? 0));
        if (homePlanet) {
          for (let i = 0; i < pirateToCreate; i++) {
            await this.generatePirateMission(userId, homePlanet.galaxy, homePlanet.system, centerLevel);
          }
        }
        updates.nextPirateDiscoveryAt = new Date(pirateNextAt.getTime() + n * cooldownMs);
      } else if (!state.nextPirateDiscoveryAt) {
        // Persist the backfill value
        updates.nextPirateDiscoveryAt = pirateNextAt;
      }

      await db.update(missionCenterState).set(updates)
        .where(eq(missionCenterState.userId, userId));
    },

    async generateDiscoveredMission(userId: string, galaxy: number, system: number, centerLevel: number) {
      const config = await gameConfigService.getFullConfig();
      // Build candidate coordinates (nearby systems × available positions)
      const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
      const positions = centerLevel >= 3 ? [...beltPositions] : [beltPositions[0]];
      const candidates: { system: number; position: 8 | 16 }[] = [];
      const searchRadius = Number(config.universe.pve_search_radius) || 5;
      const systems = Number(config.universe.systems) || 499;
      for (let offset = 0; offset <= searchRadius; offset++) {
        for (const pos of positions) {
          if (system + offset <= systems) candidates.push({ system: system + offset, position: pos as 8 | 16 });
          if (offset > 0 && system - offset >= 1) candidates.push({ system: system - offset, position: pos as 8 | 16 });
        }
      }

      // Exclude coordinates already used by available missions
      const existingMissions = await db.select({ parameters: pveMissions.parameters })
        .from(pveMissions)
        .where(and(eq(pveMissions.userId, userId), eq(pveMissions.status, 'available')));
      const usedCoords = new Set(existingMissions.map(m => {
        const p = m.parameters as { system?: number; position?: number };
        return `${p.system}:${p.position}`;
      }));

      const available = candidates.filter(c => !usedCoords.has(`${c.system}:${c.position}`));
      if (available.length === 0) return;

      const pick = available[Math.floor(Math.random() * available.length)];
      const belt = await asteroidBeltService.getOrCreateBelt(galaxy, pick.system, pick.position);

      // RNG: size and composition
      const varianceMin = Number(config.universe.pve_deposit_variance_min) || 0.6;
      const varianceMax = Number(config.universe.pve_deposit_variance_max) || 1.6;
      const varianceMultiplier = varianceMin + Math.random() * (varianceMax - varianceMin);
      const depositSizeBase = Number(config.universe.pve_deposit_size_base) || 15000;
      const depositIncrement = Number(config.universe.pve_deposit_size_increment) || 5000;
      const totalQuantity = depositSize(centerLevel, varianceMultiplier, { base: depositSizeBase, increment: depositIncrement });
      const mineraiOffset = (Math.random() * 0.30) - 0.15; // -0.15 to +0.15
      const siliciumOffset = (Math.random() * 0.20) - 0.10; // -0.10 to +0.10
      const compBaseMinerai = Number(config.universe.pve_composition_base_minerai) || 0.60;
      const compBaseSilicium = Number(config.universe.pve_composition_base_silicium) || 0.30;
      const compMinHydrogene = Number(config.universe.pve_composition_min_hydrogene) || 0.02;
      const composition = depositComposition(mineraiOffset, siliciumOffset, { baseMinerai: compBaseMinerai, baseSilicium: compBaseSilicium, minHydrogene: compMinHydrogene });

      let minerai = Math.floor(totalQuantity * composition.minerai);
      let silicium = Math.floor(totalQuantity * composition.silicium);
      let hydrogene = totalQuantity - minerai - silicium;

      // Cap hydrogene, redistribute excess to minerai/silicium
      const HYDROGENE_CAP = Number(config.universe.pve_hydrogene_cap) || 1500;
      if (hydrogene > HYDROGENE_CAP) {
        const excess = hydrogene - HYDROGENE_CAP;
        hydrogene = HYDROGENE_CAP;
        minerai += Math.floor(excess * 2 / 3);
        silicium += excess - Math.floor(excess * 2 / 3);
      }

      const cappedTotal = minerai + silicium + hydrogene;
      const cappedComposition = {
        minerai: minerai / cappedTotal,
        silicium: silicium / cappedTotal,
        hydrogene: hydrogene / cappedTotal,
      };

      const deposit = await asteroidBeltService.generateDiscoveredDeposit(
        belt.id, cappedTotal, cappedComposition,
      );

      // rewards = total deposit size (for display to the player, not per-trip extraction)
      await db.insert(pveMissions).values({
        userId,
        missionType: 'mine',
        parameters: { galaxy, system: pick.system, position: pick.position, beltId: belt.id, depositId: deposit.id },
        rewards: { minerai, silicium, hydrogene },
        status: 'available',
      });
    },

    async dismissMission(userId: string, missionId: string) {
      const config = await gameConfigService.getFullConfig();
      const dismissCooldownHours = Number(config.universe.pve_dismiss_cooldown_hours) || 24;
      // Check cooldown
      const [state] = await db.select().from(missionCenterState)
        .where(eq(missionCenterState.userId, userId)).limit(1);

      if (state?.lastDismissAt) {
        const hoursSinceLastDismiss = (Date.now() - state.lastDismissAt.getTime()) / (3600 * 1000);
        if (hoursSinceLastDismiss < dismissCooldownHours) {
          const remainingHours = Math.ceil(dismissCooldownHours - hoursSinceLastDismiss);
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

    async getPlayerFleetFP(
      userId: string,
      shipStats: Record<string, UnitCombatStats>,
      fpConfig: FPConfig,
    ): Promise<number> {
      const playerPlanets = await db.select({ id: planets.id }).from(planets).where(eq(planets.userId, userId));
      let totalFP = 0;
      for (const planet of playerPlanets) {
        const [ships] = await db.select().from(planetShips).where(eq(planetShips.planetId, planet.id)).limit(1);
        if (!ships) continue;
        const fleet: Record<string, number> = {};
        for (const [key, value] of Object.entries(ships)) {
          if (key === 'planetId') continue;
          if (typeof value === 'number' && value > 0) fleet[key] = value;
        }
        totalFP += computeFleetFP(fleet, shipStats, fpConfig);
      }
      return totalFP;
    },

    async generatePirateMission(userId: string, galaxy: number, system: number, centerLevel: number) {
      const config = await gameConfigService.getFullConfig();
      const tierMediumUnlock = Number(config.universe.pve_tier_medium_unlock) || 4;
      const tierHardUnlock = Number(config.universe.pve_tier_hard_unlock) || 6;
      const availableTiers: ('easy' | 'medium' | 'hard')[] = ['easy'];
      if (centerLevel >= tierMediumUnlock) availableTiers.push('medium');
      if (centerLevel >= tierHardUnlock) availableTiers.push('hard');

      const tier = availableTiers[Math.floor(Math.random() * availableTiers.length)];
      const template = await pirateService.pickTemplate(tier);
      if (!template) return;

      // Random position in system (exclude belt positions)
      let position: number;
      const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
      const beltSet = new Set<number>(beltPositions);
      const universePositions = Number(config.universe.positions) || 16;
      do {
        position = 1 + Math.floor(Math.random() * universePositions);
      } while (beltSet.has(position));

      // Build ship stats map for FP computation
      const shipStats: Record<string, UnitCombatStats> = {};
      for (const [id, ship] of Object.entries(config.ships)) {
        shipStats[id] = { weapons: ship.weapons, shotCount: ship.shotCount ?? 1, shield: ship.shield, hull: ship.hull };
      }
      const fpConfig: FPConfig = {
        shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
        divisor: Number(config.universe.fp_divisor) || 100,
      };

      // Compute player fleet FP (all ships across all planets)
      const playerFleetFP = await this.getPlayerFleetFP(userId, shipStats, fpConfig);

      // Scale pirate fleet
      const templateShips = template.ships as Record<string, number>;
      const { fleet: scaledFleet, fp: pirateFP } = pirateService.buildScaledPirateFleet(
        templateShips, centerLevel, playerFleetFP, config.universe, shipStats, fpConfig, tier,
      );

      // Scale rewards proportionally
      const templateRewards = template.rewards as {
        minerai: number; silicium: number; hydrogene: number;
        bonusShips: { shipId: string; count: number; chance: number }[];
      };
      const baseFP = computeFleetFP(templateShips, shipStats, fpConfig);
      const rewardRatio = baseFP > 0 ? pirateFP / baseFP : 1;
      const scaledRewards = {
        minerai: Math.floor(templateRewards.minerai * rewardRatio),
        silicium: Math.floor(templateRewards.silicium * rewardRatio),
        hydrogene: Math.floor(templateRewards.hydrogene * rewardRatio),
        bonusShips: templateRewards.bonusShips,
      };

      await db.insert(pveMissions).values({
        userId,
        missionType: 'pirate',
        parameters: {
          galaxy, system, position,
          templateId: template.id,
          scaledFleet,
          pirateFP,
        },
        rewards: scaledRewards,
        difficultyTier: tier,
        status: 'available',
      });
    },

    async expireOldMissions() {
      const config = await gameConfigService.getFullConfig();
      const expiryDays = Number(config.universe.pve_mission_expiry_days) || 7;
      await db.execute(sql`
        DELETE FROM pve_missions
        WHERE status = 'available'
          AND created_at < NOW() - INTERVAL '1 day' * ${expiryDays}
      `);
    },
  };
}
