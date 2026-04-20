import { and, eq, inArray, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  planets,
  planetShips,
  fleetEvents,
  marketOffers,
  flagships,
} from '@exilium/db';
import type { Database } from '@exilium/db';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createReportService } from '../report/report.service.js';
import { totalCargoCapacity, travelTime, fleetSpeed } from '@exilium/game-engine';
import type { ShipStats } from '@exilium/game-engine';
import { buildShipStatsMap } from '../fleet/fleet.types.js';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { publishNotification } from '../notification/notification.publisher.js';

export interface ResourceBundle {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

export interface CargoLoadResult {
  loaded: ResourceBundle;
  overflow: ResourceBundle;
}

export function computeCargoLoad(stock: ResourceBundle, capacity: number): CargoLoadResult {
  const remaining = Math.max(0, capacity);
  const loadedMinerai = Math.min(stock.minerai, remaining);
  const afterMinerai = remaining - loadedMinerai;
  const loadedSilicium = Math.min(stock.silicium, afterMinerai);
  const afterSilicium = afterMinerai - loadedSilicium;
  const loadedHydrogene = Math.min(stock.hydrogene, afterSilicium);
  return {
    loaded: {
      minerai: loadedMinerai,
      silicium: loadedSilicium,
      hydrogene: loadedHydrogene,
    },
    overflow: {
      minerai: stock.minerai - loadedMinerai,
      silicium: stock.silicium - loadedSilicium,
      hydrogene: stock.hydrogene - loadedHydrogene,
    },
  };
}

export type AbandonBlocker =
  | 'homeworld'
  | 'colonizing'
  | 'inbound_hostile'
  | 'outbound_active'
  | 'market_offers'
  | 'destination_invalid';

export interface AbandonContext {
  planet: {
    id: string;
    userId: string;
    status: string;
    planetClassId: string | null;
  };
  destinationPlanet: {
    id: string;
    userId: string;
    status: string;
  } | null;
  inboundHostile: number;
  outboundActive: number;
  activeMarketOffers: number;
}

export function detectBlockers(ctx: AbandonContext): AbandonBlocker[] {
  const blockers: AbandonBlocker[] = [];
  if (ctx.planet.planetClassId === 'homeworld') blockers.push('homeworld');
  if (ctx.planet.status === 'colonizing') blockers.push('colonizing');
  if (ctx.inboundHostile > 0) blockers.push('inbound_hostile');
  if (ctx.outboundActive > 0) blockers.push('outbound_active');
  if (ctx.activeMarketOffers > 0) blockers.push('market_offers');
  const dest = ctx.destinationPlanet;
  if (
    !dest ||
    dest.id === ctx.planet.id ||
    dest.userId !== ctx.planet.userId ||
    dest.status !== 'active'
  ) {
    blockers.push('destination_invalid');
  }
  return blockers;
}

export interface AbandonPreview {
  planetId: string;
  destinationPlanetId: string;
  blockers: AbandonBlocker[];
  ships: Record<string, number>;
  cargoCapacity: number;
  loaded: ResourceBundle;
  overflow: ResourceBundle;
  stock: ResourceBundle;
  travelSeconds: number;
  arrivalTime: Date;
  flagshipIncluded: boolean;
  buildingsLost: number;
  defensesLost: number;
  queuesLost: number;
}

export function createPlanetAbandonService(
  db: Database,
  gameConfigService: GameConfigService,
  _reportService: ReturnType<typeof createReportService>,
  fleetQueue: Queue,
  redis: Redis,
) {
  async function loadContext(userId: string, planetId: string, destinationPlanetId: string) {
    const [planet] = await db.select().from(planets).where(eq(planets.id, planetId)).limit(1);
    if (!planet || planet.userId !== userId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Planète introuvable' });
    }
    const [destination] = await db.select().from(planets).where(eq(planets.id, destinationPlanetId)).limit(1);
    const [shipsRow] = await db.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);

    const [inboundRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleetEvents)
      .where(and(
        eq(fleetEvents.targetPlanetId, planetId),
        eq(fleetEvents.status, 'active'),
        inArray(fleetEvents.mission, ['attack', 'spy', 'pirate']),
      ));
    const inboundHostile = Number(inboundRow?.count ?? 0);

    const [outboundRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleetEvents)
      .where(and(
        eq(fleetEvents.originPlanetId, planetId),
        eq(fleetEvents.status, 'active'),
      ));
    const outboundActive = Number(outboundRow?.count ?? 0);

    const [marketRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketOffers)
      .where(and(
        eq(marketOffers.planetId, planetId),
        inArray(marketOffers.status, ['active', 'reserved']),
      ));
    const marketCount = Number(marketRow?.count ?? 0);

    const [flagship] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
    const flagshipIncluded = !!flagship && flagship.planetId === planetId && flagship.status === 'active';

    return { planet, destination, shipsRow, inboundHostile, outboundActive, marketCount, flagship, flagshipIncluded };
  }

  return {
    async preview(userId: string, planetId: string, destinationPlanetId: string): Promise<AbandonPreview> {
      const ctxData = await loadContext(userId, planetId, destinationPlanetId);
      const { planet, destination, shipsRow, flagship, flagshipIncluded } = ctxData;

      const ships: Record<string, number> = {};
      if (shipsRow) {
        for (const [k, v] of Object.entries(shipsRow)) {
          if (k === 'planetId' || k === 'createdAt' || k === 'updatedAt') continue;
          const count = typeof v === 'number' ? v : 0;
          if (count > 0) ships[k] = count;
        }
      }
      if (flagshipIncluded) ships['flagship'] = 1;

      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      if (flagshipIncluded && flagship) {
        shipStatsMap['flagship'] = {
          baseSpeed: flagship.baseSpeed,
          fuelConsumption: flagship.fuelConsumption,
          cargoCapacity: flagship.cargoCapacity,
          driveType: flagship.driveType as ShipStats['driveType'],
          miningExtraction: 0,
        };
      }
      const cargoCapacity = totalCargoCapacity(ships, shipStatsMap);

      const stock: ResourceBundle = {
        minerai: Number(planet.minerai),
        silicium: Number(planet.silicium),
        hydrogene: Number(planet.hydrogene),
      };
      const { loaded, overflow } = computeCargoLoad(stock, cargoCapacity);

      const blockers = detectBlockers({
        planet: {
          id: planet.id,
          userId: planet.userId,
          status: planet.status,
          planetClassId: planet.planetClassId,
        },
        destinationPlanet: destination
          ? { id: destination.id, userId: destination.userId, status: destination.status }
          : null,
        inboundHostile: ctxData.inboundHostile,
        outboundActive: ctxData.outboundActive,
        activeMarketOffers: ctxData.marketCount,
      });

      // Travel time — only computable if destination exists
      const fleetConfig = {
        galaxyFactor: Number(config.universe.fleet_distance_galaxy_factor) || 20000,
        systemBase: Number(config.universe.fleet_distance_system_base) || 2700,
        systemFactor: Number(config.universe.fleet_distance_system_factor) || 95,
        positionBase: Number(config.universe.fleet_distance_position_base) || 1000,
        positionFactor: Number(config.universe.fleet_distance_position_factor) || 5,
        samePositionDistance: Number(config.universe.fleet_same_position_distance) || 5,
        speedFactor: Number(config.universe.fleet_speed_factor) || 35000,
      };
      const originCoords = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      let travelSeconds = 0;
      let arrivalTime = new Date();
      if (destination) {
        const destCoords = { galaxy: destination.galaxy, system: destination.system, position: destination.position };
        const speed = fleetSpeed(ships, shipStatsMap, {});
        const universeSpeed = Number(config.universe.speed) || 1;
        travelSeconds = speed > 0
          ? travelTime(originCoords, destCoords, speed, universeSpeed, fleetConfig)
          : 0;
        arrivalTime = new Date(Date.now() + travelSeconds * 1000);
      }

      // Count lost entities (best-effort; UI only — use separate SELECTs for clarity)
      const buildingsRes = await db.execute<{ total: number }>(
        sql`SELECT COALESCE(SUM(level), 0)::int AS total FROM planet_buildings WHERE planet_id = ${planetId}`,
      );
      const buildingsRows = ((buildingsRes as unknown) as { rows?: Array<{ total: number }> }).rows
        ?? (buildingsRes as unknown as Array<{ total: number }>);
      const defensesRes = await db.execute<{ total: number }>(
        sql`SELECT COALESCE(SUM(count), 0)::int AS total FROM planet_defenses WHERE planet_id = ${planetId}`,
      );
      const defensesRows = ((defensesRes as unknown) as { rows?: Array<{ total: number }> }).rows
        ?? (defensesRes as unknown as Array<{ total: number }>);
      const queuesRes = await db.execute<{ total: number }>(
        sql`SELECT COUNT(*)::int AS total FROM build_queue WHERE planet_id = ${planetId}`,
      );
      const queuesRows = ((queuesRes as unknown) as { rows?: Array<{ total: number }> }).rows
        ?? (queuesRes as unknown as Array<{ total: number }>);

      return {
        planetId,
        destinationPlanetId,
        blockers,
        ships,
        cargoCapacity,
        loaded,
        overflow,
        stock,
        travelSeconds,
        arrivalTime,
        flagshipIncluded,
        buildingsLost: Number(buildingsRows?.[0]?.total ?? 0),
        defensesLost: Number(defensesRows?.[0]?.total ?? 0),
        queuesLost: Number(queuesRows?.[0]?.total ?? 0),
      };
    },

    async abandon(userId: string, planetId: string, destinationPlanetId: string) {
      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);

      const jobData = await db.transaction(async (tx) => {
        // Re-validate with FOR UPDATE to close races
        const [planet] = await tx
          .select()
          .from(planets)
          .where(eq(planets.id, planetId))
          .for('update');
        if (!planet || planet.userId !== userId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Planète introuvable' });
        }

        const [destination] = await tx
          .select()
          .from(planets)
          .where(eq(planets.id, destinationPlanetId))
          .for('update');

        const [inboundRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fleetEvents)
          .where(and(
            eq(fleetEvents.targetPlanetId, planetId),
            eq(fleetEvents.status, 'active'),
            inArray(fleetEvents.mission, ['attack', 'spy', 'pirate']),
          ));
        const inboundHostile = Number(inboundRow?.count ?? 0);

        const [outboundRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fleetEvents)
          .where(and(
            eq(fleetEvents.originPlanetId, planetId),
            eq(fleetEvents.status, 'active'),
          ));
        const outboundActive = Number(outboundRow?.count ?? 0);

        const [marketRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(marketOffers)
          .where(and(
            eq(marketOffers.planetId, planetId),
            inArray(marketOffers.status, ['active', 'reserved']),
          ));
        const marketCount = Number(marketRow?.count ?? 0);

        const [flagship] = await tx.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
        const flagshipIncluded = !!flagship && flagship.planetId === planetId && flagship.status === 'active';

        const blockers = detectBlockers({
          planet: {
            id: planet.id, userId: planet.userId, status: planet.status, planetClassId: planet.planetClassId,
          },
          destinationPlanet: destination
            ? { id: destination.id, userId: destination.userId, status: destination.status }
            : null,
          inboundHostile,
          outboundActive,
          activeMarketOffers: marketCount,
        });
        if (blockers.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Abandon impossible: ${blockers.join(', ')}`,
          });
        }

        const [shipsRow] = await tx.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
        const ships: Record<string, number> = {};
        if (shipsRow) {
          for (const [k, v] of Object.entries(shipsRow)) {
            if (k === 'planetId' || k === 'createdAt' || k === 'updatedAt') continue;
            const count = typeof v === 'number' ? v : 0;
            if (count > 0) ships[k] = count;
          }
        }
        if (flagshipIncluded && flagship) {
          ships['flagship'] = 1;
          shipStatsMap['flagship'] = {
            baseSpeed: flagship.baseSpeed,
            fuelConsumption: flagship.fuelConsumption,
            cargoCapacity: flagship.cargoCapacity,
            driveType: flagship.driveType as ShipStats['driveType'],
            miningExtraction: 0,
          };
        }

        const capacity = totalCargoCapacity(ships, shipStatsMap);
        const stock: ResourceBundle = {
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
        };
        const { loaded, overflow } = computeCargoLoad(stock, capacity);

        const fleetConfig = {
          galaxyFactor: Number(config.universe.fleet_distance_galaxy_factor) || 20000,
          systemBase: Number(config.universe.fleet_distance_system_base) || 2700,
          systemFactor: Number(config.universe.fleet_distance_system_factor) || 95,
          positionBase: Number(config.universe.fleet_distance_position_base) || 1000,
          positionFactor: Number(config.universe.fleet_distance_position_factor) || 5,
          samePositionDistance: Number(config.universe.fleet_same_position_distance) || 5,
          speedFactor: Number(config.universe.fleet_speed_factor) || 35000,
        };
        // destination is non-null here (blockers would have triggered otherwise)
        const dest = destination!;
        const originCoords = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
        const destCoords = { galaxy: dest.galaxy, system: dest.system, position: dest.position };
        const speed = fleetSpeed(ships, shipStatsMap, {});
        const universeSpeed = Number(config.universe.speed) || 1;
        const duration = speed > 0 ? travelTime(originCoords, destCoords, speed, universeSpeed, fleetConfig) : 0;
        const now = new Date();
        const arrivalTime = new Date(now.getTime() + duration * 1000);

        // Create the return fleet event
        const [event] = await tx
          .insert(fleetEvents)
          .values({
            userId,
            originPlanetId: planet.id,
            targetPlanetId: dest.id,
            targetGalaxy: dest.galaxy,
            targetSystem: dest.system,
            targetPosition: dest.position,
            mission: 'abandon_return',
            phase: 'outbound',
            status: 'active',
            departureTime: now,
            arrivalTime,
            mineraiCargo: String(loaded.minerai),
            siliciumCargo: String(loaded.silicium),
            hydrogeneCargo: String(loaded.hydrogene),
            ships,
            metadata: {
              abandonedPlanet: {
                name: planet.name,
                galaxy: planet.galaxy,
                system: planet.system,
                position: planet.position,
              },
              overflow,
            },
          })
          .returning();

        // Flagship: mark as in_mission and move it to the destination planet BEFORE the abandoned planet
        // is deleted, so the ON DELETE cascade on planets does not try to null-out flagships.planet_id
        // (which is schema-NOT-NULL and would fail). The flagship stays "in_mission" until the
        // AbandonReturnHandler (Task 8) re-activates it at arrival.
        if (flagshipIncluded) {
          await tx
            .update(flagships)
            .set({ status: 'in_mission', planetId: dest.id, updatedAt: new Date() })
            .where(eq(flagships.userId, userId));
        }

        // Debris field for overflow minerai + silicium (hydrogene is lost)
        if (overflow.minerai > 0 || overflow.silicium > 0) {
          await tx.execute(sql`
            INSERT INTO debris_fields (galaxy, system, position, minerai, silicium, updated_at)
            VALUES (
              ${planet.galaxy}, ${planet.system}, ${planet.position},
              ${String(overflow.minerai)}, ${String(overflow.silicium)}, now()
            )
            ON CONFLICT (galaxy, system, position)
            DO UPDATE SET
              minerai = debris_fields.minerai + EXCLUDED.minerai,
              silicium = debris_fields.silicium + EXCLUDED.silicium,
              updated_at = now()
          `);
        }

        // Delete the planet — cascade cleans planet_ships, planet_buildings, planet_defenses,
        // planet_biomes, colonization_processes, build_queue, etc.
        await tx.delete(planets).where(eq(planets.id, planet.id));

        return { eventId: event.id, arrivalTime, duration };
      });

      // Schedule arrival (outside the transaction)
      const delayMs = Math.max(0, jobData.arrivalTime.getTime() - Date.now());
      await fleetQueue.add('arrive', { fleetEventId: jobData.eventId }, { delay: delayMs });

      await publishNotification(redis, userId, {
        type: 'empire_updated',
        payload: {},
      });

      return { fleetEventId: jobData.eventId, arrivalTime: jobData.arrivalTime };
    },
  };
}
