import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, buildQueue, userResearch } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  SHIPS,
  DEFENSES,
  shipCost,
  shipTime,
  defenseCost,
  defenseTime,
  checkShipPrerequisites,
  checkDefensePrerequisites,
  type ShipId,
  type DefenseId,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { Queue } from 'bullmq';

export function createShipyardService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  shipyardQueue: Queue,
) {
  return {
    async listShips(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const ships = await this.getOrCreateShips(planetId);
      const research = await this.getResearchLevels(userId);

      const buildingLevels: Record<string, number> = {
        shipyardLevel: planet.shipyardLevel,
        roboticsLevel: planet.roboticsLevel,
      };

      return Object.values(SHIPS).map((def) => {
        const count = (ships[def.countColumn as keyof typeof ships] ?? 0) as number;
        const prereqCheck = checkShipPrerequisites(def.id, buildingLevels, research);
        const cost = shipCost(def.id);
        const time = shipTime(def.id, planet.shipyardLevel);

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          count,
          cost,
          timePerUnit: time,
          prerequisitesMet: prereqCheck.met,
          missingPrerequisites: prereqCheck.missing,
        };
      });
    },

    async listDefenses(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const defenses = await this.getOrCreateDefenses(planetId);
      const research = await this.getResearchLevels(userId);

      const buildingLevels: Record<string, number> = {
        shipyardLevel: planet.shipyardLevel,
        roboticsLevel: planet.roboticsLevel,
      };

      return Object.values(DEFENSES).map((def) => {
        const count = (defenses[def.countColumn as keyof typeof defenses] ?? 0) as number;
        const prereqCheck = checkDefensePrerequisites(def.id, buildingLevels, research);
        const cost = defenseCost(def.id);
        const time = defenseTime(def.id, planet.shipyardLevel);

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          count,
          cost,
          timePerUnit: time,
          maxPerPlanet: def.maxPerPlanet,
          prerequisitesMet: prereqCheck.met,
          missingPrerequisites: prereqCheck.missing,
        };
      });
    },

    async getShipyardQueue(planetId: string) {
      return db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.status, 'active'),
          ),
        )
        .then((rows) => rows.filter((r) => r.type === 'ship' || r.type === 'defense'));
    },

    async startBuild(
      userId: string,
      planetId: string,
      type: 'ship' | 'defense',
      itemId: string,
      quantity: number,
    ) {
      const planet = await this.getOwnedPlanet(userId, planetId);

      const unitCost = type === 'ship'
        ? shipCost(itemId as ShipId)
        : defenseCost(itemId as DefenseId);

      const totalCost = {
        metal: unitCost.metal * quantity,
        crystal: unitCost.crystal * quantity,
        deuterium: unitCost.deuterium * quantity,
      };

      if (type === 'defense') {
        const def = DEFENSES[itemId as DefenseId];
        if (def.maxPerPlanet) {
          const defenses = await this.getOrCreateDefenses(planetId);
          const current = (defenses[def.countColumn as keyof typeof defenses] ?? 0) as number;
          if (current + quantity > def.maxPerPlanet) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Maximum ${def.maxPerPlanet} ${def.name} par planète`,
            });
          }
        }
      }

      await resourceService.spendResources(planetId, userId, totalCost);

      const existingActive = await this.getShipyardQueue(planetId);
      const hasActive = existingActive.some((e) => e.status === 'active');

      const unitTime = type === 'ship'
        ? shipTime(itemId as ShipId, planet.shipyardLevel)
        : defenseTime(itemId as DefenseId, planet.shipyardLevel);

      const now = new Date();
      const status = hasActive ? 'queued' : 'active';
      const startTime = now;
      const endTime = new Date(now.getTime() + unitTime * 1000);

      const [entry] = await db
        .insert(buildQueue)
        .values({
          planetId,
          userId,
          type,
          itemId,
          quantity,
          completedCount: 0,
          startTime,
          endTime,
          status,
        })
        .returning();

      if (!hasActive) {
        await shipyardQueue.add(
          'complete-unit',
          { buildQueueId: entry.id },
          { delay: unitTime * 1000, jobId: `shipyard-${entry.id}-1` },
        );
      }

      return { entry, unitTime };
    },

    async completeUnit(buildQueueId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const newCompletedCount = entry.completedCount + 1;

      if (entry.type === 'ship') {
        const ships = await this.getOrCreateShips(entry.planetId);
        const col = SHIPS[entry.itemId as ShipId].countColumn;
        const current = (ships[col as keyof typeof ships] ?? 0) as number;
        await db
          .update(planetShips)
          .set({ [col]: current + 1 })
          .where(eq(planetShips.planetId, entry.planetId));
      } else {
        const defenses = await this.getOrCreateDefenses(entry.planetId);
        const col = DEFENSES[entry.itemId as DefenseId].countColumn;
        const current = (defenses[col as keyof typeof defenses] ?? 0) as number;
        await db
          .update(planetDefenses)
          .set({ [col]: current + 1 })
          .where(eq(planetDefenses.planetId, entry.planetId));
      }

      if (newCompletedCount >= entry.quantity) {
        await db
          .update(buildQueue)
          .set({ completedCount: newCompletedCount, status: 'completed' })
          .where(eq(buildQueue.id, buildQueueId));

        await this.activateNextBatch(entry.planetId);

        return { completed: true, itemId: entry.itemId, totalCompleted: newCompletedCount };
      }

      const now = new Date();
      const [planet] = await db.select().from(planets).where(eq(planets.id, entry.planetId)).limit(1);
      const unitTime = entry.type === 'ship'
        ? shipTime(entry.itemId as ShipId, planet?.shipyardLevel ?? 0)
        : defenseTime(entry.itemId as DefenseId, planet?.shipyardLevel ?? 0);

      await db
        .update(buildQueue)
        .set({
          completedCount: newCompletedCount,
          endTime: new Date(now.getTime() + unitTime * 1000),
        })
        .where(eq(buildQueue.id, buildQueueId));

      await shipyardQueue.add(
        'complete-unit',
        { buildQueueId: entry.id },
        { delay: unitTime * 1000, jobId: `shipyard-${entry.id}-${newCompletedCount + 1}` },
      );

      return { completed: false, itemId: entry.itemId, totalCompleted: newCompletedCount };
    },

    async activateNextBatch(planetId: string) {
      const [nextBatch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.status, 'queued'),
          ),
        )
        .limit(1);

      if (!nextBatch) return;

      const [planet] = await db.select().from(planets).where(eq(planets.id, planetId)).limit(1);
      const unitTime = nextBatch.type === 'ship'
        ? shipTime(nextBatch.itemId as ShipId, planet?.shipyardLevel ?? 0)
        : defenseTime(nextBatch.itemId as DefenseId, planet?.shipyardLevel ?? 0);

      const now = new Date();
      await db
        .update(buildQueue)
        .set({
          status: 'active',
          startTime: now,
          endTime: new Date(now.getTime() + unitTime * 1000),
        })
        .where(eq(buildQueue.id, nextBatch.id));

      await shipyardQueue.add(
        'complete-unit',
        { buildQueueId: nextBatch.id },
        { delay: unitTime * 1000, jobId: `shipyard-${nextBatch.id}-1` },
      );
    },

    async cancelQueuedBatch(userId: string, planetId: string, batchId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.id, batchId),
            eq(buildQueue.userId, userId),
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.status, 'queued'),
          ),
        )
        .limit(1);

      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Batch non trouvé ou non annulable (en cours)' });
      }

      const unitCost = entry.type === 'ship'
        ? shipCost(entry.itemId as ShipId)
        : defenseCost(entry.itemId as DefenseId);
      const remaining = entry.quantity - entry.completedCount;
      const refund = {
        metal: unitCost.metal * remaining,
        crystal: unitCost.crystal * remaining,
        deuterium: unitCost.deuterium * remaining,
      };

      const [planet] = await db.select().from(planets).where(eq(planets.id, planetId)).limit(1);
      if (planet) {
        await db
          .update(planets)
          .set({
            metal: String(Number(planet.metal) + refund.metal),
            crystal: String(Number(planet.crystal) + refund.crystal),
            deuterium: String(Number(planet.deuterium) + refund.deuterium),
          })
          .where(eq(planets.id, planetId));
      }

      await db.delete(buildQueue).where(eq(buildQueue.id, batchId));

      return { cancelled: true };
    },

    async getOrCreateShips(planetId: string) {
      const [existing] = await db.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
      if (existing) return existing;
      const [created] = await db.insert(planetShips).values({ planetId }).returning();
      return created;
    },

    async getOrCreateDefenses(planetId: string) {
      const [existing] = await db.select().from(planetDefenses).where(eq(planetDefenses.planetId, planetId)).limit(1);
      if (existing) return existing;
      const [created] = await db.insert(planetDefenses).values({ planetId }).returning();
      return created;
    },

    async getResearchLevels(userId: string) {
      const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, userId)).limit(1);
      const levels: Record<string, number> = {};
      if (research) {
        for (const key of Object.keys(research)) {
          if (key !== 'userId') levels[key] = research[key as keyof typeof research] as number;
        }
      }
      return levels;
    },

    async getOwnedPlanet(userId: string, planetId: string) {
      const [planet] = await db.select().from(planets).where(and(eq(planets.id, planetId), eq(planets.userId, userId))).limit(1);
      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });
      return planet;
    },
  };
}
