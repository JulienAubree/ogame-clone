import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, userResearch, buildQueue } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  RESEARCH,
  researchCost,
  researchTime,
  checkResearchPrerequisites,
  type ResearchId,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { Queue } from 'bullmq';

const RESEARCH_LEVEL_COLUMNS: Record<ResearchId, keyof typeof userResearch.$inferSelect> = {
  espionageTech: 'espionageTech',
  computerTech: 'computerTech',
  energyTech: 'energyTech',
  combustion: 'combustion',
  impulse: 'impulse',
  hyperspaceDrive: 'hyperspaceDrive',
  weapons: 'weapons',
  shielding: 'shielding',
  armor: 'armor',
};

export function createResearchService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  researchQueue: Queue,
) {
  return {
    async listResearch(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const research = await this.getOrCreateResearch(userId);

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

      return Object.values(RESEARCH).map((def) => {
        const currentLevel = (research[RESEARCH_LEVEL_COLUMNS[def.id]] ?? 0) as number;
        const nextLevel = currentLevel + 1;
        const cost = researchCost(def.id, nextLevel);
        const time = researchTime(def.id, nextLevel, planet.researchLabLevel);

        const buildingLevels: Record<string, number> = {
          researchLabLevel: planet.researchLabLevel,
          shipyardLevel: planet.shipyardLevel,
        };
        const researchLevels: Record<string, number> = {};
        for (const [key, col] of Object.entries(RESEARCH_LEVEL_COLUMNS)) {
          researchLevels[key] = (research[col] ?? 0) as number;
        }
        const prereqCheck = checkResearchPrerequisites(def.id, buildingLevels, researchLevels);

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          currentLevel,
          nextLevelCost: cost,
          nextLevelTime: time,
          prerequisitesMet: prereqCheck.met,
          missingPrerequisites: prereqCheck.missing,
          isResearching: activeResearch?.itemId === def.id,
          researchEndTime: activeResearch?.itemId === def.id ? activeResearch.endTime.toISOString() : null,
        };
      });
    },

    async startResearch(userId: string, planetId: string, researchId: ResearchId) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const research = await this.getOrCreateResearch(userId);

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

      const buildingLevels: Record<string, number> = {
        researchLabLevel: planet.researchLabLevel,
        shipyardLevel: planet.shipyardLevel,
      };
      const researchLevels: Record<string, number> = {};
      for (const [key, col] of Object.entries(RESEARCH_LEVEL_COLUMNS)) {
        researchLevels[key] = (research[col] ?? 0) as number;
      }
      const prereqCheck = checkResearchPrerequisites(researchId, buildingLevels, researchLevels);
      if (!prereqCheck.met) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Prérequis non remplis: ${prereqCheck.missing.join(', ')}` });
      }

      const currentLevel = (research[RESEARCH_LEVEL_COLUMNS[researchId]] ?? 0) as number;
      const nextLevel = currentLevel + 1;
      const cost = researchCost(researchId, nextLevel);
      const time = researchTime(researchId, nextLevel, planet.researchLabLevel);

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

      await researchQueue.add(
        'complete',
        { buildQueueId: entry.id },
        { delay: time * 1000, jobId: `research-${entry.id}` },
      );

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

      const research = await this.getOrCreateResearch(userId);
      const researchId = activeResearch.itemId as ResearchId;
      const currentLevel = (research[RESEARCH_LEVEL_COLUMNS[researchId]] ?? 0) as number;
      const cost = researchCost(researchId, currentLevel + 1);

      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, activeResearch.planetId))
        .limit(1);

      if (planet) {
        await db
          .update(planets)
          .set({
            metal: String(Number(planet.metal) + cost.metal),
            crystal: String(Number(planet.crystal) + cost.crystal),
            deuterium: String(Number(planet.deuterium) + cost.deuterium),
          })
          .where(eq(planets.id, planet.id));
      }

      await researchQueue.remove(`research-${activeResearch.id}`);
      await db.delete(buildQueue).where(eq(buildQueue.id, activeResearch.id));

      return { cancelled: true };
    },

    async completeResearch(buildQueueId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const researchId = entry.itemId as ResearchId;
      const columnKey = RESEARCH_LEVEL_COLUMNS[researchId];
      const research = await this.getOrCreateResearch(entry.userId);
      const newLevel = ((research[columnKey] ?? 0) as number) + 1;

      await db
        .update(userResearch)
        .set({ [columnKey]: newLevel })
        .where(eq(userResearch.userId, entry.userId));

      await db
        .update(buildQueue)
        .set({ status: 'completed' })
        .where(eq(buildQueue.id, buildQueueId));

      return { researchId, newLevel };
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
