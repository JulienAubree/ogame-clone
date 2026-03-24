import { eq, and, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, buildQueue, userResearch, planetBuildings } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { shipCost, shipTime, defenseCost, defenseTime, checkShipPrerequisites, checkDefensePrerequisites, resolveBonus } from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { Queue } from 'bullmq';
import type { BuildCompletionResult } from '../../workers/completion.types.js';

export function createShipyardService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  completionQueue: Queue,
  gameConfigService: GameConfigService,
) {
  function getShipBuildCategory(
    shipDef: { prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } },
    bonuses: { stat: string; sourceId: string; category: string | null }[],
  ): string | null {
    const firstBuildingPrereq = shipDef.prerequisites?.buildings?.[0]?.buildingId;
    if (!firstBuildingPrereq) return null;
    const bonus = bonuses.find(
      b => b.stat === 'ship_build_time' && b.sourceId === firstBuildingPrereq
    );
    return bonus?.category ?? null;
  }

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

    async listShips(userId: string, planetId: string) {
      await this.getOwnedPlanet(userId, planetId);
      const ships = await this.getOrCreateShips(planetId);
      const research = await this.getResearchLevels(userId);
      const config = await gameConfigService.getFullConfig();

      const buildingLevels = await this.getBuildingLevels(planetId);

      return Object.values(config.ships)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const count = (ships[def.countColumn as keyof typeof ships] ?? 0) as number;
          const prereqCheck = checkShipPrerequisites(def.prerequisites, buildingLevels, research);
          const cost = shipCost(def);

          const buildCategory = getShipBuildCategory(def, config.bonuses);
          const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
          const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
          const time = shipTime(def, bonusMultiplier, timeDivisor);

          return {
            id: def.id,
            name: def.name,
            description: def.description,
            count,
            cost,
            timePerUnit: time,
            prerequisitesMet: prereqCheck.met,
            missingPrerequisites: prereqCheck.missing,
            isStationary: def.isStationary,
          };
        });
    },

    async listDefenses(userId: string, planetId: string) {
      await this.getOwnedPlanet(userId, planetId);
      const defenses = await this.getOrCreateDefenses(planetId);
      const research = await this.getResearchLevels(userId);
      const config = await gameConfigService.getFullConfig();

      const buildingLevels = await this.getBuildingLevels(planetId);

      return Object.values(config.defenses)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const count = (defenses[def.countColumn as keyof typeof defenses] ?? 0) as number;
          const prereqCheck = checkDefensePrerequisites(def.prerequisites, buildingLevels, research);
          const cost = defenseCost(def);

          const bonusMultiplier = resolveBonus('defense_build_time', null, buildingLevels, config.bonuses);
          const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
          const time = defenseTime(def, bonusMultiplier, timeDivisor);

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
            inArray(buildQueue.status, ['active', 'queued']),
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
      await this.getOwnedPlanet(userId, planetId);
      const config = await gameConfigService.getFullConfig();

      const def = type === 'ship' ? config.ships[itemId] : config.defenses[itemId];
      if (!def) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unité invalide' });

      const unitCost = type === 'ship' ? shipCost(def) : defenseCost(def);

      const totalCost = {
        minerai: unitCost.minerai * quantity,
        silicium: unitCost.silicium * quantity,
        hydrogene: unitCost.hydrogene * quantity,
      };

      if (type === 'defense') {
        const defenseDef = config.defenses[itemId];
        if (defenseDef?.maxPerPlanet) {
          const defenses = await this.getOrCreateDefenses(planetId);
          const current = (defenses[defenseDef.countColumn as keyof typeof defenses] ?? 0) as number;
          if (current + quantity > defenseDef.maxPerPlanet) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Maximum ${defenseDef.maxPerPlanet} ${defenseDef.name} par planète`,
            });
          }
        }
      }

      await resourceService.spendResources(planetId, userId, totalCost);

      const existingActive = await this.getShipyardQueue(planetId);
      const sameTypeQueue = existingActive.filter((e) => e.type === type);
      const hasActive = sameTypeQueue.some((e) => e.status === 'active');

      const buildingLevels = await this.getBuildingLevels(planetId);
      const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
      let unitTime: number;
      if (type === 'ship') {
        const buildCategory = getShipBuildCategory(def as any, config.bonuses);
        const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
        unitTime = shipTime(def, bonusMultiplier, timeDivisor);
      } else {
        const bonusMultiplier = resolveBonus('defense_build_time', null, buildingLevels, config.bonuses);
        unitTime = defenseTime(def, bonusMultiplier, timeDivisor);
      }

      // Merge into existing entry if last batch in queue is the same item
      const lastBatch = sameTypeQueue[sameTypeQueue.length - 1];
      if (lastBatch && lastBatch.itemId === itemId) {
        const [updated] = await db
          .update(buildQueue)
          .set({ quantity: lastBatch.quantity + quantity })
          .where(eq(buildQueue.id, lastBatch.id))
          .returning();

        // If it was the only entry and already active, the BullMQ job is already scheduled
        return { entry: updated, unitTime };
      }

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
        await completionQueue.add(
          'shipyard-unit',
          { buildQueueId: entry.id },
          { delay: unitTime * 1000, jobId: `shipyard-${entry.id}-1` },
        );
      }

      return { entry, unitTime };
    },

    async completeUnit(buildQueueId: string): Promise<BuildCompletionResult> {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const config = await gameConfigService.getFullConfig();
      const newCompletedCount = entry.completedCount + 1;

      if (entry.type === 'ship') {
        const shipDef = config.ships[entry.itemId];
        if (shipDef) {
          const ships = await this.getOrCreateShips(entry.planetId);
          const col = shipDef.countColumn;
          const current = (ships[col as keyof typeof ships] ?? 0) as number;
          await db
            .update(planetShips)
            .set({ [col]: current + 1 })
            .where(eq(planetShips.planetId, entry.planetId));
        }
      } else {
        const defenseDef = config.defenses[entry.itemId];
        if (defenseDef) {
          const defenses = await this.getOrCreateDefenses(entry.planetId);
          const col = defenseDef.countColumn;
          const current = (defenses[col as keyof typeof defenses] ?? 0) as number;
          await db
            .update(planetDefenses)
            .set({ [col]: current + 1 })
            .where(eq(planetDefenses.planetId, entry.planetId));
        }
      }

      if (newCompletedCount >= entry.quantity) {
        await db
          .update(buildQueue)
          .set({ completedCount: newCompletedCount, status: 'completed' })
          .where(eq(buildQueue.id, buildQueueId));

        await this.activateNextBatch(entry.planetId, entry.type as 'ship' | 'defense');

        const unitName = config.ships[entry.itemId]?.name
          ?? config.defenses[entry.itemId]?.name
          ?? entry.itemId;

        const [planet] = await db
          .select({ name: planets.name })
          .from(planets)
          .where(eq(planets.id, entry.planetId))
          .limit(1);

        return {
          userId: entry.userId,
          planetId: entry.planetId,
          eventType: 'shipyard-done',
          notificationPayload: {
            planetId: entry.planetId,
            unitId: entry.itemId,
            name: unitName,
            count: newCompletedCount,
          },
          eventPayload: {
            unitId: entry.itemId,
            name: unitName,
            count: newCompletedCount,
            planetName: planet?.name ?? 'Planète',
          },
          tutorialCheck: entry.type === 'ship' ? {
            type: 'ship_count',
            targetId: entry.itemId,
            targetValue: newCompletedCount,
          } : undefined,
        };
      }

      const now = new Date();
      const def = entry.type === 'ship' ? config.ships[entry.itemId] : config.defenses[entry.itemId];

      const buildingLevels = await this.getBuildingLevels(entry.planetId);
      const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
      let unitTime = 60;
      if (def) {
        if (entry.type === 'ship') {
          const buildCategory = getShipBuildCategory(def as any, config.bonuses);
          const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
          unitTime = shipTime(def, bonusMultiplier, timeDivisor);
        } else {
          const bonusMultiplier = resolveBonus('defense_build_time', null, buildingLevels, config.bonuses);
          unitTime = defenseTime(def, bonusMultiplier, timeDivisor);
        }
      }

      await db
        .update(buildQueue)
        .set({
          completedCount: newCompletedCount,
          endTime: new Date(now.getTime() + unitTime * 1000),
        })
        .where(eq(buildQueue.id, buildQueueId));

      await completionQueue.add(
        'shipyard-unit',
        { buildQueueId: entry.id },
        { delay: unitTime * 1000, jobId: `shipyard-${entry.id}-${newCompletedCount + 1}` },
      );

      return null;
    },

    async activateNextBatch(planetId: string, type: 'ship' | 'defense') {
      const [nextBatch] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.status, 'queued'),
            eq(buildQueue.type, type),
          ),
        )
        .limit(1);

      if (!nextBatch) return;

      const config = await gameConfigService.getFullConfig();
      const def = nextBatch.type === 'ship' ? config.ships[nextBatch.itemId] : config.defenses[nextBatch.itemId];

      const buildingLevels = await this.getBuildingLevels(planetId);
      const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
      let unitTime = 60;
      if (def) {
        if (nextBatch.type === 'ship') {
          const buildCategory = getShipBuildCategory(def as any, config.bonuses);
          const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
          unitTime = shipTime(def, bonusMultiplier, timeDivisor);
        } else {
          const bonusMultiplier = resolveBonus('defense_build_time', null, buildingLevels, config.bonuses);
          unitTime = defenseTime(def, bonusMultiplier, timeDivisor);
        }
      }

      const now = new Date();
      await db
        .update(buildQueue)
        .set({
          status: 'active',
          startTime: now,
          endTime: new Date(now.getTime() + unitTime * 1000),
        })
        .where(eq(buildQueue.id, nextBatch.id));

      await completionQueue.add(
        'shipyard-unit',
        { buildQueueId: nextBatch.id },
        { delay: unitTime * 1000, jobId: `shipyard-${nextBatch.id}-1` },
      );
    },

    async cancelBatch(userId: string, planetId: string, batchId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.id, batchId),
            eq(buildQueue.userId, userId),
            eq(buildQueue.planetId, planetId),
          ),
        )
        .limit(1);

      if (!entry || entry.status === 'completed') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Batch non trouvé ou déjà terminé' });
      }

      if (entry.type !== 'ship' && entry.type !== 'defense') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Type non annulable' });
      }

      // Pro-rata refund: completed units → 0, in-progress unit → pro rata (max 70%), queued units → 70%
      const config = await gameConfigService.getFullConfig();
      const cancelRefundRatio = Number(config.universe.cancel_refund_ratio) || 0.7;
      const def = entry.type === 'ship' ? config.ships[entry.itemId] : config.defenses[entry.itemId];
      const unitCost = def ? (entry.type === 'ship' ? shipCost(def) : defenseCost(def)) : { minerai: 0, silicium: 0, hydrogene: 0 };
      const remaining = entry.quantity - entry.completedCount;

      let refund: { minerai: number; silicium: number; hydrogene: number };
      if (entry.status === 'active') {
        // 1 unit is in progress (pro rata, max 70%), rest are waiting (70%)
        const waitingUnits = remaining - 1;
        const now = Date.now();
        const totalDuration = new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime();
        const timeLeft = Math.max(0, new Date(entry.endTime).getTime() - now);
        const currentUnitRatio = Math.min(cancelRefundRatio, totalDuration > 0 ? timeLeft / totalDuration : 0);

        refund = {
          minerai: Math.floor(unitCost.minerai * currentUnitRatio) + Math.floor(unitCost.minerai * cancelRefundRatio) * waitingUnits,
          silicium: Math.floor(unitCost.silicium * currentUnitRatio) + Math.floor(unitCost.silicium * cancelRefundRatio) * waitingUnits,
          hydrogene: Math.floor(unitCost.hydrogene * currentUnitRatio) + Math.floor(unitCost.hydrogene * cancelRefundRatio) * waitingUnits,
        };
      } else {
        // Queued: nothing started → full refund ratio
        refund = {
          minerai: Math.floor(unitCost.minerai * cancelRefundRatio) * remaining,
          silicium: Math.floor(unitCost.silicium * cancelRefundRatio) * remaining,
          hydrogene: Math.floor(unitCost.hydrogene * cancelRefundRatio) * remaining,
        };
      }

      const [planet] = await db.select().from(planets).where(eq(planets.id, planetId)).limit(1);
      if (planet) {
        await db
          .update(planets)
          .set({
            minerai: String(Number(planet.minerai) + refund.minerai),
            silicium: String(Number(planet.silicium) + refund.silicium),
            hydrogene: String(Number(planet.hydrogene) + refund.hydrogene),
          })
          .where(eq(planets.id, planetId));
      }

      // Remove pending BullMQ job if this was the active batch
      if (entry.status === 'active') {
        const jobId = `shipyard-${entry.id}-${entry.completedCount + 1}`;
        const job = await completionQueue.getJob(jobId);
        if (job) await job.remove();
      }

      await db.delete(buildQueue).where(eq(buildQueue.id, batchId));

      // Activate next queued batch if we cancelled the active one
      if (entry.status === 'active') {
        await this.activateNextBatch(planetId, entry.type as 'ship' | 'defense');
      }

      return { cancelled: true, refund };
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
