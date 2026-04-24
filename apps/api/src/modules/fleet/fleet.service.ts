import { eq, and, inArray, count as dbCount, sql, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, fleetEvents, userResearch, pveMissions, users, allianceMembers, alliances, marketOffers, fleetPhaseEnum } from '@exilium/db';
import type { Database } from '@exilium/db';
import { fleetSpeed, travelTime, distance, fuelConsumption, totalCargoCapacity, resolveBonus, calculateAttackDetection, detectionDelay } from '@exilium/game-engine';
import type { ShipStats } from '@exilium/game-engine';
import { buildFleetConfig, buildSpeedMultipliers } from './fleet.helpers.js';
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
import { ExploreHandler } from './handlers/explore.handler.js';
import { ColonizeReinforceHandler } from './handlers/colonize-reinforce.handler.js';
import { ColonizationRaidHandler } from './handlers/colonization-raid.handler.js';
import { AbandonReturnHandler } from './handlers/abandon-return.handler.js';
import { buildShipStatsMap } from './fleet.types.js';
import { createSendFleet } from './operations/send-fleet.js';
import { createListInboundFleets } from './operations/list-inbound.js';
import { createRecallFleet } from './operations/recall-fleet.js';
import { createScheduleReturn } from './operations/schedule-return.js';
import { createFleetQueries } from './operations/fleet-queries.js';
import type { FleetCompletionResult } from '../../workers/completion.types.js';
import { env } from '../../config/env.js';
import type { PhasedMissionHandler, MissionHandler, MissionHandlerContext, SendFleetInput, FleetEvent as HandlerFleetEvent } from './fleet.types.js';
import type { AllianceLogService } from '../alliance/alliance-log.service.js';

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
  gameEventService?: ReturnType<typeof import('../game-event/game-event.service.js').createGameEventService>,
  colonizationService?: ReturnType<typeof import('../colonization/colonization.service.js').createColonizationService>,
  allianceLogService?: AllianceLogService,
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
    explore: new ExploreHandler(),
    colonize_reinforce: new ColonizeReinforceHandler(),
    colonization_raid: new ColonizationRaidHandler(),
    abandon_return: new AbandonReturnHandler(),
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
    allianceLogService,
    fleetQueue,
    assetsDir: env.ASSETS_DIR,
    redis,
    gameEventService,
    colonizationService,
  };

  // Closure-scoped helpers (replace the previous `this.X` patterns). Kept
  // here so extracted operations can reference them as plain deps.
  async function getOwnedPlanet(userId: string, planetId: string) {
    const [planet] = await db
      .select()
      .from(planets)
      .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
      .limit(1);
    if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });
    return planet;
  }

  async function getResearchLevels(userId: string): Promise<Record<string, number>> {
    const [research] = await db
      .select()
      .from(userResearch)
      .where(eq(userResearch.userId, userId))
      .limit(1);
    if (!research) return {};
    const levels: Record<string, number> = {};
    for (const [key, value] of Object.entries(research)) {
      if (key !== 'userId' && typeof value === 'number') levels[key] = value;
    }
    return levels;
  }

  async function getOrCreateShips(planetId: string) {
    const [existing] = await db.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
    if (existing) return existing;
    const [created] = await db.insert(planetShips).values({ planetId }).returning();
    return created;
  }

  const sendFleet = createSendFleet({
    db, gameConfigService, resourceService, fleetQueue, redis,
    pveService, flagshipService, talentService, dailyQuestService,
    handlers, handlerCtx,
    getOwnedPlanet, getResearchLevels, getOrCreateShips,
  });

  const listInboundFleets = createListInboundFleets({ db, gameConfigService });
  const recallFleet = createRecallFleet({ db, fleetQueue, pveService });
  const scheduleReturn = createScheduleReturn({
    db, gameConfigService, fleetQueue, flagshipService, talentService, getResearchLevels,
  });
  const { getFleetSlots, listMovements, estimateFleet } = createFleetQueries({
    db, gameConfigService, flagshipService, talentService, getOwnedPlanet, getResearchLevels,
  });

  // Dispatcher for "phased" missions (mine, explore, prospect). Kept as a
  // closure so processProspectDone/MineDone/ExploreDone methods can call it.
  async function processPhaseDispatch(
    fleetEventId: string,
    phaseName: string,
    expectedPhase: typeof fleetPhaseEnum.enumValues[number],
  ) {
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

    if (result.scheduleReturn && event.originPlanetId) {
      const cargo = result.cargo ?? { minerai: 0, silicium: 0, hydrogene: 0 };
      await scheduleReturn(
        event.id, event.originPlanetId,
        { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
        ships, cargo.minerai, cargo.silicium, cargo.hydrogene,
      );
    }

    return { fleetEventId, phase: phaseName };
  }

  return {
    sendFleet,
    listInboundFleets,
    recallFleet,
    scheduleReturn,
    getFleetSlots,
    listMovements,
    estimateFleet,




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

      if (tier >= 1 && event.originPlanetId) {
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

      const [originPlanet] = event.originPlanetId
        ? await db
            .select({ name: planets.name })
            .from(planets)
            .where(eq(planets.id, event.originPlanetId))
            .limit(1)
        : [];

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

        if (result.scheduleReturn && event.originPlanetId) {
          const cargo = result.cargo ?? { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo };
          const returnShips = result.shipsAfterArrival ?? ships;
          await scheduleReturn(
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

          if (insertedEvent && event.originPlanetId) {
            const returnShips = (returnData.ships ?? ships) as Record<string, number>;
            const returnCargo = result.cargo ?? { minerai: 0, silicium: 0, hydrogene: 0 };
            await scheduleReturn(
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

      // Unknown mission — return fleet (only if origin still exists)
      if (event.originPlanetId) {
        await scheduleReturn(
          event.id, event.originPlanetId,
          { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
          ships, mineraiCargo, siliciumCargo, hydrogeneCargo,
        );
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
      await processPhaseDispatch(fleetEventId, 'prospect-done', 'prospecting');
      return null;
    },

    async processMineDone(fleetEventId: string): Promise<FleetCompletionResult> {
      await processPhaseDispatch(fleetEventId, 'mine-done', 'mining');
      return null;
    },

    async processExploreDone(fleetEventId: string): Promise<FleetCompletionResult> {
      await processPhaseDispatch(fleetEventId, 'explore-done', 'exploring');
      return null;
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

      const [originPlanet] = event.originPlanetId
        ? await db
            .select({ name: planets.name })
            .from(planets)
            .where(eq(planets.id, event.originPlanetId))
            .limit(1)
        : [];

      // Return flagship from mission if present (skip if origin planet was deleted)
      if (ships['flagship'] && ships['flagship'] > 0 && flagshipService && event.originPlanetId) {
        await flagshipService.returnFromMission(event.userId, event.originPlanetId);
      }

      // Merge returning ships + PvE bonus ships into a single atomic update
      // Skip ship restoration if origin planet was deleted (abandon_return after colony abandoned)
      const meta = event.metadata as { bonusShips?: Record<string, number>; reportId?: string } | null;
      if (event.originPlanetId) {
        await getOrCreateShips(event.originPlanetId);
        // Compute total increment per ship type, then apply as atomic SQL
        const shipIncrements: Record<string, number> = {};
        for (const [shipId, count] of Object.entries(ships)) {
          if (count > 0 && shipId !== 'flagship') {
            shipIncrements[shipId] = (shipIncrements[shipId] ?? 0) + count;
          }
        }
        if (meta?.bonusShips) {
          for (const [shipId, count] of Object.entries(meta.bonusShips)) {
            shipIncrements[shipId] = (shipIncrements[shipId] ?? 0) + count;
          }
        }
        const shipUpdates: Record<string, any> = {};
        for (const [shipId, total] of Object.entries(shipIncrements)) {
          const col = planetShips[shipId as keyof typeof planetShips];
          shipUpdates[shipId] = sql`${col} + ${total}`;
        }
        if (Object.keys(shipUpdates).length > 0) {
          await db
            .update(planetShips)
            .set(shipUpdates)
            .where(eq(planetShips.planetId, event.originPlanetId));
        }
      }

      const mineraiCargo = Number(event.mineraiCargo);
      const siliciumCargo = Number(event.siliciumCargo);
      const hydrogeneCargo = Number(event.hydrogeneCargo);

      if (event.originPlanetId && (mineraiCargo > 0 || siliciumCargo > 0 || hydrogeneCargo > 0)) {
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


    // Exposed for tests and older callers; internal code uses the closure
    // functions directly.
    getResearchLevels,
    getOrCreateShips,


    getOwnedPlanet,
  };
}
