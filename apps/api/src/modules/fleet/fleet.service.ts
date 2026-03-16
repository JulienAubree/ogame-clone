import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, fleetEvents, userResearch, debrisFields, users } from '@ogame-clone/db';
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
  type CombatTechs,
  type ShipStats,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { createMessageService } from '../message/message.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { Queue } from 'bullmq';

interface SendFleetInput {
  originPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  mission: 'transport' | 'station' | 'spy' | 'attack' | 'colonize' | 'recycle';
  ships: Record<string, number>;
  mineraiCargo?: number;
  siliciumCargo?: number;
  hydrogeneCargo?: number;
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
) {
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

      // Validate: cannot attack own planet
      if (input.mission === 'attack') {
        const [targetCheck] = await db
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
        if (targetCheck && targetCheck.userId === userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous ne pouvez pas attaquer votre propre planète' });
        }
      }

      // Validate: recycle mission requires only recyclers
      if (input.mission === 'recycle') {
        for (const [shipType, count] of Object.entries(input.ships)) {
          if (count > 0 && shipType !== 'recycler') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seuls les recycleurs peuvent être envoyés en mission recyclage' });
          }
        }
      }

      // Find target planet (may not exist for colonization)
      const [targetPlanet] = await db
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
          mission: input.mission,
          phase: 'outbound',
          status: 'active',
          departureTime: now,
          arrivalTime,
          mineraiCargo: String(mineraiCargo),
          siliciumCargo: String(siliciumCargo),
          hydrogeneCargo: String(hydrogeneCargo),
          ships: input.ships,
        })
        .returning();

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
            eq(fleetEvents.phase, 'outbound'),
          ),
        )
        .limit(1);

      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Flotte non trouvée ou non rappelable' });
      }

      const now = new Date();
      const elapsed = now.getTime() - event.departureTime.getTime();
      const returnTime = new Date(now.getTime() + elapsed);

      await fleetArrivalQueue.remove(`fleet-arrive-${event.id}`);

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

      if (event.mission === 'transport') {
        if (event.targetPlanetId) {
          const [targetPlanet] = await db
            .select()
            .from(planets)
            .where(eq(planets.id, event.targetPlanetId))
            .limit(1);

          if (targetPlanet) {
            await db
              .update(planets)
              .set({
                minerai: String(Number(targetPlanet.minerai) + mineraiCargo),
                silicium: String(Number(targetPlanet.silicium) + siliciumCargo),
                hydrogene: String(Number(targetPlanet.hydrogene) + hydrogeneCargo),
              })
              .where(eq(planets.id, event.targetPlanetId));
          }
        }

        await this.scheduleReturn(event.id, event.originPlanetId, {
          galaxy: event.targetGalaxy,
          system: event.targetSystem,
          position: event.targetPosition,
        }, ships, 0, 0, 0);

        return { ...eventMeta, mission: 'transport', delivered: true };
      }

      if (event.mission === 'station') {
        if (event.targetPlanetId) {
          const [targetPlanet] = await db
            .select()
            .from(planets)
            .where(eq(planets.id, event.targetPlanetId))
            .limit(1);

          if (targetPlanet) {
            await db
              .update(planets)
              .set({
                minerai: String(Number(targetPlanet.minerai) + mineraiCargo),
                silicium: String(Number(targetPlanet.silicium) + siliciumCargo),
                hydrogene: String(Number(targetPlanet.hydrogene) + hydrogeneCargo),
              })
              .where(eq(planets.id, event.targetPlanetId));

            const targetShips = await this.getOrCreateShips(event.targetPlanetId);
            const shipUpdates: Record<string, number> = {};
            for (const [shipId, count] of Object.entries(ships)) {
              if (count > 0) {
                const current = (targetShips[shipId as keyof typeof targetShips] ?? 0) as number;
                shipUpdates[shipId] = current + count;
              }
            }
            await db
              .update(planetShips)
              .set(shipUpdates)
              .where(eq(planetShips.planetId, event.targetPlanetId));
          }
        }

        await db
          .update(fleetEvents)
          .set({ status: 'completed' })
          .where(eq(fleetEvents.id, event.id));

        return { ...eventMeta, mission: 'station', stationed: true };
      }

      if (event.mission === 'colonize') {
        return { ...eventMeta, ...(await this.processColonize(event, ships, mineraiCargo, siliciumCargo, hydrogeneCargo)) };
      }

      if (event.mission === 'spy') {
        return { ...eventMeta, ...(await this.processSpy(event, ships)) };
      }

      if (event.mission === 'attack') {
        return { ...eventMeta, ...(await this.processAttack(event, ships, mineraiCargo, siliciumCargo, hydrogeneCargo)) };
      }

      if (event.mission === 'recycle') {
        return { ...eventMeta, ...(await this.processRecycle(event, ships, mineraiCargo, siliciumCargo, hydrogeneCargo)) };
      }

      // Unknown mission — return fleet
      await this.scheduleReturn(
        event.id, event.originPlanetId,
        { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
        ships, mineraiCargo, siliciumCargo, hydrogeneCargo,
      );

      return { ...eventMeta, mission: event.mission, placeholder: true };
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

      const originShips = await this.getOrCreateShips(event.originPlanetId);
      const shipUpdates: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(ships)) {
        if (count > 0) {
          const current = (originShips[shipId as keyof typeof originShips] ?? 0) as number;
          shipUpdates[shipId] = current + count;
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

    async processColonize(
      event: typeof fleetEvents.$inferSelect,
      ships: Record<string, number>,
      mineraiCargo: number,
      siliciumCargo: number,
      hydrogeneCargo: number,
    ) {
      const coords = `[${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}]`;

      // Check if position is free
      const [existing] = await db
        .select()
        .from(planets)
        .where(
          and(
            eq(planets.galaxy, event.targetGalaxy),
            eq(planets.system, event.targetSystem),
            eq(planets.position, event.targetPosition),
          ),
        )
        .limit(1);

      if (existing) {
        if (messageService) {
          await messageService.createSystemMessage(
            event.userId,
            'colonization',
            `Colonisation échouée ${coords}`,
            `La position ${coords} est déjà occupée. Votre flotte fait demi-tour.`,
          );
        }
        await this.scheduleReturn(
          event.id, event.originPlanetId,
          { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
          ships, mineraiCargo, siliciumCargo, hydrogeneCargo,
        );
        return { mission: 'colonize', success: false, reason: 'occupied' };
      }

      // Check max planets
      const userPlanets = await db
        .select()
        .from(planets)
        .where(eq(planets.userId, event.userId));

      if (userPlanets.length >= 9) {
        if (messageService) {
          await messageService.createSystemMessage(
            event.userId,
            'colonization',
            `Colonisation échouée ${coords}`,
            `Nombre maximum de planètes atteint (9). Votre flotte fait demi-tour.`,
          );
        }
        await this.scheduleReturn(
          event.id, event.originPlanetId,
          { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
          ships, mineraiCargo, siliciumCargo, hydrogeneCargo,
        );
        return { mission: 'colonize', success: false, reason: 'max_planets' };
      }

      // Success: create new planet — determine type from position
      const config = await gameConfigService.getFullConfig();
      const planetTypeForPos = config.planetTypes.find(
        (pt) => pt.id !== 'homeworld' && (pt.positions as number[]).includes(event.targetPosition),
      );

      const randomOffset = Math.floor(Math.random() * 41) - 20;
      const maxTemp = calculateMaxTemp(event.targetPosition, randomOffset);
      const minTemp = calculateMinTemp(maxTemp);

      let diameter: number;
      let fieldsBonus = 1;
      if (planetTypeForPos) {
        const { diameterMin, diameterMax } = planetTypeForPos;
        diameter = Math.floor(diameterMin + (diameterMax - diameterMin) * Math.random());
        fieldsBonus = planetTypeForPos.fieldsBonus;
      } else {
        diameter = calculateDiameter(event.targetPosition, Math.random());
      }
      const maxFields = calculateMaxFields(diameter, fieldsBonus);

      const [newPlanet] = await db
        .insert(planets)
        .values({
          userId: event.userId,
          name: 'Colonie',
          galaxy: event.targetGalaxy,
          system: event.targetSystem,
          position: event.targetPosition,
          planetType: 'planet',
          planetClassId: planetTypeForPos?.id ?? null,
          diameter,
          maxFields,
          minTemp,
          maxTemp,
        })
        .returning();

      // Create associated rows
      await db.insert(planetShips).values({ planetId: newPlanet.id });
      await db.insert(planetDefenses).values({ planetId: newPlanet.id });

      // Colony ship is consumed — remove from fleet
      const remainingShips = { ...ships };
      if (remainingShips.colonyShip) {
        remainingShips.colonyShip = Math.max(0, remainingShips.colonyShip - 1);
      }

      // Mark event completed
      await db
        .update(fleetEvents)
        .set({ status: 'completed' })
        .where(eq(fleetEvents.id, event.id));

      // Return remaining ships (if any) with cargo
      const hasRemainingShips = Object.values(remainingShips).some(v => v > 0);
      if (hasRemainingShips) {
        const config = await gameConfigService.getFullConfig();
        const shipStatsMap = buildShipStatsMap(config);
        const driveTechs = await this.getDriveTechs(event.userId);
        const speed = fleetSpeed(remainingShips, driveTechs, shipStatsMap);
        const [originPlanet] = await db
          .select()
          .from(planets)
          .where(eq(planets.id, event.originPlanetId))
          .limit(1);

        if (originPlanet && speed > 0) {
          const origin = { galaxy: originPlanet.galaxy, system: originPlanet.system, position: originPlanet.position };
          const target = { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition };
          const duration = travelTime(target, origin, speed, universeSpeed);
          const now = new Date();
          const returnTime = new Date(now.getTime() + duration * 1000);

          const [returnEvent] = await db
            .insert(fleetEvents)
            .values({
              userId: event.userId,
              originPlanetId: event.originPlanetId,
              targetPlanetId: newPlanet.id,
              targetGalaxy: event.targetGalaxy,
              targetSystem: event.targetSystem,
              targetPosition: event.targetPosition,
              mission: 'transport',
              phase: 'return',
              status: 'active',
              departureTime: now,
              arrivalTime: returnTime,
              mineraiCargo: String(mineraiCargo),
              siliciumCargo: String(siliciumCargo),
              hydrogeneCargo: String(hydrogeneCargo),
              ships: remainingShips,
            })
            .returning();

          await fleetReturnQueue.add(
            'return',
            { fleetEventId: returnEvent.id },
            { delay: duration * 1000, jobId: `fleet-return-${returnEvent.id}` },
          );
        }
      }

      if (messageService) {
        await messageService.createSystemMessage(
          event.userId,
          'colonization',
          `Colonisation réussie ${coords}`,
          `Une nouvelle colonie a été fondée sur ${coords}. Diamètre : ${diameter}km, ${maxFields} cases disponibles.`,
        );
      }

      return { mission: 'colonize', success: true, planetId: newPlanet.id };
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

    async getEspionageTech(userId: string): Promise<number> {
      const [research] = await db
        .select({ espionageTech: userResearch.espionageTech })
        .from(userResearch)
        .where(eq(userResearch.userId, userId))
        .limit(1);

      return research?.espionageTech ?? 0;
    },

    async processSpy(
      event: typeof fleetEvents.$inferSelect,
      ships: Record<string, number>,
    ) {
      const probeCount = ships.espionageProbe ?? 0;
      const coords = `[${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}]`;

      const attackerTech = await this.getEspionageTech(event.userId);

      const [targetPlanet] = await db
        .select()
        .from(planets)
        .where(
          and(
            eq(planets.galaxy, event.targetGalaxy),
            eq(planets.system, event.targetSystem),
            eq(planets.position, event.targetPosition),
          ),
        )
        .limit(1);

      if (!targetPlanet) {
        if (messageService) {
          await messageService.createSystemMessage(
            event.userId,
            'espionage',
            `Espionnage ${coords}`,
            `Aucune planète trouvée à la position ${coords}.`,
          );
        }
        await this.scheduleReturn(
          event.id, event.originPlanetId,
          { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
          ships, 0, 0, 0,
        );
        return { mission: 'spy', success: false, reason: 'no_planet' };
      }

      const defenderTech = await this.getEspionageTech(targetPlanet.userId);
      const visibility = calculateSpyReport(probeCount, attackerTech, defenderTech);

      let body = `Rapport d'espionnage de ${coords}\n\n`;

      if (visibility.resources) {
        await resourceService.materializeResources(targetPlanet.id, targetPlanet.userId);
        const [planet] = await db.select().from(planets).where(eq(planets.id, targetPlanet.id)).limit(1);
        body += `Ressources :\nMinerai : ${Math.floor(Number(planet.minerai))}\nSilicium : ${Math.floor(Number(planet.silicium))}\nHydrogène : ${Math.floor(Number(planet.hydrogene))}\n\n`;
      }

      if (visibility.fleet) {
        const [targetShips] = await db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
        if (targetShips) {
          body += `Flotte :\n`;
          const shipTypes = ['smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler'] as const;
          for (const t of shipTypes) {
            if (targetShips[t] > 0) body += `${t}: ${targetShips[t]}\n`;
          }
          body += '\n';
        }
      }

      if (visibility.defenses) {
        const [defs] = await db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);
        if (defs) {
          body += `Défenses :\n`;
          const defTypes = ['rocketLauncher', 'lightLaser', 'heavyLaser', 'gaussCannon', 'plasmaTurret', 'smallShield', 'largeShield'] as const;
          for (const t of defTypes) {
            if (defs[t] > 0) body += `${t}: ${defs[t]}\n`;
          }
          body += '\n';
        }
      }

      if (visibility.buildings) {
        const [planet] = await db.select().from(planets).where(eq(planets.id, targetPlanet.id)).limit(1);
        body += `Bâtiments :\n`;
        const buildingCols = ['mineraiMineLevel', 'siliciumMineLevel', 'hydrogeneSynthLevel', 'solarPlantLevel', 'roboticsLevel', 'shipyardLevel', 'researchLabLevel'] as const;
        for (const col of buildingCols) {
          if (planet[col] > 0) body += `${col}: ${planet[col]}\n`;
        }
        body += '\n';
      }

      if (visibility.research) {
        const [research] = await db.select().from(userResearch).where(eq(userResearch.userId, targetPlanet.userId)).limit(1);
        if (research) {
          body += `Recherches :\n`;
          const researchCols = ['espionageTech', 'computerTech', 'energyTech', 'combustion', 'impulse', 'hyperspaceDrive', 'weapons', 'shielding', 'armor'] as const;
          for (const col of researchCols) {
            if (research[col] > 0) body += `${col}: ${research[col]}\n`;
          }
        }
      }

      if (messageService) {
        await messageService.createSystemMessage(
          event.userId,
          'espionage',
          `Rapport d'espionnage ${coords}`,
          body,
        );
      }

      const detectionChance = calculateDetectionChance(probeCount, attackerTech, defenderTech);
      const detected = Math.random() * 100 < detectionChance;

      if (detected) {
        if (messageService) {
          const [attackerUser] = await db.select({ username: users.username }).from(users).where(eq(users.id, event.userId)).limit(1);
          await messageService.createSystemMessage(
            targetPlanet.userId,
            'espionage',
            `Activité d'espionnage détectée ${coords}`,
            `${probeCount} sonde(s) d'espionnage provenant de ${attackerUser?.username ?? 'Inconnu'} ont été détectées et détruites.`,
          );
        }
        await db
          .update(fleetEvents)
          .set({ status: 'completed' })
          .where(eq(fleetEvents.id, event.id));

        return { mission: 'spy', success: true, detected: true };
      }

      await this.scheduleReturn(
        event.id, event.originPlanetId,
        { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
        ships, 0, 0, 0,
      );

      return { mission: 'spy', success: true, detected: false };
    },

    async processRecycle(
      event: typeof fleetEvents.$inferSelect,
      ships: Record<string, number>,
      mineraiCargo: number,
      siliciumCargo: number,
      hydrogeneCargo: number,
    ) {
      const [debris] = await db
        .select()
        .from(debrisFields)
        .where(
          and(
            eq(debrisFields.galaxy, event.targetGalaxy),
            eq(debrisFields.system, event.targetSystem),
            eq(debrisFields.position, event.targetPosition),
          ),
        )
        .limit(1);

      if (!debris || (Number(debris.minerai) <= 0 && Number(debris.silicium) <= 0)) {
        await this.scheduleReturn(
          event.id, event.originPlanetId,
          { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
          ships, mineraiCargo, siliciumCargo, hydrogeneCargo,
        );
        return { mission: 'recycle', collected: { minerai: 0, silicium: 0 } };
      }

      const config = await gameConfigService.getFullConfig();
      const recyclerDef = config.ships['recycler'];
      const recyclerCount = ships.recycler ?? 0;
      const cargoPerRecycler = recyclerDef?.cargoCapacity ?? 20000;
      const totalCargoCapacityValue = recyclerCount * cargoPerRecycler;

      let remainingCargo = totalCargoCapacityValue;
      const availableMinerai = Number(debris.minerai);
      const availableSilicium = Number(debris.silicium);

      const collectedMinerai = Math.min(availableMinerai, remainingCargo);
      remainingCargo -= collectedMinerai;
      const collectedSilicium = Math.min(availableSilicium, remainingCargo);

      const newMinerai = availableMinerai - collectedMinerai;
      const newSilicium = availableSilicium - collectedSilicium;

      if (newMinerai <= 0 && newSilicium <= 0) {
        await db.delete(debrisFields).where(eq(debrisFields.id, debris.id));
      } else {
        await db
          .update(debrisFields)
          .set({
            minerai: String(newMinerai),
            silicium: String(newSilicium),
            updatedAt: new Date(),
          })
          .where(eq(debrisFields.id, debris.id));
      }

      await this.scheduleReturn(
        event.id, event.originPlanetId,
        { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
        ships,
        mineraiCargo + collectedMinerai,
        siliciumCargo + collectedSilicium,
        hydrogeneCargo,
      );

      return { mission: 'recycle', collected: { minerai: collectedMinerai, silicium: collectedSilicium } };
    },

    async processAttack(
      event: typeof fleetEvents.$inferSelect,
      ships: Record<string, number>,
      mineraiCargo: number,
      siliciumCargo: number,
      hydrogeneCargo: number,
    ) {
      const coords = `[${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}]`;
      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      const combatStatsMap = buildCombatStats(config);
      const shipCostsMap = buildShipCosts(config);
      const shipIdSet = new Set(Object.keys(config.ships));
      const defenseIdSet = new Set(Object.keys(config.defenses));
      const debrisRatio = (config.universe['debrisRatio'] as number) ?? 0.3;

      const [targetPlanet] = await db
        .select()
        .from(planets)
        .where(
          and(
            eq(planets.galaxy, event.targetGalaxy),
            eq(planets.system, event.targetSystem),
            eq(planets.position, event.targetPosition),
          ),
        )
        .limit(1);

      if (!targetPlanet) {
        if (messageService) {
          await messageService.createSystemMessage(
            event.userId,
            'combat',
            `Attaque ${coords}`,
            `Aucune planète trouvée à la position ${coords}. Votre flotte fait demi-tour.`,
          );
        }
        await this.scheduleReturn(
          event.id, event.originPlanetId,
          { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
          ships, mineraiCargo, siliciumCargo, hydrogeneCargo,
        );
        return { mission: 'attack', success: false, reason: 'no_planet' };
      }

      const [defShips] = await db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
      const [defDefs] = await db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);

      const defenderFleet: Record<string, number> = {};
      const defenderDefenses: Record<string, number> = {};
      const shipTypes = ['smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler'] as const;
      const defenseTypes = ['rocketLauncher', 'lightLaser', 'heavyLaser', 'gaussCannon', 'plasmaTurret', 'smallShield', 'largeShield'] as const;

      if (defShips) {
        for (const t of shipTypes) {
          if (defShips[t] > 0) defenderFleet[t] = defShips[t];
        }
      }
      if (defDefs) {
        for (const t of defenseTypes) {
          if (defDefs[t] > 0) defenderDefenses[t] = defDefs[t];
        }
      }

      const attackerTechs = await this.getCombatTechs(event.userId);
      const defenderTechs = await this.getCombatTechs(targetPlanet.userId);

      const hasDefenders = Object.values(defenderFleet).some(v => v > 0) ||
                           Object.values(defenderDefenses).some(v => v > 0);

      // Merge defender fleet + defenses into one pool for simulateCombat
      const defenderCombined: Record<string, number> = { ...defenderFleet, ...defenderDefenses };

      let outcome: 'attacker' | 'defender' | 'draw';
      let attackerLosses: Record<string, number> = {};
      let defenderLosses: Record<string, number> = {};
      let debris = { minerai: 0, silicium: 0 };
      let repairedDefenses: Record<string, number> = {};
      let roundCount = 0;

      if (!hasDefenders) {
        outcome = 'attacker';
      } else {
        const result = simulateCombat(
          ships, defenderCombined, attackerTechs, defenderTechs,
          combatStatsMap, config.rapidFire,
          shipIdSet, shipCostsMap, defenseIdSet, debrisRatio,
        );
        outcome = result.outcome;
        attackerLosses = result.attackerLosses;
        defenderLosses = result.defenderLosses;
        debris = result.debris;
        repairedDefenses = result.repairedDefenses;
        roundCount = result.rounds.length;
      }

      // Apply attacker losses
      const survivingShips: Record<string, number> = { ...ships };
      for (const [type, lost] of Object.entries(attackerLosses)) {
        survivingShips[type] = (survivingShips[type] ?? 0) - (lost as number);
        if (survivingShips[type] <= 0) delete survivingShips[type];
      }

      // Apply defender ship losses
      if (defShips) {
        const shipUpdates: Record<string, number> = {};
        for (const t of shipTypes) {
          const lost = defenderLosses[t] ?? 0;
          if (lost > 0) shipUpdates[t] = defShips[t] - lost;
        }
        if (Object.keys(shipUpdates).length > 0) {
          await db.update(planetShips).set(shipUpdates).where(eq(planetShips.planetId, targetPlanet.id));
        }
      }

      // Apply defender defense losses (minus repairs)
      if (defDefs) {
        const defUpdates: Record<string, number> = {};
        for (const t of defenseTypes) {
          const lost = defenderLosses[t] ?? 0;
          const repaired = repairedDefenses[t] ?? 0;
          const netLoss = lost - repaired;
          if (netLoss > 0) defUpdates[t] = defDefs[t] - netLoss;
        }
        if (Object.keys(defUpdates).length > 0) {
          await db.update(planetDefenses).set(defUpdates).where(eq(planetDefenses.planetId, targetPlanet.id));
        }
      }

      // Create/accumulate debris field
      if (debris.minerai > 0 || debris.silicium > 0) {
        const [existingDebris] = await db
          .select()
          .from(debrisFields)
          .where(
            and(
              eq(debrisFields.galaxy, event.targetGalaxy),
              eq(debrisFields.system, event.targetSystem),
              eq(debrisFields.position, event.targetPosition),
            ),
          )
          .limit(1);

        if (existingDebris) {
          await db
            .update(debrisFields)
            .set({
              minerai: String(Number(existingDebris.minerai) + debris.minerai),
              silicium: String(Number(existingDebris.silicium) + debris.silicium),
              updatedAt: new Date(),
            })
            .where(eq(debrisFields.id, existingDebris.id));
        } else {
          await db.insert(debrisFields).values({
            galaxy: event.targetGalaxy,
            system: event.targetSystem,
            position: event.targetPosition,
            minerai: String(debris.minerai),
            silicium: String(debris.silicium),
          });
        }
      }

      // Pillage resources if attacker wins
      let pillagedMinerai = 0;
      let pillagedSilicium = 0;
      let pillagedHydrogene = 0;

      if (outcome === 'attacker') {
        const remainingCargoCapacity = totalCargoCapacity(survivingShips, shipStatsMap);
        const availableCargo = remainingCargoCapacity - mineraiCargo - siliciumCargo - hydrogeneCargo;

        if (availableCargo > 0) {
          await resourceService.materializeResources(targetPlanet.id, targetPlanet.userId);
          const [updatedPlanet] = await db.select().from(planets).where(eq(planets.id, targetPlanet.id)).limit(1);

          const availMinerai = Math.floor(Number(updatedPlanet.minerai));
          const availSilicium = Math.floor(Number(updatedPlanet.silicium));
          const availHydrogene = Math.floor(Number(updatedPlanet.hydrogene));

          const thirdCargo = Math.floor(availableCargo / 3);

          pillagedMinerai = Math.min(availMinerai, thirdCargo);
          pillagedSilicium = Math.min(availSilicium, thirdCargo);
          pillagedHydrogene = Math.min(availHydrogene, thirdCargo);

          let remaining = availableCargo - pillagedMinerai - pillagedSilicium - pillagedHydrogene;

          if (remaining > 0) {
            const extraMinerai = Math.min(availMinerai - pillagedMinerai, remaining);
            pillagedMinerai += extraMinerai;
            remaining -= extraMinerai;
          }
          if (remaining > 0) {
            const extraSilicium = Math.min(availSilicium - pillagedSilicium, remaining);
            pillagedSilicium += extraSilicium;
            remaining -= extraSilicium;
          }
          if (remaining > 0) {
            const extraHydrogene = Math.min(availHydrogene - pillagedHydrogene, remaining);
            pillagedHydrogene += extraHydrogene;
          }

          await db
            .update(planets)
            .set({
              minerai: sql`${planets.minerai} - ${pillagedMinerai}`,
              silicium: sql`${planets.silicium} - ${pillagedSilicium}`,
              hydrogene: sql`${planets.hydrogene} - ${pillagedHydrogene}`,
            })
            .where(eq(planets.id, targetPlanet.id));
        }
      }

      // Send combat reports
      const outcomeText = outcome === 'attacker' ? 'Victoire' :
                          outcome === 'defender' ? 'Défaite' : 'Match nul';

      const reportBody = `Combat ${coords} — ${outcomeText}\n\n` +
        `Rounds : ${roundCount}\n` +
        `Pertes attaquant : ${JSON.stringify(attackerLosses)}\n` +
        `Pertes défenseur : ${JSON.stringify(defenderLosses)}\n` +
        `Défenses réparées : ${JSON.stringify(repairedDefenses)}\n` +
        `Débris : ${debris.minerai} minerai, ${debris.silicium} silicium\n` +
        (outcome === 'attacker' ?
          `Pillage : ${pillagedMinerai} minerai, ${pillagedSilicium} silicium, ${pillagedHydrogene} hydrogène\n` : '');

      if (messageService) {
        await messageService.createSystemMessage(
          event.userId,
          'combat',
          `Rapport de combat ${coords} — ${outcomeText}`,
          reportBody,
        );
        await messageService.createSystemMessage(
          targetPlanet.userId,
          'combat',
          `Rapport de combat ${coords} — ${outcome === 'attacker' ? 'Défaite' : outcome === 'defender' ? 'Victoire' : 'Match nul'}`,
          reportBody,
        );
      }

      // Return surviving fleet with cargo + pillage
      const hasShips = Object.values(survivingShips).some(v => v > 0);
      if (hasShips) {
        await this.scheduleReturn(
          event.id, event.originPlanetId,
          { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
          survivingShips,
          mineraiCargo + pillagedMinerai,
          siliciumCargo + pillagedSilicium,
          hydrogeneCargo + pillagedHydrogene,
        );
      } else {
        await db
          .update(fleetEvents)
          .set({ status: 'completed' })
          .where(eq(fleetEvents.id, event.id));
      }

      return { mission: 'attack', outcome };
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
