import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, planetBuildings, userResearch, users } from '@ogame-clone/db';
import { calculateSpyReport, calculateDetectionChance, totalCargoCapacity } from '@ogame-clone/game-engine';
import type { Database } from '@ogame-clone/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { formatDuration, buildShipStatsMap } from '../fleet.types.js';

export class SpyHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    for (const [shipType, count] of Object.entries(input.ships)) {
      if (count > 0 && shipType !== 'espionageProbe') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seules les sondes d\'espionnage peuvent être envoyées en mission espionnage' });
      }
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const ships = fleetEvent.ships;
    const probeCount = ships.espionageProbe ?? 0;
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
    const visibility = calculateSpyReport(probeCount, attackerTech, defenderTech);
    const detectionChance = calculateDetectionChance(probeCount, attackerTech, defenderTech);
    const detected = Math.random() * 100 < detectionChance;

    const duration = formatDuration(fleetEvent.arrivalTime.getTime() - fleetEvent.departureTime.getTime());
    let body = `Rapport d'espionnage de ${coords}\nDurée du trajet : ${duration}\n\n`;

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
      body += `Ressources :\nMinerai : ${resources.minerai}\nSilicium : ${resources.silicium}\nHydrogène : ${resources.hydrogene}\n\n`;
    }

    if (visibility.fleet) {
      const [targetShips] = await ctx.db.select().from(planetShips).where(eq(planetShips.planetId, targetPlanet.id)).limit(1);
      if (targetShips) {
        const fleetData: Record<string, number> = {};
        const shipTypes = ['smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler'] as const;
        body += `Flotte :\n`;
        for (const t of shipTypes) {
          if (targetShips[t] > 0) {
            fleetData[t] = targetShips[t];
            body += `${t}: ${targetShips[t]}\n`;
          }
        }
        reportResult.fleet = fleetData;
        body += '\n';
      }
    }

    if (visibility.defenses) {
      const [defs] = await ctx.db.select().from(planetDefenses).where(eq(planetDefenses.planetId, targetPlanet.id)).limit(1);
      if (defs) {
        const defensesData: Record<string, number> = {};
        const defTypes = ['rocketLauncher', 'lightLaser', 'heavyLaser', 'gaussCannon', 'plasmaTurret', 'smallShield', 'largeShield'] as const;
        body += `Défenses :\n`;
        for (const t of defTypes) {
          if (defs[t] > 0) {
            defensesData[t] = defs[t];
            body += `${t}: ${defs[t]}\n`;
          }
        }
        reportResult.defenses = defensesData;
        body += '\n';
      }
    }

    if (visibility.buildings) {
      const bRows = await ctx.db.select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
        .from(planetBuildings).where(eq(planetBuildings.planetId, targetPlanet.id));
      const buildingsData: Record<string, number> = {};
      body += `Bâtiments :\n`;
      for (const row of bRows) {
        if (row.level > 0) {
          buildingsData[row.buildingId] = row.level;
          body += `${row.buildingId}: ${row.level}\n`;
        }
      }
      reportResult.buildings = buildingsData;
      body += '\n';
    }

    if (visibility.research) {
      const [research] = await ctx.db.select().from(userResearch).where(eq(userResearch.userId, targetPlanet.userId)).limit(1);
      if (research) {
        const researchData: Record<string, number> = {};
        const researchCols = ['espionageTech', 'computerTech', 'energyTech', 'combustion', 'impulse', 'hyperspaceDrive', 'weapons', 'shielding', 'armor'] as const;
        body += `Recherches :\n`;
        for (const col of researchCols) {
          if (research[col] > 0) {
            researchData[col] = research[col];
            body += `${col}: ${research[col]}\n`;
          }
        }
        reportResult.research = researchData;
      }
    }

    // Send system message
    let messageId: string | undefined;
    if (ctx.messageService) {
      const msg = await ctx.messageService.createSystemMessage(
        fleetEvent.userId,
        'espionage',
        `Rapport d'espionnage ${coords}`,
        body,
      );
      messageId = msg.id;
    }

    // Fetch origin planet for report
    const [originPlanet] = await ctx.db.select({
      galaxy: planets.galaxy,
      system: planets.system,
      position: planets.position,
      name: planets.name,
    }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);

    // Create structured mission report
    if (ctx.reportService) {
      const config = await ctx.gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        messageId,
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
      return { scheduleReturn: false, shipsAfterArrival: {} };
    }

    return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 } };
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
