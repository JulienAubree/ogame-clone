import { eq } from 'drizzle-orm';
import { fleetEvents, pveMissions } from '@ogame-clone/db';
import { totalCargoCapacity } from '@ogame-clone/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap, getCombatTechs } from '../fleet.types.js';

export class PirateHandler implements MissionHandler {
  async validateFleet(_input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    // No pirate-specific validation (initiated via PvE system)
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const ships = fleetEvent.ships;
    const pveMissionId = fleetEvent.pveMissionId;
    const mission = pveMissionId
      ? await ctx.db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
      : null;

    if (!mission || !ctx.pveService || !ctx.pirateService) {
      return {
        scheduleReturn: true,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
      };
    }

    const params = mission.parameters as { templateId: string };
    const playerTechs = await getCombatTechs(ctx.db, fleetEvent.userId);

    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);
    const preCargoCapacity = totalCargoCapacity(ships, shipStatsMap);
    const result = await ctx.pirateService.processPirateArrival(
      ships, playerTechs, params.templateId, preCargoCapacity,
    );

    // Re-cap loot to surviving fleet's actual cargo capacity
    if (result.outcome === 'attacker') {
      const survivingCargo = totalCargoCapacity(result.survivingShips, shipStatsMap);
      const totalLoot = result.loot.minerai + result.loot.silicium + result.loot.hydrogene;
      if (totalLoot > survivingCargo) {
        const ratio = survivingCargo / totalLoot;
        result.loot.minerai = Math.floor(result.loot.minerai * ratio);
        result.loot.silicium = Math.floor(result.loot.silicium * ratio);
        result.loot.hydrogene = Math.floor(result.loot.hydrogene * ratio);
      }
    }

    // Update fleet event with combat results
    await ctx.db.update(fleetEvents).set({
      ships: result.survivingShips,
      mineraiCargo: String(result.loot.minerai),
      siliciumCargo: String(result.loot.silicium),
      hydrogeneCargo: String(result.loot.hydrogene),
      metadata: Object.keys(result.bonusShips).length > 0
        ? { bonusShips: result.bonusShips }
        : null,
    }).where(eq(fleetEvents.id, fleetEvent.id));

    // Complete PvE mission at arrival (not return)
    await ctx.pveService.completeMission(mission.id);

    return {
      scheduleReturn: true,
      cargo: {
        minerai: result.loot.minerai,
        silicium: result.loot.silicium,
        hydrogene: result.loot.hydrogene,
      },
      shipsAfterArrival: result.survivingShips,
    };
  }
}
