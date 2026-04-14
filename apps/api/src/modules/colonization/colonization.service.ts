import { eq, and, lt, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { colonizationProcesses, colonizationEvents, planets, planetBuildings } from '@exilium/db';
import type { Database } from '@exilium/db';
import { calculateGovernancePenalty } from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';

export function createColonizationService(
  db: Database,
  gameConfigService: GameConfigService,
) {
  return {
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

    /** Get full colonization status (process + events) for frontend */
    async getStatus(userId: string, planetId: string) {
      const process = await this.getProcess(planetId);
      if (!process || process.userId !== userId) return null;

      const events = await db
        .select()
        .from(colonizationEvents)
        .where(eq(colonizationEvents.processId, process.id));

      const config = await gameConfigService.getFullConfig();
      const passiveRate = Number(config.universe.colonization_passive_rate) || 0.10;
      const reinforceBonus = process.reinforcePassiveBonus ?? 0;
      const effectiveRate = passiveRate * process.difficultyFactor + reinforceBonus;
      const remaining = Math.max(0, 1 - process.progress);
      const etaHours = effectiveRate > 0 ? remaining / effectiveRate : Infinity;

      const cooldownSeconds = Number(config.universe.colonization_consolidate_cooldown) || 14400;
      let consolidateCooldownRemaining = 0;
      if (process.lastConsolidateAt) {
        const elapsed = (Date.now() - new Date(process.lastConsolidateAt).getTime()) / 1000;
        consolidateCooldownRemaining = Math.max(0, Math.ceil(cooldownSeconds - elapsed));
      }

      return {
        ...process,
        events: events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        effectivePassiveRate: effectiveRate,
        estimatedCompletionHours: etaHours,
        consolidateCooldownRemaining,
      };
    },

    /** Start a new colonization process */
    async startProcess(planetId: string, userId: string, originPlanetId: string, difficultyFactor: number) {
      const [process] = await db
        .insert(colonizationProcesses)
        .values({
          planetId,
          userId,
          colonyShipOriginPlanetId: originPlanetId,
          difficultyFactor,
        })
        .returning();
      return process;
    },

    /** Advance passive progress for a process */
    async tick(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, processId), eq(colonizationProcesses.status, 'active')))
        .limit(1);

      if (!process) return null;

      const config = await gameConfigService.getFullConfig();
      const passiveRate = Number(config.universe.colonization_passive_rate) || 0.10;
      const reinforceBonus = process.reinforcePassiveBonus ?? 0;
      const effectiveRate = passiveRate * process.difficultyFactor + reinforceBonus;

      const now = new Date();
      const elapsedHours = (now.getTime() - new Date(process.lastTickAt).getTime()) / (1000 * 60 * 60);
      const progressDelta = effectiveRate * elapsedHours;
      const newProgress = Math.min(1, process.progress + progressDelta);

      await db
        .update(colonizationProcesses)
        .set({ progress: newProgress, lastTickAt: now })
        .where(eq(colonizationProcesses.id, processId));

      return { ...process, progress: newProgress };
    },

    /** Expire overdue events and apply penalties */
    async expireEvents(processId: string) {
      const now = new Date();
      const pendingExpired = await db
        .select()
        .from(colonizationEvents)
        .where(and(
          eq(colonizationEvents.processId, processId),
          eq(colonizationEvents.status, 'pending'),
          lt(colonizationEvents.expiresAt, now),
        ));

      let totalPenalty = 0;
      for (const event of pendingExpired) {
        totalPenalty += event.penalty;
        await db
          .update(colonizationEvents)
          .set({ status: 'expired' })
          .where(eq(colonizationEvents.id, event.id));
      }

      if (totalPenalty > 0) {
        await db
          .update(colonizationProcesses)
          .set({ progress: sql`GREATEST(${colonizationProcesses.progress} - ${totalPenalty}, 0)` })
          .where(eq(colonizationProcesses.id, processId));
      }

      return totalPenalty;
    },

    /** Generate a random event if interval has elapsed */
    async maybeGenerateEvent(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, processId), eq(colonizationProcesses.status, 'active')))
        .limit(1);

      if (!process) return null;

      const config = await gameConfigService.getFullConfig();
      const interval = Number(config.universe.colonization_event_interval) || 7200;
      const now = new Date();
      const elapsed = (now.getTime() - new Date(process.lastEventAt).getTime()) / 1000;

      if (elapsed < interval) return null;

      const deadlineMin = Number(config.universe.colonization_event_deadline_min) || 14400;
      const deadlineMax = Number(config.universe.colonization_event_deadline_max) || 21600;
      const deadline = deadlineMin + Math.random() * (deadlineMax - deadlineMin);

      const eventType = Math.random() < 0.5 ? 'raid' : 'shortage';
      const penalty = eventType === 'raid'
        ? Number(config.universe.colonization_event_raid_penalty) || 0.12
        : Number(config.universe.colonization_event_shortage_penalty) || 0.12;
      const resolveBonus = Number(config.universe.colonization_event_resolve_bonus) || 0.04;

      const [event] = await db
        .insert(colonizationEvents)
        .values({
          processId,
          eventType: eventType as 'raid' | 'shortage',
          penalty,
          resolveBonus,
          expiresAt: new Date(now.getTime() + deadline * 1000),
        })
        .returning();

      await db
        .update(colonizationProcesses)
        .set({ lastEventAt: now })
        .where(eq(colonizationProcesses.id, processId));

      return event;
    },

    /** Resolve a pending event */
    async resolveEvent(eventId: string, userId: string) {
      const [event] = await db
        .select()
        .from(colonizationEvents)
        .where(and(eq(colonizationEvents.id, eventId), eq(colonizationEvents.status, 'pending')))
        .limit(1);

      if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found or already resolved' });

      // Verify ownership
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, event.processId), eq(colonizationProcesses.userId, userId)))
        .limit(1);

      if (!process) throw new TRPCError({ code: 'FORBIDDEN' });

      const now = new Date();
      await db
        .update(colonizationEvents)
        .set({ status: 'resolved', resolvedAt: now })
        .where(eq(colonizationEvents.id, eventId));

      // Apply resolve bonus
      await db
        .update(colonizationProcesses)
        .set({ progress: sql`LEAST(${colonizationProcesses.progress} + ${event.resolveBonus}, 1)` })
        .where(eq(colonizationProcesses.id, process.id));

      return { resolved: true, bonus: event.resolveBonus };
    },

    /** Apply a mission boost to progress */
    async applyBoost(processId: string, boostAmount: number) {
      await db
        .update(colonizationProcesses)
        .set({ progress: sql`LEAST(${colonizationProcesses.progress} + ${boostAmount}, 1)` })
        .where(eq(colonizationProcesses.id, processId));
    },

    /** Local action: establish outpost (one-shot, costs resources) */
    async consolidate(userId: string, planetId: string) {
      const process = await this.getProcess(planetId);
      if (!process || process.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active colonization process' });
      }

      if (process.consolidateCompleted) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "L'avant-poste a deja ete etabli" });
      }

      const config = await gameConfigService.getFullConfig();
      const boost = Number(config.universe.colonization_consolidate_boost) || 0.20;
      const costMinerai = Number(config.universe.colonization_consolidate_cost_minerai) || 2000;
      const costSilicium = Number(config.universe.colonization_consolidate_cost_silicium) || 1000;

      // Check and deduct resources from the colonizing planet
      const [planet] = await db
        .select({ minerai: planets.minerai, silicium: planets.silicium })
        .from(planets)
        .where(eq(planets.id, planetId))
        .limit(1);

      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });

      const currentMinerai = Number(planet.minerai);
      const currentSilicium = Number(planet.silicium);

      if (currentMinerai < costMinerai || currentSilicium < costSilicium) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Ressources insuffisantes (${costMinerai} minerai + ${costSilicium} silicium requis, disponible : ${Math.floor(currentMinerai)} minerai + ${Math.floor(currentSilicium)} silicium)`,
        });
      }

      // Deduct resources atomically
      await db
        .update(planets)
        .set({
          minerai: sql`${planets.minerai} - ${costMinerai}`,
          silicium: sql`${planets.silicium} - ${costSilicium}`,
        })
        .where(eq(planets.id, planetId));

      await this.applyBoost(process.id, boost);
      await db
        .update(colonizationProcesses)
        .set({ consolidateCompleted: true })
        .where(eq(colonizationProcesses.id, process.id));

      return { boosted: true, amount: boost };
    },

    /** Player-triggered completion — validates progress >= 0.995 */
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

      // Get Imperial Power Center level (on any of the user's planets)
      const config = await gameConfigService.getFullConfig();

      const allIpc = await db
        .select()
        .from(planetBuildings)
        .where(eq(planetBuildings.buildingId, 'imperialPowerCenter'));

      const userPlanetIds = new Set(userPlanets.map(p => p.id));
      const ipc = allIpc.find(b => userPlanetIds.has(b.planetId));
      const ipcLevel = ipc?.level ?? 0;

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
