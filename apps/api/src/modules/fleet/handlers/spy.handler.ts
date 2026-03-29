import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, planetBuildings, userResearch, users } from '@exilium/db';
import { calculateSpyReport, calculateDetectionChance, totalCargoCapacity } from '@exilium/game-engine';
import type { Database } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';
import { findShipByRole } from '../../../lib/config-helpers.js';

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
      if (ctx.messageService) {
        await ctx.messageService.createSystemMessage(
          fleetEvent.userId,
          'espionage',
          `Espionnage ${coords}`,
          `Aucune planète trouvée à la position ${coords}.`,
        );
      }
      return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 } };
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
      if (ctx.messageService) {
        const [attackerUser] = await ctx.db.select({ username: users.username }).from(users).where(eq(users.id, fleetEvent.userId)).limit(1);
        await ctx.messageService.createSystemMessage(
          targetPlanet.userId,
          'espionage',
          `Activité d'espionnage détectée ${coords}`,
          `${probeCount} sonde(s) d'espionnage provenant de ${attackerUser?.username ?? 'Inconnu'} ont été détectées et détruites.`,
        );
      }
      // Probes destroyed — no return (dispatcher marks completed)
      return { scheduleReturn: false, shipsAfterArrival: {}, reportId };
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
