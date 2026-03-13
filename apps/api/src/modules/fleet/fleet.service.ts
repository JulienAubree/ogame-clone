import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, fleetEvents, userResearch } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  fleetSpeed,
  travelTime,
  distance,
  fuelConsumption,
  totalCargoCapacity,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { Queue } from 'bullmq';

interface SendFleetInput {
  originPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  mission: 'transport' | 'station' | 'spy' | 'attack' | 'colonize';
  ships: Record<string, number>;
  metalCargo?: number;
  crystalCargo?: number;
  deuteriumCargo?: number;
}

export function createFleetService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  fleetArrivalQueue: Queue,
  fleetReturnQueue: Queue,
  universeSpeed: number,
) {
  return {
    async sendFleet(userId: string, input: SendFleetInput) {
      const planet = await this.getOwnedPlanet(userId, input.originPlanetId);

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
      const speed = fleetSpeed(input.ships, driveTechs);
      if (speed === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun vaisseau sélectionné' });
      }

      const origin = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      const target = { galaxy: input.targetGalaxy, system: input.targetSystem, position: input.targetPosition };
      const dist = distance(origin, target);
      const duration = travelTime(origin, target, speed, universeSpeed);
      const fuel = fuelConsumption(input.ships, dist, duration);

      // Validate cargo doesn't exceed capacity
      const cargo = totalCargoCapacity(input.ships);
      const metalCargo = input.metalCargo ?? 0;
      const crystalCargo = input.crystalCargo ?? 0;
      const deuteriumCargo = input.deuteriumCargo ?? 0;
      const totalCargo = metalCargo + crystalCargo + deuteriumCargo;
      if (totalCargo > cargo) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Capacité de fret dépassée' });
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
      const totalDeutCost = deuteriumCargo + fuel;
      await resourceService.spendResources(input.originPlanetId, userId, {
        metal: metalCargo,
        crystal: crystalCargo,
        deuterium: totalDeutCost,
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
          metalCargo: String(metalCargo),
          crystalCargo: String(crystalCargo),
          deuteriumCargo: String(deuteriumCargo),
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
      const metalCargo = Number(event.metalCargo);
      const crystalCargo = Number(event.crystalCargo);
      const deuteriumCargo = Number(event.deuteriumCargo);

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
                metal: String(Number(targetPlanet.metal) + metalCargo),
                crystal: String(Number(targetPlanet.crystal) + crystalCargo),
                deuterium: String(Number(targetPlanet.deuterium) + deuteriumCargo),
              })
              .where(eq(planets.id, event.targetPlanetId));
          }
        }

        await this.scheduleReturn(event.id, event.originPlanetId, {
          galaxy: event.targetGalaxy,
          system: event.targetSystem,
          position: event.targetPosition,
        }, ships, 0, 0, 0);

        return { mission: 'transport', delivered: true };
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
                metal: String(Number(targetPlanet.metal) + metalCargo),
                crystal: String(Number(targetPlanet.crystal) + crystalCargo),
                deuterium: String(Number(targetPlanet.deuterium) + deuteriumCargo),
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

        return { mission: 'station', stationed: true };
      }

      // For other missions (attack, spy, colonize) — Phase 5
      await this.scheduleReturn(
        event.id, event.originPlanetId,
        { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
        ships, metalCargo, crystalCargo, deuteriumCargo,
      );

      return { mission: event.mission, placeholder: true };
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

      const metalCargo = Number(event.metalCargo);
      const crystalCargo = Number(event.crystalCargo);
      const deuteriumCargo = Number(event.deuteriumCargo);

      if (metalCargo > 0 || crystalCargo > 0 || deuteriumCargo > 0) {
        const [originPlanet] = await db
          .select()
          .from(planets)
          .where(eq(planets.id, event.originPlanetId))
          .limit(1);

        if (originPlanet) {
          await db
            .update(planets)
            .set({
              metal: String(Number(originPlanet.metal) + metalCargo),
              crystal: String(Number(originPlanet.crystal) + crystalCargo),
              deuterium: String(Number(originPlanet.deuterium) + deuteriumCargo),
            })
            .where(eq(planets.id, event.originPlanetId));
        }
      }

      await db
        .update(fleetEvents)
        .set({ status: 'completed' })
        .where(eq(fleetEvents.id, event.id));

      return { returned: true, ships };
    },

    async scheduleReturn(
      fleetEventId: string,
      originPlanetId: string,
      targetCoords: { galaxy: number; system: number; position: number },
      ships: Record<string, number>,
      metalCargo: number,
      crystalCargo: number,
      deuteriumCargo: number,
    ) {
      const [originPlanet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, originPlanetId))
        .limit(1);

      if (!originPlanet) return;

      const driveTechs = await this.getDriveTechsByEvent(fleetEventId);
      const speed = fleetSpeed(ships, driveTechs);
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
          metalCargo: String(metalCargo),
          crystalCargo: String(crystalCargo),
          deuteriumCargo: String(deuteriumCargo),
          ships,
        })
        .where(eq(fleetEvents.id, fleetEventId));

      await fleetReturnQueue.add(
        'return',
        { fleetEventId },
        { delay: duration * 1000, jobId: `fleet-return-${fleetEventId}` },
      );
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
