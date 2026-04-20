import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, fleetEvents, planetBiomes, discoveredBiomes, discoveredPositions } from '@exilium/db';
import { calculateMaxTemp, calculateMinTemp, calculateDiameter, totalCargoCapacity, seededRandom, coordinateSeed, generateBiomeCount, pickBiomes, pickPlanetTypeForPosition, calculateColonizationDifficulty, type BiomeDefinition } from '@exilium/game-engine';
import { getRandomPlanetImageIndex } from '../../../lib/planet-image.util.js';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';
import { findShipsByRole, findPlanetTypeByRole } from '../../../lib/config-helpers.js';

export class ColonizeHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const config = await ctx.gameConfigService.getFullConfig();
    const allowedIds = new Set(findShipsByRole(config, 'colonization').map((s) => s.id));
    for (const [shipType, count] of Object.entries(input.ships)) {
      if (count > 0 && !allowedIds.has(shipType) && shipType !== 'flagship') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seuls les vaisseaux de colonisation peuvent être envoyés en mission colonisation' });
      }
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const ships = fleetEvent.ships;
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;

    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);
    const homeworldType = findPlanetTypeByRole(config, 'homeworld');
    const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];

    const createColonizeReport = async (title: string, result: Record<string, unknown>) => {
      if (!ctx.reportService) return undefined;
      const [originPlanet] = fleetEvent.originPlanetId
        ? await ctx.db.select({
            galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
          }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
        : [];
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'colonize',
        title,
        coordinates: {
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
        },
        originCoordinates: originPlanet ? {
          galaxy: originPlanet.galaxy,
          system: originPlanet.system,
          position: originPlanet.position,
          planetName: originPlanet.name,
        } : undefined,
        fleet: { ships, totalCargo: totalCargoCapacity(ships, shipStatsMap) },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result,
      });
      return report.id;
    };

    // Check if position is an asteroid belt
    if (beltPositions.includes(fleetEvent.targetPosition)) {
      const reportId = await createColonizeReport(
        `Colonisation échouée ${coords}`,
        { success: false, reason: 'asteroid_belt' },
      );
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        reportId,
      };
    }

    // Check if position is free
    const [existing] = await ctx.db
      .select()
      .from(planets)
      .where(
        and(
          eq(planets.galaxy, fleetEvent.targetGalaxy),
          eq(planets.system, fleetEvent.targetSystem),
          eq(planets.position, fleetEvent.targetPosition),
        ),
      )
      .limit(1);

    if (existing) {
      const reportId = await createColonizeReport(
        `Colonisation échouée ${coords}`,
        { success: false, reason: 'occupied' },
      );
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        reportId,
      };
    }

    // Compute sortOrder for the new colony (max existing + 1)
    const userPlanets = await ctx.db
      .select({ sortOrder: planets.sortOrder })
      .from(planets)
      .where(eq(planets.userId, fleetEvent.userId));
    const maxSortOrder = userPlanets.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0);
    const newSortOrder = maxSortOrder + 1;

    // Success: create new planet — use seeded temperature-weighted picker (consistent with galaxy view)
    const maxTemp = calculateMaxTemp(fleetEvent.targetPosition, 0);
    const typeRng = seededRandom(coordinateSeed(fleetEvent.targetGalaxy, fleetEvent.targetSystem, fleetEvent.targetPosition) ^ 0x9E3779B9);
    const planetClassId = pickPlanetTypeForPosition(maxTemp, typeRng);
    const planetTypeForPos = config.planetTypes.find((pt) => pt.id === planetClassId) ?? null;
    const minTemp = calculateMinTemp(maxTemp);

    let diameter: number;
    if (planetTypeForPos) {
      const { diameterMin, diameterMax } = planetTypeForPos;
      diameter = Math.floor(diameterMin + (diameterMax - diameterMin) * Math.random());
    } else {
      diameter = calculateDiameter(fleetEvent.targetPosition, Math.random());
    }
    const planetImageIndex = getRandomPlanetImageIndex(planetTypeForPos?.id ?? homeworldType.id, ctx.assetsDir);

    const [newPlanet] = await ctx.db
      .insert(planets)
      .values({
        userId: fleetEvent.userId,
        name: 'Colonie',
        galaxy: fleetEvent.targetGalaxy,
        system: fleetEvent.targetSystem,
        position: fleetEvent.targetPosition,
        planetType: 'planet',
        planetClassId: planetTypeForPos?.id ?? null,
        diameter,
        minTemp,
        maxTemp,
        planetImageIndex,
        sortOrder: newSortOrder,
        status: 'colonizing',
      })
      .returning();

    await ctx.db.insert(planetShips).values({ planetId: newPlanet.id });
    await ctx.db.insert(planetDefenses).values({ planetId: newPlanet.id });

    // Generate and persist biomes for the new colony
    const biomeCatalogue: BiomeDefinition[] = (config.biomes ?? []).map((b: any) => ({
      id: b.id,
      rarity: b.rarity,
      compatiblePlanetTypes: b.compatiblePlanetTypes as string[],
      effects: b.effects as Array<{ stat: string; modifier: number }>,
    }));

    let pickedBiomes: BiomeDefinition[] = [];
    if (biomeCatalogue.length > 0 && planetTypeForPos) {
      const seed = coordinateSeed(fleetEvent.targetGalaxy, fleetEvent.targetSystem, fleetEvent.targetPosition);
      const rng = seededRandom(seed);
      const biomeCount = generateBiomeCount(rng);
      pickedBiomes = pickBiomes(biomeCatalogue, planetTypeForPos.id, biomeCount, rng);

      if (pickedBiomes.length > 0) {
        // Cross with player's discovered biomes to set the active flag
        const discoveredBiomeIds = new Set(
          (await ctx.db
            .select({ biomeId: discoveredBiomes.biomeId })
            .from(discoveredBiomes)
            .where(
              and(
                eq(discoveredBiomes.userId, fleetEvent.userId),
                eq(discoveredBiomes.galaxy, fleetEvent.targetGalaxy),
                eq(discoveredBiomes.system, fleetEvent.targetSystem),
                eq(discoveredBiomes.position, fleetEvent.targetPosition),
              ),
            )
          ).map(r => r.biomeId),
        );

        await ctx.db.insert(planetBiomes).values(
          pickedBiomes.map(b => ({
            planetId: newPlanet.id,
            biomeId: b.id,
            active: discoveredBiomeIds.has(b.id),
          })),
        );
      }
    }

    // Auto-discover all biomes for the colonizer
    if (pickedBiomes.length > 0) {
      await ctx.db.insert(discoveredBiomes).values(
        pickedBiomes.map((b) => ({
          userId: fleetEvent.userId,
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
          biomeId: b.id,
        })),
      ).onConflictDoNothing();
    }

    // Mark the colonized position as discovered (and self-explored) for the colonizer.
    // Upgrade any pre-existing purchased discovery to self-explored.
    await ctx.db.insert(discoveredPositions).values({
      userId: fleetEvent.userId,
      galaxy: fleetEvent.targetGalaxy,
      system: fleetEvent.targetSystem,
      position: fleetEvent.targetPosition,
      selfExplored: true,
    }).onConflictDoUpdate({
      target: [discoveredPositions.userId, discoveredPositions.galaxy, discoveredPositions.system, discoveredPositions.position],
      set: { selfExplored: true },
    });

    // Transfer cargo to the new planet
    if (mineraiCargo > 0 || siliciumCargo > 0 || hydrogeneCargo > 0) {
      await ctx.db
        .update(planets)
        .set({
          minerai: sql`${planets.minerai} + ${mineraiCargo}`,
          silicium: sql`${planets.silicium} + ${siliciumCargo}`,
          hydrogene: sql`${planets.hydrogene} + ${hydrogeneCargo}`,
        })
        .where(eq(planets.id, newPlanet.id));
    }

    // Calculate colonization difficulty
    const [homeworld] = await ctx.db.select({ system: planets.system }).from(planets)
      .where(and(eq(planets.userId, fleetEvent.userId), eq(planets.planetClassId, 'homeworld')))
      .limit(1);

    const config2 = await ctx.gameConfigService.getFullConfig();
    const difficultyMap: Record<string, number> = {};
    for (const key of Object.keys(config2.universe)) {
      if (key.startsWith('colonization_difficulty_')) {
        difficultyMap[key.replace('colonization_difficulty_', '')] = Number(config2.universe[key]);
      }
    }
    const distancePenaltyPerHop = Number(config2.universe.colonization_distance_penalty_per_hop) || 0.01;
    const distanceFloor = Number(config2.universe.colonization_distance_floor) || 0.90;
    const difficulty = calculateColonizationDifficulty(
      planetTypeForPos?.id ?? 'temperate',
      homeworld?.system ?? fleetEvent.targetSystem,
      fleetEvent.targetSystem,
      difficultyMap,
      distancePenaltyPerHop,
      distanceFloor,
    );

    // If the colony ship's cargo already meets outpost thresholds, establish it immediately
    const { minerai: thresholdMinerai, silicium: thresholdSilicium } =
      await ctx.colonizationService!.getOutpostThresholds(fleetEvent.userId);
    const outpostEstablished =
      mineraiCargo >= thresholdMinerai && siliciumCargo >= thresholdSilicium;

    if (!fleetEvent.originPlanetId) {
      throw new Error(`[colonize] originPlanetId is null for fleet event ${fleetEvent.id} — cannot start colonization process`);
    }
    // Start colonization process (colony ship consumed when process reaches 100%)
    await ctx.colonizationService!.startProcess(
      newPlanet.id,
      fleetEvent.userId,
      fleetEvent.originPlanetId,
      difficulty,
      outpostEstablished,
    );

    // Mark original event completed
    await ctx.db
      .update(fleetEvents)
      .set({ status: 'completed' })
      .where(eq(fleetEvents.id, fleetEvent.id));

    const reportId = await createColonizeReport(
      `Colonisation lancée ${coords}`,
      { success: true, colonizing: true, planetId: newPlanet.id, difficulty },
    );

    return { scheduleReturn: false, reportId };
  }
}
