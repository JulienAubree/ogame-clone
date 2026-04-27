import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, buildQueue, planetBuildings } from '@exilium/db';
import type { Database } from '@exilium/db';
import { buildingCost, buildingTime, resolveBonus } from '@exilium/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import { getGovernancePenalty } from '../../lib/governance.js';
import type { Queue } from 'bullmq';
import type { BuildCompletionResult } from '../../workers/completion.types.js';
import type { createDailyQuestService } from '../daily-quest/daily-quest.service.js';

export function createBuildingService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  completionQueue: Queue,
  gameConfigService: GameConfigService,
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
  dailyQuestService?: ReturnType<typeof createDailyQuestService>,
) {
  return {
    async getBuildingLevels(planetId: string): Promise<Record<string, number>> {
      const rows = await db
        .select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
        .from(planetBuildings)
        .where(eq(planetBuildings.planetId, planetId));
      const levels: Record<string, number> = {};
      for (const row of rows) {
        levels[row.buildingId] = row.level;
      }
      return levels;
    },

    async listBuildings(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const config = await gameConfigService.getFullConfig();
      const buildingLevels = await this.getBuildingLevels(planetId);

      const [activeBuild] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.type, 'building'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      const phaseMap = config.universe.phase_multiplier
        ? Object.fromEntries(Object.entries(config.universe.phase_multiplier as Record<string, number>).map(([k, v]) => [Number(k), v]))
        : undefined;

      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const talentTimeMultiplier = 1 / (1 + (talentCtx['building_time'] ?? 0));

      // Governance construction penalty (non-homeworld only)
      const govPenalty = await getGovernancePenalty(db, userId, planet.planetClassId, config);
      const govTimeMult = 1 + govPenalty.constructionMalus;

      // Fetch cross-planet max building levels for annex prerequisite display
      const hasAnnex = Object.values(config.buildings).some(
        (def) => def.allowedPlanetTypes && def.allowedPlanetTypes.includes(planet.planetClassId ?? ''),
      );
      let globalBuildingLevels: Record<string, number> | null = null;
      if (hasAnnex) {
        const allRows = await db
          .select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
          .from(planetBuildings)
          .innerJoin(planets, eq(planets.id, planetBuildings.planetId))
          .where(eq(planets.userId, userId));
        globalBuildingLevels = {};
        for (const row of allRows) {
          globalBuildingLevels[row.buildingId] = Math.max(globalBuildingLevels[row.buildingId] ?? 0, row.level);
        }
      }

      return Object.values(config.buildings)
        .filter((def) => {
          const allowed = def.allowedPlanetTypes;
          if (!allowed) return true;
          return allowed.includes(planet.planetClassId ?? '');
        })
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const currentLevel = buildingLevels[def.id] ?? 0;
          const nextLevel = currentLevel + 1;
          const cost = buildingCost(def, nextLevel, phaseMap);
          const bonusMultiplier = resolveBonus('building_time', null, buildingLevels, config.bonuses);
          const time = Math.max(1, Math.floor(buildingTime(def, nextLevel, bonusMultiplier * talentTimeMultiplier, phaseMap) * govTimeMult));

          // For annex buildings, resolve prerequisites cross-planet
          const prereqLevels = def.allowedPlanetTypes ? (globalBuildingLevels ?? buildingLevels) : buildingLevels;
          const resolvedPrereqs = def.prerequisites.map(p => ({
            buildingId: p.buildingId,
            level: p.level,
            currentLevel: prereqLevels[p.buildingId] ?? 0,
          }));

          return {
            id: def.id,
            name: def.name,
            description: def.description,
            currentLevel,
            nextLevelCost: cost,
            nextLevelTime: time,
            prerequisites: resolvedPrereqs,
            isUpgrading: activeBuild?.itemId === def.id,
            upgradeEndTime: activeBuild?.itemId === def.id ? activeBuild.endTime.toISOString() : null,
          };
        });
    },

    async startUpgrade(userId: string, planetId: string, buildingId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);

      if (planet.status === 'colonizing') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Construction impossible pendant la colonisation' });
      }

      const config = await gameConfigService.getFullConfig();
      const def = config.buildings[buildingId];
      if (!def) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bâtiment invalide' });

      // Check no active building construction on this planet
      const [activeBuild] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.type, 'building'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      if (activeBuild) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Construction déjà en cours' });
      }

      // Check planet type restriction
      const allowedTypes = def.allowedPlanetTypes;
      if (allowedTypes && !allowedTypes.includes(planet.planetClassId ?? '')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Ce batiment ne peut pas etre construit sur ce type de planete',
        });
      }

      const buildingLevels = await this.getBuildingLevels(planetId);

      // Check prerequisites
      // For buildings restricted to specific planet types (annexes), check prerequisites
      // across ALL player's planets (e.g., researchLab on homeworld)
      let prereqLevels = buildingLevels;
      if (allowedTypes) {
        const allPlanetRows = await db
          .select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
          .from(planetBuildings)
          .innerJoin(planets, eq(planets.id, planetBuildings.planetId))
          .where(eq(planets.userId, userId));
        const globalLevels: Record<string, number> = {};
        for (const row of allPlanetRows) {
          globalLevels[row.buildingId] = Math.max(globalLevels[row.buildingId] ?? 0, row.level);
        }
        prereqLevels = globalLevels;
      }

      for (const prereq of def.prerequisites) {
        const prereqLevel = prereqLevels[prereq.buildingId] ?? 0;
        if (prereqLevel < prereq.level) {
          const prereqDef = config.buildings[prereq.buildingId];
          const prereqName = prereqDef?.name ?? prereq.buildingId;
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Prerequis non rempli : ${prereqName} niveau ${prereq.level}`,
          });
        }
      }

      const phaseMap = config.universe.phase_multiplier
        ? Object.fromEntries(Object.entries(config.universe.phase_multiplier as Record<string, number>).map(([k, v]) => [Number(k), v]))
        : undefined;

      const currentLevel = buildingLevels[buildingId] ?? 0;
      const nextLevel = currentLevel + 1;
      const cost = buildingCost(def, nextLevel, phaseMap);
      const bonusMultiplier = resolveBonus('building_time', null, buildingLevels, config.bonuses);
      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const talentTimeMultiplier = 1 / (1 + (talentCtx['building_time'] ?? 0));
      const govPenaltyUpgrade = await getGovernancePenalty(db, userId, planet.planetClassId, config);
      const govTimeMultUpgrade = 1 + govPenaltyUpgrade.constructionMalus;
      const time = Math.max(1, Math.floor(buildingTime(def, nextLevel, bonusMultiplier * talentTimeMultiplier, phaseMap) * govTimeMultUpgrade));

      // Spend resources (atomic)
      await resourceService.spendResources(planetId, userId, cost);

      // Create build queue entry
      const now = new Date();
      const endTime = new Date(now.getTime() + time * 1000);

      const [entry] = await db
        .insert(buildQueue)
        .values({
          planetId,
          userId,
          type: 'building',
          itemId: buildingId,
          startTime: now,
          endTime,
          status: 'active',
        })
        .returning();

      // Schedule BullMQ delayed job
      await completionQueue.add(
        'building',
        { buildQueueId: entry.id },
        { delay: time * 1000, jobId: `building-${entry.id}` },
      );

      // Hook: daily quest detection for construction start
      if (dailyQuestService) {
        dailyQuestService.processEvent({
          type: 'construction:started',
          userId,
          payload: { buildingId },
        }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
      }

      return { entry, endTime: endTime.toISOString(), buildingTime: time };
    },

    async cancelUpgrade(userId: string, planetId: string) {
      const [activeBuild] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.userId, userId),
            eq(buildQueue.type, 'building'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      if (!activeBuild) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune construction en cours' });
      }

      const config = await gameConfigService.getFullConfig();
      const cancelRefundRatio = Number(config.universe.cancel_refund_ratio) || 0.7;
      const def = config.buildings[activeBuild.itemId];
      const planet = await this.getOwnedPlanet(userId, planetId);
      const buildingLevels = await this.getBuildingLevels(planetId);
      const currentLevel = buildingLevels[activeBuild.itemId] ?? 0;
      const phaseMap = config.universe.phase_multiplier
        ? Object.fromEntries(Object.entries(config.universe.phase_multiplier as Record<string, number>).map(([k, v]) => [Number(k), v]))
        : undefined;
      const cost = def ? buildingCost(def, currentLevel + 1, phaseMap) : { minerai: 0, silicium: 0, hydrogene: 0 };

      // Pro-rata refund capped at 70%
      const now = Date.now();
      const totalDuration = new Date(activeBuild.endTime).getTime() - new Date(activeBuild.startTime).getTime();
      const timeLeft = Math.max(0, new Date(activeBuild.endTime).getTime() - now);
      const refundRatio = Math.min(cancelRefundRatio, totalDuration > 0 ? timeLeft / totalDuration : 0);
      const refund = {
        minerai: Math.floor(cost.minerai * refundRatio),
        silicium: Math.floor(cost.silicium * refundRatio),
        hydrogene: Math.floor(cost.hydrogene * refundRatio),
      };

      await db
        .update(planets)
        .set({
          minerai: String(Number(planet.minerai) + refund.minerai),
          silicium: String(Number(planet.silicium) + refund.silicium),
          hydrogene: String(Number(planet.hydrogene) + refund.hydrogene),
        })
        .where(eq(planets.id, planetId));

      // Remove BullMQ job
      await completionQueue.remove(`building-${activeBuild.id}`);

      // Delete queue entry
      await db.delete(buildQueue).where(eq(buildQueue.id, activeBuild.id));

      return { cancelled: true, refund };
    },

    async completeUpgrade(buildQueueId: string): Promise<BuildCompletionResult> {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const config = await gameConfigService.getFullConfig();
      const def = config.buildings[entry.itemId];
      if (!def) return null;

      const buildingLevels = await this.getBuildingLevels(entry.planetId);
      const currentLevel = buildingLevels[entry.itemId] ?? 0;
      const newLevel = currentLevel + 1;

      // Upsert planet building level (unchanged)
      await db
        .insert(planetBuildings)
        .values({ planetId: entry.planetId, buildingId: entry.itemId, level: newLevel })
        .onConflictDoUpdate({
          target: [planetBuildings.planetId, planetBuildings.buildingId],
          set: { level: newLevel },
        });

      // Mark queue entry as completed (unchanged)
      await db
        .update(buildQueue)
        .set({ status: 'completed' })
        .where(eq(buildQueue.id, buildQueueId));

      // NEW: fetch planet name and build standardized result
      const [planet] = await db
        .select({ name: planets.name })
        .from(planets)
        .where(eq(planets.id, entry.planetId))
        .limit(1);

      const buildingName = config.buildings[entry.itemId]?.name ?? entry.itemId;
      const planetName = planet?.name ?? 'Planète';

      return {
        userId: entry.userId,
        planetId: entry.planetId,
        eventType: 'building-done',
        notificationPayload: {
          planetId: entry.planetId,
          planetName,
          buildingId: entry.itemId,
          name: buildingName,
          level: newLevel,
        },
        eventPayload: {
          buildingId: entry.itemId,
          name: buildingName,
          level: newLevel,
          planetName,
        },
        tutorialCheck: {
          type: 'building_level',
          targetId: entry.itemId,
          targetValue: newLevel,
        },
      };
    },

    async getOwnedPlanet(userId: string, planetId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return planet;
    },
  };
}
