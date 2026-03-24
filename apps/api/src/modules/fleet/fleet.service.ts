import { eq, and, inArray, count as dbCount, sql, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, fleetEvents, userResearch, pveMissions, users, allianceMembers, alliances } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { fleetSpeed, travelTime, distance, fuelConsumption, totalCargoCapacity, resolveBonus, calculateAttackDetection, detectionDelay } from '@ogame-clone/game-engine';
import type { BonusDefinition, ShipStats, FleetConfig } from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { createMessageService } from '../message/message.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { Queue } from 'bullmq';
import type { createPveService } from '../pve/pve.service.js';
import type { createAsteroidBeltService } from '../pve/asteroid-belt.service.js';
import type { createPirateService } from '../pve/pirate.service.js';
import type { createReportService } from '../report/report.service.js';
import type Redis from 'ioredis';
import { publishNotification } from '../notification/notification.publisher.js';
import { TransportHandler } from './handlers/transport.handler.js';
import { StationHandler } from './handlers/station.handler.js';
import { SpyHandler } from './handlers/spy.handler.js';
import { RecycleHandler } from './handlers/recycle.handler.js';
import { ColonizeHandler } from './handlers/colonize.handler.js';
import { AttackHandler } from './handlers/attack.handler.js';
import { PirateHandler } from './handlers/pirate.handler.js';
import { MineHandler } from './handlers/mine.handler.js';
import { buildShipStatsMap } from './fleet.types.js';
import type { FleetCompletionResult } from '../../workers/completion.types.js';
import { env } from '../../config/env.js';
import type { PhasedMissionHandler, MissionHandler, MissionHandlerContext, SendFleetInput, FleetEvent as HandlerFleetEvent } from './fleet.types.js';

export function createFleetService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  fleetQueue: Queue,
  messageService: ReturnType<typeof createMessageService> | undefined,
  gameConfigService: GameConfigService,
  redis: Redis,
  pveService?: ReturnType<typeof createPveService>,
  asteroidBeltService?: ReturnType<typeof createAsteroidBeltService>,
  pirateService?: ReturnType<typeof createPirateService>,
  reportService?: ReturnType<typeof createReportService>,
) {
  const handlers: Record<string, MissionHandler> = {
    transport: new TransportHandler(),
    station: new StationHandler(),
    spy: new SpyHandler(),
    recycle: new RecycleHandler(),
    colonize: new ColonizeHandler(),
    attack: new AttackHandler(),
    pirate: new PirateHandler(),
    mine: new MineHandler(),
  };

  const handlerCtx: MissionHandlerContext = {
    db,
    resourceService,
    gameConfigService,
    messageService,
    pveService,
    asteroidBeltService,
    pirateService,
    reportService,
    fleetQueue,
    assetsDir: env.ASSETS_DIR,
  };

  function buildFleetConfig(config: { universe: Record<string, unknown> }): FleetConfig {
    return {
      galaxyFactor: Number(config.universe.fleet_distance_galaxy_factor) || 20000,
      systemBase: Number(config.universe.fleet_distance_system_base) || 2700,
      systemFactor: Number(config.universe.fleet_distance_system_factor) || 95,
      positionBase: Number(config.universe.fleet_distance_position_base) || 1000,
      positionFactor: Number(config.universe.fleet_distance_position_factor) || 5,
      samePositionDistance: Number(config.universe.fleet_same_position_distance) || 5,
      speedFactor: Number(config.universe.fleet_speed_factor) || 35000,
    };
  }

  return {
    async sendFleet(userId: string, input: SendFleetInput) {
      const planet = await this.getOwnedPlanet(userId, input.originPlanetId);
      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);

      // Get research levels (used for fleet limit + speed calculation)
      const researchLevels = await this.getResearchLevels(userId);

      // Validate fleet slot limit (computerTech)
      const maxFleets = Math.floor(resolveBonus('fleet_count', null, researchLevels, config.bonuses));
      const [{ count: activeFleets }] = await db
        .select({ count: dbCount() })
        .from(fleetEvents)
        .where(and(eq(fleetEvents.userId, userId), eq(fleetEvents.status, 'active')));
      if (activeFleets >= maxFleets) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Nombre maximum de flottes atteint (${maxFleets}). Améliorez la Technologie informatique pour envoyer plus de flottes.`,
        });
      }

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
      const speedMultipliers = this.buildSpeedMultipliers(input.ships, shipStatsMap, researchLevels, config.bonuses);
      const speed = fleetSpeed(input.ships, shipStatsMap, speedMultipliers);
      if (speed === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun vaisseau sélectionné' });
      }

      const fleetConfig = buildFleetConfig(config);
      const origin = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      const target = { galaxy: input.targetGalaxy, system: input.targetSystem, position: input.targetPosition };
      const dist = distance(origin, target, fleetConfig);
      const universeSpeed = Number(config.universe.speed) || 1;
      const duration = travelTime(origin, target, speed, universeSpeed, fleetConfig);
      const fuel = fuelConsumption(input.ships, dist, duration, shipStatsMap, { speedFactor: fleetConfig.speedFactor });

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

      // Validate PvE mission ownership and status
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
        // Mine missions stay available until deposit is empty — don't mark in_progress
        if (pveMission.missionType !== 'mine') {
          await pveService.startMission(input.pveMissionId);
        }
      }

      // Schedule arrival job
      await fleetQueue.add(
        'arrive',
        { fleetEventId: event.id },
        { delay: duration * 1000, jobId: `fleet-arrive-${event.id}` },
      );

      // Notify target planet owner for non-dangerous missions
      const missionDef = config.missions[input.mission];
      if (missionDef && !missionDef.dangerous && targetPlanet && targetPlanet.userId !== userId) {
        const [sender] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        publishNotification(redis, targetPlanet.userId, {
          type: 'fleet-inbound',
          payload: {
            mission: input.mission,
            missionLabel: missionDef.label,
            senderUsername: sender?.username ?? null,
            originCoords: `${planet.galaxy}:${planet.system}:${planet.position}`,
            targetCoords: `${input.targetGalaxy}:${input.targetSystem}:${input.targetPosition}`,
            arrivalTime: arrivalTime.toISOString(),
          },
        });
      }

      // Schedule attack detection for dangerous missions targeting other players
      if (missionDef?.dangerous && targetPlanet?.userId && targetPlanet.userId !== userId) {
        const [defenderResearch] = await db
          .select({ sensorNetwork: userResearch.sensorNetwork })
          .from(userResearch)
          .where(eq(userResearch.userId, targetPlanet.userId))
          .limit(1);

        const defSensor = defenderResearch?.sensorNetwork ?? 0;
        const atkStealth = researchLevels.stealthTech ?? 0;

        const scoreThresholds: number[] = JSON.parse(String(config.universe.attack_detection_score_thresholds ?? '[0,1,3,5,7]'));
        const timingPercents: number[] = JSON.parse(String(config.universe.attack_detection_timing ?? '[20,40,60,80,100]'));

        const detection = calculateAttackDetection(defSensor, atkStealth, scoreThresholds, timingPercents);

        await db
          .update(fleetEvents)
          .set({ detectionScore: detection.score })
          .where(eq(fleetEvents.id, event.id));

        const travelDurationMs = duration * 1000;
        const detDelay = detectionDelay(travelDurationMs, detection.detectionPercent);

        await fleetQueue.add(
          'fleet-detected',
          { fleetEventId: event.id, defenderId: targetPlanet.userId },
          { delay: detDelay, jobId: `fleet-detected-${event.id}` },
        );
      }

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
      if (jobId) await fleetQueue.remove(jobId);

      // Also cancel pending detection job
      await fleetQueue.remove(`fleet-detected-${event.id}`);

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

      await fleetQueue.add(
        'return',
        { fleetEventId: event.id },
        { delay: elapsed, jobId: `fleet-return-${event.id}` },
      );

      return { recalled: true, returnTime: returnTime.toISOString() };
    },

    async getFleetSlots(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const researchLevels = await this.getResearchLevels(userId);
      const max = Math.floor(resolveBonus('fleet_count', null, researchLevels, config.bonuses));
      const [{ count: current }] = await db
        .select({ count: dbCount() })
        .from(fleetEvents)
        .where(and(eq(fleetEvents.userId, userId), eq(fleetEvents.status, 'active')));
      return { current: Number(current), max };
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

    async listInboundFleets(userId: string) {
      const config = await gameConfigService.getFullConfig();

      // Get user's planet IDs
      const userPlanets = await db
        .select({ id: planets.id })
        .from(planets)
        .where(eq(planets.userId, userId));

      if (userPlanets.length === 0) return [];
      const planetIds = userPlanets.map((p) => p.id);

      const inboundSelect = {
        id: fleetEvents.id,
        userId: fleetEvents.userId,
        originPlanetId: fleetEvents.originPlanetId,
        targetGalaxy: fleetEvents.targetGalaxy,
        targetSystem: fleetEvents.targetSystem,
        targetPosition: fleetEvents.targetPosition,
        mission: fleetEvents.mission,
        phase: fleetEvents.phase,
        departureTime: fleetEvents.departureTime,
        arrivalTime: fleetEvents.arrivalTime,
        mineraiCargo: fleetEvents.mineraiCargo,
        siliciumCargo: fleetEvents.siliciumCargo,
        hydrogeneCargo: fleetEvents.hydrogeneCargo,
        ships: fleetEvents.ships,
        detectionScore: fleetEvents.detectionScore,
        senderUsername: users.username,
        allianceTag: alliances.tag,
        originPlanetName: sql<string>`(SELECT name FROM planets WHERE id = ${fleetEvents.originPlanetId})`.as('origin_planet_name'),
        originGalaxy: sql<number>`(SELECT galaxy FROM planets WHERE id = ${fleetEvents.originPlanetId})`.as('origin_galaxy'),
        originSystem: sql<number>`(SELECT system FROM planets WHERE id = ${fleetEvents.originPlanetId})`.as('origin_system'),
        originPosition: sql<number>`(SELECT position FROM planets WHERE id = ${fleetEvents.originPlanetId})`.as('origin_position'),
      };

      const baseJoin = () =>
        db
          .select(inboundSelect)
          .from(fleetEvents)
          .innerJoin(users, eq(users.id, fleetEvents.userId))
          .leftJoin(allianceMembers, eq(allianceMembers.userId, fleetEvents.userId))
          .leftJoin(alliances, eq(alliances.id, allianceMembers.allianceId));

      // Get non-dangerous mission types from config
      const peacefulMissions = Object.entries(config.missions)
        .filter(([, m]) => !m.dangerous)
        .map(([id]) => id);

      // Get dangerous mission types
      const dangerousMissions = Object.entries(config.missions)
        .filter(([, m]) => m.dangerous)
        .map(([id]) => id);

      // Query inbound peaceful fleets
      const peacefulFleets = peacefulMissions.length > 0
        ? await baseJoin().where(
            and(
              inArray(fleetEvents.targetPlanetId, planetIds),
              eq(fleetEvents.status, 'active'),
              ne(fleetEvents.userId, userId),
              sql`${fleetEvents.mission}::text IN (${sql.join(peacefulMissions.map((m) => sql`${m}`), sql`, `)})`,
            ),
          )
        : [];

      // Query detected hostile fleets
      const hostileRaw = dangerousMissions.length > 0
        ? await baseJoin().where(
            and(
              inArray(fleetEvents.targetPlanetId, planetIds),
              eq(fleetEvents.status, 'active'),
              ne(fleetEvents.userId, userId),
              sql`${fleetEvents.detectedAt} IS NOT NULL`,
              sql`${fleetEvents.mission}::text IN (${sql.join(dangerousMissions.map((m) => sql`${m}`), sql`, `)})`,
            ),
          )
        : [];

      // Apply visibility masking on hostile fleets based on detection tier
      const scoreThresholds: number[] = JSON.parse(String(config.universe.attack_detection_score_thresholds ?? '[0,1,3,5,7]'));

      const hostileFleets = hostileRaw.map((f) => {
        let tier = 0;
        const score = f.detectionScore ?? 0;
        for (let i = scoreThresholds.length - 1; i >= 0; i--) {
          if (score >= scoreThresholds[i]) { tier = i; break; }
        }

        const ships = f.ships as Record<string, number>;
        const totalShips = Object.values(ships).reduce((sum, n) => sum + n, 0);

        return {
          id: f.id,
          userId: f.userId,
          originPlanetId: f.originPlanetId,
          targetGalaxy: f.targetGalaxy,
          targetSystem: f.targetSystem,
          targetPosition: f.targetPosition,
          mission: f.mission,
          phase: f.phase,
          departureTime: f.departureTime,
          arrivalTime: f.arrivalTime,
          mineraiCargo: '0' as string,
          siliciumCargo: '0' as string,
          hydrogeneCargo: '0' as string,
          ships: tier >= 3 ? f.ships : {},
          detectionScore: f.detectionScore,
          senderUsername: tier >= 4 ? f.senderUsername : null,
          allianceTag: tier >= 4 ? f.allianceTag : null,
          originPlanetName: tier >= 1 ? f.originPlanetName : null,
          originGalaxy: tier >= 1 ? f.originGalaxy : 0,
          originSystem: tier >= 1 ? f.originSystem : 0,
          originPosition: tier >= 1 ? f.originPosition : 0,
          hostile: true as const,
          detectionTier: tier,
          shipCount: tier >= 2 ? totalShips : null as number | null,
        };
      });

      return [
        ...peacefulFleets.map((f) => ({
          ...f,
          hostile: false as const,
          detectionTier: null as number | null,
          shipCount: null as number | null,
        })),
        ...hostileFleets,
      ];
    },

    async processDetection(fleetEventId: string, defenderId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active'), eq(fleetEvents.phase, 'outbound')))
        .limit(1);

      if (!event) return null;

      // Mark as detected
      await db
        .update(fleetEvents)
        .set({ detectedAt: new Date() })
        .where(eq(fleetEvents.id, fleetEventId));

      // Calculate tier for notification content
      const config = await gameConfigService.getFullConfig();
      const scoreThresholds: number[] = JSON.parse(String(config.universe.attack_detection_score_thresholds ?? '[0,1,3,5,7]'));

      let tier = 0;
      const score = event.detectionScore ?? 0;
      for (let i = scoreThresholds.length - 1; i >= 0; i--) {
        if (score >= scoreThresholds[i]) { tier = i; break; }
      }

      // Build notification payload — only include fields the defender can see
      const payload: Record<string, unknown> = {
        tier,
        arrivalTime: event.arrivalTime.toISOString(),
        targetCoords: `${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}`,
        mission: event.mission,
        missionLabel: config.missions[event.mission]?.label ?? event.mission,
      };

      if (tier >= 1) {
        const [originPlanet] = await db
          .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
          .from(planets)
          .where(eq(planets.id, event.originPlanetId))
          .limit(1);
        if (originPlanet) {
          payload.originCoords = `${originPlanet.galaxy}:${originPlanet.system}:${originPlanet.position}`;
        }
      }

      if (tier >= 2) {
        const ships = event.ships as Record<string, number>;
        payload.shipCount = Object.values(ships).reduce((sum, n) => sum + n, 0);
      }

      if (tier >= 4) {
        const [attacker] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, event.userId))
          .limit(1);
        payload.attackerName = attacker?.username ?? null;
      }

      publishNotification(redis, defenderId, {
        type: 'fleet-hostile-inbound',
        payload,
      });

      return { detected: true };
    },

    async processArrival(fleetEventId: string): Promise<FleetCompletionResult> {
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
          await fleetQueue.add(
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

        return {
          userId: event.userId,
          planetId: event.originPlanetId,
          mission: event.mission,
          eventType: 'fleet-arrived',
          notificationPayload: {
            mission: event.mission,
            originName: eventMeta.originName,
            targetCoords: eventMeta.targetCoords,
            reportId: result.reportId,
          },
          eventPayload: {
            mission: event.mission,
            originName: eventMeta.originName,
            targetCoords: eventMeta.targetCoords,
            ships,
            cargo: {
              minerai: Number(event.mineraiCargo),
              silicium: Number(event.siliciumCargo),
              hydrogene: Number(event.hydrogeneCargo),
            },
            reportId: result.reportId,
          },
        };
      }

      // Unknown mission — return fleet
      await this.scheduleReturn(
        event.id, event.originPlanetId,
        { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
        ships, mineraiCargo, siliciumCargo, hydrogeneCargo,
      );

      return {
        userId: event.userId,
        planetId: event.originPlanetId,
        mission: event.mission,
        eventType: 'fleet-arrived',
        notificationPayload: {
          mission: event.mission,
          originName: eventMeta.originName,
          targetCoords: eventMeta.targetCoords,
        },
        eventPayload: {
          mission: event.mission,
          originName: eventMeta.originName,
          targetCoords: eventMeta.targetCoords,
          ships,
          cargo: {
            minerai: mineraiCargo,
            silicium: siliciumCargo,
            hydrogene: hydrogeneCargo,
          },
        },
      };
    },

    async processProspectDone(fleetEventId: string): Promise<FleetCompletionResult> {
      await this.processPhaseDispatch(fleetEventId, 'prospect-done', 'prospecting');
      return null;
    },

    async processMineDone(fleetEventId: string): Promise<FleetCompletionResult> {
      await this.processPhaseDispatch(fleetEventId, 'mine-done', 'mining');
      return null;
    },

    async processPhaseDispatch(fleetEventId: string, phaseName: string, expectedPhase: 'outbound' | 'prospecting' | 'mining' | 'return') {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active'), eq(fleetEvents.phase, expectedPhase)))
        .limit(1);

      if (!event) return { skipped: true };

      const handler = handlers[event.mission];
      if (!handler || !('processPhase' in handler)) {
        return { skipped: true, reason: 'no_phased_handler' };
      }

      const ships = event.ships as Record<string, number>;
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

      const result = await (handler as PhasedMissionHandler).processPhase(phaseName, handlerEvent, handlerCtx);

      if (result.scheduleNextPhase) {
        await fleetQueue.add(
          result.scheduleNextPhase.jobName,
          { fleetEventId: event.id },
          { delay: result.scheduleNextPhase.delayMs, jobId: `fleet-${result.scheduleNextPhase.jobName}-${event.id}` },
        );
      }

      // Store reportId in metadata for retrieval during processReturn
      if (result.reportId) {
        const existingMeta = (event.metadata ?? {}) as Record<string, unknown>;
        await db.update(fleetEvents).set({
          metadata: { ...existingMeta, reportId: result.reportId },
        }).where(eq(fleetEvents.id, event.id));
      }

      if (result.scheduleReturn) {
        const cargo = result.cargo ?? { minerai: 0, silicium: 0, hydrogene: 0 };
        await this.scheduleReturn(
          event.id, event.originPlanetId,
          { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
          ships, cargo.minerai, cargo.silicium, cargo.hydrogene,
        );
      }

      return { fleetEventId, phase: phaseName };
    },

    async processReturn(fleetEventId: string): Promise<FleetCompletionResult> {
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
      const meta = event.metadata as { bonusShips?: Record<string, number>; reportId?: string } | null;
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

      const reportId = meta?.reportId;

      return {
        userId: event.userId,
        planetId: event.originPlanetId,
        mission: event.mission,
        eventType: 'fleet-returned',
        notificationPayload: {
          mission: event.mission,
          originName: originPlanet?.name ?? 'Planète',
          targetCoords: `${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}`,
          reportId,
        },
        eventPayload: {
          mission: event.mission,
          originName: originPlanet?.name ?? 'Planète',
          targetCoords: `${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}`,
          ships,
          cargo: {
            minerai: Number(event.mineraiCargo),
            silicium: Number(event.siliciumCargo),
            hydrogene: Number(event.hydrogeneCargo),
          },
          reportId,
        },
        extraEvents: (event.mission === 'mine' || event.mission === 'pirate') ? [{
          type: 'pve-mission-done',
          payload: {
            missionType: event.mission,
            targetCoords: `${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}`,
            originName: originPlanet?.name ?? 'Planète',
            cargo: {
              minerai: Number(event.mineraiCargo),
              silicium: Number(event.siliciumCargo),
              hydrogene: Number(event.hydrogeneCargo),
            },
            reportId,
          },
        }] : undefined,
        tutorialChecks: [
          { type: 'fleet_return', targetId: event.mission, targetValue: 1 },
          ...(event.mission === 'mine' ? [{ type: 'mission_complete' as const, targetId: 'mine', targetValue: 1 }] : []),
        ],
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
      const fleetConfig = buildFleetConfig(config);
      const shipStatsMap = buildShipStatsMap(config);
      const [event] = await db.select().from(fleetEvents).where(eq(fleetEvents.id, fleetEventId)).limit(1);
      const researchLevels = event ? await this.getResearchLevels(event.userId) : {};
      const speedMultipliers = this.buildSpeedMultipliers(ships, shipStatsMap, researchLevels, config.bonuses);
      const speed = fleetSpeed(ships, shipStatsMap, speedMultipliers);
      const universeSpeed = Number(config.universe.speed) || 1;
      const origin = { galaxy: originPlanet.galaxy, system: originPlanet.system, position: originPlanet.position };
      const duration = travelTime(targetCoords, origin, speed, universeSpeed, fleetConfig);

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

      await fleetQueue.add(
        'return',
        { fleetEventId },
        { delay: duration * 1000, jobId: `fleet-return-${fleetEventId}` },
      );
    },

    async getResearchLevels(userId: string): Promise<Record<string, number>> {
      const [research] = await db
        .select()
        .from(userResearch)
        .where(eq(userResearch.userId, userId))
        .limit(1);
      if (!research) return {};
      const levels: Record<string, number> = {};
      for (const [key, value] of Object.entries(research)) {
        if (key !== 'userId' && typeof value === 'number') {
          levels[key] = value;
        }
      }
      return levels;
    },

    buildSpeedMultipliers(
      ships: Record<string, number>,
      shipStatsMap: Record<string, ShipStats>,
      researchLevels: Record<string, number>,
      bonusDefs: BonusDefinition[],
    ): Record<string, number> {
      const multipliers: Record<string, number> = {};
      for (const shipId of Object.keys(ships)) {
        const stats = shipStatsMap[shipId];
        if (stats) {
          multipliers[shipId] = resolveBonus('ship_speed', stats.driveType, researchLevels, bonusDefs);
        }
      }
      return multipliers;
    },

    async getOrCreateShips(planetId: string) {
      const [existing] = await db.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
      if (existing) return existing;
      const [created] = await db.insert(planetShips).values({ planetId }).returning();
      return created;
    },

    async estimateFleet(userId: string, input: { originPlanetId: string; targetGalaxy: number; targetSystem: number; targetPosition: number; ships: Record<string, number> }) {
      const planet = await this.getOwnedPlanet(userId, input.originPlanetId);
      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      const researchLevels = await this.getResearchLevels(userId);
      const speedMultipliers = this.buildSpeedMultipliers(input.ships, shipStatsMap, researchLevels, config.bonuses);
      const speed = fleetSpeed(input.ships, shipStatsMap, speedMultipliers);
      if (speed === 0) return { fuel: 0, duration: 0 };

      const fleetConfig = buildFleetConfig(config);
      const universeSpeed = Number(config.universe.speed) || 1;
      const origin = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      const target = { galaxy: input.targetGalaxy, system: input.targetSystem, position: input.targetPosition };
      const dist = distance(origin, target, fleetConfig);
      const dur = travelTime(origin, target, speed, universeSpeed, fleetConfig);
      const fuel = fuelConsumption(input.ships, dist, dur, shipStatsMap, { speedFactor: fleetConfig.speedFactor });

      return { fuel, duration: dur };
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
