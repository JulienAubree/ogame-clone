import { eq, and, inArray, count as dbCount, sql, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, fleetEvents, userResearch, pveMissions, users, allianceMembers, alliances, marketOffers } from '@exilium/db';
import type { Database } from '@exilium/db';
import { fleetSpeed, travelTime, distance, fuelConsumption, totalCargoCapacity, resolveBonus, calculateAttackDetection, detectionDelay } from '@exilium/game-engine';
import type { BonusDefinition, ShipStats, FleetConfig } from '@exilium/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { createMessageService } from '../message/message.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { Queue } from 'bullmq';
import type { createPveService } from '../pve/pve.service.js';
import type { createAsteroidBeltService } from '../pve/asteroid-belt.service.js';
import type { createPirateService } from '../pve/pirate.service.js';
import type { createReportService } from '../report/report.service.js';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { createDailyQuestService } from '../daily-quest/daily-quest.service.js';
import type { createFlagshipService } from '../flagship/flagship.service.js';
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
import { TradeHandler } from './handlers/trade.handler.js';
import { ScanHandler } from './handlers/scan.handler.js';
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
  exiliumService?: ReturnType<typeof createExiliumService>,
  dailyQuestService?: ReturnType<typeof createDailyQuestService>,
  flagshipService?: ReturnType<typeof createFlagshipService>,
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
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
    trade: new TradeHandler(),
    scan: new ScanHandler(),
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
    exiliumService,
    dailyQuestService,
    flagshipService,
    talentService,
    fleetQueue,
    assetsDir: env.ASSETS_DIR,
    redis,
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
          message: `Nombre maximum de flottes atteint (${maxFleets}). Améliorez la Technologie Ordinateur pour envoyer plus de flottes.`,
        });
      }

      // Block self-targeting for hostile missions
      if (input.mission === 'spy' || input.mission === 'attack') {
        // Check if target belongs to the same user
        const [targetPl] = await db
          .select({ userId: planets.userId })
          .from(planets)
          .where(
            and(
              eq(planets.galaxy, input.targetGalaxy),
              eq(planets.system, input.targetSystem),
              eq(planets.position, input.targetPosition),
            ),
          )
          .limit(1);
        if (targetPl?.userId === userId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: input.mission === 'spy'
              ? 'Impossible d\'espionner votre propre planète'
              : 'Impossible d\'attaquer votre propre planète',
          });
        }
      }

      // Validate ships are available
      const planetShipRow = await this.getOrCreateShips(input.originPlanetId);
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count <= 0) continue;
        if (shipId === 'flagship') continue; // Validated separately below
        const available = (planetShipRow[shipId as keyof typeof planetShipRow] ?? 0) as number;
        if (available < count) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Pas assez de ${shipId} (disponible: ${available}, demandé: ${count})`,
          });
        }
      }

      // Validate flagship if included in fleet
      let hasFlagship = false;
      if (input.ships['flagship'] && input.ships['flagship'] > 0) {
        hasFlagship = true;
        if (!flagshipService) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Service flagship non disponible' });
        }
        const flagship = await flagshipService.get(userId);
        if (!flagship) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous n\'avez pas de vaisseau amiral' });
        }
        if (flagship.status !== 'active') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Votre vaisseau amiral n\'est pas disponible (statut: ' + flagship.status + ')' });
        }
        if (flagship.planetId !== input.originPlanetId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Votre vaisseau amiral n\'est pas sur cette planete' });
        }
        // Hull-restricted missions: flagship can only mine/recycle with industrial hull
        if ((input.mission === 'mine' || input.mission === 'recycle') && flagship.hullId !== 'industrial') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Seule la coque industrielle permet au vaisseau amiral de participer aux missions de minage et recyclage',
          });
        }
        // Inject flagship stats into shipStatsMap for speed/fuel/cargo calculations
        shipStatsMap['flagship'] = {
          baseSpeed: flagship.baseSpeed,
          fuelConsumption: flagship.fuelConsumption,
          cargoCapacity: flagship.cargoCapacity,
          driveType: flagship.driveType as ShipStats['driveType'],
          miningExtraction: 0,
        };
      }

      // Fetch talent context for fleet bonuses
      const talentCtx = talentService ? await talentService.computeTalentContext(userId) : {};

      const baseSpeedMultipliers = this.buildSpeedMultipliers(input.ships, shipStatsMap, researchLevels, config.bonuses);
      const talentSpeedFactor = 1 + (talentCtx['fleet_speed'] ?? 0);
      const speedMultipliers: Record<string, number> = {};
      for (const [k, v] of Object.entries(baseSpeedMultipliers)) {
        speedMultipliers[k] = v * talentSpeedFactor;
      }
      const speed = fleetSpeed(input.ships, shipStatsMap, speedMultipliers);
      if (speed === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun vaisseau sélectionné' });
      }

      const fleetConfig = buildFleetConfig(config);
      const origin = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      const target = { galaxy: input.targetGalaxy, system: input.targetSystem, position: input.targetPosition };
      const blockedSelfTargetMissions = ['spy', 'attack'];
      if (origin.galaxy === target.galaxy && origin.system === target.system && origin.position === target.position && blockedSelfTargetMissions.includes(input.mission)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La destination doit être différente du point de départ' });
      }
      const dist = distance(origin, target, fleetConfig);
      const universeSpeed = Number(config.universe.speed) || 1;
      const duration = travelTime(origin, target, speed, universeSpeed, fleetConfig);
      const fuel = fuelConsumption(input.ships, dist, duration, shipStatsMap, { speedFactor: fleetConfig.speedFactor }) / (1 + (talentCtx['fleet_fuel'] ?? 0));

      // Validate cargo doesn't exceed capacity
      const cargo = totalCargoCapacity(input.ships, shipStatsMap) * (1 + (talentCtx['fleet_cargo'] ?? 0));
      const mineraiCargo = input.mineraiCargo ?? 0;
      const siliciumCargo = input.siliciumCargo ?? 0;
      const hydrogeneCargo = input.hydrogeneCargo ?? 0;
      const totalCargo = mineraiCargo + siliciumCargo + hydrogeneCargo;
      if (totalCargo > cargo) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Capacité de fret dépassée' });
      }

      // Handler-based validation (trade handler reserves the offer atomically)
      const sendHandler = handlers[input.mission];
      if (sendHandler) {
        await sendHandler.validateFleet({ ...input, userId }, config, handlerCtx);
      }

      // Everything after this point must rollback the trade reservation on failure
      try {
      // Find target planet (may not exist for colonization or PvE missions)
      let targetPlanet: typeof planets.$inferSelect | undefined;
      if (input.mission !== 'mine' && input.mission !== 'pirate' && input.mission !== 'recycle') {
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

      // Deduct ships from planet (skip flagship — managed via flagshipService)
      const shipUpdates: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count > 0 && shipId !== 'flagship') {
          const current = (planetShipRow[shipId as keyof typeof planetShipRow] ?? 0) as number;
          shipUpdates[shipId] = current - count;
        }
      }
      if (Object.keys(shipUpdates).length > 0) {
        await db
          .update(planetShips)
          .set(shipUpdates)
          .where(eq(planetShips.planetId, input.originPlanetId));
      }

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
          targetPriority: input.targetPriority ?? null,
          pveMissionId: input.pveMissionId ?? null,
          tradeId: input.tradeId ?? null,
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

      // Link trade fleet to offer
      if (input.tradeId) {
        await db
          .update(marketOffers)
          .set({ fleetEventId: event.id })
          .where(eq(marketOffers.id, input.tradeId));
      }

      // Schedule arrival job
      await fleetQueue.add(
        'arrive',
        { fleetEventId: event.id },
        { delay: duration * 1000, jobId: `fleet-arrive-${event.id}` },
      );

      // Set flagship in mission if included (scan: flagship stays home, only virtual probe travels)
      if (hasFlagship && flagshipService && input.mission !== 'scan') {
        await flagshipService.setInMission(userId);
      }

      // Hook: daily quest detection for fleet dispatch
      if (dailyQuestService) {
        await dailyQuestService.processEvent({
          type: 'fleet:dispatched',
          userId,
          payload: { missionType: input.mission },
        }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
      }

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
      } catch (err) {
        // Rollback trade reservation if anything failed after validateFleet
        if (input.tradeId) {
          await db
            .update(marketOffers)
            .set({ status: 'active', reservedBy: null, reservedAt: null, fleetEventId: null })
            .where(and(eq(marketOffers.id, input.tradeId), eq(marketOffers.status, 'reserved')));
        }
        throw err;
      }
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

      if (event.mission === 'trade') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Les flottes de commerce ne peuvent pas être rappelées' });
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
        targetPlanetId: fleetEvents.targetPlanetId,
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
        targetPlanetName: sql<string>`(SELECT name FROM planets WHERE id = ${fleetEvents.targetPlanetId})`.as('target_planet_name'),
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

      // Get dangerous mission types (exclude spy — espionage stays invisible in inbound list)
      const dangerousMissions = Object.entries(config.missions)
        .filter(([id, m]) => m.dangerous && id !== 'spy')
        .map(([id]) => id);

      // Query inbound peaceful fleets (outbound only — not returning)
      const peacefulFleets = peacefulMissions.length > 0
        ? await baseJoin().where(
            and(
              inArray(fleetEvents.targetPlanetId, planetIds),
              eq(fleetEvents.status, 'active'),
              eq(fleetEvents.phase, 'outbound'),
              ne(fleetEvents.userId, userId),
              sql`${fleetEvents.mission}::text IN (${sql.join(peacefulMissions.map((m) => sql`${m}`), sql`, `)})`,
            ),
          )
        : [];

      // Query detected hostile fleets (outbound only — not returning)
      const hostileRaw = dangerousMissions.length > 0
        ? await baseJoin().where(
            and(
              inArray(fleetEvents.targetPlanetId, planetIds),
              eq(fleetEvents.status, 'active'),
              eq(fleetEvents.phase, 'outbound'),
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
          targetPlanetId: f.targetPlanetId,
          targetPlanetName: f.targetPlanetName,
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
          targetPriority: event.targetPriority,
          pveMissionId: event.pveMissionId,
          tradeId: event.tradeId,
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
          // Flagship stays on target planet for no-return missions (station, colonize)
          // But NOT if it was destroyed in combat (shipsAfterArrival would exclude it)
          const survivingShips = result.shipsAfterArrival ?? ships;
          if (survivingShips['flagship'] && survivingShips['flagship'] > 0 && flagshipService && event.targetPlanetId) {
            await flagshipService.returnFromMission(event.userId, event.targetPlanetId);
          }
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

        // Notify defender for dangerous missions so their inbound list refreshes
        const config = await gameConfigService.getFullConfig();
        const missionDef = config.missions[event.mission];
        const notifyUsers: Array<{ userId: string; type: string; payload: Record<string, unknown> }> = [];
        if (missionDef?.dangerous && event.targetPlanetId) {
          const [targetPlanet] = await db
            .select({ userId: planets.userId })
            .from(planets)
            .where(eq(planets.id, event.targetPlanetId))
            .limit(1);
          if (targetPlanet && targetPlanet.userId !== event.userId) {
            notifyUsers.push({
              userId: targetPlanet.userId,
              type: 'fleet-attack-landed',
              payload: {
                targetCoords: eventMeta.targetCoords,
                reportId: result.defenderReportId ?? result.reportId,
                attackerUsername: result.attackerUsername,
                outcome: result.defenderOutcomeText,
              },
            });
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
          notifyUsers,
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
        targetPriority: event.targetPriority,
        pveMissionId: event.pveMissionId,
        tradeId: event.tradeId,
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

      // Return flagship from mission if present
      console.log(`[processReturn] fleetEventId=${fleetEventId}, ships=`, JSON.stringify(ships));
      if (ships['flagship'] && ships['flagship'] > 0 && flagshipService) {
        console.log(`[processReturn] calling returnFromMission for userId=${event.userId}, originPlanetId=${event.originPlanetId}`);
        await flagshipService.returnFromMission(event.userId, event.originPlanetId);
      }

      // Merge returning ships + PvE bonus ships into a single atomic update
      const meta = event.metadata as { bonusShips?: Record<string, number>; reportId?: string } | null;
      const originShips = await this.getOrCreateShips(event.originPlanetId);
      const shipUpdates: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(ships)) {
        if (count > 0 && shipId !== 'flagship') {
          const current = (originShips[shipId as keyof typeof originShips] ?? 0) as number;
          shipUpdates[shipId] = current + count;
        }
      }
      if (meta?.bonusShips) {
        for (const [shipId, count] of Object.entries(meta.bonusShips)) {
          shipUpdates[shipId] = (shipUpdates[shipId] ?? (originShips[shipId as keyof typeof originShips] ?? 0) as number) + count;
        }
      }
      if (Object.keys(shipUpdates).length > 0) {
        await db
          .update(planetShips)
          .set(shipUpdates)
          .where(eq(planetShips.planetId, event.originPlanetId));
      }

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

        // Hook: daily quest — comptabiliser les ressources rapportees par la flotte
        if (dailyQuestService) {
          const totalCollected = mineraiCargo + siliciumCargo + hydrogeneCargo;
          await dailyQuestService.processEvent({
            type: 'resources:collected',
            userId: event.userId,
            payload: { totalCollected },
          }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
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
          ...(event.mission === 'pirate' ? [{ type: 'mission_complete' as const, targetId: 'pirate', targetValue: 1 }] : []),
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

      // Inject flagship stats if flagship is in returning fleet
      if (ships['flagship'] && ships['flagship'] > 0 && flagshipService && event) {
        const flagship = await flagshipService.get(event.userId);
        if (flagship) {
          shipStatsMap['flagship'] = {
            baseSpeed: flagship.baseSpeed,
            fuelConsumption: flagship.fuelConsumption,
            cargoCapacity: flagship.cargoCapacity,
            driveType: flagship.driveType as ShipStats['driveType'],
            miningExtraction: 0,
          };
        }
      }

      const researchLevels = event ? await this.getResearchLevels(event.userId) : {};
      const returnTalentCtx = (event && talentService) ? await talentService.computeTalentContext(event.userId) : {};
      const baseReturnSpeedMult = this.buildSpeedMultipliers(ships, shipStatsMap, researchLevels, config.bonuses);
      const returnTalentSpeedFactor = 1 + (returnTalentCtx['fleet_speed'] ?? 0);
      const speedMultipliers: Record<string, number> = {};
      for (const [k, v] of Object.entries(baseReturnSpeedMult)) {
        speedMultipliers[k] = v * returnTalentSpeedFactor;
      }
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

      // Inject flagship stats if present in estimate
      if (input.ships['flagship'] && input.ships['flagship'] > 0 && flagshipService) {
        const flagship = await flagshipService.get(userId);
        if (flagship) {
          shipStatsMap['flagship'] = {
            baseSpeed: flagship.baseSpeed,
            fuelConsumption: flagship.fuelConsumption,
            cargoCapacity: flagship.cargoCapacity,
            driveType: flagship.driveType as ShipStats['driveType'],
            miningExtraction: 0,
          };
        }
      }

      const researchLevels = await this.getResearchLevels(userId);
      const estTalentCtx = talentService ? await talentService.computeTalentContext(userId) : {};
      const baseEstSpeedMult = this.buildSpeedMultipliers(input.ships, shipStatsMap, researchLevels, config.bonuses);
      const estTalentSpeedFactor = 1 + (estTalentCtx['fleet_speed'] ?? 0);
      const estSpeedMultipliers: Record<string, number> = {};
      for (const [k, v] of Object.entries(baseEstSpeedMult)) {
        estSpeedMultipliers[k] = v * estTalentSpeedFactor;
      }
      const speed = fleetSpeed(input.ships, shipStatsMap, estSpeedMultipliers);
      if (speed === 0) return { fuel: 0, duration: 0 };

      const fleetConfig = buildFleetConfig(config);
      const universeSpeed = Number(config.universe.speed) || 1;
      const origin = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      const target = { galaxy: input.targetGalaxy, system: input.targetSystem, position: input.targetPosition };
      const dist = distance(origin, target, fleetConfig);
      const dur = travelTime(origin, target, speed, universeSpeed, fleetConfig);
      const fuel = fuelConsumption(input.ships, dist, dur, shipStatsMap, { speedFactor: fleetConfig.speedFactor }) / (1 + (estTalentCtx['fleet_fuel'] ?? 0));

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
