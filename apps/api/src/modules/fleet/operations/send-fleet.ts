import { eq, and, count as dbCount, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, fleetEvents, userResearch, pveMissions, users, marketOffers } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  fleetSpeed,
  travelTime,
  distance,
  fuelConsumption,
  totalCargoCapacity,
  resolveBonus,
  calculateAttackDetection,
  detectionDelay,
} from '@exilium/game-engine';
import type { ShipStats } from '@exilium/game-engine';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { buildFleetConfig, buildSpeedMultipliers } from '../fleet.helpers.js';
import { buildShipStatsMap } from '../fleet.types.js';
import { publishNotification } from '../../notification/notification.publisher.js';
import type { GameConfigService } from '../../admin/game-config.service.js';
import type { createResourceService } from '../../resource/resource.service.js';
import type { createPveService } from '../../pve/pve.service.js';
import type { createFlagshipService } from '../../flagship/flagship.service.js';
import type { createDailyQuestService } from '../../daily-quest/daily-quest.service.js';
import type { MissionHandler, MissionHandlerContext, SendFleetInput } from '../fleet.types.js';

export interface SendFleetDeps {
  db: Database;
  gameConfigService: GameConfigService;
  resourceService: ReturnType<typeof createResourceService>;
  fleetQueue: Queue;
  redis: Redis;
  pveService?: ReturnType<typeof createPveService>;
  flagshipService?: ReturnType<typeof createFlagshipService>;
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> };
  dailyQuestService?: ReturnType<typeof createDailyQuestService>;
  handlers: Record<string, MissionHandler>;
  handlerCtx: MissionHandlerContext;
  getOwnedPlanet(userId: string, planetId: string): Promise<typeof planets.$inferSelect>;
  getResearchLevels(userId: string): Promise<Record<string, number>>;
  getOrCreateShips(planetId: string): Promise<typeof planetShips.$inferSelect>;
}

export function createSendFleet(deps: SendFleetDeps) {
  const {
    db,
    gameConfigService,
    resourceService,
    fleetQueue,
    redis,
    pveService,
    flagshipService,
    talentService,
    dailyQuestService,
    handlers,
    handlerCtx,
    getOwnedPlanet,
    getResearchLevels,
    getOrCreateShips,
  } = deps;

  return async function sendFleet(userId: string, input: SendFleetInput) {
    const planet = await getOwnedPlanet(userId, input.originPlanetId);
    const config = await gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);

    // Get research levels (used for fleet limit + speed calculation)
    const researchLevels = await getResearchLevels(userId);

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
    const planetShipRow = await getOrCreateShips(input.originPlanetId);
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
      // Hull-restricted missions: check abilities from config
      const flagshipHullConfig = flagship.hullId ? config.hulls[flagship.hullId] : null;
      const hullAbilities = (flagshipHullConfig?.abilities ?? []) as Array<{ id: string; type: string; unlockedMissions?: string[]; miningExtractionEqualsCargo?: boolean }>;
      const unlockedMissions = hullAbilities.filter((a) => a.type === 'fleet_unlock').flatMap((a) => a.unlockedMissions ?? []);
      const allUnlockableMissions = new Set(
        Object.values(config.hulls).flatMap((h) => (h.abilities ?? []).filter((a) => a.type === 'fleet_unlock').flatMap((a) => a.unlockedMissions ?? [])),
      );
      const missionNeedsUnlock = allUnlockableMissions.has(input.mission);
      if (missionNeedsUnlock && !unlockedMissions.includes(input.mission)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `La coque de votre vaisseau amiral ne permet pas les missions de ${input.mission}`,
        });
      }
      // Inject flagship stats into shipStatsMap for speed/fuel/cargo calculations
      const efs = 'effectiveStats' in flagship ? flagship.effectiveStats : null;
      const effectiveCargo = efs?.cargoCapacity ?? flagship.cargoCapacity;
      const hasMiningExtraction = hullAbilities.some((a) => a.miningExtractionEqualsCargo);
      shipStatsMap['flagship'] = {
        baseSpeed: efs?.baseSpeed ?? flagship.baseSpeed,
        fuelConsumption: efs?.fuelConsumption ?? flagship.fuelConsumption,
        cargoCapacity: effectiveCargo,
        driveType: (efs?.driveType ?? flagship.driveType) as ShipStats['driveType'],
        miningExtraction: hasMiningExtraction ? effectiveCargo : 0,
      };
    }

    // Fetch talent context for fleet bonuses
    const talentCtx = talentService ? await talentService.computeTalentContext(userId) : {};

    const baseSpeedMultipliers = buildSpeedMultipliers(input.ships, shipStatsMap, researchLevels, config.bonuses);
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
    if (
      origin.galaxy === target.galaxy
      && origin.system === target.system
      && origin.position === target.position
      && blockedSelfTargetMissions.includes(input.mission)
    ) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La destination doit être différente du point de départ' });
    }
    const dist = distance(origin, target, fleetConfig);
    const universeSpeed = Number(config.universe.speed) || 1;
    const duration = travelTime(origin, target, speed, universeSpeed, fleetConfig);
    const fuel = fuelConsumption(input.ships, dist, duration, shipStatsMap, { speedFactor: fleetConfig.speedFactor })
      / (1 + (talentCtx['fleet_fuel'] ?? 0));

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

      // Deduct ships from planet (atomic decrement — safe under concurrent sends)
      const shipUpdates: Record<string, any> = {};
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count > 0 && shipId !== 'flagship') {
          const col = planetShips[shipId as keyof typeof planetShips];
          shipUpdates[shipId] = sql`GREATEST(${col} - ${count}, 0)`;
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
          mission: input.mission as typeof fleetEvents.$inferInsert.mission,
          phase: 'outbound',
          status: 'active',
          departureTime: now,
          arrivalTime,
          mineraiCargo: String(mineraiCargo),
          siliciumCargo: String(siliciumCargo),
          hydrogeneCargo: String(hydrogeneCargo),
          ships: input.ships,
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

        const { scoreThresholds, timingPercents } = config.attackDetection;

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
  };
}
