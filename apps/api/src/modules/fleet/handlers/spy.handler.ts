import { eq, and, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, planetBuildings, userResearch, flagships, flagshipTalents, allianceMembers, alliances } from '@exilium/db';
import { calculateSpyReport, calculateDetectionChance, totalCargoCapacity, simulateCombat } from '@exilium/game-engine';
import type { Database } from '@exilium/db';
import type { CombatInput } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap, buildShipCombatConfigs, buildShipCosts } from '../fleet.types.js';
import { findShipByRole, findShipsByRole } from '../../../lib/config-helpers.js';
import { publishNotification } from '../../notification/notification.publisher.js';
import {
  buildCombatConfig,
  parseUnitRow,
  computeCombatMultipliers,
  computeAttackerSurvivors,
  applyDefenderLosses,
  upsertDebris,
  computeBothFP,
  computeShotsPerRound,
  fetchUsernames,
  buildCombatReportData,
  outcomeText,
  defenderOutcome,
} from '../combat.helpers.js';

async function emitEspionageAllianceLogs(
  ctx: MissionHandlerContext,
  args: {
    spyUserId: string;
    targetUserId: string;
    spyName: string;
    targetName: string;
    targetPlanetName: string;
    coords: string;
    reportId: string;
  },
): Promise<void> {
  if (!ctx.allianceLogService) return;

  const membershipRows = await ctx.db
    .select({
      userId: allianceMembers.userId,
      allianceId: allianceMembers.allianceId,
      allianceTag: alliances.tag,
    })
    .from(allianceMembers)
    .innerJoin(alliances, eq(alliances.id, allianceMembers.allianceId))
    .where(inArray(allianceMembers.userId, [args.spyUserId, args.targetUserId]));

  const byUser = new Map(membershipRows.map((r) => [r.userId, r]));
  const spyAlliance = byUser.get(args.spyUserId);
  const targetAlliance = byUser.get(args.targetUserId);

  if (spyAlliance) {
    await ctx.allianceLogService.add({
      allianceId: spyAlliance.allianceId,
      visibility: 'all',
      payload: {
        type: 'espionage.outgoing',
        memberId: args.spyUserId,
        memberName: args.spyName,
        targetId: args.targetUserId,
        targetName: args.targetName,
        targetAllianceTag: targetAlliance?.allianceTag,
        planetName: args.targetPlanetName,
        coords: args.coords,
        reportId: args.reportId,
      },
    });
  }

  if (targetAlliance) {
    await ctx.allianceLogService.add({
      allianceId: targetAlliance.allianceId,
      visibility: 'all',
      payload: {
        type: 'espionage.incoming',
        memberId: args.targetUserId,
        memberName: args.targetName,
        planetName: args.targetPlanetName,
        coords: args.coords,
        spyId: args.spyUserId,
        spyName: args.spyName,
        spyAllianceTag: spyAlliance?.allianceTag,
        reportId: args.reportId,
      },
    });
  }
}

export class SpyHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const config = await ctx.gameConfigService.getFullConfig();
    const allowedIds = new Set(findShipsByRole(config, 'espionage').map((s) => s.id));
    for (const [shipType, count] of Object.entries(input.ships)) {
      if (count > 0 && !allowedIds.has(shipType) && shipType !== 'flagship') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seules les sondes d\'espionnage peuvent être envoyées en mission espionnage' });
      }
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const ships = fleetEvent.ships;
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);
    const probeDef = findShipByRole(config, 'espionage');
    const probeCount = ships[probeDef.id] ?? 0;
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;

    let attackerTech = await this.getEspionageTech(ctx.db, fleetEvent.userId);

    // Scan mission bonus: scientific hull probe gets +N espionage
    const meta = fleetEvent.metadata as Record<string, unknown> | null;
    if (meta?.scanMission && typeof meta.espionageBonus === 'number') {
      attackerTech += meta.espionageBonus;
    }

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

    // Fetch ships & defenses once — reused for visibility report AND combat
    const [targetShipsRow] = await ctx.db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
    const [targetDefsRow] = await ctx.db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);

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

    if (visibility.fleet && targetShipsRow) {
      const fleetData: Record<string, number> = {};
      for (const [key, val] of Object.entries(targetShipsRow)) {
        if (key === 'planetId') continue;
        if (typeof val === 'number' && val > 0) {
          fleetData[key] = val;
        }
      }
      reportResult.fleet = fleetData;

      // Check if defender's flagship is stationed on this planet (with talent bonuses)
      const [defenderFlagship] = await ctx.db
        .select()
        .from(flagships)
        .where(
          and(
            eq(flagships.userId, targetPlanet.userId),
            eq(flagships.planetId, targetPlanet.id),
            eq(flagships.status, 'active'),
          ),
        )
        .limit(1);

      if (defenderFlagship) {
        // Compute talent stat bonuses
        const talentRows = await ctx.db
          .select({ talentId: flagshipTalents.talentId, currentRank: flagshipTalents.currentRank })
          .from(flagshipTalents)
          .where(eq(flagshipTalents.flagshipId, defenderFlagship.id));

        let bonusWeapons = 0, bonusShield = 0, bonusHull = 0, bonusCargo = 0;
        for (const row of talentRows) {
          if (row.currentRank <= 0) continue;
          const def = config.talents[row.talentId];
          if (!def || def.effectType !== 'modify_stat') continue;
          const params = def.effectParams as { stat: string; perRank: number };
          const bonus = params.perRank * row.currentRank;
          if (params.stat === 'weapons') bonusWeapons += bonus;
          else if (params.stat === 'shield') bonusShield += bonus;
          else if (params.stat === 'hull') bonusHull += bonus;
          else if (params.stat === 'cargoCapacity') bonusCargo += bonus;
        }

        // Apply hull passive bonuses
        const hullConfig = defenderFlagship.hullId ? (config.hulls?.[defenderFlagship.hullId] ?? null) : null;
        if (hullConfig) {
          bonusWeapons += (hullConfig.passiveBonuses?.bonus_weapons ?? 0);
        }

        reportResult.flagship = {
          name: defenderFlagship.name,
          weapons: defenderFlagship.weapons + bonusWeapons,
          shield: defenderFlagship.shield + bonusShield,
          hull: defenderFlagship.hull + bonusHull,
          cargoCapacity: defenderFlagship.cargoCapacity + bonusCargo,
        };
      }
    }

    if (visibility.defenses && targetDefsRow) {
      const defensesData: Record<string, number> = {};
      for (const [key, val] of Object.entries(targetDefsRow)) {
        if (key === 'planetId') continue;
        if (typeof val === 'number' && val > 0) {
          defensesData[key] = val;
        }
      }
      reportResult.defenses = defensesData;
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
    const [originPlanet] = fleetEvent.originPlanetId
      ? await ctx.db.select({
          galaxy: planets.galaxy,
          system: planets.system,
          position: planets.position,
          name: planets.name,
        }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
      : [];

    // Create structured mission report
    let reportId: string | undefined;
    if (ctx.reportService) {
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

    if (detected && reportId && ctx.allianceLogService) {
      const { attackerUsername: spyUsername, defenderUsername } = await fetchUsernames(ctx.db, fleetEvent.userId, targetPlanet.userId);
      await emitEspionageAllianceLogs(ctx, {
        spyUserId: fleetEvent.userId,
        targetUserId: targetPlanet.userId,
        spyName: spyUsername,
        targetName: defenderUsername,
        targetPlanetName: targetPlanet.name,
        coords: `${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}`,
        reportId,
      });
    }

    if (detected) {
      // Build defender maps from already-fetched rows
      const defenderFleet = parseUnitRow(targetShipsRow);
      const defenderDefenses = parseUnitRow(targetDefsRow);

      const hasDefenders = Object.values(defenderFleet).some(v => v > 0) ||
                           Object.values(defenderDefenses).some(v => v > 0);

      // If no defenders exist, probes pass through despite detection
      if (!hasDefenders) {
        return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 }, reportId };
      }

      // --- Combat setup ---
      const shipCombatConfigs = buildShipCombatConfigs(config);
      const shipCostsMap = buildShipCosts(config);
      const shipIdSet = new Set(Object.keys(config.ships));
      const defenseIdSet = new Set(Object.keys(config.defenses));

      const combatConfig = buildCombatConfig(config.universe, { pillageRatio: 0 });

      // Combat multipliers
      const { attackerMultipliers, defenderMultipliers } = await computeCombatMultipliers(
        ctx, config, fleetEvent.userId, targetPlanet.userId, targetPlanet.id,
      );

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
      const survivingShips = computeAttackerSurvivors(ships, attackerLosses);

      // Apply defender losses (ships + defenses)
      await applyDefenderLosses(ctx.db, targetPlanet.id, targetShipsRow, targetDefsRow, defenderLosses, repairedDefenses);

      // Create/accumulate debris field (atomic upsert)
      await upsertDebris(ctx.db, fleetEvent.targetGalaxy, fleetEvent.targetSystem, fleetEvent.targetPosition, debris);

      // Compute FP for both sides
      const { attackerFP, defenderFP } = computeBothFP(config, ships, defenderFleet, defenderDefenses, shipCombatConfigs);

      // Compute shots per round
      const shotsPerRound = computeShotsPerRound(config, ships, defenderFleet, defenderDefenses, rounds);

      // Fetch usernames for combat reports
      const { attackerUsername, defenderUsername } = await fetchUsernames(ctx.db, fleetEvent.userId, targetPlanet.userId);

      const outcomeLabel = outcomeText(outcome);
      const defenderOutcomeText = defenderOutcome(outcome);

      const probesSurvived = Object.values(survivingShips).some(v => v > 0);

      // Create combat reports for both sides
      let combatReportId: string | undefined;
      let defenderReportId: string | undefined;
      if (ctx.reportService) {
        const combatReportResult = buildCombatReportData({
          outcome,
          attackerUsername,
          defenderUsername,
          targetPlanetName: targetPlanet.name,
          attackerFleet: ships,
          defenderFleet,
          defenderDefenses,
          attackerLosses,
          defenderLosses,
          attackerSurvivors: survivingShips,
          repairedDefenses,
          debris,
          rounds,
          attackerStats: combatResult.attackerStats,
          defenderStats: combatResult.defenderStats,
          attackerFP,
          defenderFP,
          shotsPerRound,
          extra: { spyCombat: true },
        });

        const attackerReport = await ctx.reportService.create({
          userId: fleetEvent.userId,
          fleetEventId: fleetEvent.id,
          missionType: 'spy',
          title: `Espionnage ${coords} — Combat ${outcomeLabel}`,
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
