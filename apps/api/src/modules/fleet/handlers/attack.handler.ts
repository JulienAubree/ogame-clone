import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, debrisFields } from '@ogame-clone/db';
import { simulateCombat, totalCargoCapacity } from '@ogame-clone/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap, buildCombatStats, buildShipCosts, getCombatMultipliers, formatDuration } from '../fleet.types.js';

export class AttackHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const [targetCheck] = await ctx.db
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
    // userId is passed via the service's sendFleet caller, but we check via the originPlanetId owner
    // We need the userId from the caller context — get it from the origin planet
    const [originPlanet] = await ctx.db
      .select({ userId: planets.userId })
      .from(planets)
      .where(eq(planets.id, input.originPlanetId))
      .limit(1);
    if (targetCheck && originPlanet && targetCheck.userId === originPlanet.userId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous ne pouvez pas attaquer votre propre planète' });
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
    const combatStatsMap = buildCombatStats(config);
    const shipCostsMap = buildShipCosts(config);
    const shipIdSet = new Set(Object.keys(config.ships));
    const defenseIdSet = new Set(Object.keys(config.defenses));
    const debrisRatio = (config.universe['debrisRatio'] as number) ?? 0.3;

    const [targetPlanet] = await ctx.db
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

    if (!targetPlanet) {
      if (ctx.messageService) {
        await ctx.messageService.createSystemMessage(
          fleetEvent.userId,
          'combat',
          `Attaque ${coords}`,
          `Aucune planète trouvée à la position ${coords}. Votre flotte fait demi-tour.`,
        );
      }
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
      };
    }

    const [defShips] = await ctx.db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
    const [defDefs] = await ctx.db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);

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

    const attackerMultipliers = await getCombatMultipliers(ctx.db, fleetEvent.userId, config.bonuses);
    const defenderMultipliers = await getCombatMultipliers(ctx.db, targetPlanet.userId, config.bonuses);

    const hasDefenders = Object.values(defenderFleet).some(v => v > 0) ||
                         Object.values(defenderDefenses).some(v => v > 0);

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
        ships, defenderCombined, attackerMultipliers, defenderMultipliers,
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
        await ctx.db.update(planetShips).set(shipUpdates).where(eq(planetShips.planetId, targetPlanet.id));
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
        await ctx.db.update(planetDefenses).set(defUpdates).where(eq(planetDefenses.planetId, targetPlanet.id));
      }
    }

    // Create/accumulate debris field
    if (debris.minerai > 0 || debris.silicium > 0) {
      const [existingDebris] = await ctx.db
        .select()
        .from(debrisFields)
        .where(
          and(
            eq(debrisFields.galaxy, fleetEvent.targetGalaxy),
            eq(debrisFields.system, fleetEvent.targetSystem),
            eq(debrisFields.position, fleetEvent.targetPosition),
          ),
        )
        .limit(1);

      if (existingDebris) {
        await ctx.db
          .update(debrisFields)
          .set({
            minerai: String(Number(existingDebris.minerai) + debris.minerai),
            silicium: String(Number(existingDebris.silicium) + debris.silicium),
            updatedAt: new Date(),
          })
          .where(eq(debrisFields.id, existingDebris.id));
      } else {
        await ctx.db.insert(debrisFields).values({
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
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
        await ctx.resourceService.materializeResources(targetPlanet.id, targetPlanet.userId);
        const [updatedPlanet] = await ctx.db.select().from(planets).where(eq(planets.id, targetPlanet.id)).limit(1);

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

        await ctx.db
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

    const duration = formatDuration(fleetEvent.arrivalTime.getTime() - fleetEvent.departureTime.getTime());
    const reportBody = `Combat ${coords} — ${outcomeText}\n\n` +
      `Durée du trajet : ${duration}\n` +
      `Rounds : ${roundCount}\n` +
      `Pertes attaquant : ${JSON.stringify(attackerLosses)}\n` +
      `Pertes défenseur : ${JSON.stringify(defenderLosses)}\n` +
      `Défenses réparées : ${JSON.stringify(repairedDefenses)}\n` +
      `Débris : ${debris.minerai} minerai, ${debris.silicium} silicium\n` +
      (outcome === 'attacker' ?
        `Pillage : ${pillagedMinerai} minerai, ${pillagedSilicium} silicium, ${pillagedHydrogene} hydrogène\n` : '');

    if (ctx.messageService) {
      await ctx.messageService.createSystemMessage(
        fleetEvent.userId,
        'combat',
        `Rapport de combat ${coords} — ${outcomeText}`,
        reportBody,
      );
      await ctx.messageService.createSystemMessage(
        targetPlanet.userId,
        'combat',
        `Rapport de combat ${coords} — ${outcome === 'attacker' ? 'Défaite' : outcome === 'defender' ? 'Victoire' : 'Match nul'}`,
        reportBody,
      );
    }

    const hasShips = Object.values(survivingShips).some(v => v > 0);
    if (hasShips) {
      return {
        scheduleReturn: true,
        cargo: {
          minerai: mineraiCargo + pillagedMinerai,
          silicium: siliciumCargo + pillagedSilicium,
          hydrogene: hydrogeneCargo + pillagedHydrogene,
        },
        shipsAfterArrival: survivingShips,
      };
    }

    // All ships destroyed — no return
    return { scheduleReturn: false };
  }
}
