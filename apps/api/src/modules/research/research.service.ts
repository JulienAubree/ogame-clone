import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, userResearch, buildQueue, planetBuildings } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { researchCost, researchTime, checkResearchPrerequisites, resolveBonus } from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { Queue } from 'bullmq';

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

export function createResearchService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  researchQueue: Queue,
  gameConfigService: GameConfigService,
) {
  return {
    async listResearch(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
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

      return Object.values(config.research)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const currentLevel = (research[def.levelColumn as keyof typeof research] ?? 0) as number;
          const nextLevel = currentLevel + 1;
          const cost = researchCost(def, nextLevel);
          const bonusMultiplier = resolveBonus('research_time', null, buildingLevels, config.bonuses);
          const time = researchTime(def, nextLevel, bonusMultiplier);

          const researchLevels: Record<string, number> = {};
          for (const [key, rDef] of Object.entries(config.research)) {
            researchLevels[key] = (research[rDef.levelColumn as keyof typeof research] ?? 0) as number;
          }
          const prereqCheck = checkResearchPrerequisites(def.prerequisites, buildingLevels, researchLevels);

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

    async startResearch(userId: string, planetId: string, researchId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
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

      const currentLevel = (research[def.levelColumn as keyof typeof research] ?? 0) as number;
      const nextLevel = currentLevel + 1;
      const cost = researchCost(def, nextLevel);
      const bonusMultiplier = resolveBonus('research_time', null, buildingLevels, config.bonuses);
      const time = researchTime(def, nextLevel, bonusMultiplier);

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

      const config = await gameConfigService.getFullConfig();
      const def = config.research[activeResearch.itemId];
      const research = await this.getOrCreateResearch(userId);
      const currentLevel = def
        ? (research[def.levelColumn as keyof typeof research] ?? 0) as number
        : 0;
      const cost = def ? researchCost(def, currentLevel + 1) : { minerai: 0, silicium: 0, hydrogene: 0 };

      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, activeResearch.planetId))
        .limit(1);

      if (planet) {
        await db
          .update(planets)
          .set({
            minerai: String(Number(planet.minerai) + cost.minerai),
            silicium: String(Number(planet.silicium) + cost.silicium),
            hydrogene: String(Number(planet.hydrogene) + cost.hydrogene),
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

      return { researchId: entry.itemId, newLevel };
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
