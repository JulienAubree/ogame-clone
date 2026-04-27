import { eq, and, inArray, asc, sql, gt } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, buildQueue, userResearch, planetBuildings, flagships } from '@exilium/db';
import type { Database } from '@exilium/db';
import { shipCost, shipTime, defenseCost, defenseTime, checkShipPrerequisites, checkDefensePrerequisites, resolveBonus, computeFleetFP } from '@exilium/game-engine';
import type { FPConfig, UnitCombatStats } from '@exilium/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import { getGovernancePenalty } from '../../lib/governance.js';
import type { Queue } from 'bullmq';
import type { BuildCompletionResult } from '../../workers/completion.types.js';

export function createShipyardService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  completionQueue: Queue,
  gameConfigService: GameConfigService,
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
  flagshipService?: { addUnlockedShip(userId: string, shipId: string): Promise<void> },
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

  function getFacilityId(
    type: 'ship' | 'defense',
    itemId: string,
    config: { ships: Record<string, any>; defenses: Record<string, any> },
  ): string {
    if (type === 'defense') return 'arsenal';
    const shipDef = config.ships[itemId];
    const firstBuildingPrereq = shipDef?.prerequisites?.buildings?.[0]?.buildingId;
    return firstBuildingPrereq ?? 'shipyard';
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
      const planet = await this.getOwnedPlanet(userId, planetId);
      const ships = await this.getOrCreateShips(planetId);
      const research = await this.getResearchLevels(userId);
      const config = await gameConfigService.getFullConfig();

      const buildingLevels = await this.getBuildingLevels(planetId);
      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const talentTimeMultiplier = 1 / (1 + (talentCtx['ship_build_time'] ?? 0));

      // Governance construction penalty
      const govPenalty = await getGovernancePenalty(db, userId, planet.planetClassId, config);
      const govTimeMult = 1 + govPenalty.constructionMalus;

      return Object.values(config.ships)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const count = (ships[def.countColumn as keyof typeof ships] ?? 0) as number;
          const prereqCheck = checkShipPrerequisites(def.prerequisites, buildingLevels, research);
          const cost = shipCost(def);

          const buildCategory = getShipBuildCategory(def, config.bonuses);
          const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
          const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
          const hullKey = buildCategory === 'build_military' ? 'hull_combat_build_time_reduction'
            : buildCategory === 'build_industrial' ? 'hull_industrial_build_time_reduction'
            : null;
          const hullTimeMultiplier = hullKey ? 1 - (talentCtx[hullKey] ?? 0) : 1;
          const talentCategoryKey = buildCategory === 'build_military' ? 'military_build_time' : buildCategory === 'build_industrial' ? 'industrial_build_time' : null;
          const talentCategoryMultiplier = talentCategoryKey ? 1 - (talentCtx[talentCategoryKey] ?? 0) : 1;
          const time = Math.max(1, Math.floor(shipTime(def, bonusMultiplier, timeDivisor) * talentTimeMultiplier * hullTimeMultiplier * talentCategoryMultiplier * govTimeMult));

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
            role: def.role ?? null,
          };
        });
    },

    async empireOverview(userId: string) {
      const config = await gameConfigService.getFullConfig();

      const userPlanets = await db
        .select({
          id: planets.id,
          name: planets.name,
          galaxy: planets.galaxy,
          system: planets.system,
          position: planets.position,
          planetClassId: planets.planetClassId,
          planetImageIndex: planets.planetImageIndex,
        })
        .from(planets)
        .where(and(eq(planets.userId, userId), eq(planets.status, 'active')))
        .orderBy(asc(planets.galaxy), asc(planets.system), asc(planets.position));

      const [flagshipRow] = await db
        .select()
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      // Build FP / cargo helpers once
      const unitCombatStats: Record<string, UnitCombatStats> = {};
      for (const [id, ship] of Object.entries(config.ships)) {
        unitCombatStats[id] = {
          weapons: ship.weapons,
          shotCount: ship.shotCount ?? 1,
          shield: ship.shield,
          hull: ship.hull,
          weaponProfiles: ship.weaponProfiles,
        };
      }
      // Inject flagship combat stats (uses base stats — talents/research bonuses
      // are not factored in here since this view is informational, not a combat
      // simulation).
      if (flagshipRow) {
        unitCombatStats['flagship'] = {
          weapons: flagshipRow.weapons,
          shotCount: flagshipRow.shotCount ?? 1,
          shield: flagshipRow.shield,
          hull: flagshipRow.hull,
        };
      }
      const fpConfig: FPConfig = {
        shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
        divisor: Number(config.universe.fp_divisor) || 100,
      };

      const sortedShipDefs = Object.values(config.ships).sort((a, b) => a.sortOrder - b.sortOrder);

      if (userPlanets.length === 0) {
        return {
          planets: [],
          empireTotals: { shipsByType: [], totalShips: 0, totalFP: 0, totalCargo: 0 },
          flagship: flagshipRow
            ? { status: flagshipRow.status, planetId: flagshipRow.planetId, planetName: null }
            : null,
        };
      }

      const planetIds = userPlanets.map((p) => p.id);
      const allShipsRows = await db
        .select()
        .from(planetShips)
        .where(inArray(planetShips.planetId, planetIds));
      const shipsByPlanet = new Map(allShipsRows.map((r) => [r.planetId, r]));

      const empireShipCounts: Record<string, number> = {};

      const planetsResult = userPlanets.map((p) => {
        const shipsRow = shipsByPlanet.get(p.id);
        const shipsList: { id: string; name: string; count: number; role: string | null; cargoCapacity: number; isStationary: boolean }[] = [];
        const fleet: Record<string, number> = {};
        let totalShips = 0;
        let totalCargo = 0;

        for (const def of sortedShipDefs) {
          const count = shipsRow ? Number((shipsRow as Record<string, unknown>)[def.countColumn] ?? 0) : 0;
          if (count <= 0) continue;
          shipsList.push({
            id: def.id,
            name: def.name,
            count,
            role: def.role ?? null,
            cargoCapacity: def.cargoCapacity ?? 0,
            isStationary: def.isStationary ?? false,
          });
          fleet[def.id] = count;
          totalShips += count;
          totalCargo += count * (def.cargoCapacity ?? 0);
          empireShipCounts[def.id] = (empireShipCounts[def.id] ?? 0) + count;
        }

        const hasFlagship =
          !!flagshipRow && flagshipRow.status === 'active' && flagshipRow.planetId === p.id;

        // Inject flagship as a regular ship row if it's stationed here. We
        // expose its base cargoCapacity (effectiveStats with talents/research
        // bonuses are computed at send-time by the fleet service).
        if (hasFlagship && flagshipRow) {
          shipsList.unshift({
            id: 'flagship',
            name: flagshipRow.name,
            count: 1,
            role: 'flagship',
            cargoCapacity: flagshipRow.cargoCapacity,
            isStationary: false,
          });
          fleet['flagship'] = 1;
          totalShips += 1;
          totalCargo += flagshipRow.cargoCapacity;
          empireShipCounts['flagship'] = (empireShipCounts['flagship'] ?? 0) + 1;
        }

        const totalFP = computeFleetFP(fleet, unitCombatStats, fpConfig);

        return {
          id: p.id,
          name: p.name,
          galaxy: p.galaxy,
          system: p.system,
          position: p.position,
          planetClassId: p.planetClassId,
          planetImageIndex: p.planetImageIndex,
          ships: shipsList,
          totalShips,
          totalCargo,
          totalFP,
          hasFlagship,
        };
      });

      const shipsByType = sortedShipDefs
        .filter((def) => (empireShipCounts[def.id] ?? 0) > 0)
        .map((def) => ({
          id: def.id,
          name: def.name,
          count: empireShipCounts[def.id] ?? 0,
          role: def.role ?? null,
        }));
      if (flagshipRow && flagshipRow.status === 'active' && empireShipCounts['flagship']) {
        shipsByType.unshift({
          id: 'flagship',
          name: flagshipRow.name,
          count: empireShipCounts['flagship'],
          role: 'flagship',
        });
      }

      const totalEmpireShips = Object.values(empireShipCounts).reduce((s, c) => s + c, 0);
      const totalEmpireFP = computeFleetFP(empireShipCounts, unitCombatStats, fpConfig);
      const totalEmpireCargo = planetsResult.reduce((s, p) => s + p.totalCargo, 0);

      return {
        planets: planetsResult,
        empireTotals: {
          shipsByType,
          totalShips: totalEmpireShips,
          totalFP: totalEmpireFP,
          totalCargo: totalEmpireCargo,
        },
        flagship: flagshipRow
          ? {
              status: flagshipRow.status,
              planetId: flagshipRow.planetId,
              planetName: planetsResult.find((p) => p.id === flagshipRow.planetId)?.name ?? null,
            }
          : null,
      };
    },

    async listDefenses(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const defenses = await this.getOrCreateDefenses(planetId);
      const research = await this.getResearchLevels(userId);
      const config = await gameConfigService.getFullConfig();

      const buildingLevels = await this.getBuildingLevels(planetId);
      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const talentDefenseTimeMultiplier = 1 / (1 + (talentCtx['defense_build_time'] ?? 0));

      // Governance construction penalty
      const govPenaltyDef = await getGovernancePenalty(db, userId, planet.planetClassId, config);
      const govTimeMultDef = 1 + govPenaltyDef.constructionMalus;

      return Object.values(config.defenses)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const count = (defenses[def.countColumn as keyof typeof defenses] ?? 0) as number;
          const prereqCheck = checkDefensePrerequisites(def.prerequisites, buildingLevels, research);
          const cost = defenseCost(def);

          const bonusMultiplier = resolveBonus('defense_build_time', null, buildingLevels, config.bonuses);
          const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
          const time = Math.max(1, Math.floor(defenseTime(def, bonusMultiplier, timeDivisor) * talentDefenseTimeMultiplier * govTimeMultDef));

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

    async getShipyardQueue(planetId: string, facilityId?: string) {
      const conditions = [
        eq(buildQueue.planetId, planetId),
        inArray(buildQueue.status, ['active', 'queued']),
      ];
      if (facilityId) {
        conditions.push(eq(buildQueue.facilityId, facilityId));
      }
      return db
        .select()
        .from(buildQueue)
        .where(and(...conditions))
        .then((rows) =>
          facilityId
            ? rows
            : rows.filter((r) => r.type === 'ship' || r.type === 'defense'),
        );
    },

    async startBuild(
      userId: string,
      planetId: string,
      type: 'ship' | 'defense',
      itemId: string,
      quantity: number,
    ) {
      const planet = await this.getOwnedPlanet(userId, planetId);

      if (planet.status === 'colonizing') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Construction impossible pendant la colonisation' });
      }

      const config = await gameConfigService.getFullConfig();
      const facilityId = getFacilityId(type, itemId, config);

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
          // Also count units already in the build queue
          const queue = await this.getShipyardQueue(planetId);
          const queuedCount = queue
            .filter((e) => e.itemId === itemId)
            .reduce((sum, e) => sum + e.quantity, 0);
          if (current + queuedCount + quantity > defenseDef.maxPerPlanet) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Maximum ${defenseDef.maxPerPlanet} ${defenseDef.name} par planète (${current} construit${current > 1 ? 's' : ''}, ${queuedCount} en file)`,
            });
          }
        }
      }

      await resourceService.spendResources(planetId, userId, totalCost);

      const existingActive = await this.getShipyardQueue(planetId);
      const sameTypeQueue = existingActive.filter((e) => e.facilityId === facilityId);

      const buildingLevels = await this.getBuildingLevels(planetId);
      const talentCtx = talentService ? await talentService.computeTalentContext(userId, planetId) : {};
      const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;

      // Governance construction penalty
      const govPenaltyBuild = await getGovernancePenalty(db, userId, planet.planetClassId, config);
      const govTimeMultBuild = 1 + govPenaltyBuild.constructionMalus;

      let unitTime: number;
      if (type === 'ship') {
        const buildCategory = getShipBuildCategory(def as any, config.bonuses);
        const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
        const talentTimeMultiplier = 1 / (1 + (talentCtx['ship_build_time'] ?? 0));
        const hullKey = buildCategory === 'build_military' ? 'hull_combat_build_time_reduction'
          : buildCategory === 'build_industrial' ? 'hull_industrial_build_time_reduction'
          : null;
        const hullTimeMultiplier = hullKey ? 1 - (talentCtx[hullKey] ?? 0) : 1;
        const talentCatKey = buildCategory === 'build_military' ? 'military_build_time' : buildCategory === 'build_industrial' ? 'industrial_build_time' : null;
        const talentCatMult = talentCatKey ? 1 - (talentCtx[talentCatKey] ?? 0) : 1;
        unitTime = Math.max(1, Math.floor(shipTime(def, bonusMultiplier, timeDivisor) * talentTimeMultiplier * hullTimeMultiplier * talentCatMult * govTimeMultBuild));
      } else {
        const bonusMultiplier = resolveBonus('defense_build_time', null, buildingLevels, config.bonuses);
        const talentTimeMultiplier = 1 / (1 + (talentCtx['defense_build_time'] ?? 0));
        unitTime = Math.max(1, Math.floor(defenseTime(def, bonusMultiplier, timeDivisor) * talentTimeMultiplier * govTimeMultBuild));
      }

      // Compute parallel build slots for this facility
      let maxSlots = 1;
      if (facilityId === 'shipyard') {
        maxSlots += Math.floor(talentCtx['industrial_parallel_build'] ?? 0);
      }
      if (facilityId === 'commandCenter') {
        maxSlots += Math.floor(talentCtx['military_parallel_build'] ?? 0);
      }
      const activeCount = sameTypeQueue.filter((e) => e.status === 'active').length;
      const freeSlots = Math.max(0, maxSlots - activeCount);

      // How many units can start immediately vs queued
      const immediateUnits = Math.min(quantity, freeSlots);
      const queuedUnits = quantity - immediateUnits;

      const now = new Date();
      let lastEntry: typeof buildQueue.$inferSelect | null = null;

      // Create active entries (one per slot, qty=1 each)
      for (let i = 0; i < immediateUnits; i++) {
        const startTime = now;
        const endTime = new Date(now.getTime() + unitTime * 1000);
        const [entry] = await db
          .insert(buildQueue)
          .values({
            planetId, userId, type, itemId,
            quantity: 1, completedCount: 0,
            startTime, endTime,
            status: 'active',
            facilityId,
          })
          .returning();

        await completionQueue.add(
          'shipyard-unit',
          { buildQueueId: entry.id },
          { delay: unitTime * 1000, jobId: `shipyard-${entry.id}-1` },
        );
        lastEntry = entry;
      }

      // Create queued entry for remainder (or merge with last queued)
      if (queuedUnits > 0) {
        const lastBatch = sameTypeQueue.filter(e => e.status === 'queued').pop();
        if (lastBatch && lastBatch.itemId === itemId) {
          // Merge with existing queued entry
          const [updated] = await db
            .update(buildQueue)
            .set({ quantity: lastBatch.quantity + queuedUnits })
            .where(eq(buildQueue.id, lastBatch.id))
            .returning();
          if (!lastEntry) lastEntry = updated;
        } else {
          const [entry] = await db
            .insert(buildQueue)
            .values({
              planetId, userId, type, itemId,
              quantity: queuedUnits, completedCount: 0,
              startTime: now, endTime: new Date(now.getTime() + unitTime * 1000),
              status: 'queued',
              facilityId,
            })
            .returning();
          if (!lastEntry) lastEntry = entry;
        }
      }

      return { entry: lastEntry, unitTime };
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

      // Fetch planet class for governance penalty
      const [entryPlanet] = await db
        .select({ planetClassId: planets.planetClassId })
        .from(planets)
        .where(eq(planets.id, entry.planetId))
        .limit(1);
      const govPenaltyUnit = await getGovernancePenalty(db, entry.userId, entryPlanet?.planetClassId ?? null, config);
      const govTimeMultUnit = 1 + govPenaltyUnit.constructionMalus;

      if (entry.type === 'ship') {
        const shipDef = config.ships[entry.itemId];
        if (shipDef) {
          await this.getOrCreateShips(entry.planetId);
          const col = shipDef.countColumn as keyof typeof planetShips;
          await db
            .update(planetShips)
            .set({ [col]: sql`${planetShips[col]} + 1` })
            .where(eq(planetShips.planetId, entry.planetId));
          // Update flagship base stats if this is a new ship type
          if (flagshipService) {
            await flagshipService.addUnlockedShip(entry.userId, entry.itemId);
          }
        }
      } else {
        const defenseDef = config.defenses[entry.itemId];
        if (defenseDef) {
          await this.getOrCreateDefenses(entry.planetId);
          const col = defenseDef.countColumn as keyof typeof planetDefenses;
          await db
            .update(planetDefenses)
            .set({ [col]: sql`${planetDefenses[col]} + 1` })
            .where(eq(planetDefenses.planetId, entry.planetId));
        }
      }

      if (newCompletedCount >= entry.quantity) {
        await db
          .update(buildQueue)
          .set({ completedCount: newCompletedCount, status: 'completed' })
          .where(eq(buildQueue.id, buildQueueId));

        // Compute maxSlots here where we have full context
        let maxSlots = 1;
        if (talentService) {
          const tc = await talentService.computeTalentContext(entry.userId, entry.planetId);
          if (entry.facilityId === 'shipyard') maxSlots += Math.floor(tc['industrial_parallel_build'] ?? 0);
          if (entry.facilityId === 'commandCenter') maxSlots += Math.floor(tc['military_parallel_build'] ?? 0);
        }

        await this.activateNextBatch(entry.planetId, entry.type as 'ship' | 'defense', entry.facilityId, maxSlots);

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
            planetName: planet?.name ?? 'Planète',
            unitId: entry.itemId,
            name: unitName,
            count: newCompletedCount,
            buildType: entry.type,
          },
          eventPayload: {
            unitId: entry.itemId,
            name: unitName,
            count: newCompletedCount,
            buildType: entry.type,
            planetName: planet?.name ?? 'Planète',
          },
          tutorialCheck: entry.type === 'ship'
            ? { type: 'ship_count' as const, targetId: entry.itemId, targetValue: newCompletedCount }
            : entry.type === 'defense'
              ? { type: 'defense_count' as const, targetId: entry.itemId, targetValue: newCompletedCount }
              : undefined,
        };
      }

      const now = new Date();
      const def = entry.type === 'ship' ? config.ships[entry.itemId] : config.defenses[entry.itemId];

      const buildingLevels = await this.getBuildingLevels(entry.planetId);
      const talentCtx = talentService ? await talentService.computeTalentContext(entry.userId, entry.planetId) : {};
      const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
      let unitTime = 60;
      if (def) {
        if (entry.type === 'ship') {
          const buildCategory = getShipBuildCategory(def as any, config.bonuses);
          const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
          const talentTimeMultiplier = 1 / (1 + (talentCtx['ship_build_time'] ?? 0));
          const hullKey = buildCategory === 'build_military' ? 'hull_combat_build_time_reduction'
            : buildCategory === 'build_industrial' ? 'hull_industrial_build_time_reduction'
            : null;
          const hullTimeMultiplier = hullKey ? 1 - (talentCtx[hullKey] ?? 0) : 1;
          const tcKey = buildCategory === 'build_military' ? 'military_build_time' : buildCategory === 'build_industrial' ? 'industrial_build_time' : null;
          const tcMult = tcKey ? 1 - (talentCtx[tcKey] ?? 0) : 1;
          unitTime = Math.max(1, Math.floor(shipTime(def, bonusMultiplier, timeDivisor) * talentTimeMultiplier * hullTimeMultiplier * tcMult * govTimeMultUnit));
        } else {
          const bonusMultiplier = resolveBonus('defense_build_time', null, buildingLevels, config.bonuses);
          const talentTimeMultiplier = 1 / (1 + (talentCtx['defense_build_time'] ?? 0));
          unitTime = Math.max(1, Math.floor(defenseTime(def, bonusMultiplier, timeDivisor) * talentTimeMultiplier * govTimeMultUnit));
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

    async activateNextBatch(planetId: string, type: 'ship' | 'defense', facilityId?: string | null, maxSlots: number = 1) {
      // Hoist invariant lookups outside the loop — config, building levels,
      // and talent context don't change between iterations.
      const config = await gameConfigService.getFullConfig();
      const buildingLevels = await this.getBuildingLevels(planetId);
      const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
      // talentCtx is lazily initialised on first iteration (needs userId from nextBatch)
      let talentCtx2: Record<string, number> | null = null;

      // Governance construction penalty
      const [batchPlanet] = await db
        .select({ planetClassId: planets.planetClassId, userId: planets.userId })
        .from(planets)
        .where(eq(planets.id, planetId))
        .limit(1);
      let govTimeMultBatch = 1;
      if (batchPlanet) {
        const govPenaltyBatch = await getGovernancePenalty(db, batchPlanet.userId, batchPlanet.planetClassId, config);
        govTimeMultBatch = 1 + govPenaltyBatch.constructionMalus;
      }

      for (;;) {
        // Fresh active count each iteration to prevent concurrent over-activation
        const freshQueue = await this.getShipyardQueue(planetId, facilityId ?? undefined);
        const freshSameType = freshQueue.filter(e =>
          e.type === type && (!facilityId || e.facilityId === facilityId)
        );
        const activeCount = freshSameType.filter(e => e.status === 'active').length;
        if (activeCount >= maxSlots) break;
        // Find next queued entry
        const [nextBatch] = await db
          .select()
          .from(buildQueue)
          .where(
            and(
              eq(buildQueue.planetId, planetId),
              eq(buildQueue.status, 'queued'),
              eq(buildQueue.type, type),
              ...(facilityId ? [eq(buildQueue.facilityId, facilityId)] : []),
            ),
          )
          .orderBy(asc(buildQueue.startTime))
          .limit(1);

        if (!nextBatch) break;

        if (!talentCtx2) {
          talentCtx2 = talentService ? await talentService.computeTalentContext(nextBatch.userId, planetId) : {};
        }

        let unitTime: number;
        if (type === 'ship') {
          const def = config.ships[nextBatch.itemId];
          const buildCategory = getShipBuildCategory(def as any, config.bonuses);
          const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
          const talentTimeMultiplier = 1 / (1 + (talentCtx2['ship_build_time'] ?? 0));
          const hullKey = buildCategory === 'build_military' ? 'hull_combat_build_time_reduction'
            : buildCategory === 'build_industrial' ? 'hull_industrial_build_time_reduction'
            : null;
          const hullTimeMultiplier = hullKey ? 1 - (talentCtx2[hullKey] ?? 0) : 1;
          const talentCatKey = buildCategory === 'build_military' ? 'military_build_time' : buildCategory === 'build_industrial' ? 'industrial_build_time' : null;
          const talentCatMult = talentCatKey ? 1 - (talentCtx2[talentCatKey] ?? 0) : 1;
          unitTime = Math.max(1, Math.floor(shipTime(def, bonusMultiplier, timeDivisor) * talentTimeMultiplier * hullTimeMultiplier * talentCatMult * govTimeMultBatch));
        } else {
          const def = config.defenses[nextBatch.itemId];
          const bonusMultiplier = resolveBonus('defense_build_time', null, buildingLevels, config.bonuses);
          const talentTimeMultiplier = 1 / (1 + (talentCtx2['defense_build_time'] ?? 0));
          unitTime = Math.max(1, Math.floor(defenseTime(def, bonusMultiplier, timeDivisor) * talentTimeMultiplier * govTimeMultBatch));
        }

        // Atomic decrement: try to claim 1 unit from queued batch
        // This prevents race conditions when multiple slots complete simultaneously
        if (nextBatch.quantity - nextBatch.completedCount > 1) {
          const [decremented] = await db.update(buildQueue)
            .set({ quantity: sql`${buildQueue.quantity} - 1` })
            .where(and(eq(buildQueue.id, nextBatch.id), gt(buildQueue.quantity, 1)))
            .returning();

          if (!decremented) continue; // Another worker already claimed it

          // Create new active entry for 1 unit
          const now = new Date();
          const [newEntry] = await db.insert(buildQueue).values({
            planetId: nextBatch.planetId,
            userId: nextBatch.userId,
            type: nextBatch.type,
            itemId: nextBatch.itemId,
            quantity: 1,
            completedCount: 0,
            startTime: now,
            endTime: new Date(now.getTime() + unitTime * 1000),
            status: 'active',
            facilityId: nextBatch.facilityId,
          }).returning();

          await completionQueue.add(
            'shipyard-unit',
            { buildQueueId: newEntry.id },
            { delay: unitTime * 1000, jobId: `shipyard-${newEntry.id}-1` },
          );
        } else {
          // Single unit — atomically claim it by setting active (only if still queued)
          const now = new Date();
          const [activated] = await db.update(buildQueue).set({
            status: 'active',
            startTime: now,
            endTime: new Date(now.getTime() + unitTime * 1000),
          }).where(and(eq(buildQueue.id, nextBatch.id), eq(buildQueue.status, 'queued')))
            .returning();

          if (!activated) continue; // Another worker already activated it

          await completionQueue.add(
            'shipyard-unit',
            { buildQueueId: nextBatch.id },
            { delay: unitTime * 1000, jobId: `shipyard-${nextBatch.id}-${nextBatch.completedCount + 1}` },
          );
        }
      }
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
        let maxSlots = 1;
        if (talentService) {
          const tc = await talentService.computeTalentContext(entry.userId, planetId);
          if (entry.facilityId === 'shipyard') maxSlots += Math.floor(tc['industrial_parallel_build'] ?? 0);
          if (entry.facilityId === 'commandCenter') maxSlots += Math.floor(tc['military_parallel_build'] ?? 0);
        }
        await this.activateNextBatch(planetId, entry.type as 'ship' | 'defense', entry.facilityId, maxSlots);
      }

      return { cancelled: true, refund };
    },

    async reduceQuantity(userId: string, planetId: string, batchId: string, removeCount: number) {
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
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Type non modifiable' });
      }

      const remaining = entry.quantity - entry.completedCount;
      if (removeCount <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Quantité invalide' });
      }

      // If removing all remaining, just cancel the whole batch
      if (removeCount >= remaining) {
        return this.cancelBatch(userId, planetId, batchId);
      }

      // Refund at cancel ratio (default 70%) to prevent resource sheltering exploits
      const config = await gameConfigService.getFullConfig();
      const cancelRefundRatio = Number(config.universe.cancel_refund_ratio) || 0.7;
      const def = entry.type === 'ship' ? config.ships[entry.itemId] : config.defenses[entry.itemId];
      const unitCost = def ? (entry.type === 'ship' ? shipCost(def) : defenseCost(def)) : { minerai: 0, silicium: 0, hydrogene: 0 };

      const refund = {
        minerai: Math.floor(unitCost.minerai * cancelRefundRatio) * removeCount,
        silicium: Math.floor(unitCost.silicium * cancelRefundRatio) * removeCount,
        hydrogene: Math.floor(unitCost.hydrogene * cancelRefundRatio) * removeCount,
      };

      // Refund resources
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

      // Reduce quantity in the batch
      await db
        .update(buildQueue)
        .set({ quantity: entry.quantity - removeCount })
        .where(eq(buildQueue.id, batchId));

      return { reduced: true, removedCount: removeCount, refund };
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
