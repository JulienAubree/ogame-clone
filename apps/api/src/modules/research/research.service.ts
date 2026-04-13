import { eq, and, sql, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, userResearch, buildQueue, planetBuildings, discoveredBiomes } from '@exilium/db';
import type { Database } from '@exilium/db';
import { researchCost, researchTime, checkResearchPrerequisites, resolveBonus, researchAnnexBonus, researchBiomeBonus } from '@exilium/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { Queue } from 'bullmq';
import type { BuildCompletionResult } from '../../workers/completion.types.js';
import type { createDailyQuestService } from '../daily-quest/daily-quest.service.js';

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

const ANNEX_BUILDING_IDS = ['labVolcanic', 'labArid', 'labTemperate', 'labGlacial', 'labGaseous'];

async function getAnnexLevelsSum(db: Database, userId: string): Promise<number> {
  const userPlanets = db
    .select({ id: planets.id })
    .from(planets)
    .where(eq(planets.userId, userId));

  const [result] = await db
    .select({ total: sql<number>`coalesce(sum(${planetBuildings.level}), 0)` })
    .from(planetBuildings)
    .where(
      and(
        inArray(planetBuildings.planetId, userPlanets),
        inArray(planetBuildings.buildingId, ANNEX_BUILDING_IDS),
      ),
    );
  return Number(result?.total ?? 0);
}

async function getDiscoveredBiomesCount(db: Database, userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(discoveredBiomes)
    .where(eq(discoveredBiomes.userId, userId));
  return Number(result?.count ?? 0);
}

async function hasAnnexOfType(db: Database, userId: string, annexType: string): Promise<boolean> {
  const annexBuildingId = `lab${annexType.charAt(0).toUpperCase()}${annexType.slice(1)}`;
  const userPlanets = db
    .select({ id: planets.id })
    .from(planets)
    .where(eq(planets.userId, userId));

  const [result] = await db
    .select({ level: planetBuildings.level })
    .from(planetBuildings)
    .where(
      and(
        inArray(planetBuildings.planetId, userPlanets),
        eq(planetBuildings.buildingId, annexBuildingId),
      ),
    )
    .limit(1);
  return (result?.level ?? 0) >= 1;
}

export function createResearchService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  completionQueue: Queue,
  gameConfigService: GameConfigService,
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
  dailyQuestService?: ReturnType<typeof createDailyQuestService>,
) {
  return {
    async listResearch(userId: string, planetId: string) {
      await this.getOwnedPlanet(userId, planetId);
      const research = await this.getOrCreateResearch(userId);
      const config = await gameConfigService.getFullConfig();
      const buildingLevels = await getBuildingLevels(db, planetId);

      const [activeResearch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.userId, userId),
            eq(buildQueue.type, 'research'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      const phaseMap = config.universe.phase_multiplier
        ? Object.fromEntries(Object.entries(config.universe.phase_multiplier as Record<string, number>).map(([k, v]) => [Number(k), v]))
        : undefined;
      const timeDivisor = Number(config.universe.research_time_divisor) || 1000;
      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const talentTimeMultiplier = 1 / (1 + (talentCtx['research_time'] ?? 0));
      const hullTimeMultiplier = 1 - (talentCtx['hull_research_time_reduction'] ?? 0);

      const annexLevelsSum = await getAnnexLevelsSum(db, userId);
      const annexBonusMultiplier = researchAnnexBonus(annexLevelsSum);
      const discoveredBiomesCount = await getDiscoveredBiomesCount(db, userId);
      const biomeBonusMultiplier = researchBiomeBonus(discoveredBiomesCount);

      const results = await Promise.all(
        Object.values(config.research)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(async (def) => {
            const currentLevel = (research[def.levelColumn as keyof typeof research] ?? 0) as number;
            const nextLevel = currentLevel + 1;
            const cost = researchCost(def, nextLevel, phaseMap);
            const bonusMultiplier = resolveBonus('research_time', null, buildingLevels, config.bonuses);
            const time = Math.max(1, Math.floor(researchTime(def, nextLevel, bonusMultiplier, { timeDivisor, phaseMap }) * talentTimeMultiplier * hullTimeMultiplier * annexBonusMultiplier * biomeBonusMultiplier));

            const researchLevels: Record<string, number> = {};
            for (const [key, rDef] of Object.entries(config.research)) {
              researchLevels[key] = (research[rDef.levelColumn as keyof typeof research] ?? 0) as number;
            }
            const prereqCheck = checkResearchPrerequisites(def.prerequisites, buildingLevels, researchLevels);

            // Check annex prerequisite if required
            const requiredAnnex = (def as { requiredAnnexType?: string | null }).requiredAnnexType;
            let annexMet = true;
            if (requiredAnnex) {
              annexMet = await hasAnnexOfType(db, userId, requiredAnnex);
            }

            return {
              id: def.id,
              name: def.name,
              description: def.description,
              currentLevel,
              nextLevelCost: cost,
              nextLevelTime: time,
              prerequisitesMet: prereqCheck.met && annexMet,
              missingPrerequisites: [
                ...prereqCheck.missing,
                ...(requiredAnnex && !annexMet ? [`Requires annex: ${requiredAnnex}`] : []),
              ],
              requiredAnnexType: requiredAnnex ?? null,
              isResearching: activeResearch?.itemId === def.id,
              researchEndTime: activeResearch?.itemId === def.id ? activeResearch.endTime.toISOString() : null,
            };
          }),
      );
      return results;
    },

    async startResearch(userId: string, planetId: string, researchId: string) {
      await this.getOwnedPlanet(userId, planetId);
      const research = await this.getOrCreateResearch(userId);
      const config = await gameConfigService.getFullConfig();
      const def = config.research[researchId];
      if (!def) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Recherche invalide' });

      const [activeResearch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.userId, userId),
            eq(buildQueue.type, 'research'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      if (activeResearch) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Recherche déjà en cours' });
      }

      const buildingLevels = await getBuildingLevels(db, planetId);
      const researchLevels: Record<string, number> = {};
      for (const [key, rDef] of Object.entries(config.research)) {
        researchLevels[key] = (research[rDef.levelColumn as keyof typeof research] ?? 0) as number;
      }
      const prereqCheck = checkResearchPrerequisites(def.prerequisites, buildingLevels, researchLevels);
      if (!prereqCheck.met) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Prérequis non remplis: ${prereqCheck.missing.join(', ')}` });
      }

      // Check annex prerequisite
      const requiredAnnex = (def as { requiredAnnexType?: string | null }).requiredAnnexType;
      if (requiredAnnex) {
        const hasAnnex = await hasAnnexOfType(db, userId, requiredAnnex);
        if (!hasAnnex) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Annexe requise : ${requiredAnnex}` });
        }
      }

      const currentLevel = (research[def.levelColumn as keyof typeof research] ?? 0) as number;
      const nextLevel = currentLevel + 1;
      if (def.maxLevel != null && nextLevel > def.maxLevel) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Niveau maximum atteint (${def.maxLevel})` });
      }
      const phaseMap = config.universe.phase_multiplier
        ? Object.fromEntries(Object.entries(config.universe.phase_multiplier as Record<string, number>).map(([k, v]) => [Number(k), v]))
        : undefined;
      const timeDivisor = Number(config.universe.research_time_divisor) || 1000;
      const cost = researchCost(def, nextLevel, phaseMap);
      const bonusMultiplier = resolveBonus('research_time', null, buildingLevels, config.bonuses);
      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const talentTimeMultiplier = 1 / (1 + (talentCtx['research_time'] ?? 0));
      const hullTimeMultiplier = 1 - (talentCtx['hull_research_time_reduction'] ?? 0);
      const annexLevelsSum = await getAnnexLevelsSum(db, userId);
      const annexBonusMultiplier = researchAnnexBonus(annexLevelsSum);
      const discoveredBiomesCount = await getDiscoveredBiomesCount(db, userId);
      const biomeBonusMultiplier = researchBiomeBonus(discoveredBiomesCount);
      const time = Math.max(1, Math.floor(researchTime(def, nextLevel, bonusMultiplier, { timeDivisor, phaseMap }) * talentTimeMultiplier * hullTimeMultiplier * annexBonusMultiplier * biomeBonusMultiplier));

      await resourceService.spendResources(planetId, userId, cost);

      const now = new Date();
      const endTime = new Date(now.getTime() + time * 1000);

      const [entry] = await db
        .insert(buildQueue)
        .values({
          planetId,
          userId,
          type: 'research',
          itemId: researchId,
          startTime: now,
          endTime,
          status: 'active',
        })
        .returning();

      await completionQueue.add(
        'research',
        { buildQueueId: entry.id },
        { delay: time * 1000, jobId: `research-${entry.id}` },
      );

      // Hook: daily quest detection for construction start
      if (dailyQuestService) {
        dailyQuestService.processEvent({
          type: 'construction:started',
          userId,
          payload: { researchId },
        }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
      }

      return { entry, endTime: endTime.toISOString(), researchTime: time };
    },

    async cancelResearch(userId: string) {
      const [activeResearch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.userId, userId),
            eq(buildQueue.type, 'research'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      if (!activeResearch) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune recherche en cours' });
      }

      const config = await gameConfigService.getFullConfig();
      const cancelRefundRatio = Number(config.universe.cancel_refund_ratio) || 0.7;
      const def = config.research[activeResearch.itemId];
      const research = await this.getOrCreateResearch(userId);
      const currentLevel = def
        ? (research[def.levelColumn as keyof typeof research] ?? 0) as number
        : 0;
      const phaseMap = config.universe.phase_multiplier
        ? Object.fromEntries(Object.entries(config.universe.phase_multiplier as Record<string, number>).map(([k, v]) => [Number(k), v]))
        : undefined;
      const cost = def ? researchCost(def, currentLevel + 1, phaseMap) : { minerai: 0, silicium: 0, hydrogene: 0 };

      // Pro-rata refund capped at 70%
      const now = Date.now();
      const totalDuration = new Date(activeResearch.endTime).getTime() - new Date(activeResearch.startTime).getTime();
      const remaining = Math.max(0, new Date(activeResearch.endTime).getTime() - now);
      const refundRatio = Math.min(cancelRefundRatio, totalDuration > 0 ? remaining / totalDuration : 0);
      const refund = {
        minerai: Math.floor(cost.minerai * refundRatio),
        silicium: Math.floor(cost.silicium * refundRatio),
        hydrogene: Math.floor(cost.hydrogene * refundRatio),
      };

      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, activeResearch.planetId))
        .limit(1);

      if (planet) {
        await db
          .update(planets)
          .set({
            minerai: String(Number(planet.minerai) + refund.minerai),
            silicium: String(Number(planet.silicium) + refund.silicium),
            hydrogene: String(Number(planet.hydrogene) + refund.hydrogene),
          })
          .where(eq(planets.id, planet.id));
      }

      await completionQueue.remove(`research-${activeResearch.id}`);
      await db.delete(buildQueue).where(eq(buildQueue.id, activeResearch.id));

      return { cancelled: true, refund };
    },

    async completeResearch(buildQueueId: string): Promise<BuildCompletionResult> {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const config = await gameConfigService.getFullConfig();
      const def = config.research[entry.itemId];
      if (!def) return null;

      const columnKey = def.levelColumn;
      const research = await this.getOrCreateResearch(entry.userId);
      const newLevel = ((research[columnKey as keyof typeof research] ?? 0) as number) + 1;

      await db
        .update(userResearch)
        .set({ [columnKey]: newLevel })
        .where(eq(userResearch.userId, entry.userId));

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

      const techName = config.research[entry.itemId]?.name ?? entry.itemId;
      const planetName = planet?.name ?? 'Planète';

      return {
        userId: entry.userId,
        planetId: entry.planetId,
        eventType: 'research-done',
        notificationPayload: {
          techId: entry.itemId,
          name: techName,
          level: newLevel,
        },
        eventPayload: {
          techId: entry.itemId,
          name: techName,
          level: newLevel,
          planetName,
        },
        tutorialCheck: {
          type: 'research_level',
          targetId: entry.itemId,
          targetValue: newLevel,
        },
      };
    },

    async getOrCreateResearch(userId: string) {
      const [existing] = await db
        .select()
        .from(userResearch)
        .where(eq(userResearch.userId, userId))
        .limit(1);

      if (existing) return existing;

      const [created] = await db
        .insert(userResearch)
        .values({ userId })
        .returning();

      return created;
    },

    async getOwnedPlanet(userId: string, planetId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });
      return planet;
    },
  };
}
