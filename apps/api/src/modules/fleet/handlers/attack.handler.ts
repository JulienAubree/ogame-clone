import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, debrisFields, users } from '@exilium/db';
import { simulateCombat, totalCargoCapacity, computeFleetFP } from '@exilium/game-engine';
import type { CombatConfig, ShipCategory, CombatInput, RoundResult, UnitCombatStats, FPConfig } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap, buildShipCombatConfigs, buildShipCosts, getCombatMultipliers } from '../fleet.types.js';
import { publishNotification } from '../../notification/notification.publisher.js';

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
    const shipCombatConfigs = buildShipCombatConfigs(config);
    const shipCostsMap = buildShipCosts(config);
    const shipIdSet = new Set(Object.keys(config.ships));
    const defenseIdSet = new Set(Object.keys(config.defenses));

    // Inject flagship combat config if flagship is in the fleet
    if (ships['flagship'] && ships['flagship'] > 0 && ctx.flagshipService) {
      const flagship = await ctx.flagshipService.get(fleetEvent.userId);
      if (flagship) {
        shipStatsMap['flagship'] = {
          baseSpeed: flagship.baseSpeed,
          fuelConsumption: flagship.fuelConsumption,
          cargoCapacity: flagship.cargoCapacity,
          driveType: flagship.driveType as import('@exilium/game-engine').ShipStats['driveType'],
          miningExtraction: 0,
        };
        shipCombatConfigs['flagship'] = {
          shipType: 'flagship',
          categoryId: flagship.combatCategoryId ?? 'support',
          baseShield: flagship.shield,
          baseArmor: flagship.baseArmor ?? 0,
          baseHull: flagship.hull,
          baseWeaponDamage: flagship.weapons,
          baseShotCount: flagship.shotCount ?? 1,
        };
        shipCostsMap['flagship'] = { minerai: 0, silicium: 0 }; // No debris from flagship
        shipIdSet.add('flagship');
      }
    }

    // Build CombatConfig from universe config
    const categories: ShipCategory[] = [
      { id: 'light', name: 'Léger', targetable: true, targetOrder: 1 },
      { id: 'medium', name: 'Moyen', targetable: true, targetOrder: 2 },
      { id: 'heavy', name: 'Lourd', targetable: true, targetOrder: 3 },
      { id: 'support', name: 'Support', targetable: false, targetOrder: 4 },
    ];

    const combatConfig: CombatConfig = {
      maxRounds: Number(config.universe['combat_max_rounds']) || 4,
      debrisRatio: Number(config.universe['combat_debris_ratio']) || 0.3,
      defenseRepairRate: Number(config.universe['combat_defense_repair_rate']) || 0.7,
      pillageRatio: Number(config.universe['combat_pillage_ratio']) || 0.33,
      minDamagePerHit: Number(config.universe['combat_min_damage_per_hit']) || 1,
      researchBonusPerLevel: Number(config.universe['combat_research_bonus_per_level']) || 0.1,
      categories,
    };

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

    // Fetch attacker & defender usernames for combat reports
    const [[attackerUser], [defenderUser]] = await Promise.all([
      ctx.db.select({ username: users.username }).from(users).where(eq(users.id, fleetEvent.userId)).limit(1),
      ctx.db.select({ username: users.username }).from(users).where(eq(users.id, targetPlanet.userId)).limit(1),
    ]);
    const attackerUsername = attackerUser?.username ?? 'Inconnu';
    const defenderUsername = defenderUser?.username ?? 'Inconnu';
    const targetPlanetName = targetPlanet.name;

    const [defShips] = await ctx.db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
    const [defDefs] = await ctx.db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);

    const defenderFleet: Record<string, number> = {};
    const defenderDefenses: Record<string, number> = {};

    if (defShips) {
      for (const [key, val] of Object.entries(defShips)) {
        if (key === 'planetId') continue;
        if (typeof val === 'number' && val > 0) defenderFleet[key] = val;
      }
    }
    if (defDefs) {
      for (const [key, val] of Object.entries(defDefs)) {
        if (key === 'planetId') continue;
        if (typeof val === 'number' && val > 0) defenderDefenses[key] = val;
      }
    }

    // Compute talent contexts for combat bonuses
    const attackerTalentCtx = ctx.talentService
      ? await ctx.talentService.computeTalentContext(fleetEvent.userId)
      : {};
    const defenderTalentCtx = ctx.talentService
      ? await ctx.talentService.computeTalentContext(targetPlanet.userId, targetPlanet.id)
      : {};

    const attackerMultipliers = await getCombatMultipliers(ctx.db, fleetEvent.userId, config.bonuses, attackerTalentCtx);
    const defenderMultipliers = await getCombatMultipliers(ctx.db, targetPlanet.userId, config.bonuses, defenderTalentCtx);

    // Additional defense strength bonus (planet_bonus — only when flagship stationed)
    const defenseBonus = 1 + (defenderTalentCtx['defense_strength'] ?? 0);
    defenderMultipliers.weapons *= defenseBonus;
    defenderMultipliers.shielding *= defenseBonus;
    defenderMultipliers.armor *= defenseBonus;

    const hasDefenders = Object.values(defenderFleet).some(v => v > 0) ||
                         Object.values(defenderDefenses).some(v => v > 0);

    let outcome: 'attacker' | 'defender' | 'draw';
    let attackerLosses: Record<string, number> = {};
    let defenderLosses: Record<string, number> = {};
    let debris = { minerai: 0, silicium: 0 };
    let repairedDefenses: Record<string, number> = {};
    let roundCount = 0;
    let rounds: RoundResult[] = [];
    let result: ReturnType<typeof simulateCombat> | undefined;

    if (!hasDefenders) {
      outcome = 'attacker';
    } else {
      const combatInput: CombatInput = {
        attackerFleet: ships,
        defenderFleet,
        defenderDefenses,
        attackerMultipliers,
        defenderMultipliers,
        attackerTargetPriority: fleetEvent.targetPriority ?? 'light',
        defenderTargetPriority: 'light',
        combatConfig,
        shipConfigs: shipCombatConfigs,
        shipCosts: shipCostsMap,
        shipIds: shipIdSet,
        defenseIds: defenseIdSet,
      };
      result = simulateCombat(combatInput);
      outcome = result.outcome;
      attackerLosses = result.attackerLosses;
      defenderLosses = result.defenderLosses;
      debris = result.debris;
      repairedDefenses = result.repairedDefenses;
      roundCount = result.rounds.length;
      rounds = result.rounds;
    }

    // Apply attacker losses + handle flagship incapacitation
    const survivingShips: Record<string, number> = { ...ships };
    let flagshipDestroyed = false;
    for (const [type, lost] of Object.entries(attackerLosses)) {
      if (type === 'flagship' && (lost as number) > 0) {
        // Flagship is incapacitated, not destroyed — teleported to home planet
        if (ctx.flagshipService) {
          await ctx.flagshipService.incapacitate(fleetEvent.userId);
        }
        if (ctx.redis) {
          publishNotification(ctx.redis, fleetEvent.userId, {
            type: 'flagship-incapacitated',
            payload: { coords, mission: 'attack' },
          });
        }
        flagshipDestroyed = true;
        delete survivingShips['flagship'];
        continue;
      }
      survivingShips[type] = (survivingShips[type] ?? 0) - (lost as number);
      if (survivingShips[type] <= 0) delete survivingShips[type];
    }

    // Remove flagship from returning ships if destroyed (incapacitated)
    const returnShips = { ...survivingShips };
    if (flagshipDestroyed) {
      delete returnShips['flagship'];
    }

    // Apply defender ship losses
    if (defShips) {
      const shipUpdates: Record<string, number> = {};
      for (const [key, val] of Object.entries(defShips)) {
        if (key === 'planetId') continue;
        const lost = defenderLosses[key] ?? 0;
        if (lost > 0) shipUpdates[key] = (val as number) - lost;
      }
      if (Object.keys(shipUpdates).length > 0) {
        await ctx.db.update(planetShips).set(shipUpdates).where(eq(planetShips.planetId, targetPlanet.id));
      }
    }

    // Apply defender defense losses (minus repairs)
    if (defDefs) {
      const defUpdates: Record<string, number> = {};
      for (const [key, val] of Object.entries(defDefs)) {
        if (key === 'planetId') continue;
        const lost = defenderLosses[key] ?? 0;
        const repaired = repairedDefenses[key] ?? 0;
        const netLoss = lost - repaired;
        if (netLoss > 0) defUpdates[key] = (val as number) - netLoss;
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

        // Pillage: apply ratio (33% max) then talent protection (capped at 90%)
        const pillageProtection = 1 - Math.min(0.9, defenderTalentCtx['pillage_protection'] ?? 0);
        const ratio = combatConfig.pillageRatio;
        const availMinerai = Math.floor(Number(updatedPlanet.minerai) * ratio * pillageProtection);
        const availSilicium = Math.floor(Number(updatedPlanet.silicium) * ratio * pillageProtection);
        const availHydrogene = Math.floor(Number(updatedPlanet.hydrogene) * ratio * pillageProtection);

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

    // Fetch origin planet for report
    const [originPlanet] = await ctx.db.select({
      galaxy: planets.galaxy,
      system: planets.system,
      position: planets.position,
      name: planets.name,
    }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);

    // Compute FP for both sides
    const unitCombatStats: Record<string, UnitCombatStats> = {};
    for (const [id, ship] of Object.entries(config.ships)) {
      unitCombatStats[id] = { weapons: ship.weapons, shotCount: ship.shotCount ?? 1, shield: ship.shield, hull: ship.hull };
    }
    for (const [id, def] of Object.entries(config.defenses)) {
      unitCombatStats[id] = { weapons: def.weapons, shotCount: def.shotCount ?? 1, shield: def.shield, hull: def.hull };
    }
    // Include flagship in FP calculation if present
    if (shipCombatConfigs['flagship']) {
      const fc = shipCombatConfigs['flagship'];
      unitCombatStats['flagship'] = { weapons: fc.baseWeaponDamage, shotCount: fc.baseShotCount, shield: fc.baseShield, hull: fc.baseHull };
    }
    const fpConfig: FPConfig = {
      shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
      divisor: Number(config.universe.fp_divisor) || 100,
    };
    const attackerFP = computeFleetFP(ships, unitCombatStats, fpConfig);
    const defenderCombinedForFP: Record<string, number> = { ...defenderFleet, ...defenderDefenses };
    const defenderFP = computeFleetFP(defenderCombinedForFP, unitCombatStats, fpConfig);

    // Compute shots per round
    const shotsPerRound = rounds.map((round, i) => {
      const attFleet = i === 0 ? ships : rounds[i - 1].attackerShips;
      const defFleetRound = i === 0 ? { ...defenderFleet, ...defenderDefenses } : rounds[i - 1].defenderShips;
      const attShots = Object.entries(attFleet).reduce((sum, [id, count]) => {
        const sc = config.ships[id]?.shotCount ?? config.defenses[id]?.shotCount ?? 1;
        return sum + count * sc;
      }, 0);
      const defShots = Object.entries(defFleetRound).reduce((sum, [id, count]) => {
        const sc = config.ships[id]?.shotCount ?? config.defenses[id]?.shotCount ?? 1;
        return sum + count * sc;
      }, 0);
      return { attacker: attShots, defender: defShots };
    });

    // Create structured mission report
    const defenderOutcomeText = outcome === 'attacker' ? 'Défaite' :
                                outcome === 'defender' ? 'Victoire' : 'Match nul';

    let reportId: string | undefined;
    let defenderReportId: string | undefined;
    if (ctx.reportService) {
      const reportResult: Record<string, unknown> = {
        outcome,
        perspective: 'attacker' as const,
        attackerUsername,
        defenderUsername,
        targetPlanetName,
        roundCount,
        attackerFleet: ships,
        attackerLosses,
        attackerSurvivors: survivingShips,
        defenderFleet,
        defenderDefenses,
        defenderLosses,
        defenderSurvivors: (() => {
          const combined: Record<string, number> = { ...defenderFleet, ...defenderDefenses };
          const survivors: Record<string, number> = {};
          for (const [type, count] of Object.entries(combined)) {
            const remaining = count - (defenderLosses[type] ?? 0) + (repairedDefenses[type] ?? 0);
            if (remaining > 0) survivors[type] = remaining;
          }
          return survivors;
        })(),
        repairedDefenses,
        debris,
        rounds,
        // New combat stats
        attackerStats: result?.attackerStats,
        defenderStats: result?.defenderStats,
        attackerFP,
        defenderFP,
        shotsPerRound,
      };
      if (outcome === 'attacker') {
        reportResult.pillage = {
          minerai: pillagedMinerai,
          silicium: pillagedSilicium,
          hydrogene: pillagedHydrogene,
        };
      }
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'attack',
        title: `Rapport de combat ${coords} — ${outcomeText}`,
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
          ships,
          totalCargo: totalCargoCapacity(ships, shipStatsMap),
        },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result: reportResult,
      });
      reportId = report.id;
      const defenderReportResult = { ...reportResult, perspective: 'defender' as const };
      const defenderReport = await ctx.reportService.create({
        userId: targetPlanet.userId,
        missionType: 'attack',
        title: `Rapport de combat ${coords} — ${defenderOutcomeText}`,
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
        fleet: { ships: {}, totalCargo: 0 },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result: defenderReportResult,
      });
      defenderReportId = defenderReport.id;
    }

    // Hook: daily quest detection for PvP battle
    if (ctx.dailyQuestService) {
      await ctx.dailyQuestService.processEvent({
        type: 'pvp:battle_resolved',
        userId: fleetEvent.userId,
        payload: { role: 'attacker', result: outcome },
      }).catch(() => {});
    }

    // Hook: Exilium drop on PvP victory
    if (outcome === 'attacker' && ctx.exiliumService) {
      await ctx.exiliumService.tryDrop(fleetEvent.userId, 'pvp', {
        coords: `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`,
      }).catch(() => {});
    }

    const hasShips = Object.values(returnShips).some(v => v > 0);
    if (hasShips) {
      return {
        scheduleReturn: true,
        cargo: {
          minerai: mineraiCargo + pillagedMinerai,
          silicium: siliciumCargo + pillagedSilicium,
          hydrogene: hydrogeneCargo + pillagedHydrogene,
        },
        shipsAfterArrival: returnShips,
        reportId,
        defenderReportId,
        attackerUsername,
        defenderOutcomeText,
      };
    }

    // All ships destroyed — no return
    // Pass empty shipsAfterArrival so fleet.service doesn't call returnFromMission on destroyed flagship
    return { scheduleReturn: false, reportId, defenderReportId, shipsAfterArrival: returnShips, attackerUsername, defenderOutcomeText };
  }
}
