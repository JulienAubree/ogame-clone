import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, planetBuildings, userResearch, users, debrisFields } from '@exilium/db';
import { calculateSpyReport, calculateDetectionChance, totalCargoCapacity, simulateCombat, computeFleetFP } from '@exilium/game-engine';
import type { Database } from '@exilium/db';
import type { CombatConfig, ShipCategory, CombatInput, RoundResult, UnitCombatStats, FPConfig } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap, buildShipCombatConfigs, buildShipCosts, getCombatMultipliers } from '../fleet.types.js';
import { findShipByRole } from '../../../lib/config-helpers.js';
import { publishNotification } from '../../notification/notification.publisher.js';

export class SpyHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const config = await ctx.gameConfigService.getFullConfig();
    const probeDef = findShipByRole(config, 'probe');
    for (const [shipType, count] of Object.entries(input.ships)) {
      if (count > 0 && shipType !== probeDef.id && shipType !== 'flagship') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seules les sondes d\'espionnage peuvent être envoyées en mission espionnage' });
      }
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const ships = fleetEvent.ships;
    const config = await ctx.gameConfigService.getFullConfig();
    const probeDef = findShipByRole(config, 'probe');
    const probeCount = ships[probeDef.id] ?? 0;
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;

    const attackerTech = await this.getEspionageTech(ctx.db, fleetEvent.userId);

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
      let reportId: string | undefined;
      if (ctx.reportService) {
        const shipStatsMap = buildShipStatsMap(config);
        const [originPlanet] = await ctx.db.select({
          galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
        }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);
        const report = await ctx.reportService.create({
          userId: fleetEvent.userId,
          fleetEventId: fleetEvent.id,
          missionType: 'spy',
          title: `Espionnage ${coords} — Avortée`,
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
          result: { aborted: true, reason: 'no_planet' },
        });
        reportId = report.id;
      }
      return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 }, reportId };
    }

    const defenderTech = await this.getEspionageTech(ctx.db, targetPlanet.userId);
    const spyThresholds = (config.universe['spy_visibility_thresholds'] as number[] | undefined) ?? [1, 3, 5, 7, 9];
    const visibility = calculateSpyReport(probeCount, attackerTech, defenderTech, spyThresholds);
    const detectionConfig = {
      probeMultiplier: Number(config.universe['spy_probe_multiplier']) || 2,
      techMultiplier: Number(config.universe['spy_tech_multiplier']) || 4,
    };
    const detectionChance = calculateDetectionChance(probeCount, attackerTech, defenderTech, detectionConfig);
    const detected = Math.random() * 100 < detectionChance;

    // Collect structured data for report
    const reportResult: Record<string, unknown> = {
      visibility,
      probeCount,
      attackerTech,
      defenderTech,
      detectionChance,
      detected,
    };

    if (visibility.resources) {
      await ctx.resourceService.materializeResources(targetPlanet.id, targetPlanet.userId);
      const [planet] = await ctx.db.select().from(planets).where(eq(planets.id, targetPlanet.id)).limit(1);
      const resources = {
        minerai: Math.floor(Number(planet.minerai)),
        silicium: Math.floor(Number(planet.silicium)),
        hydrogene: Math.floor(Number(planet.hydrogene)),
      };
      reportResult.resources = resources;
    }

    if (visibility.fleet) {
      const [targetShips] = await ctx.db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
      if (targetShips) {
        const fleetData: Record<string, number> = {};
        for (const [key, val] of Object.entries(targetShips)) {
          if (key === 'planetId') continue;
          if (typeof val === 'number' && val > 0) {
            fleetData[key] = val;
          }
        }
        reportResult.fleet = fleetData;
      }
    }

    if (visibility.defenses) {
      const [defs] = await ctx.db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);
      if (defs) {
        const defensesData: Record<string, number> = {};
        for (const [key, val] of Object.entries(defs)) {
          if (key === 'planetId') continue;
          if (typeof val === 'number' && val > 0) {
            defensesData[key] = val;
          }
        }
        reportResult.defenses = defensesData;
      }
    }

    if (visibility.buildings) {
      const bRows = await ctx.db.select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
        .from(planetBuildings).where(eq(planetBuildings.planetId, targetPlanet.id));
      const buildingsData: Record<string, number> = {};
      for (const row of bRows) {
        if (row.level > 0) {
          buildingsData[row.buildingId] = row.level;
        }
      }
      reportResult.buildings = buildingsData;
    }

    if (visibility.research) {
      const [research] = await ctx.db.select().from(userResearch).where(eq(userResearch.userId, targetPlanet.userId)).limit(1);
      if (research) {
        const researchData: Record<string, number> = {};
        for (const [key, val] of Object.entries(research)) {
          if (key === 'userId') continue;
          if (typeof val === 'number' && val > 0) {
            researchData[key] = val;
          }
        }
        reportResult.research = researchData;
      }
    }

    // Fetch origin planet for report
    const [originPlanet] = await ctx.db.select({
      galaxy: planets.galaxy,
      system: planets.system,
      position: planets.position,
      name: planets.name,
    }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);

    // Create structured mission report
    let reportId: string | undefined;
    if (ctx.reportService) {
      const config = await ctx.gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'spy',
        title: `Rapport d'espionnage ${coords}`,
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
    }

    if (detected) {
      // Fetch defender's defenses and ships
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

      const hasDefenders = Object.values(defenderFleet).some(v => v > 0) ||
                           Object.values(defenderDefenses).some(v => v > 0);

      // If no defenders exist, probes pass through despite detection
      if (!hasDefenders) {
        return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 }, reportId };
      }

      // --- Combat setup ---
      const shipStatsMapCombat = buildShipStatsMap(config);
      const shipCombatConfigs = buildShipCombatConfigs(config);
      const shipCostsMap = buildShipCosts(config);
      const shipIdSet = new Set(Object.keys(config.ships));
      const defenseIdSet = new Set(Object.keys(config.defenses));

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
        pillageRatio: 0, // No pillage for spy combat
        minDamagePerHit: Number(config.universe['combat_min_damage_per_hit']) || 1,
        researchBonusPerLevel: Number(config.universe['combat_research_bonus_per_level']) || 0.1,
        categories,
      };

      // Combat multipliers
      const attackerTalentCtx = ctx.talentService
        ? await ctx.talentService.computeTalentContext(fleetEvent.userId)
        : {};
      const defenderTalentCtx = ctx.talentService
        ? await ctx.talentService.computeTalentContext(targetPlanet.userId, targetPlanet.id)
        : {};

      const attackerMultipliers = await getCombatMultipliers(ctx.db, fleetEvent.userId, config.bonuses, attackerTalentCtx);
      const defenderMultipliers = await getCombatMultipliers(ctx.db, targetPlanet.userId, config.bonuses, defenderTalentCtx);

      // Defense strength bonus
      const defenseBonus = 1 + (defenderTalentCtx['defense_strength'] ?? 0);
      defenderMultipliers.weapons *= defenseBonus;
      defenderMultipliers.shielding *= defenseBonus;
      defenderMultipliers.armor *= defenseBonus;

      // Run combat simulation
      const combatInput: CombatInput = {
        attackerFleet: ships,
        defenderFleet,
        defenderDefenses,
        attackerMultipliers,
        defenderMultipliers,
        attackerTargetPriority: 'light',
        defenderTargetPriority: 'light',
        combatConfig,
        shipConfigs: shipCombatConfigs,
        shipCosts: shipCostsMap,
        shipIds: shipIdSet,
        defenseIds: defenseIdSet,
      };
      const combatResult = simulateCombat(combatInput);
      const { outcome, attackerLosses, defenderLosses, debris, repairedDefenses, rounds } = combatResult;

      // Apply attacker losses (probes)
      const survivingShips: Record<string, number> = { ...ships };
      for (const [type, lost] of Object.entries(attackerLosses)) {
        survivingShips[type] = (survivingShips[type] ?? 0) - (lost as number);
        if (survivingShips[type] <= 0) delete survivingShips[type];
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

      // Compute FP for both sides
      const unitCombatStats: Record<string, UnitCombatStats> = {};
      for (const [id, ship] of Object.entries(config.ships)) {
        unitCombatStats[id] = { weapons: ship.weapons, shotCount: ship.shotCount ?? 1, shield: ship.shield, hull: ship.hull };
      }
      for (const [id, def] of Object.entries(config.defenses)) {
        unitCombatStats[id] = { weapons: def.weapons, shotCount: def.shotCount ?? 1, shield: def.shield, hull: def.hull };
      }
      const fpConfig: FPConfig = {
        shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
        divisor: Number(config.universe.fp_divisor) || 100,
      };
      const attackerFP = computeFleetFP(ships, unitCombatStats, fpConfig);
      const defenderCombinedForFP: Record<string, number> = { ...defenderFleet, ...defenderDefenses };
      const defenderFP = computeFleetFP(defenderCombinedForFP, unitCombatStats, fpConfig);

      // Compute shots per round
      const shotsPerRound = rounds.map((round: RoundResult, i: number) => {
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

      // Fetch usernames for combat reports
      const [[attackerUser], [defenderUser]] = await Promise.all([
        ctx.db.select({ username: users.username }).from(users).where(eq(users.id, fleetEvent.userId)).limit(1),
        ctx.db.select({ username: users.username }).from(users).where(eq(users.id, targetPlanet.userId)).limit(1),
      ]);
      const attackerUsername = attackerUser?.username ?? 'Inconnu';
      const defenderUsername = defenderUser?.username ?? 'Inconnu';
      const targetPlanetName = targetPlanet.name;

      const outcomeText = outcome === 'attacker' ? 'Victoire' :
                          outcome === 'defender' ? 'Défaite' : 'Match nul';
      const defenderOutcomeText = outcome === 'attacker' ? 'Défaite' :
                                  outcome === 'defender' ? 'Victoire' : 'Match nul';

      const probesSurvived = Object.values(survivingShips).some(v => v > 0);

      // Create combat reports for both sides
      let combatReportId: string | undefined;
      let defenderReportId: string | undefined;
      if (ctx.reportService) {
        const combatReportResult: Record<string, unknown> = {
          outcome,
          perspective: 'attacker' as const,
          attackerUsername,
          defenderUsername,
          targetPlanetName,
          roundCount: rounds.length,
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
          attackerStats: combatResult.attackerStats,
          defenderStats: combatResult.defenderStats,
          attackerFP,
          defenderFP,
          shotsPerRound,
          spyCombat: true,
        };

        const attackerReport = await ctx.reportService.create({
          userId: fleetEvent.userId,
          fleetEventId: fleetEvent.id,
          missionType: 'spy',
          title: `Espionnage ${coords} — Combat ${outcomeText}`,
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
            totalCargo: totalCargoCapacity(ships, shipStatsMapCombat),
          },
          departureTime: fleetEvent.departureTime,
          completionTime: fleetEvent.arrivalTime,
          result: combatReportResult,
        });
        combatReportId = attackerReport.id;

        const defenderReportResult = { ...combatReportResult, perspective: 'defender' as const };
        const defenderReport = await ctx.reportService.create({
          userId: targetPlanet.userId,
          missionType: 'spy',
          title: `Espionnage détecté ${coords} — ${defenderOutcomeText}`,
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

      // Notify defender
      if (ctx.redis) {
        publishNotification(ctx.redis, targetPlanet.userId, {
          type: 'fleet-attack-landed',
          payload: { coords, mission: 'spy' },
        });
      }

      if (probesSurvived) {
        // Probes survived — return with spy report
        return {
          scheduleReturn: true,
          cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
          shipsAfterArrival: survivingShips,
          reportId,
          defenderReportId,
          attackerUsername,
          defenderOutcomeText,
        };
      } else {
        // Probes destroyed — delete spy report (probes couldn't transmit data)
        if (reportId && ctx.reportService) {
          await ctx.reportService.deleteReport(fleetEvent.userId, reportId);
        }
        return {
          scheduleReturn: false,
          shipsAfterArrival: {},
          reportId: combatReportId,
          defenderReportId,
          attackerUsername,
          defenderOutcomeText,
        };
      }
    }

    return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 }, reportId };
  }

  private async getEspionageTech(db: Database, userId: string): Promise<number> {
    const [research] = await db
      .select({ espionageTech: userResearch.espionageTech })
      .from(userResearch)
      .where(eq(userResearch.userId, userId))
      .limit(1);

    return research?.espionageTech ?? 0;
  }
}
