import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, buildQueue, planetBuildings } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { buildingCost, buildingTime } from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { Queue } from 'bullmq';

export function createBuildingService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  buildingQueue: Queue,
  gameConfigService: GameConfigService,
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

      return Object.values(config.buildings)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const currentLevel = buildingLevels[def.id] ?? 0;
          const nextLevel = currentLevel + 1;
          const cost = buildingCost(def, nextLevel);
          const time = buildingTime(def, nextLevel, buildingLevels['robotics'] ?? 0);

          return {
            id: def.id,
            name: def.name,
            description: def.description,
            currentLevel,
            nextLevelCost: cost,
            nextLevelTime: time,
            prerequisites: def.prerequisites,
            isUpgrading: activeBuild?.itemId === def.id,
            upgradeEndTime: activeBuild?.itemId === def.id ? activeBuild.endTime.toISOString() : null,
          };
        });
    },

    async startUpgrade(userId: string, planetId: string, buildingId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
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

      const buildingLevels = await this.getBuildingLevels(planetId);

      // Check prerequisites
      for (const prereq of def.prerequisites) {
        const prereqLevel = buildingLevels[prereq.buildingId] ?? 0;
        if (prereqLevel < prereq.level) {
          const prereqDef = config.buildings[prereq.buildingId];
          const prereqName = prereqDef?.name ?? prereq.buildingId;
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Prérequis non rempli : ${prereqName} niveau ${prereq.level}`,
          });
        }
      }

      // Check building slots
      const totalLevels = Object.values(buildingLevels).reduce((sum, lvl) => sum + lvl, 0);

      if (totalLevels >= planet.maxFields) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Plus de champs disponibles' });
      }

      const currentLevel = buildingLevels[buildingId] ?? 0;
      const nextLevel = currentLevel + 1;
      const cost = buildingCost(def, nextLevel);
      const time = buildingTime(def, nextLevel, buildingLevels['robotics'] ?? 0);

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
      await buildingQueue.add(
        'complete',
        { buildQueueId: entry.id },
        { delay: time * 1000, jobId: `building-${entry.id}` },
      );

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
      const def = config.buildings[activeBuild.itemId];
      const planet = await this.getOwnedPlanet(userId, planetId);
      const buildingLevels = await this.getBuildingLevels(planetId);
      const currentLevel = buildingLevels[activeBuild.itemId] ?? 0;
      const cost = def ? buildingCost(def, currentLevel + 1) : { minerai: 0, silicium: 0, hydrogene: 0 };

      // Refund resources
      await db
        .update(planets)
        .set({
          minerai: String(Number(planet.minerai) + cost.minerai),
          silicium: String(Number(planet.silicium) + cost.silicium),
          hydrogene: String(Number(planet.hydrogene) + cost.hydrogene),
        })
        .where(eq(planets.id, planetId));

      // Remove BullMQ job
      await buildingQueue.remove(`building-${activeBuild.id}`);

      // Delete queue entry
      await db.delete(buildQueue).where(eq(buildQueue.id, activeBuild.id));

      return { cancelled: true };
    },

    async completeUpgrade(buildQueueId: string) {
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

      // Upsert planet building level
      await db
        .insert(planetBuildings)
        .values({ planetId: entry.planetId, buildingId: entry.itemId, level: newLevel })
        .onConflictDoUpdate({
          target: [planetBuildings.planetId, planetBuildings.buildingId],
          set: { level: newLevel },
        });

      // Mark queue entry as completed
      await db
        .update(buildQueue)
        .set({ status: 'completed' })
        .where(eq(buildQueue.id, buildQueueId));

      return { buildingId: entry.itemId, newLevel };
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
