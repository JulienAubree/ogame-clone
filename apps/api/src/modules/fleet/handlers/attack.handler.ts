import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, planetBuildings, userResearch } from '@exilium/db';
import { simulateCombat, totalCargoCapacity, calculateShieldCapacity, calculateProtectedResources } from '@exilium/game-engine';
import type { CombatInput, RoundResult } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap, buildShipCombatConfigs, buildShipCosts } from '../fleet.types.js';
import { publishNotification } from '../../notification/notification.publisher.js';
import {
  buildCombatConfig,
  parseUnitRow,
  computeCombatMultipliers,
  applyDefenderLosses,
  upsertDebris,
  computeBothFP,
  computeShotsPerRound,
  fetchUsernames,
  buildCombatReportData,
  outcomeText,
  defenderOutcome,
} from '../combat.helpers.js';

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
        const fs = 'effectiveStats' in flagship ? (flagship as any).effectiveStats : null;
        shipStatsMap['flagship'] = {
          baseSpeed: fs?.baseSpeed ?? flagship.baseSpeed,
          fuelConsumption: fs?.fuelConsumption ?? flagship.fuelConsumption,
          cargoCapacity: fs?.cargoCapacity ?? flagship.cargoCapacity,
          driveType: (fs?.driveType ?? flagship.driveType) as import('@exilium/game-engine').ShipStats['driveType'],
          miningExtraction: 0,
        };
        shipCombatConfigs['flagship'] = {
          shipType: 'flagship',
          categoryId: flagship.combatCategoryId ?? 'support',
          baseShield: fs?.shield ?? flagship.shield,
          baseArmor: fs?.baseArmor ?? flagship.baseArmor ?? 0,
          baseHull: fs?.hull ?? flagship.hull,
          baseWeaponDamage: fs?.weapons ?? flagship.weapons,
          baseShotCount: fs?.shotCount ?? flagship.shotCount ?? 1,
        };
        shipCostsMap['flagship'] = { minerai: 0, silicium: 0 }; // No debris from flagship
        shipIdSet.add('flagship');
      }
    }

    // Override defense unit categories so they are targeted after the planetary shield
    for (const defId of defenseIdSet) {
      if (shipCombatConfigs[defId]) {
        shipCombatConfigs[defId] = { ...shipCombatConfigs[defId], categoryId: 'defense' };
      }
    }

    const combatConfig = buildCombatConfig(config.universe);

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
        const [originPlanet] = fleetEvent.originPlanetId
          ? await ctx.db.select({
              galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
            }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
          : [];
        const report = await ctx.reportService.create({
          userId: fleetEvent.userId,
          fleetEventId: fleetEvent.id,
          missionType: 'attack',
          title: `Attaque ${coords} — Avortée`,
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
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        reportId,
      };
    }

    const { attackerUsername, defenderUsername } = await fetchUsernames(ctx.db, fleetEvent.userId, targetPlanet.userId);
    const targetPlanetName = targetPlanet.name;

    const [defShipsRow] = await ctx.db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
    if (!defShipsRow) await ctx.db.insert(planetShips).values({ planetId: targetPlanet.id }).onConflictDoNothing();
    const [defDefsRow] = await ctx.db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);
    if (!defDefsRow) await ctx.db.insert(planetDefenses).values({ planetId: targetPlanet.id }).onConflictDoNothing();

    const defenderFleet = parseUnitRow(defShipsRow);
    const defenderDefenses = parseUnitRow(defDefsRow);
    console.log(`[attack] planet=${targetPlanet.id} defDefsRow=${defDefsRow ? JSON.stringify(defDefsRow) : 'MISSING'} defenderDefenses=${JSON.stringify(defenderDefenses)}`);

    const [shieldBuilding] = await ctx.db
      .select({ level: planetBuildings.level })
      .from(planetBuildings)
      .where(and(
        eq(planetBuildings.planetId, targetPlanet.id),
        eq(planetBuildings.buildingId, 'planetaryShield'),
      ))
      .limit(1);
    const shieldLevel = shieldBuilding?.level ?? 0;
    const shieldPercent = (targetPlanet as any).shieldPercent ?? 100;
    const planetaryShieldCapacity = shieldLevel > 0
      ? Math.floor(calculateShieldCapacity(shieldLevel) * (shieldPercent / 100))
      : 0;

    const { attackerMultipliers, defenderMultipliers, defenderTalentCtx } = await computeCombatMultipliers(
      ctx, config, fleetEvent.userId, targetPlanet.userId, targetPlanet.id,
    );

    const hasDefenders = Object.values(defenderFleet).some(v => v > 0) ||
                         Object.values(defenderDefenses).some(v => v > 0);

    let outcome: 'attacker' | 'defender' | 'draw';
    let attackerLosses: Record<string, number> = {};
    let defenderLosses: Record<string, number> = {};
    let debris = { minerai: 0, silicium: 0 };
    let repairedDefenses: Record<string, number> = {};
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
        planetaryShieldCapacity,
        detailedLog: true,
      };
      result = simulateCombat(combatInput);
      outcome = result.outcome;
      attackerLosses = result.attackerLosses;
      defenderLosses = result.defenderLosses;
      debris = result.debris;
      repairedDefenses = result.repairedDefenses;
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

    await applyDefenderLosses(ctx.db, targetPlanet.id, defShipsRow, defDefsRow, defenderLosses, repairedDefenses);

    await upsertDebris(ctx.db, fleetEvent.targetGalaxy, fleetEvent.targetSystem, fleetEvent.targetPosition, debris);

    // Pillage resources if attacker wins
    let pillagedMinerai = 0;
    let pillagedSilicium = 0;
    let pillagedHydrogene = 0;
    let protectedResources = { minerai: 0, silicium: 0, hydrogene: 0 };

    if (outcome === 'attacker') {
      const remainingCargoCapacity = totalCargoCapacity(survivingShips, shipStatsMap);
      const availableCargo = remainingCargoCapacity - mineraiCargo - siliciumCargo - hydrogeneCargo;

      if (availableCargo > 0) {
        await ctx.resourceService.materializeResources(targetPlanet.id, targetPlanet.userId);
        const [updatedPlanet] = await ctx.db.select().from(planets).where(eq(planets.id, targetPlanet.id)).limit(1);

        // Armored storage: calculate protected resources
        const defenderBuildingLevels = await ctx.resourceService.getBuildingLevels(targetPlanet.id);

        const findBuildingIdByRole = (buildings: Record<string, any>, role: string): string | undefined =>
          Object.entries(buildings).find(([, b]) => (b as any).role === role)?.[0];

        const storageMineraiId = findBuildingIdByRole(config.buildings, 'storage_minerai');
        const storageSiliciumId = findBuildingIdByRole(config.buildings, 'storage_silicium');
        const storageHydrogeneId = findBuildingIdByRole(config.buildings, 'storage_hydrogene');

        const [defenderResearchRow] = await ctx.db
          .select()
          .from(userResearch)
          .where(eq(userResearch.userId, targetPlanet.userId))
          .limit(1);

        const defenderResearchLevels: Record<string, number> = {};
        if (defenderResearchRow) {
          for (const [key, rDef] of Object.entries(config.research)) {
            defenderResearchLevels[key] = (defenderResearchRow[rDef.levelColumn as keyof typeof defenderResearchRow] ?? 0) as number;
          }
        }

        const baseRatio = Number(config.universe['protected_storage_base_ratio']) || 0.05;
        const storageConfig = config.universe['storage_config'] as
          { storageBase: number; coeffA: number; coeffB: number; coeffC: number } | undefined;

        protectedResources = calculateProtectedResources(
          {
            storageMineraiLevel: storageMineraiId ? (defenderBuildingLevels[storageMineraiId] ?? 0) : 0,
            storageSiliciumLevel: storageSiliciumId ? (defenderBuildingLevels[storageSiliciumId] ?? 0) : 0,
            storageHydrogeneLevel: storageHydrogeneId ? (defenderBuildingLevels[storageHydrogeneId] ?? 0) : 0,
            minerai: Number(updatedPlanet.minerai),
            silicium: Number(updatedPlanet.silicium),
            hydrogene: Number(updatedPlanet.hydrogene),
          },
          baseRatio,
          defenderResearchLevels,
          config.bonuses,
          storageConfig,
          defenderTalentCtx,
        );

        // Pillage: subtract protected resources, apply ratio (33% max) then talent protection (capped at 90%)
        const pillageProtection = 1 - Math.min(0.9, defenderTalentCtx['pillage_protection'] ?? 0);
        const ratio = combatConfig.pillageRatio;
        const availMinerai = Math.floor(Math.max(0, Number(updatedPlanet.minerai) - protectedResources.minerai) * ratio * pillageProtection);
        const availSilicium = Math.floor(Math.max(0, Number(updatedPlanet.silicium) - protectedResources.silicium) * ratio * pillageProtection);
        const availHydrogene = Math.floor(Math.max(0, Number(updatedPlanet.hydrogene) - protectedResources.hydrogene) * ratio * pillageProtection);

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

    // Fetch origin planet for report
    const [originPlanet] = fleetEvent.originPlanetId
      ? await ctx.db.select({
          galaxy: planets.galaxy,
          system: planets.system,
          position: planets.position,
          name: planets.name,
        }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
      : [];

    // Compute FP for both sides
    const { attackerFP, defenderFP } = computeBothFP(config, ships, defenderFleet, defenderDefenses, shipCombatConfigs);

    // Compute shots per round
    const shotsPerRound = computeShotsPerRound(config, ships, defenderFleet, defenderDefenses, rounds);

    let reportId: string | undefined;
    let defenderReportId: string | undefined;
    if (ctx.reportService) {
      const reportResult = buildCombatReportData({
        outcome,
        attackerUsername,
        defenderUsername,
        targetPlanetName,
        attackerFleet: ships,
        defenderFleet,
        defenderDefenses,
        attackerLosses,
        defenderLosses,
        attackerSurvivors: survivingShips,
        repairedDefenses,
        debris,
        rounds,
        attackerStats: result?.attackerStats,
        defenderStats: result?.defenderStats,
        attackerFP,
        defenderFP,
        shotsPerRound,
      });
      if (outcome === 'attacker') {
        reportResult.pillage = {
          minerai: pillagedMinerai,
          silicium: pillagedSilicium,
          hydrogene: pillagedHydrogene,
        };
        reportResult.protectedResources = {
          minerai: protectedResources.minerai,
          silicium: protectedResources.silicium,
          hydrogene: protectedResources.hydrogene,
        };
      }
      if (planetaryShieldCapacity > 0) {
        reportResult.planetaryShield = { level: shieldLevel, capacity: planetaryShieldCapacity };
      }
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'attack',
        title: `Rapport de combat ${coords} — ${outcomeText(outcome)}`,
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
        detailedLog: (result?.detailedLog as unknown as Record<string, unknown>) ?? null,
      });
      reportId = report.id;
      const defenderReportResult = { ...reportResult, perspective: 'defender' as const };
      const defenderReport = await ctx.reportService.create({
        userId: targetPlanet.userId,
        missionType: 'attack',
        title: `Rapport de combat ${coords} — ${defenderOutcome(outcome)}`,
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
        detailedLog: (result?.detailedLog as unknown as Record<string, unknown>) ?? null,
      });
      defenderReportId = defenderReport.id;
    }

    // Hook: daily quest detection for PvP battle
    if (ctx.dailyQuestService) {
      await ctx.dailyQuestService.processEvent({
        type: 'pvp:battle_resolved',
        userId: fleetEvent.userId,
        payload: { role: 'attacker', result: outcome },
      }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
    }

    // Hook: Exilium drop on PvP victory
    if (outcome === 'attacker' && ctx.exiliumService) {
      await ctx.exiliumService.tryDrop(fleetEvent.userId, 'pvp', {
        coords: `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`,
      }).catch((e) => console.warn('[exilium-drop] tryDrop failed:', e));
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
        defenderOutcomeText: defenderOutcome(outcome),
      };
    }

    // All ships destroyed — no return
    // Pass empty shipsAfterArrival so fleet.service doesn't call returnFromMission on destroyed flagship
    return { scheduleReturn: false, reportId, defenderReportId, shipsAfterArrival: returnShips, attackerUsername, defenderOutcomeText: defenderOutcome(outcome) };
  }
}
