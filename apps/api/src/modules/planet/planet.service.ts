import { eq, asc, and, sql, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetBuildings, planetTypes, buildQueue, fleetEvents, flagships } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  calculateMaxTemp,
  calculateMinTemp,
} from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';
import { getRandomPlanetImageIndex } from '../../lib/planet-image.util.js';
import { findPlanetTypeByRole } from '../../lib/config-helpers.js';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function createPlanetService(
  db: Database,
  gameConfigService: GameConfigService,
  assetsDir: string,
  resourceService?: {
    materializeResources(planetId: string, userId: string): Promise<any>;
    getProductionRates(planetId: string, planet: any, bonus?: any, userId?: string): Promise<any>;
  },
) {
  return {
    async createHomePlanet(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const homeworldType = findPlanetTypeByRole(config, 'homeworld');
      const universe = config.universe;

      const galaxies = Number(universe.galaxies) || 9;
      const systems = Number(universe.systems) || 499;

      const galaxy = randomInt(1, galaxies);
      const system = randomInt(1, systems);
      const posMin = Number(universe.home_planet_position_min) || 4;
      const posMax = Number(universe.home_planet_position_max) || 12;
      const position = randomInt(posMin, posMax);

      const randomOffset = randomInt(-20, 20);
      const maxTemp = calculateMaxTemp(position, randomOffset);
      const minTemp = calculateMinTemp(maxTemp);
      const diameter = Number(universe.homePlanetDiameter) || 12000;

      const startingMinerai = Number(universe.startingMinerai) || 500;
      const startingSilicium = Number(universe.startingSilicium) || 300;
      const startingHydrogene = Number(universe.startingHydrogene) || 100;

      const [planet] = await db
        .insert(planets)
        .values({
          userId,
          name: 'Homeworld',
          galaxy,
          system,
          position,
          planetType: 'planet',
          planetClassId: homeworldType.id,
          diameter,
          minTemp,
          maxTemp,
          minerai: String(startingMinerai),
          silicium: String(startingSilicium),
          hydrogene: String(startingHydrogene),
          planetImageIndex: getRandomPlanetImageIndex(homeworldType.id, assetsDir),
        })
        .returning();

      // Initialize building levels at 0 for all buildings
      const buildingIds = Object.keys(config.buildings);
      if (buildingIds.length > 0) {
        await db.insert(planetBuildings).values(
          buildingIds.map((buildingId) => ({
            planetId: planet.id,
            buildingId,
            level: 0,
          })),
        );
      }

      return planet;
    },

    async listPlanets(userId: string) {
      return db
        .select()
        .from(planets)
        .where(eq(planets.userId, userId))
        .orderBy(asc(planets.createdAt));
    },

    async getPlanet(userId: string, planetId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, planetId))
        .limit(1);

      if (!planet || planet.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return planet;
    },

    async rename(userId: string, planetId: string, name: string) {
      const planet = await this.getPlanet(userId, planetId);
      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });
      if (planet.renamed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Planète déjà renommée' });

      await db
        .update(planets)
        .set({ name, renamed: true })
        .where(eq(planets.id, planetId));

      return { ok: true };
    },

    async getEmpireOverview(userId: string) {
      const planetList = await this.listPlanets(userId);

      if (!resourceService) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'resourceService required for empire' });
      }

      // Get flagship location
      const [flagship] = await db
        .select({ planetId: flagships.planetId })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);
      const flagshipPlanetId = flagship?.planetId ?? null;

      const planetData = await Promise.all(
        planetList.map(async (planet) => {
          const updated = await resourceService.materializeResources(planet.id, userId);

          const bonus = planet.planetClassId
            ? await db.select({
                mineraiBonus: planetTypes.mineraiBonus,
                siliciumBonus: planetTypes.siliciumBonus,
                hydrogeneBonus: planetTypes.hydrogeneBonus,
              }).from(planetTypes).where(eq(planetTypes.id, planet.planetClassId)).limit(1).then(r => r[0])
            : undefined;

          const rates = await resourceService.getProductionRates(planet.id, planet, bonus, userId);

          const activeBuilds = await db
            .select({
              type: buildQueue.type,
              itemId: buildQueue.itemId,
              quantity: buildQueue.quantity,
              endTime: buildQueue.endTime,
              status: buildQueue.status,
              facilityId: buildQueue.facilityId,
            })
            .from(buildQueue)
            .where(and(eq(buildQueue.planetId, planet.id), inArray(buildQueue.status, ['active', 'queued'])));

          // For each type, prefer the 'active' entry, fallback to first 'queued'
          const findEntry = (type: string) =>
            activeBuilds.find(b => b.type === type && b.status === 'active')
            ?? activeBuilds.find(b => b.type === type)
            ?? null;

          const activeBuild = findEntry('building');
          const activeResearch = findEntry('research');
          const activeShipyard = findEntry('ship');
          const activeDefense = findEntry('defense');

          // Outbound fleets from this planet (count + earliest arrival)
          const [outbound] = await db
            .select({
              count: sql<number>`count(*)::int`,
              earliestArrival: sql<string>`min(${fleetEvents.arrivalTime})::text`,
            })
            .from(fleetEvents)
            .where(and(
              eq(fleetEvents.originPlanetId, planet.id),
              eq(fleetEvents.userId, userId),
              eq(fleetEvents.status, 'active'),
            ));

          // Inbound friendly fleets to this planet (not from this user = could be ally transport, etc.)
          // Actually, inbound friendly = own fleets returning OR other players' non-attack missions
          // Simplification: inbound from self (return legs) + inbound non-attack from others
          const [inboundFriendly] = await db
            .select({
              count: sql<number>`count(*)::int`,
              earliestArrival: sql<string>`min(${fleetEvents.arrivalTime})::text`,
            })
            .from(fleetEvents)
            .where(and(
              eq(fleetEvents.targetPlanetId, planet.id),
              eq(fleetEvents.status, 'active'),
              sql`(${fleetEvents.userId} = ${userId} OR ${fleetEvents.mission} NOT IN ('attack', 'spy'))`,
            ));

          // Inbound hostile fleets
          const inboundAttacks = await db
            .select({
              arrivalTime: fleetEvents.arrivalTime,
              mission: fleetEvents.mission,
            })
            .from(fleetEvents)
            .where(and(
              eq(fleetEvents.targetPlanetId, planet.id),
              eq(fleetEvents.status, 'active'),
              inArray(fleetEvents.mission, ['attack', 'spy']),
              sql`${fleetEvents.userId} != ${userId}`,
            ))
            .orderBy(asc(fleetEvents.arrivalTime))
            .limit(1);

          return {
            id: planet.id,
            name: planet.name,
            galaxy: planet.galaxy,
            system: planet.system,
            position: planet.position,
            planetClassId: planet.planetClassId,
            planetImageIndex: planet.planetImageIndex,
            diameter: planet.diameter,
            minTemp: planet.minTemp,
            maxTemp: planet.maxTemp,
            minerai: Number(updated.minerai),
            silicium: Number(updated.silicium),
            hydrogene: Number(updated.hydrogene),
            mineraiPerHour: rates.mineraiPerHour,
            siliciumPerHour: rates.siliciumPerHour,
            hydrogenePerHour: rates.hydrogenePerHour,
            storageMineraiCapacity: rates.storageMineraiCapacity,
            storageSiliciumCapacity: rates.storageSiliciumCapacity,
            storageHydrogeneCapacity: rates.storageHydrogeneCapacity,
            energyProduced: rates.energyProduced,
            energyConsumed: rates.energyConsumed,
            hasFlagship: flagshipPlanetId === planet.id,
            activeBuild: activeBuild
              ? { buildingId: activeBuild.itemId, level: activeBuild.quantity, endTime: activeBuild.endTime.toISOString() }
              : null,
            activeResearch: activeResearch
              ? { researchId: activeResearch.itemId, level: activeResearch.quantity, endTime: activeResearch.endTime.toISOString() }
              : null,
            activeShipyard: activeShipyard
              ? { shipId: activeShipyard.itemId, quantity: activeShipyard.quantity, endTime: activeShipyard.endTime.toISOString(), facilityId: activeShipyard.facilityId }
              : null,
            activeDefense: activeDefense
              ? { defenseId: activeDefense.itemId, quantity: activeDefense.quantity, endTime: activeDefense.endTime.toISOString() }
              : null,
            outboundFleets: (outbound?.count ?? 0) > 0
              ? { count: outbound!.count, earliestArrival: outbound!.earliestArrival }
              : null,
            inboundFriendlyFleets: (inboundFriendly?.count ?? 0) > 0
              ? { count: inboundFriendly!.count, earliestArrival: inboundFriendly!.earliestArrival }
              : null,
            inboundAttack: inboundAttacks[0]
              ? { arrivalTime: inboundAttacks[0].arrivalTime.toISOString() }
              : null,
          };
        }),
      );

      const totalRates = {
        mineraiPerHour: planetData.reduce((sum, p) => sum + p.mineraiPerHour, 0),
        siliciumPerHour: planetData.reduce((sum, p) => sum + p.siliciumPerHour, 0),
        hydrogenePerHour: planetData.reduce((sum, p) => sum + p.hydrogenePerHour, 0),
      };

      const [fleetCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(fleetEvents)
        .where(and(eq(fleetEvents.userId, userId), eq(fleetEvents.status, 'active')));

      const inboundAttackCount = planetData.filter(p => p.inboundAttack !== null).length;

      return {
        planets: planetData,
        totalRates,
        activeFleetCount: fleetCount?.count ?? 0,
        inboundAttackCount,
      };
    },
  };
}
