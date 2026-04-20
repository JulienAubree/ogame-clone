import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { colonizationProcesses, planets, planetBuildings, planetBiomes, discoveredBiomes, planetShips } from '@exilium/db';
import type { Database } from '@exilium/db';
import { calculateGovernancePenalty, computeFleetFP, type UnitCombatStats, type FPConfig } from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';

export function createColonizationService(
  db: Database,
  gameConfigService: GameConfigService,
) {
  return {
    /** Get Imperial Power Center level for a user */
    async getIpcLevel(userId: string): Promise<number> {
      const userPlanets = await db
        .select({ id: planets.id })
        .from(planets)
        .where(eq(planets.userId, userId));

      if (userPlanets.length === 0) return 0;

      const userPlanetIds = new Set(userPlanets.map(p => p.id));

      const allIpc = await db
        .select()
        .from(planetBuildings)
        .where(eq(planetBuildings.buildingId, 'imperialPowerCenter'));

      const ipc = allIpc.find(b => userPlanetIds.has(b.planetId));
      return ipc?.level ?? 0;
    },

    /** Scale a base cost by IPC level and scaling factor */
    scaleCost(baseCost: number, ipcLevel: number, scalingFactor: number): number {
      return baseCost * (1 + scalingFactor * ipcLevel);
    },

    /** Get active colonization process for a planet */
    async getProcess(planetId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(
          eq(colonizationProcesses.planetId, planetId),
          eq(colonizationProcesses.status, 'active'),
        ))
        .limit(1);
      return process ?? null;
    },

    /** Get full colonization status for frontend */
    async getStatus(userId: string, planetId: string) {
      const process = await this.getProcess(planetId);
      if (!process || process.userId !== userId) return null;

      const config = await gameConfigService.getFullConfig();
      const passiveRate = Number(config.universe.colonization_passive_rate) || 0.10;
      const sf = Number(config.universe.colonization_cost_scaling_factor) || 0.5;
      const ipcLevel = await this.getIpcLevel(userId);

      const baseMinerai = Number(config.universe.colonization_consumption_minerai) || 200;
      const baseSilicium = Number(config.universe.colonization_consumption_silicium) || 100;
      const consumptionMineraiPerHour = this.scaleCost(baseMinerai, ipcLevel, sf);
      const consumptionSiliciumPerHour = this.scaleCost(baseSilicium, ipcLevel, sf);

      // Fetch planet resources
      const [planet] = await db
        .select({ minerai: planets.minerai, silicium: planets.silicium })
        .from(planets)
        .where(eq(planets.id, planetId))
        .limit(1);

      const currentMinerai = planet ? Number(planet.minerai) : 0;
      const currentSilicium = planet ? Number(planet.silicium) : 0;

      const stockSufficient = currentMinerai > 0 && currentSilicium > 0;

      // Hours until stockout
      let hoursUntilStockout: number | null = null;
      if (process.outpostEstablished && consumptionMineraiPerHour > 0 && consumptionSiliciumPerHour > 0) {
        const hoursMinerai = currentMinerai / consumptionMineraiPerHour;
        const hoursSilicium = currentSilicium / consumptionSiliciumPerHour;
        hoursUntilStockout = Math.min(hoursMinerai, hoursSilicium);
      }

      // Garrison info
      const [ships] = await db
        .select()
        .from(planetShips)
        .where(eq(planetShips.planetId, planetId))
        .limit(1);

      const stationedShips: Record<string, number> = {};
      let stationedFP = 0;
      if (ships) {
        for (const [key, value] of Object.entries(ships)) {
          if (key === 'planetId') continue;
          const count = Number(value) || 0;
          if (count > 0) stationedShips[key] = count;
        }

        // Compute stationed FP
        const shipStats: Record<string, UnitCombatStats> = {};
        for (const [id, ship] of Object.entries(config.ships)) {
          shipStats[id] = {
            weapons: ship.weapons,
            shotCount: ship.shotCount ?? 1,
            shield: ship.shield,
            hull: ship.hull,
          };
        }
        const fpConfig: FPConfig = {
          shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
          divisor: Number(config.universe.fp_divisor) || 100,
        };
        stationedFP = computeFleetFP(stationedShips, shipStats, fpConfig);
      }

      // Rate bonuses (garrison + recent convoy), capped
      const nowMs = Date.now();
      const garrisonFpThreshold = Number(config.universe.colonization_rate_garrison_fp_threshold) || 50;
      const garrisonBonusValue = Number(config.universe.colonization_rate_garrison_bonus) || 0;
      const convoyBonusValue = Number(config.universe.colonization_rate_convoy_bonus) || 0;
      const convoyWindowHours = Number(config.universe.colonization_rate_convoy_window_hours) || 2;
      const bonusCap = Number(config.universe.colonization_rate_bonus_cap) || 0.30;

      const garrisonBonusActive = stationedFP >= garrisonFpThreshold;
      const garrisonBonus = garrisonBonusActive ? garrisonBonusValue : 0;

      let convoyBonusActive = false;
      let convoyBonusEndsAt: Date | null = null;
      if (process.lastConvoySupplyAt) {
        const windowMs = convoyWindowHours * 60 * 60 * 1000;
        const endsAtMs = new Date(process.lastConvoySupplyAt).getTime() + windowMs;
        if (endsAtMs > nowMs) {
          convoyBonusActive = true;
          convoyBonusEndsAt = new Date(endsAtMs);
        }
      }
      const convoyBonus = convoyBonusActive ? convoyBonusValue : 0;
      // Additive bonuses in percentage points per hour (e.g. 0.05 = +5%/h)
      const totalBonus = Math.min(bonusCap, garrisonBonus + convoyBonus);

      // Effective rate = base × difficulty × stockMult + bonus_pp
      const baseEffective = passiveRate * process.difficultyFactor * (stockSufficient ? 1 : 0.5);
      const effectiveRate = process.outpostEstablished ? baseEffective + totalBonus : 0;
      const remaining = Math.max(0, 1 - process.progress);
      const estimatedCompletionHours = effectiveRate > 0 ? remaining / effectiveRate : Infinity;

      // Outpost thresholds
      const outpostThresholdMinerai = this.scaleCost(
        Number(config.universe.colonization_outpost_threshold_minerai) || 500,
        ipcLevel,
        sf,
      );
      const outpostThresholdSilicium = this.scaleCost(
        Number(config.universe.colonization_outpost_threshold_silicium) || 250,
        ipcLevel,
        sf,
      );

      // Grace period and outpost timeout deadlines
      const gracePeriodHours = Number(config.universe.colonization_grace_period_hours) || 0;
      const outpostTimeoutHours = Number(config.universe.colonization_outpost_timeout_hours) || 0;
      const startedAtMs = new Date(process.startedAt).getTime();
      const gracePeriodEndsAt = new Date(startedAtMs + gracePeriodHours * 60 * 60 * 1000);
      const outpostTimeoutAt = new Date(startedAtMs + outpostTimeoutHours * 60 * 60 * 1000);
      const inGracePeriod = nowMs < gracePeriodEndsAt.getTime();

      return {
        ...process,
        basePassiveRate: passiveRate,
        effectivePassiveRate: effectiveRate,
        estimatedCompletionHours,
        consumptionMineraiPerHour,
        consumptionSiliciumPerHour,
        currentMinerai,
        currentSilicium,
        hoursUntilStockout,
        stockSufficient,
        stationedShips,
        stationedFP,
        ipcLevel,
        outpostThresholdMinerai,
        outpostThresholdSilicium,
        gracePeriodEndsAt,
        outpostTimeoutAt,
        inGracePeriod,
        // Rate bonuses
        garrisonBonusActive,
        garrisonBonusValue,
        garrisonFpThreshold,
        convoyBonusActive,
        convoyBonusValue,
        convoyBonusEndsAt,
        convoyWindowHours,
        totalRateBonus: totalBonus,
        bonusCap,
      };
    },

    /** Start a new colonization process */
    async startProcess(
      planetId: string,
      userId: string,
      originPlanetId: string,
      difficultyFactor: number,
      outpostEstablished = false,
    ) {
      const [process] = await db
        .insert(colonizationProcesses)
        .values({
          planetId,
          userId,
          colonyShipOriginPlanetId: originPlanetId,
          difficultyFactor,
          outpostEstablished,
        })
        .returning();
      return process;
    },

    /** Compute outpost resource thresholds scaled by user's IPC level */
    async getOutpostThresholds(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const sf = Number(config.universe.colonization_cost_scaling_factor) || 0.5;
      const ipcLevel = await this.getIpcLevel(userId);
      const minerai = this.scaleCost(
        Number(config.universe.colonization_outpost_threshold_minerai) || 500,
        ipcLevel,
        sf,
      );
      const silicium = this.scaleCost(
        Number(config.universe.colonization_outpost_threshold_silicium) || 250,
        ipcLevel,
        sf,
      );
      return { minerai, silicium };
    },

    /** Consume resources from the colonizing planet */
    async consumeResources(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, processId), eq(colonizationProcesses.status, 'active')))
        .limit(1);

      if (!process) return { stockSufficient: true };

      // No consumption before outpost is established
      if (!process.outpostEstablished) return { stockSufficient: true };

      const config = await gameConfigService.getFullConfig();

      // Grace period: no consumption for the first N hours after start
      const gracePeriodHours = Number(config.universe.colonization_grace_period_hours) || 0;
      const elapsedMs = Date.now() - new Date(process.startedAt).getTime();
      if (elapsedMs < gracePeriodHours * 60 * 60 * 1000) {
        return { stockSufficient: true };
      }

      const sf = Number(config.universe.colonization_cost_scaling_factor) || 0.5;
      const ipcLevel = await this.getIpcLevel(process.userId);

      const baseMinerai = Number(config.universe.colonization_consumption_minerai) || 200;
      const baseSilicium = Number(config.universe.colonization_consumption_silicium) || 100;
      const consumptionMineraiPerHour = this.scaleCost(baseMinerai, ipcLevel, sf);
      const consumptionSiliciumPerHour = this.scaleCost(baseSilicium, ipcLevel, sf);

      const now = new Date();
      const elapsedHours = (now.getTime() - new Date(process.lastTickAt).getTime()) / (1000 * 60 * 60);
      const mineraiToDeduct = consumptionMineraiPerHour * elapsedHours;
      const siliciumToDeduct = consumptionSiliciumPerHour * elapsedHours;

      // Deduct resources, flooring at 0
      await db
        .update(planets)
        .set({
          minerai: sql`GREATEST(${planets.minerai} - ${mineraiToDeduct}, 0)`,
          silicium: sql`GREATEST(${planets.silicium} - ${siliciumToDeduct}, 0)`,
        })
        .where(eq(planets.id, process.planetId));

      // Read remaining resources after deduction
      const [planet] = await db
        .select({ minerai: planets.minerai, silicium: planets.silicium })
        .from(planets)
        .where(eq(planets.id, process.planetId))
        .limit(1);

      const stockSufficient = planet
        ? Number(planet.minerai) > 0 && Number(planet.silicium) > 0
        : false;

      return { stockSufficient };
    },

    /** Generate a pirate raid if the interval has elapsed */
    async maybeGenerateRaid(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, processId), eq(colonizationProcesses.status, 'active')))
        .limit(1);

      if (!process) return null;

      // No raids before outpost is established
      if (!process.outpostEstablished) return null;

      const config = await gameConfigService.getFullConfig();
      const intervalMin = Number(config.universe.colonization_raid_interval_min) || 3600;
      const intervalMax = Number(config.universe.colonization_raid_interval_max) || 5400;
      const travelMin = Number(config.universe.colonization_raid_travel_min) || 1800;
      const travelMax = Number(config.universe.colonization_raid_travel_max) || 3600;
      const baseFP = Number(config.universe.colonization_raid_base_fp) || 50;
      const stationedFPRatio = Number(config.universe.colonization_raid_stationed_fp_ratio) || 0.3;
      const sf = Number(config.universe.colonization_cost_scaling_factor) || 0.5;

      const now = new Date();
      const elapsed = (now.getTime() - new Date(process.lastRaidAt ?? process.startedAt).getTime()) / 1000;

      // Random interval for next raid
      const interval = intervalMin + Math.random() * (intervalMax - intervalMin);
      if (elapsed < interval) return null;

      const ipcLevel = await this.getIpcLevel(process.userId);

      // Compute stationed FP for scaling
      const [ships] = await db
        .select()
        .from(planetShips)
        .where(eq(planetShips.planetId, process.planetId))
        .limit(1);

      let stationedFP = 0;
      if (ships) {
        const fleet: Record<string, number> = {};
        for (const [key, value] of Object.entries(ships)) {
          if (key === 'planetId') continue;
          const count = Number(value) || 0;
          if (count > 0) fleet[key] = count;
        }
        const shipStats: Record<string, UnitCombatStats> = {};
        for (const [id, ship] of Object.entries(config.ships)) {
          shipStats[id] = {
            weapons: ship.weapons,
            shotCount: ship.shotCount ?? 1,
            shield: ship.shield,
            hull: ship.hull,
          };
        }
        const fpConfig: FPConfig = {
          shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
          divisor: Number(config.universe.fp_divisor) || 100,
        };
        stationedFP = computeFleetFP(fleet, shipStats, fpConfig);
      }

      // Target FP for the pirate raid
      const targetFP = Math.round(baseFP * (1 + sf * ipcLevel) * (1 + stationedFPRatio * stationedFP));

      // Random travel time
      const travelTime = Math.round(travelMin + Math.random() * (travelMax - travelMin));

      // Get planet coordinates
      const [planet] = await db
        .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
        .from(planets)
        .where(eq(planets.id, process.planetId))
        .limit(1);

      if (!planet) return null;

      // Update lastRaidAt
      await db
        .update(colonizationProcesses)
        .set({ lastRaidAt: now })
        .where(eq(colonizationProcesses.id, processId));

      return {
        targetFP,
        travelTime,
        planetId: process.planetId,
        coordinates: {
          galaxy: planet.galaxy,
          system: planet.system,
          position: planet.position,
        },
      };
    },

    /** Advance passive progress for a process */
    async tick(processId: string, stockSufficient: boolean) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, processId), eq(colonizationProcesses.status, 'active')))
        .limit(1);

      if (!process) return null;

      // No progress before outpost is established
      if (!process.outpostEstablished) {
        // Still update lastTickAt to keep timing accurate
        const now = new Date();
        await db
          .update(colonizationProcesses)
          .set({ lastTickAt: now })
          .where(eq(colonizationProcesses.id, processId));
        return { ...process, progress: process.progress };
      }

      const config = await gameConfigService.getFullConfig();
      const passiveRate = Number(config.universe.colonization_passive_rate) || 0.10;
      const now = new Date();
      const nowMs = now.getTime();

      // Rate bonuses (garrison FP + recent convoy). Evaluate averaged over the
      // tick interval, not just at "now", so a bonus that expires mid-interval
      // gets partial credit and we don't over/under-shoot the UI preview.
      const lastTickMs = new Date(process.lastTickAt).getTime();
      const elapsedHours = (nowMs - lastTickMs) / (1000 * 60 * 60);

      const garrisonFpThreshold = Number(config.universe.colonization_rate_garrison_fp_threshold) || 50;
      const garrisonBonusValue = Number(config.universe.colonization_rate_garrison_bonus) || 0;
      const convoyBonusValue = Number(config.universe.colonization_rate_convoy_bonus) || 0;
      const convoyWindowHours = Number(config.universe.colonization_rate_convoy_window_hours) || 2;
      const bonusCap = Number(config.universe.colonization_rate_bonus_cap) || 0.30;

      // Garrison bonus: read current stationed FP
      let stationedFP = 0;
      const [ships] = await db
        .select()
        .from(planetShips)
        .where(eq(planetShips.planetId, process.planetId))
        .limit(1);
      if (ships) {
        const stationedShips: Record<string, number> = {};
        for (const [key, value] of Object.entries(ships)) {
          if (key === 'planetId') continue;
          const count = Number(value) || 0;
          if (count > 0) stationedShips[key] = count;
        }
        const shipStats: Record<string, UnitCombatStats> = {};
        for (const [id, ship] of Object.entries(config.ships)) {
          shipStats[id] = {
            weapons: ship.weapons,
            shotCount: ship.shotCount ?? 1,
            shield: ship.shield,
            hull: ship.hull,
          };
        }
        const fpConfig: FPConfig = {
          shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
          divisor: Number(config.universe.fp_divisor) || 100,
        };
        stationedFP = computeFleetFP(stationedShips, shipStats, fpConfig);
      }
      const garrisonBonus = stationedFP >= garrisonFpThreshold ? garrisonBonusValue : 0;

      // Convoy bonus: fraction of the tick interval covered by an active window
      let convoyBonus = 0;
      if (process.lastConvoySupplyAt) {
        const convoyStartMs = new Date(process.lastConvoySupplyAt).getTime();
        const convoyEndMs = convoyStartMs + convoyWindowHours * 60 * 60 * 1000;
        const overlapStart = Math.max(lastTickMs, convoyStartMs);
        const overlapEnd = Math.min(nowMs, convoyEndMs);
        const overlapHours = Math.max(0, (overlapEnd - overlapStart) / (1000 * 60 * 60));
        if (elapsedHours > 0) {
          convoyBonus = convoyBonusValue * (overlapHours / elapsedHours);
        }
      }

      // Additive bonuses in percentage points per hour (e.g. 0.05 = +5%/h)
      const totalBonus = Math.min(bonusCap, garrisonBonus + convoyBonus);
      const effectiveRate = passiveRate * process.difficultyFactor * (stockSufficient ? 1 : 0.5) + totalBonus;

      const progressDelta = effectiveRate * elapsedHours;
      const newProgress = Math.min(1, process.progress + progressDelta);

      await db
        .update(colonizationProcesses)
        .set({ progress: newProgress, lastTickAt: now })
        .where(eq(colonizationProcesses.id, processId));

      return { ...process, progress: newProgress };
    },

    /** Record a supply convoy arrival for the recent-convoy rate bonus */
    async updateLastConvoySupplyAt(planetId: string) {
      await db
        .update(colonizationProcesses)
        .set({ lastConvoySupplyAt: new Date() })
        .where(and(
          eq(colonizationProcesses.planetId, planetId),
          eq(colonizationProcesses.status, 'active'),
        ));
    },

    /** Player-triggered completion -- validates progress >= 0.995 */
    async completeFromPlayer(userId: string, planetId: string) {
      const process = await this.getProcess(planetId);
      if (!process || process.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active colonization process' });
      }
      if (process.progress < 0.995) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La colonisation n\'est pas encore terminee' });
      }
      await this.finalize(process.id);
      return { completed: true, planetId };
    },

    /** Finalize a completed colonization */
    async finalize(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(eq(colonizationProcesses.id, processId))
        .limit(1);

      if (!process) return;

      // Re-activate biomes based on current discovered_biomes state.
      // Biomes may have been discovered AFTER the planet was created
      // (e.g., player bought an exploration report during colonization).
      const [planet] = await db
        .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
        .from(planets)
        .where(eq(planets.id, process.planetId))
        .limit(1);

      if (planet) {
        const discoveredIds = new Set(
          (await db
            .select({ biomeId: discoveredBiomes.biomeId })
            .from(discoveredBiomes)
            .where(and(
              eq(discoveredBiomes.userId, process.userId),
              eq(discoveredBiomes.galaxy, planet.galaxy),
              eq(discoveredBiomes.system, planet.system),
              eq(discoveredBiomes.position, planet.position),
            ))
          ).map(r => r.biomeId),
        );

        // Activate biomes that are now discovered
        const currentBiomes = await db
          .select({ biomeId: planetBiomes.biomeId, active: planetBiomes.active })
          .from(planetBiomes)
          .where(eq(planetBiomes.planetId, process.planetId));

        for (const b of currentBiomes) {
          const shouldBeActive = discoveredIds.has(b.biomeId);
          if (shouldBeActive && !b.active) {
            await db
              .update(planetBiomes)
              .set({ active: true })
              .where(and(
                eq(planetBiomes.planetId, process.planetId),
                eq(planetBiomes.biomeId, b.biomeId),
              ));
          }
        }
      }

      await db
        .update(colonizationProcesses)
        .set({ status: 'completed' })
        .where(eq(colonizationProcesses.id, processId));

      // Planet becomes active
      await db
        .update(planets)
        .set({ status: 'active' })
        .where(eq(planets.id, process.planetId));
    },

    /** Fail a colonization -- delete planet, return colony ship */
    async fail(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(eq(colonizationProcesses.id, processId))
        .limit(1);

      if (!process) return null;

      await db
        .update(colonizationProcesses)
        .set({ status: 'failed' })
        .where(eq(colonizationProcesses.id, processId));

      // Delete the planet (cascade deletes planetShips, planetDefenses, planetBiomes, etc.)
      await db
        .delete(planets)
        .where(eq(planets.id, process.planetId));

      // Return colony ship origin planet ID for fleet scheduling
      return { originPlanetId: process.colonyShipOriginPlanetId, userId: process.userId };
    },

    /** Get governance info for a user (for Empire page) */
    async getGovernanceInfo(userId: string) {
      // Count colonies (exclude homeworld = first planet; 1 planet = 0 colonies)
      const userPlanets = await db
        .select({ id: planets.id, status: planets.status })
        .from(planets)
        .where(eq(planets.userId, userId));

      const activePlanets = userPlanets.filter(p => p.status === 'active');
      const colonyCount = Math.max(0, activePlanets.length - 1);

      const ipcLevel = await this.getIpcLevel(userId);
      const config = await gameConfigService.getFullConfig();

      const capacity = 1 + ipcLevel;
      const harvestPenalties = (config.universe.governance_penalty_harvest as number[]) ?? [0.15, 0.35, 0.60];
      const constructionPenalties = (config.universe.governance_penalty_construction as number[]) ?? [0.15, 0.35, 0.60];

      const penalty = calculateGovernancePenalty(colonyCount, capacity, harvestPenalties, constructionPenalties);

      return {
        colonyCount,
        capacity,
        ipcLevel,
        ...penalty,
      };
    },
  };
}
