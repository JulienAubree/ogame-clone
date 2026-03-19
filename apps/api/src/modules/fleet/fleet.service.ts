import { eq, and, sql, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, fleetEvents, userResearch, debrisFields, users, planetBuildings, pveMissions, asteroidDeposits } from '@ogame-clone/db';
import { BELT_POSITIONS } from '../universe/universe.config.js';
import type { Database } from '@ogame-clone/db';
import {
  fleetSpeed,
  travelTime,
  distance,
  fuelConsumption,
  totalCargoCapacity,
  calculateMaxTemp,
  calculateMinTemp,
  calculateDiameter,
  calculateMaxFields,
  calculateSpyReport,
  calculateDetectionChance,
  simulateCombat,
  totalExtracted,
  extractionDuration,
  miningDuration,
  prospectionDuration,
  type CombatTechs,
  type ShipStats,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { createMessageService } from '../message/message.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { Queue } from 'bullmq';
import type { createPveService } from '../pve/pve.service.js';
import type { createAsteroidBeltService } from '../pve/asteroid-belt.service.js';
import type { createPirateService } from '../pve/pirate.service.js';
import { TransportHandler } from './handlers/transport.handler.js';
import { StationHandler } from './handlers/station.handler.js';
import { SpyHandler } from './handlers/spy.handler.js';
import { RecycleHandler } from './handlers/recycle.handler.js';
import { ColonizeHandler } from './handlers/colonize.handler.js';
import { AttackHandler } from './handlers/attack.handler.js';
import type { MissionHandler, MissionHandlerContext, FleetEvent as HandlerFleetEvent } from './fleet.types.js';

interface SendFleetInput {
  originPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  mission: 'transport' | 'station' | 'spy' | 'attack' | 'colonize' | 'recycle' | 'mine' | 'pirate';
  ships: Record<string, number>;
  mineraiCargo?: number;
  siliciumCargo?: number;
  hydrogeneCargo?: number;
  pveMissionId?: string;
}

function buildShipStatsMap(config: Awaited<ReturnType<GameConfigService['getFullConfig']>>): Record<string, ShipStats> {
  const map: Record<string, ShipStats> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    map[id] = {
      baseSpeed: ship.baseSpeed,
      fuelConsumption: ship.fuelConsumption,
      cargoCapacity: ship.cargoCapacity,
      driveType: ship.driveType as ShipStats['driveType'],
    };
  }
  return map;
}

function buildCombatStats(config: Awaited<ReturnType<GameConfigService['getFullConfig']>>) {
  const stats: Record<string, { weapons: number; shield: number; armor: number }> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    stats[id] = { weapons: ship.weapons, shield: ship.shield, armor: ship.armor };
  }
  for (const [id, def] of Object.entries(config.defenses)) {
    stats[id] = { weapons: def.weapons, shield: def.shield, armor: def.armor };
  }
  return stats;
}

function buildShipCosts(config: Awaited<ReturnType<GameConfigService['getFullConfig']>>) {
  const costs: Record<string, { minerai: number; silicium: number }> = {};
  for (const [id, ship] of Object.entries(config.ships)) {
    costs[id] = { minerai: ship.cost.minerai, silicium: ship.cost.silicium };
  }
  return costs;
}

export function createFleetService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  fleetArrivalQueue: Queue,
  fleetReturnQueue: Queue,
  universeSpeed: number,
  messageService: ReturnType<typeof createMessageService> | undefined,
  gameConfigService: GameConfigService,
  pveService?: ReturnType<typeof createPveService>,
  asteroidBeltService?: ReturnType<typeof createAsteroidBeltService>,
  pirateService?: ReturnType<typeof createPirateService>,
) {
  const handlers: Record<string, MissionHandler> = {
    transport: new TransportHandler(),
    station: new StationHandler(),
    spy: new SpyHandler(),
    recycle: new RecycleHandler(),
    colonize: new ColonizeHandler(),
    attack: new AttackHandler(),
  };

  const handlerCtx: MissionHandlerContext = {
    db,
    resourceService,
    gameConfigService,
    messageService,
    pveService,
    asteroidBeltService,
    pirateService,
    fleetArrivalQueue,
    fleetReturnQueue,
    universeSpeed,
  };

  return {
    async sendFleet(userId: string, input: SendFleetInput) {
      const planet = await this.getOwnedPlanet(userId, input.originPlanetId);
      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);

      // Validate ships are available
      const planetShipRow = await this.getOrCreateShips(input.originPlanetId);
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count <= 0) continue;
        const available = (planetShipRow[shipId as keyof typeof planetShipRow] ?? 0) as number;
        if (available < count) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Pas assez de ${shipId} (disponible: ${available}, demandé: ${count})`,
          });
        }
      }

      // Get research levels for speed calculation
      const driveTechs = await this.getDriveTechs(userId);
      const speed = fleetSpeed(input.ships, driveTechs, shipStatsMap);
      if (speed === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun vaisseau sélectionné' });
      }

      const origin = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      const target = { galaxy: input.targetGalaxy, system: input.targetSystem, position: input.targetPosition };
      const dist = distance(origin, target);
      const duration = travelTime(origin, target, speed, universeSpeed);
      const fuel = fuelConsumption(input.ships, dist, duration, shipStatsMap);

      // Validate cargo doesn't exceed capacity
      const cargo = totalCargoCapacity(input.ships, shipStatsMap);
      const mineraiCargo = input.mineraiCargo ?? 0;
      const siliciumCargo = input.siliciumCargo ?? 0;
      const hydrogeneCargo = input.hydrogeneCargo ?? 0;
      const totalCargo = mineraiCargo + siliciumCargo + hydrogeneCargo;
      if (totalCargo > cargo) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Capacité de fret dépassée' });
      }

      // Handler-based validation
      const sendHandler = handlers[input.mission];
      if (sendHandler) {
        await sendHandler.validateFleet(input, config, handlerCtx);
      }

      // Attack validation moved to AttackHandler

      // Recycle validation moved to RecycleHandler

      // Spy validation moved to SpyHandler

      // Colonize validation moved to ColonizeHandler

      // Validate: mine requires at least 1 prospector and must target belt position
      if (input.mission === 'mine') {
        const prospectorCount = input.ships['prospector'] ?? 0;
        if (prospectorCount === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'La mission Miner nécessite au moins 1 prospecteur' });
        }
        if (!BELT_POSITIONS.includes(input.targetPosition as 8 | 16)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Les missions de minage ciblent uniquement les ceintures d\'astéroïdes (positions 8 ou 16)' });
        }
      }

      // Find target planet (may not exist for colonization or PvE missions)
      let targetPlanet: typeof planets.$inferSelect | undefined;
      if (input.mission !== 'mine' && input.mission !== 'pirate') {
        const [found] = await db
          .select()
          .from(planets)
          .where(
            and(
              eq(planets.galaxy, input.targetGalaxy),
              eq(planets.system, input.targetSystem),
              eq(planets.position, input.targetPosition),
            ),
          )
          .limit(1);
        targetPlanet = found;
      }

      // Spend resources (cargo + fuel)
      const totalHydrogeneCost = hydrogeneCargo + fuel;
      await resourceService.spendResources(input.originPlanetId, userId, {
        minerai: mineraiCargo,
        silicium: siliciumCargo,
        hydrogene: totalHydrogeneCost,
      });

      // Deduct ships from planet
      const shipUpdates: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count > 0) {
          const current = (planetShipRow[shipId as keyof typeof planetShipRow] ?? 0) as number;
          shipUpdates[shipId] = current - count;
        }
      }
      await db
        .update(planetShips)
        .set(shipUpdates)
        .where(eq(planetShips.planetId, input.originPlanetId));

      // Create fleet event
      const now = new Date();
      const arrivalTime = new Date(now.getTime() + duration * 1000);

      const [event] = await db
        .insert(fleetEvents)
        .values({
          userId,
          originPlanetId: input.originPlanetId,
          targetPlanetId: targetPlanet?.id ?? null,
          targetGalaxy: input.targetGalaxy,
          targetSystem: input.targetSystem,
          targetPosition: input.targetPosition,
          mission: input.mission as typeof fleetEvents.$inferInsert.mission,  // mine/pirate added to DB enum in Task 4
          phase: 'outbound',
          status: 'active',
          departureTime: now,
          arrivalTime,
          mineraiCargo: String(mineraiCargo),
          siliciumCargo: String(siliciumCargo),
          hydrogeneCargo: String(hydrogeneCargo),
          ships: input.ships,
          pveMissionId: input.pveMissionId ?? null,
        })
        .returning();

      // Mark PvE mission as in_progress (with ownership check)
      if (input.pveMissionId && pveService) {
        const [pveMission] = await db.select().from(pveMissions)
          .where(and(eq(pveMissions.id, input.pveMissionId), eq(pveMissions.userId, userId)))
          .limit(1);
        if (!pveMission) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Mission non trouvée ou non autorisée' });
        }
        if (pveMission.status !== 'available') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mission déjà en cours ou terminée' });
        }
        await pveService.startMission(input.pveMissionId);
      }

      // Schedule arrival job
      await fleetArrivalQueue.add(
        'arrive',
        { fleetEventId: event.id },
        { delay: duration * 1000, jobId: `fleet-arrive-${event.id}` },
      );

      return {
        event,
        arrivalTime: arrivalTime.toISOString(),
        travelTime: duration,
        fuelConsumed: fuel,
      };
    },

    async recallFleet(userId: string, fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(
          and(
            eq(fleetEvents.id, fleetEventId),
            eq(fleetEvents.userId, userId),
            eq(fleetEvents.status, 'active'),
            inArray(fleetEvents.phase, ['outbound', 'prospecting', 'mining']),
          ),
        )
        .limit(1);

      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Flotte non trouvée ou non rappelable' });
      }

      const now = new Date();
      const elapsed = now.getTime() - event.departureTime.getTime();
      const returnTime = new Date(now.getTime() + elapsed);

      // Cancel the pending job for the current phase
      const jobIdMap: Record<string, string> = {
        outbound: `fleet-arrive-${event.id}`,
        prospecting: `fleet-prospect-${event.id}`,
        mining: `fleet-mine-${event.id}`,
      };
      const jobId = jobIdMap[event.phase];
      if (jobId) await fleetArrivalQueue.remove(jobId);

      // Release PvE mission back to available if recalling
      if (event.pveMissionId && pveService) {
        await pveService.releaseMission(event.pveMissionId);
      }

      await db
        .update(fleetEvents)
        .set({
          phase: 'return',
          departureTime: now,
          arrivalTime: returnTime,
        })
        .where(eq(fleetEvents.id, event.id));

      await fleetReturnQueue.add(
        'return',
        { fleetEventId: event.id },
        { delay: elapsed, jobId: `fleet-return-${event.id}` },
      );

      return { recalled: true, returnTime: returnTime.toISOString() };
    },

    async listMovements(userId: string) {
      return db
        .select()
        .from(fleetEvents)
        .where(
          and(
            eq(fleetEvents.userId, userId),
            eq(fleetEvents.status, 'active'),
          ),
        );
    },

    async processArrival(fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active')))
        .limit(1);

      if (!event) return null;

      const ships = event.ships as Record<string, number>;
      const mineraiCargo = Number(event.mineraiCargo);
      const siliciumCargo = Number(event.siliciumCargo);
      const hydrogeneCargo = Number(event.hydrogeneCargo);

      const [originPlanet] = await db
        .select({ name: planets.name })
        .from(planets)
        .where(eq(planets.id, event.originPlanetId))
        .limit(1);

      const eventMeta = {
        userId: event.userId,
        originPlanetId: event.originPlanetId,
        originName: originPlanet?.name ?? 'Planète',
        targetCoords: `${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}`,
        ships,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
      };

      // Handler-based dispatch
      const handler = handlers[event.mission];
      if (handler) {
        const handlerEvent: HandlerFleetEvent = {
          id: event.id,
          userId: event.userId,
          originPlanetId: event.originPlanetId,
          targetPlanetId: event.targetPlanetId,
          targetGalaxy: event.targetGalaxy,
          targetSystem: event.targetSystem,
          targetPosition: event.targetPosition,
          mission: event.mission,
          phase: event.phase,
          status: event.status,
          departureTime: event.departureTime,
          arrivalTime: event.arrivalTime,
          mineraiCargo: event.mineraiCargo,
          siliciumCargo: event.siliciumCargo,
          hydrogeneCargo: event.hydrogeneCargo,
          ships,
          metadata: event.metadata,
          pveMissionId: event.pveMissionId,
        };
        const result = await handler.processArrival(handlerEvent, handlerCtx);

        if (result.scheduleReturn) {
          const cargo = result.cargo ?? { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo };
          const returnShips = result.shipsAfterArrival ?? ships;
          await this.scheduleReturn(
            event.id, event.originPlanetId,
            { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
            returnShips, cargo.minerai, cargo.silicium, cargo.hydrogene,
          );
        }

        if (result.schedulePhase) {
          await fleetArrivalQueue.add(
            result.schedulePhase.jobName,
            { fleetEventId: event.id },
            { delay: result.schedulePhase.delayMs, jobId: `fleet-${result.schedulePhase.jobName}-${event.id}` },
          );
        }

        if (!result.scheduleReturn && !result.schedulePhase && !result.createReturnEvent) {
          await db.update(fleetEvents).set({ status: 'completed' }).where(eq(fleetEvents.id, event.id));
        }

        if (result.createReturnEvent) {
          // Handle special return events (e.g. colonize success — remaining ships return in a new fleet event)
          const returnData = result.createReturnEvent;
          const [insertedEvent] = await db
            .insert(fleetEvents)
            .values(returnData as typeof fleetEvents.$inferInsert)
            .returning();

          if (insertedEvent) {
            const returnShips = (returnData.ships ?? ships) as Record<string, number>;
            const returnCargo = result.cargo ?? { minerai: 0, silicium: 0, hydrogene: 0 };
            await this.scheduleReturn(
              insertedEvent.id, event.originPlanetId,
              { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
              returnShips, returnCargo.minerai, returnCargo.silicium, returnCargo.hydrogene,
            );
          }
        }

        return { ...eventMeta, mission: event.mission };
      }

      // Station handled by handler dispatch above

      // Transport, Station, Spy, Recycle, Colonize, Attack handled by handler dispatch above

      if (event.mission === 'mine') {
        const pveMissionId = event.pveMissionId;
        const mission = pveMissionId
          ? await db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
          : null;

        const targetCoords = { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition };

        if (!mission || !pveService || !asteroidBeltService) {
          await this.scheduleReturn(event.id, event.originPlanetId, targetCoords, ships, 0, 0, 0);
          return { ...eventMeta, mission: 'mine', extracted: 0 };
        }

        // Transition to prospecting phase
        const params = mission.parameters as { depositId: string; resourceType: string };
        const [deposit] = await db.select().from(asteroidDeposits)
          .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
        const depositTotal = deposit ? Number(deposit.totalQuantity) : 0;
        const prospectMins = prospectionDuration(depositTotal);
        const prospectMs = prospectMins * 60 * 1000;

        const now = new Date();
        const prospectArrival = new Date(now.getTime() + prospectMs);

        await db.update(fleetEvents).set({
          phase: 'prospecting',
          departureTime: now,
          arrivalTime: prospectArrival,
        }).where(eq(fleetEvents.id, event.id));

        await fleetArrivalQueue.add(
          'prospect-done',
          { fleetEventId: event.id },
          { delay: prospectMs, jobId: `fleet-prospect-${event.id}` },
        );

        return { ...eventMeta, mission: 'mine', phase: 'prospecting', prospectionDuration: prospectMins };
      }

      if (event.mission === 'pirate') {
        const pveMissionId = event.pveMissionId;
        const mission = pveMissionId
          ? await db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
          : null;

        const targetCoords = { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition };

        if (!mission || !pveService || !pirateService) {
          await this.scheduleReturn(event.id, event.originPlanetId, targetCoords, ships, 0, 0, 0);
          return { ...eventMeta, mission: 'pirate', outcome: 'error' };
        }

        const params = mission.parameters as { templateId: string };

        const playerTechs = await this.getCombatTechs(event.userId);

        const config = await gameConfigService.getFullConfig();
        const shipStatsMap = buildShipStatsMap(config);
        // Pass pre-combat cargo, then re-cap loot based on surviving fleet
        const preCargoCapacity = totalCargoCapacity(ships, shipStatsMap);
        const result = await pirateService.processPirateArrival(
          ships, playerTechs, params.templateId, preCargoCapacity,
        );
        // Re-cap loot to surviving fleet's actual cargo capacity
        if (result.outcome === 'attacker') {
          const survivingCargo = totalCargoCapacity(result.survivingShips, shipStatsMap);
          const totalLoot = result.loot.minerai + result.loot.silicium + result.loot.hydrogene;
          if (totalLoot > survivingCargo) {
            const ratio = survivingCargo / totalLoot;
            result.loot.minerai = Math.floor(result.loot.minerai * ratio);
            result.loot.silicium = Math.floor(result.loot.silicium * ratio);
            result.loot.hydrogene = Math.floor(result.loot.hydrogene * ratio);
          }
        }

        await db.update(fleetEvents).set({
          ships: result.survivingShips,
          mineraiCargo: String(result.loot.minerai),
          siliciumCargo: String(result.loot.silicium),
          hydrogeneCargo: String(result.loot.hydrogene),
          metadata: Object.keys(result.bonusShips).length > 0
            ? { bonusShips: result.bonusShips }
            : null,
        }).where(eq(fleetEvents.id, event.id));

        await this.scheduleReturn(
          event.id, event.originPlanetId, targetCoords,
          result.survivingShips,
          result.loot.minerai, result.loot.silicium, result.loot.hydrogene,
        );
        await pveService.completeMission(mission.id);

        return { ...eventMeta, mission: 'pirate', outcome: result.outcome, loot: result.loot, bonusShips: result.bonusShips, losses: result.attackerLosses };
      }

      // Unknown mission — return fleet
      await this.scheduleReturn(
        event.id, event.originPlanetId,
        { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
        ships, mineraiCargo, siliciumCargo, hydrogeneCargo,
      );

      return { ...eventMeta, mission: event.mission, placeholder: true };
    },

    async processProspectDone(fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active'), eq(fleetEvents.phase, 'prospecting')))
        .limit(1);

      if (!event) return { skipped: true };

      const pveMissionId = event.pveMissionId;
      const mission = pveMissionId
        ? await db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
        : null;
      const ships = event.ships as Record<string, number>;

      if (!mission || !pveService) {
        const targetCoords = { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition };
        await this.scheduleReturn(event.id, event.originPlanetId, targetCoords, ships, 0, 0, 0);
        return { fleetEventId, phase: 'error' };
      }

      // Transition to mining phase
      const centerLevel = await pveService.getMissionCenterLevel(event.userId);
      const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, event.userId)).limit(1);
      const fracturingLevel = research?.rockFracturing ?? 0;
      const mineMins = miningDuration(centerLevel, fracturingLevel);
      const mineMs = mineMins * 60 * 1000;

      const now = new Date();
      const mineArrival = new Date(now.getTime() + mineMs);

      await db.update(fleetEvents).set({
        phase: 'mining',
        departureTime: now,
        arrivalTime: mineArrival,
      }).where(eq(fleetEvents.id, event.id));

      await fleetArrivalQueue.add(
        'mine-done',
        { fleetEventId: event.id },
        { delay: mineMs, jobId: `fleet-mine-${event.id}` },
      );

      return { fleetEventId, phase: 'mining', miningDuration: mineMins };
    },

    async processMineDone(fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active'), eq(fleetEvents.phase, 'mining')))
        .limit(1);

      if (!event) return { skipped: true };

      const pveMissionId = event.pveMissionId;
      const mission = pveMissionId
        ? await db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
        : null;
      const ships = event.ships as Record<string, number>;
      const targetCoords = { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition };

      if (!mission || !pveService || !asteroidBeltService) {
        await this.scheduleReturn(event.id, event.originPlanetId, targetCoords, ships, 0, 0, 0);
        return { fleetEventId, extracted: 0 };
      }

      // Extract resources
      const params = mission.parameters as { depositId: string; resourceType: string };
      const centerLevel = await pveService.getMissionCenterLevel(event.userId);
      const prospectorCount = ships['prospector'] ?? 0;
      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      const cargoCapacity = totalCargoCapacity(ships, shipStatsMap);

      const [deposit] = await db.select().from(asteroidDeposits)
        .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
      const depositRemaining = deposit ? Number(deposit.remainingQuantity) : 0;
      const extractAmount = totalExtracted(centerLevel, prospectorCount, cargoCapacity, depositRemaining);

      const extracted = await asteroidBeltService.extractFromDeposit(params.depositId, extractAmount);

      const cargo = { minerai: 0, silicium: 0, hydrogene: 0 };
      if (extracted > 0) {
        cargo[params.resourceType as keyof typeof cargo] = extracted;
      }

      await db.update(fleetEvents).set({
        mineraiCargo: String(cargo.minerai),
        siliciumCargo: String(cargo.silicium),
        hydrogeneCargo: String(cargo.hydrogene),
      }).where(eq(fleetEvents.id, event.id));

      await this.scheduleReturn(
        event.id, event.originPlanetId, targetCoords, ships,
        cargo.minerai, cargo.silicium, cargo.hydrogene,
      );

      await pveService.completeMission(mission.id);
      return { fleetEventId, extracted };
    },

    async processReturn(fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(
          and(
            eq(fleetEvents.id, fleetEventId),
            eq(fleetEvents.status, 'active'),
            eq(fleetEvents.phase, 'return'),
          ),
        )
        .limit(1);

      if (!event) return null;

      const ships = event.ships as Record<string, number>;

      const [originPlanet] = await db
        .select({ name: planets.name })
        .from(planets)
        .where(eq(planets.id, event.originPlanetId))
        .limit(1);

      // Merge returning ships + PvE bonus ships into a single atomic update
      const meta = event.metadata as { bonusShips?: Record<string, number> } | null;
      const originShips = await this.getOrCreateShips(event.originPlanetId);
      const shipUpdates: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(ships)) {
        if (count > 0) {
          const current = (originShips[shipId as keyof typeof originShips] ?? 0) as number;
          shipUpdates[shipId] = current + count;
        }
      }
      if (meta?.bonusShips) {
        for (const [shipId, count] of Object.entries(meta.bonusShips)) {
          shipUpdates[shipId] = (shipUpdates[shipId] ?? (originShips[shipId as keyof typeof originShips] ?? 0) as number) + count;
        }
      }
      await db
        .update(planetShips)
        .set(shipUpdates)
        .where(eq(planetShips.planetId, event.originPlanetId));

      const mineraiCargo = Number(event.mineraiCargo);
      const siliciumCargo = Number(event.siliciumCargo);
      const hydrogeneCargo = Number(event.hydrogeneCargo);

      if (mineraiCargo > 0 || siliciumCargo > 0 || hydrogeneCargo > 0) {
        const [originPlanetData] = await db
          .select()
          .from(planets)
          .where(eq(planets.id, event.originPlanetId))
          .limit(1);

        if (originPlanetData) {
          await db
            .update(planets)
            .set({
              minerai: String(Number(originPlanetData.minerai) + mineraiCargo),
              silicium: String(Number(originPlanetData.silicium) + siliciumCargo),
              hydrogene: String(Number(originPlanetData.hydrogene) + hydrogeneCargo),
            })
            .where(eq(planets.id, event.originPlanetId));
        }
      }

      await db
        .update(fleetEvents)
        .set({ status: 'completed' })
        .where(eq(fleetEvents.id, event.id));

      return {
        returned: true,
        ships,
        userId: event.userId,
        originPlanetId: event.originPlanetId,
        originName: originPlanet?.name ?? 'Planète',
        targetCoords: `${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}`,
        mission: event.mission,
        cargo: {
          minerai: Number(event.mineraiCargo),
          silicium: Number(event.siliciumCargo),
          hydrogene: Number(event.hydrogeneCargo),
        },
      };
    },

    async scheduleReturn(
      fleetEventId: string,
      originPlanetId: string,
      targetCoords: { galaxy: number; system: number; position: number },
      ships: Record<string, number>,
      mineraiCargo: number,
      siliciumCargo: number,
      hydrogeneCargo: number,
    ) {
      const [originPlanet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, originPlanetId))
        .limit(1);

      if (!originPlanet) return;

      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      const driveTechs = await this.getDriveTechsByEvent(fleetEventId);
      const speed = fleetSpeed(ships, driveTechs, shipStatsMap);
      const origin = { galaxy: originPlanet.galaxy, system: originPlanet.system, position: originPlanet.position };
      const duration = travelTime(targetCoords, origin, speed, universeSpeed);

      const now = new Date();
      const returnTime = new Date(now.getTime() + duration * 1000);

      await db
        .update(fleetEvents)
        .set({
          phase: 'return',
          departureTime: now,
          arrivalTime: returnTime,
          mineraiCargo: String(mineraiCargo),
          siliciumCargo: String(siliciumCargo),
          hydrogeneCargo: String(hydrogeneCargo),
          ships,
        })
        .where(eq(fleetEvents.id, fleetEventId));

      await fleetReturnQueue.add(
        'return',
        { fleetEventId },
        { delay: duration * 1000, jobId: `fleet-return-${fleetEventId}` },
      );
    },

    async scheduleReturnWithDelay(
      fleetEventId: string,
      originPlanetId: string,
      targetCoords: { galaxy: number; system: number; position: number },
      ships: Record<string, number>,
      mineraiCargo: number,
      siliciumCargo: number,
      hydrogeneCargo: number,
      delayMs: number,
    ) {
      const [originPlanet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, originPlanetId))
        .limit(1);

      if (!originPlanet) return;

      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      const driveTechs = await this.getDriveTechsByEvent(fleetEventId);
      const speed = fleetSpeed(ships, driveTechs, shipStatsMap);
      const origin = { galaxy: originPlanet.galaxy, system: originPlanet.system, position: originPlanet.position };
      const duration = travelTime(targetCoords, origin, speed, universeSpeed);

      const now = new Date();
      const departureTime = new Date(now.getTime() + delayMs);
      const returnTime = new Date(departureTime.getTime() + duration * 1000);

      await db
        .update(fleetEvents)
        .set({
          phase: 'return',
          departureTime,
          arrivalTime: returnTime,
          mineraiCargo: String(mineraiCargo),
          siliciumCargo: String(siliciumCargo),
          hydrogeneCargo: String(hydrogeneCargo),
          ships,
        })
        .where(eq(fleetEvents.id, fleetEventId));

      await fleetReturnQueue.add(
        'return',
        { fleetEventId },
        { delay: delayMs + duration * 1000, jobId: `fleet-return-${fleetEventId}` },
      );
    },

    async getCombatTechs(userId: string): Promise<CombatTechs> {
      const [research] = await db
        .select({
          weapons: userResearch.weapons,
          shielding: userResearch.shielding,
          armor: userResearch.armor,
        })
        .from(userResearch)
        .where(eq(userResearch.userId, userId))
        .limit(1);

      return {
        weapons: research?.weapons ?? 0,
        shielding: research?.shielding ?? 0,
        armor: research?.armor ?? 0,
      };
    },

    async getDriveTechs(userId: string) {
      const [research] = await db
        .select()
        .from(userResearch)
        .where(eq(userResearch.userId, userId))
        .limit(1);

      return {
        combustion: (research?.combustion ?? 0) as number,
        impulse: (research?.impulse ?? 0) as number,
        hyperspaceDrive: (research?.hyperspaceDrive ?? 0) as number,
      };
    },

    async getDriveTechsByEvent(fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(eq(fleetEvents.id, fleetEventId))
        .limit(1);

      if (!event) return { combustion: 0, impulse: 0, hyperspaceDrive: 0 };
      return this.getDriveTechs(event.userId);
    },

    async getOrCreateShips(planetId: string) {
      const [existing] = await db.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
      if (existing) return existing;
      const [created] = await db.insert(planetShips).values({ planetId }).returning();
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
