import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { fleetEvents, pveMissions, asteroidDeposits, userResearch, planets } from '@exilium/db';
import { prospectionDuration, miningDuration, totalCargoCapacity, totalMiningExtraction, resolveBonus, computeSlagRate, computeMiningExtraction } from '@exilium/game-engine';
import type { PhasedMissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult, PhaseResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';
import { findShipsByRole } from '../../../lib/config-helpers.js';

export class MineHandler implements PhasedMissionHandler {
  async validateFleet(input: SendFleetInput, config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const fullConfig = await ctx.gameConfigService.getFullConfig();
    const miningShips = findShipsByRole(fullConfig, 'mining');
    const miningCount = miningShips.reduce((sum, def) => sum + (input.ships[def.id] ?? 0), 0);
    const hasFlagship = (input.ships['flagship'] ?? 0) > 0;
    if (miningCount === 0 && !hasFlagship) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La mission Miner nécessite au moins 1 vaisseau minier ou le vaisseau amiral' });
    }
    const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
    if (!beltPositions.includes(input.targetPosition)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Les missions de minage ciblent uniquement les ceintures d\'astéroïdes (positions 8 ou 16)' });
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const pveMissionId = fleetEvent.pveMissionId;
    const mission = pveMissionId
      ? await ctx.db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
      : null;

    if (!mission || !ctx.pveService || !ctx.asteroidBeltService) {
      return {
        scheduleReturn: true,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
      };
    }

    // Transition to prospecting phase
    const params = mission.parameters as { depositId: string };
    const [deposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const depositTotal = deposit
      ? Number(deposit.mineraiTotal) + Number(deposit.siliciumTotal) + Number(deposit.hydrogeneTotal)
      : 0;
    const talentCtxProspect = ctx.talentService ? await ctx.talentService.computeTalentContext(fleetEvent.userId) : {};
    const prospectBonus = 1 + (talentCtxProspect['prospection_speed'] ?? 0);
    const prospectMins = prospectionDuration(depositTotal) / prospectBonus;
    const prospectMs = prospectMins * 60 * 1000;

    const now = new Date();
    const prospectArrival = new Date(now.getTime() + prospectMs);

    await ctx.db.update(fleetEvents).set({
      phase: 'prospecting',
      departureTime: now,
      arrivalTime: prospectArrival,
      metadata: { ...(fleetEvent.metadata as Record<string, unknown> ?? {}), originalDepartureTime: fleetEvent.departureTime.toISOString() },
    }).where(eq(fleetEvents.id, fleetEvent.id));

    return {
      scheduleReturn: false,
      schedulePhase: {
        jobName: 'prospect-done',
        delayMs: prospectMs,
      },
    };
  }

  async processPhase(phase: string, fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<PhaseResult> {
    if (phase === 'prospect-done') {
      return this.processProspectDone(fleetEvent, ctx);
    }
    if (phase === 'mine-done') {
      return this.processMineDone(fleetEvent, ctx);
    }
    throw new Error(`Unknown mine phase: ${phase}`);
  }

  private async processProspectDone(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<PhaseResult> {
    const pveMissionId = fleetEvent.pveMissionId;
    const mission = pveMissionId
      ? await ctx.db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
      : null;

    if (!mission || !ctx.pveService) {
      return { scheduleReturn: true };
    }

    // Transition to mining phase
    const [research] = await ctx.db.select().from(userResearch).where(eq(userResearch.userId, fleetEvent.userId)).limit(1);
    const researchLevels: Record<string, number> = {};
    if (research) {
      for (const [key, value] of Object.entries(research)) {
        if (key !== 'userId' && typeof value === 'number') researchLevels[key] = value;
      }
    }
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);

    // Inject flagship stats if present in mining fleet
    if (fleetEvent.ships['flagship'] && fleetEvent.ships['flagship'] > 0 && ctx.flagshipService) {
      const flagship = await ctx.flagshipService.get(fleetEvent.userId);
      if (flagship) {
        const fs = 'effectiveStats' in flagship ? (flagship as any).effectiveStats : null;
        const effectiveCargo = fs?.cargoCapacity ?? flagship.cargoCapacity;
        const hullConfig = flagship.hullId ? config.hulls[flagship.hullId] : null;
        const hullAbilities = ((hullConfig as any)?.abilities ?? []) as Array<{ miningExtractionEqualsCargo?: boolean }>;
        const hasMiningExtraction = hullAbilities.some(a => a.miningExtractionEqualsCargo);
        shipStatsMap['flagship'] = {
          baseSpeed: fs?.baseSpeed ?? flagship.baseSpeed,
          fuelConsumption: fs?.fuelConsumption ?? flagship.fuelConsumption,
          cargoCapacity: effectiveCargo,
          driveType: (fs?.driveType ?? flagship.driveType) as import('@exilium/game-engine').ShipStats['driveType'],
          miningExtraction: hasMiningExtraction ? effectiveCargo : 0,
        };
      }
    }

    const cargoCapacity = totalCargoCapacity(fleetEvent.ships, shipStatsMap);
    const baseFleetExtr = totalMiningExtraction(fleetEvent.ships, shipStatsMap);
    const extractionMultiplier = resolveBonus('mining_extraction', null, researchLevels, config.bonuses);
    const fleetExtr = Math.floor(baseFleetExtr * extractionMultiplier);
    const talentCtx = ctx.talentService ? await ctx.talentService.computeTalentContext(fleetEvent.userId) : {};
    const miningSpeedBonus = 1 + (talentCtx['mining_speed'] ?? 0);
    const mineMins = miningDuration(cargoCapacity, fleetExtr, 1 / miningSpeedBonus);
    const mineMs = mineMins * 60 * 1000;

    const now = new Date();
    const mineArrival = new Date(now.getTime() + mineMs);

    await ctx.db.update(fleetEvents).set({
      phase: 'mining',
      departureTime: now,
      arrivalTime: mineArrival,
    }).where(eq(fleetEvents.id, fleetEvent.id));

    return {
      scheduleNextPhase: {
        jobName: 'mine-done',
        delayMs: mineMs,
      },
    };
  }

  private async processMineDone(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<PhaseResult> {
    const ships = fleetEvent.ships;
    const pveMissionId = fleetEvent.pveMissionId;
    const mission = pveMissionId
      ? await ctx.db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
      : null;

    if (!mission || !ctx.pveService || !ctx.asteroidBeltService) {
      return {
        scheduleReturn: true,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
      };
    }

    const params = mission.parameters as { depositId: string };
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);

    // Inject flagship stats if present in mining fleet
    if (ships['flagship'] && ships['flagship'] > 0 && ctx.flagshipService) {
      const flagship = await ctx.flagshipService.get(fleetEvent.userId);
      if (flagship) {
        const fs = 'effectiveStats' in flagship ? (flagship as any).effectiveStats : null;
        const effectiveCargo = fs?.cargoCapacity ?? flagship.cargoCapacity;
        const hullConfig = flagship.hullId ? config.hulls[flagship.hullId] : null;
        const hullAbilities = ((hullConfig as any)?.abilities ?? []) as Array<{ miningExtractionEqualsCargo?: boolean }>;
        const hasMiningExtraction = hullAbilities.some(a => a.miningExtractionEqualsCargo);
        shipStatsMap['flagship'] = {
          baseSpeed: fs?.baseSpeed ?? flagship.baseSpeed,
          fuelConsumption: fs?.fuelConsumption ?? flagship.fuelConsumption,
          cargoCapacity: effectiveCargo,
          driveType: (fs?.driveType ?? flagship.driveType) as import('@exilium/game-engine').ShipStats['driveType'],
          miningExtraction: hasMiningExtraction ? effectiveCargo : 0,
        };
      }
    }

    const cargoCapacity = totalCargoCapacity(ships, shipStatsMap);
    const baseFleetExtr = totalMiningExtraction(ships, shipStatsMap);

    // Single slag rate
    const baseSlagRate = Number(config.universe.slag_rate ?? 0.5);

    const [research] = await ctx.db.select().from(userResearch).where(eq(userResearch.userId, fleetEvent.userId)).limit(1);
    const refiningLevel = research?.deepSpaceRefining ?? 0;
    const slagRate = computeSlagRate(baseSlagRate, refiningLevel);

    // Apply rock fracturing extraction bonus
    const researchLevelsForExtraction: Record<string, number> = {};
    if (research) {
      for (const [key, value] of Object.entries(research)) {
        if (key !== 'userId' && typeof value === 'number') researchLevelsForExtraction[key] = value;
      }
    }
    const extractionMultiplier = resolveBonus('mining_extraction', null, researchLevelsForExtraction, config.bonuses);
    const fleetExtr = Math.floor(baseFleetExtr * extractionMultiplier);

    // Fetch deposit remaining
    const [deposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const mineraiRemaining = deposit ? Number(deposit.mineraiRemaining) : 0;
    const siliciumRemaining = deposit ? Number(deposit.siliciumRemaining) : 0;
    const hydrogeneRemaining = deposit ? Number(deposit.hydrogeneRemaining) : 0;

    const extraction = computeMiningExtraction({
      fleetExtraction: fleetExtr,
      cargoCapacity,
      mineraiRemaining,
      siliciumRemaining,
      hydrogeneRemaining,
      slagRate,
    });

    // Atomic extraction — returns actual deducted amounts
    const actualLoss = await ctx.asteroidBeltService.extractFromDeposit(params.depositId, extraction.depositLoss);

    // Recompute playerReceives from actual loss (handles concurrent access)
    const cargo = {
      minerai: slagRate > 0 ? Math.floor(actualLoss.minerai * (1 - slagRate)) : actualLoss.minerai,
      silicium: slagRate > 0 ? Math.floor(actualLoss.silicium * (1 - slagRate)) : actualLoss.silicium,
      hydrogene: slagRate > 0 ? Math.floor(actualLoss.hydrogene * (1 - slagRate)) : actualLoss.hydrogene,
    };

    await ctx.db.update(fleetEvents).set({
      mineraiCargo: String(cargo.minerai),
      siliciumCargo: String(cargo.silicium),
      hydrogeneCargo: String(cargo.hydrogene),
    }).where(eq(fleetEvents.id, fleetEvent.id));

    // Complete mission only when deposit is fully empty
    const [updatedDeposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const totalRemaining = updatedDeposit
      ? Number(updatedDeposit.mineraiRemaining) + Number(updatedDeposit.siliciumRemaining) + Number(updatedDeposit.hydrogeneRemaining)
      : 0;
    if (totalRemaining <= 0) {
      await ctx.pveService.completeMission(mission.id);
    }

    // Build report data
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const meta = fleetEvent.metadata as { originalDepartureTime?: string } | null;
    const originalDeparture = meta?.originalDepartureTime ? new Date(meta.originalDepartureTime) : fleetEvent.departureTime;

    // Fetch origin planet for coordinates
    const [originPlanet] = fleetEvent.originPlanetId
      ? await ctx.db.select({
          galaxy: planets.galaxy,
          system: planets.system,
          position: planets.position,
          name: planets.name,
        }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
      : [];

    // Collect technologies that influenced the result
    // Note: `config` and `shipStatsMap` are already in scope from extraction logic above
    const technologies: Array<{ name: string; level: number | null; bonusType: string; description: string }> = [];
    if (refiningLevel > 0) {
      technologies.push({
        name: 'deepSpaceRefining',
        level: refiningLevel,
        bonusType: 'slag_reduction',
        description: `Scories reduites a ${Math.round(slagRate * 100)}%`,
      });
    }
    if (extractionMultiplier > 1) {
      technologies.push({
        name: 'mining_extraction',
        level: null,
        bonusType: 'extraction_bonus',
        description: `Extraction +${Math.round((extractionMultiplier - 1) * 100)}%`,
      });
    }

    // Create mission report
    let reportId: string | undefined;
    if (ctx.reportService) {
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        pveMissionId: pveMissionId ?? undefined,
        missionType: 'mine',
        title: `Rapport de minage ${coords}`,
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
        fleet: {
          ships: ships,
          totalCargo: totalCargoCapacity(ships, shipStatsMap),
        },
        departureTime: originalDeparture,
        completionTime: new Date(),
        result: {
          rewards: cargo,
          grossMined: actualLoss,
          slagRate,
          fleetExtraction: fleetExtr,
          cargoCapacity,
          technologies,
        },
      });
      reportId = report.id;
    }

    return {
      scheduleReturn: true,
      cargo,
      reportId,
    };
  }
}
