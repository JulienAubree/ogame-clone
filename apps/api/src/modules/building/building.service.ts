import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, buildQueue } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  BUILDINGS,
  buildingCost,
  buildingTime,
  type BuildingId,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { Queue } from 'bullmq';

const BUILDING_LEVEL_COLUMNS: Record<BuildingId, keyof typeof planets.$inferSelect> = {
  metalMine: 'metalMineLevel',
  crystalMine: 'crystalMineLevel',
  deutSynth: 'deutSynthLevel',
  solarPlant: 'solarPlantLevel',
  robotics: 'roboticsLevel',
  shipyard: 'shipyardLevel',
  researchLab: 'researchLabLevel',
  storageMetal: 'storageMetalLevel',
  storageCrystal: 'storageCrystalLevel',
  storageDeut: 'storageDeutLevel',
};

export function createBuildingService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  buildingQueue: Queue,
) {
  return {
    async listBuildings(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);

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

      return Object.values(BUILDINGS).map((def) => {
        const currentLevel = planet[BUILDING_LEVEL_COLUMNS[def.id]] as number;
        const nextLevel = currentLevel + 1;
        const cost = buildingCost(def.id, nextLevel);
        const time = buildingTime(def.id, nextLevel, planet.roboticsLevel);

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

    async startUpgrade(userId: string, planetId: string, buildingId: BuildingId) {
      const planet = await this.getOwnedPlanet(userId, planetId);

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

      // Check prerequisites
      const def = BUILDINGS[buildingId];
      for (const prereq of def.prerequisites) {
        const prereqLevel = planet[BUILDING_LEVEL_COLUMNS[prereq.buildingId]] as number;
        if (prereqLevel < prereq.level) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Prérequis non rempli : ${BUILDINGS[prereq.buildingId].name} niveau ${prereq.level}`,
          });
        }
      }

      // Check building slots
      const totalLevels =
        planet.metalMineLevel +
        planet.crystalMineLevel +
        planet.deutSynthLevel +
        planet.solarPlantLevel +
        planet.roboticsLevel +
        planet.shipyardLevel +
        planet.researchLabLevel +
        planet.storageMetalLevel +
        planet.storageCrystalLevel +
        planet.storageDeutLevel;

      if (totalLevels >= planet.maxFields) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Plus de champs disponibles' });
      }

      const currentLevel = planet[BUILDING_LEVEL_COLUMNS[buildingId]] as number;
      const nextLevel = currentLevel + 1;
      const cost = buildingCost(buildingId, nextLevel);
      const time = buildingTime(buildingId, nextLevel, planet.roboticsLevel);

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

      const planet = await this.getOwnedPlanet(userId, planetId);
      const currentLevel = planet[BUILDING_LEVEL_COLUMNS[activeBuild.itemId as BuildingId]] as number;
      const cost = buildingCost(activeBuild.itemId as BuildingId, currentLevel + 1);

      // Refund resources
      await db
        .update(planets)
        .set({
          metal: String(Number(planet.metal) + cost.metal),
          crystal: String(Number(planet.crystal) + cost.crystal),
          deuterium: String(Number(planet.deuterium) + cost.deuterium),
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

      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, entry.planetId))
        .limit(1);

      if (!planet) return null;

      const buildingId = entry.itemId as BuildingId;
      const columnKey = BUILDING_LEVEL_COLUMNS[buildingId];
      const currentLevel = planet[columnKey] as number;
      const newLevel = currentLevel + 1;

      // Update planet level
      await db
        .update(planets)
        .set({
          [columnKey]: newLevel,
        })
        .where(eq(planets.id, entry.planetId));

      // Mark queue entry as completed
      await db
        .update(buildQueue)
        .set({ status: 'completed' })
        .where(eq(buildQueue.id, buildQueueId));

      return { buildingId, newLevel };
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
