import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { fleetEvents, planets, userResearch, discoveredBiomes, discoveredPositions } from '@exilium/db';
import { biomeDiscoveryProbability, scanDuration, seededRandom, coordinateSeed, generateBiomeCount, pickBiomes, pickPlanetTypeForPosition, calculateMaxTemp, type BiomeDefinition } from '@exilium/game-engine';
import type { PhasedMissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult, PhaseResult } from '../fleet.types.js';
import { findShipsByRole } from '../../../lib/config-helpers.js';

export class ExploreHandler implements PhasedMissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const config = await ctx.gameConfigService.getFullConfig();
    const explorerShips = findShipsByRole(config, 'exploration');
    const explorerCount = explorerShips.reduce((sum, def) => sum + (input.ships[def.id] ?? 0), 0);

    if (explorerCount === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "La mission Explorer nécessite au moins un vaisseau d'exploration" });
    }

    const [existing] = await ctx.db
      .select({ id: planets.id })
      .from(planets)
      .where(and(
        eq(planets.galaxy, input.targetGalaxy),
        eq(planets.system, input.targetSystem),
        eq(planets.position, input.targetPosition),
      ))
      .limit(1);

    if (existing) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "Impossible d'explorer une position déjà colonisée" });
    }

    const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
    if (beltPositions.includes(input.targetPosition)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "Impossible d'explorer une ceinture d'astéroïdes" });
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const config = await ctx.gameConfigService.getFullConfig();

    const [research] = await ctx.db.select().from(userResearch)
      .where(eq(userResearch.userId, fleetEvent.userId)).limit(1);
    const researchLevel = (research as any)?.planetaryExploration ?? 0;

    const scanMs = scanDuration(researchLevel) * 1000;
    const now = new Date();
    const scanEnd = new Date(now.getTime() + scanMs);

    const explorerShips = findShipsByRole(config, 'exploration');
    const explorerCount = explorerShips.reduce((sum, def) => sum + (fleetEvent.ships[def.id] ?? 0), 0);

    await ctx.db.update(fleetEvents).set({
      phase: 'exploring',
      departureTime: now,
      arrivalTime: scanEnd,
      metadata: { explorerCount, researchLevel },
    }).where(eq(fleetEvents.id, fleetEvent.id));

    return {
      scheduleReturn: false,
      schedulePhase: {
        jobName: 'explore-done',
        delayMs: scanMs,
      },
    };
  }

  async processPhase(phase: string, fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<PhaseResult> {
    if (phase !== 'explore-done') {
      throw new Error(`Unknown explore phase: ${phase}`);
    }

    const config = await ctx.gameConfigService.getFullConfig();
    const metadata = fleetEvent.metadata as { explorerCount: number; researchLevel: number } | null;
    const explorerCount = metadata?.explorerCount ?? 1;
    const researchLevel = metadata?.researchLevel ?? 0;

    // Mark this position as discovered for the player (regardless of biome roll outcome).
    // Upgrade to self-explored even if the position was previously acquired via a purchased report.
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

    const biomeCatalogue: BiomeDefinition[] = (config.biomes ?? []).map((b) => ({
      id: b.id,
      rarity: b.rarity,
      compatiblePlanetTypes: b.compatiblePlanetTypes as string[],
      effects: b.effects as Array<{ stat: string; modifier: number }>,
    }));

    if (biomeCatalogue.length === 0) {
      return this.createResult(fleetEvent, ctx, [], 0);
    }

    const maxTemp = calculateMaxTemp(fleetEvent.targetPosition, 0);
    const typeRng = seededRandom(coordinateSeed(fleetEvent.targetGalaxy, fleetEvent.targetSystem, fleetEvent.targetPosition) ^ 0x9E3779B9);
    const planetClassId = pickPlanetTypeForPosition(maxTemp, typeRng);

    const rng = seededRandom(coordinateSeed(fleetEvent.targetGalaxy, fleetEvent.targetSystem, fleetEvent.targetPosition));
    const biomeCount = generateBiomeCount(rng);
    const allBiomes = pickBiomes(biomeCatalogue, planetClassId, biomeCount, rng);

    const alreadyDiscovered = await ctx.db
      .select({ biomeId: discoveredBiomes.biomeId })
      .from(discoveredBiomes)
      .where(and(
        eq(discoveredBiomes.userId, fleetEvent.userId),
        eq(discoveredBiomes.galaxy, fleetEvent.targetGalaxy),
        eq(discoveredBiomes.system, fleetEvent.targetSystem),
        eq(discoveredBiomes.position, fleetEvent.targetPosition),
      ));

    const discoveredSet = new Set(alreadyDiscovered.map((d) => d.biomeId));
    const undiscovered = allBiomes.filter((b) => !discoveredSet.has(b.id));

    const newlyDiscovered: BiomeDefinition[] = [];
    for (const biome of undiscovered) {
      const prob = biomeDiscoveryProbability(explorerCount, researchLevel, biome.rarity);
      if (Math.random() < prob) {
        newlyDiscovered.push(biome);
      }
    }

    if (newlyDiscovered.length > 0) {
      await ctx.db.insert(discoveredBiomes).values(
        newlyDiscovered.map((b) => ({
          userId: fleetEvent.userId,
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
          biomeId: b.id,
        })),
      ).onConflictDoNothing();
    }

    const remaining = undiscovered.length - newlyDiscovered.length;
    return this.createResult(fleetEvent, ctx, newlyDiscovered, remaining);
  }

  private async createResult(
    fleetEvent: FleetEvent,
    ctx: MissionHandlerContext,
    discovered: BiomeDefinition[],
    remaining: number,
  ): Promise<PhaseResult> {
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    let reportId: string | undefined;

    if (ctx.reportService) {
      const config = await ctx.gameConfigService.getFullConfig();
      const biomeDetails = discovered.map((b) => {
        const full = (config.biomes ?? []).find((cb) => cb.id === b.id);
        return { id: b.id, name: full?.name ?? b.id, rarity: b.rarity, effects: b.effects };
      });

      const [originPlanet] = fleetEvent.originPlanetId
        ? await ctx.db.select({
            galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
          }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
        : [];

      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'explore',
        title: discovered.length > 0
          ? `Exploration réussie ${coords}`
          : `Exploration infructueuse ${coords}`,
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
        fleet: { ships: fleetEvent.ships, totalCargo: 0 },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result: {
          discovered: biomeDetails,
          discoveredCount: discovered.length,
          remaining,
        },
      });
      reportId = report.id;
    }

    return {
      scheduleReturn: true,
      cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
      reportId,
    };
  }
}
