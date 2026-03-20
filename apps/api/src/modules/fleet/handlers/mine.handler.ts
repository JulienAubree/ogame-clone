import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { fleetEvents, pveMissions, asteroidDeposits, userResearch } from '@ogame-clone/db';
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
    const params = mission.parameters as { depositId: string; resourceType: string };
    const [deposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const depositTotal = deposit ? Number(deposit.totalQuantity) : 0;
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
    const bonusMultiplier = resolveBonus('mining_duration', null, researchLevels, config.bonuses);
    const mineMins = miningDuration(centerLevel, bonusMultiplier);
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

    // Extract resources with slag
    const params = mission.parameters as { depositId: string; resourceType: string };
    const centerLevel = await ctx.pveService.getMissionCenterLevel(fleetEvent.userId);
    const prospectorCount = ships['prospector'] ?? 0;
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);
    const cargoCapacity = totalCargoCapacity(ships, shipStatsMap);

    // Get slag rate from config
    const position = fleetEvent.targetPosition as 8 | 16;
    const slagKey = `slag_rate.pos${position}.${params.resourceType}`;
    const baseSlagRate = Number(config.universe[slagKey] ?? 0);

    // Get refining level
    const [research] = await ctx.db.select().from(userResearch).where(eq(userResearch.userId, fleetEvent.userId)).limit(1);
    const refiningLevel = research?.deepSpaceRefining ?? 0;
    const slagRate = computeSlagRate(baseSlagRate, refiningLevel);

    // Compute extraction with slag
    const [deposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const depositRemaining = deposit ? Number(deposit.remainingQuantity) : 0;
    const extraction = computeMiningExtraction({
      centerLevel,
      nbProspectors: prospectorCount,
      cargoCapacity,
      depositRemaining,
      slagRate,
    });

    // extractFromDeposit handles atomicity — derive playerReceives from actual extracted
    const actualDeducted = await ctx.asteroidBeltService.extractFromDeposit(params.depositId, extraction.depositLoss);
    const playerReceives = slagRate > 0
      ? Math.floor(actualDeducted * (1 - slagRate))
      : actualDeducted;

    const cargo = { minerai: 0, silicium: 0, hydrogene: 0 };
    if (playerReceives > 0) {
      cargo[params.resourceType as keyof typeof cargo] = playerReceives;
    }

    await ctx.db.update(fleetEvents).set({
      mineraiCargo: String(cargo.minerai),
      siliciumCargo: String(cargo.silicium),
      hydrogeneCargo: String(cargo.hydrogene),
    }).where(eq(fleetEvents.id, fleetEvent.id));

    await ctx.pveService.completeMission(mission.id);

    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const meta = fleetEvent.metadata as { originalDepartureTime?: string } | null;
    const originalDeparture = meta?.originalDepartureTime ? new Date(meta.originalDepartureTime) : fleetEvent.departureTime;
    const totalDuration = formatDuration(Date.now() - originalDeparture.getTime());

    if (ctx.messageService) {
      const parts = [`Extraction terminée en ${coords}\n`];
      parts.push(`Durée totale : ${totalDuration}`);
      parts.push(`Ressource extraite : ${playerReceives} ${params.resourceType}`);
      if (slagRate > 0) {
        const slagPct = Math.round(slagRate * 100);
        const slagLost = actualDeducted - playerReceives;
        parts.push(`Scories : ${slagPct}% — ${slagLost} tonnes perdues`);
      }
      await ctx.messageService.createSystemMessage(
        fleetEvent.userId,
        'mission',
        `Extraction terminée ${coords}`,
        parts.join('\n'),
      );
    }

    return {
      scheduleReturn: true,
      cargo,
    };
  }
}
