import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { fleetEvents, pveMissions, asteroidDeposits, userResearch, planets } from '@ogame-clone/db';
import { prospectionDuration, miningDuration, totalCargoCapacity, resolveBonus, computeSlagRate, computeMiningExtraction } from '@ogame-clone/game-engine';
import { BELT_POSITIONS } from '../../universe/universe.config.js';
import type { PhasedMissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult, PhaseResult } from '../fleet.types.js';
import { buildShipStatsMap, formatDuration } from '../fleet.types.js';

export class MineHandler implements PhasedMissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    const prospectorCount = input.ships['prospector'] ?? 0;
    if (prospectorCount === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La mission Miner nécessite au moins 1 prospecteur' });
    }
    if (!BELT_POSITIONS.includes(input.targetPosition as 8 | 16)) {
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
    const prospectMins = prospectionDuration(depositTotal);
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
    const centerLevel = await ctx.pveService.getMissionCenterLevel(fleetEvent.userId);
    const [research] = await ctx.db.select().from(userResearch).where(eq(userResearch.userId, fleetEvent.userId)).limit(1);
    const researchLevels: Record<string, number> = {};
    if (research) {
      for (const [key, value] of Object.entries(research)) {
        if (key !== 'userId' && typeof value === 'number') researchLevels[key] = value;
      }
    }
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);
    const cargoCapacity = totalCargoCapacity(fleetEvent.ships, shipStatsMap);
    const prospectorCount = fleetEvent.ships['prospector'] ?? 0;
    const bonusMultiplier = resolveBonus('mining_duration', null, researchLevels, config.bonuses);
    const mineMins = miningDuration(cargoCapacity, prospectorCount, bonusMultiplier);
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
    const centerLevel = await ctx.pveService.getMissionCenterLevel(fleetEvent.userId);
    const prospectorCount = ships['prospector'] ?? 0;
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);
    const cargoCapacity = totalCargoCapacity(ships, shipStatsMap);

    // Single slag rate per position
    const position = fleetEvent.targetPosition as 8 | 16;
    const slagKey = `slag_rate.pos${position}`;
    const baseSlagRate = Number(config.universe[slagKey] ?? 0);

    const [research] = await ctx.db.select().from(userResearch).where(eq(userResearch.userId, fleetEvent.userId)).limit(1);
    const refiningLevel = research?.deepSpaceRefining ?? 0;
    const slagRate = computeSlagRate(baseSlagRate, refiningLevel);

    // Fetch deposit remaining
    const [deposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const mineraiRemaining = deposit ? Number(deposit.mineraiRemaining) : 0;
    const siliciumRemaining = deposit ? Number(deposit.siliciumRemaining) : 0;
    const hydrogeneRemaining = deposit ? Number(deposit.hydrogeneRemaining) : 0;

    const extraction = computeMiningExtraction({
      centerLevel,
      nbProspectors: prospectorCount,
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
    const totalDuration = formatDuration(Date.now() - originalDeparture.getTime());

    // Fetch origin planet for coordinates
    const [originPlanet] = await ctx.db.select({
      galaxy: planets.galaxy,
      system: planets.system,
      position: planets.position,
      name: planets.name,
    }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);

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
    const researchLevels: Record<string, number> = {};
    if (research) {
      for (const [key, value] of Object.entries(research)) {
        if (key !== 'userId' && typeof value === 'number') researchLevels[key] = value;
      }
    }
    const durationBonus = resolveBonus('mining_duration', null, researchLevels, config.bonuses);
    if (durationBonus < 1) {
      technologies.push({
        name: 'mining_duration',
        level: null,
        bonusType: 'duration_reduction',
        description: `Duree de minage -${Math.round((1 - durationBonus) * 100)}%`,
      });
    }

    // Create system message
    let messageId: string | undefined;
    if (ctx.messageService) {
      const parts = [`Extraction terminee en ${coords}\n`];
      parts.push(`Duree totale : ${totalDuration}`);
      const resLines: string[] = [];
      if (cargo.minerai > 0) resLines.push(`Minerai: +${cargo.minerai.toLocaleString('fr-FR')}`);
      if (cargo.silicium > 0) resLines.push(`Silicium: +${cargo.silicium.toLocaleString('fr-FR')}`);
      if (cargo.hydrogene > 0) resLines.push(`Hydrogene: +${cargo.hydrogene.toLocaleString('fr-FR')}`);
      parts.push(resLines.join(' | '));
      if (slagRate > 0) {
        parts.push(`Pertes (scories) : ${Math.round(slagRate * 100)}%`);
      }
      const msg = await ctx.messageService.createSystemMessage(
        fleetEvent.userId,
        'mission',
        `Extraction terminee ${coords}`,
        parts.join('\n'),
      );
      messageId = msg.id;
    }

    // Create mission report
    if (ctx.reportService) {
      await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        pveMissionId: pveMissionId ?? undefined,
        messageId,
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
          slagRate,
          technologies,
        },
      });
    }

    return {
      scheduleReturn: true,
      cargo,
    };
  }
}
