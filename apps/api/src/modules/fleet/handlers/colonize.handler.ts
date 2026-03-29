import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, fleetEvents } from '@exilium/db';
import { calculateMaxTemp, calculateMinTemp, calculateDiameter, calculateMaxFields } from '@exilium/game-engine';
import { getRandomPlanetImageIndex } from '../../../lib/planet-image.util.js';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { formatDuration } from '../fleet.types.js';
import { findShipByRole, findPlanetTypeByRole } from '../../../lib/config-helpers.js';

export class ColonizeHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const config = await ctx.gameConfigService.getFullConfig();
    const colonyShipDef = findShipByRole(config, 'colonizer');
    for (const [shipType, count] of Object.entries(input.ships)) {
      if (count > 0 && shipType !== colonyShipDef.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seuls les vaisseaux de colonisation peuvent être envoyés en mission colonisation' });
      }
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const ships = fleetEvent.ships;
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const duration = formatDuration(fleetEvent.arrivalTime.getTime() - fleetEvent.departureTime.getTime());

    const config = await ctx.gameConfigService.getFullConfig();
    const colonyShipDef = findShipByRole(config, 'colonizer');
    const homeworldType = findPlanetTypeByRole(config, 'homeworld');
    const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
    const maxPlanetsPerPlayer = Number(config.universe.maxPlanetsPerPlayer) || 9;

    // Check if position is an asteroid belt
    if (beltPositions.includes(fleetEvent.targetPosition)) {
      if (ctx.messageService) {
        await ctx.messageService.createSystemMessage(
          fleetEvent.userId,
          'colonization',
          `Colonisation échouée ${coords}`,
          `La position ${coords} est une ceinture d'astéroïdes et ne peut pas être colonisée. Votre flotte fait demi-tour.\nDurée du trajet : ${duration}`,
        );
      }
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
      };
    }

    // Check if position is free
    const [existing] = await ctx.db
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

    if (existing) {
      if (ctx.messageService) {
        await ctx.messageService.createSystemMessage(
          fleetEvent.userId,
          'colonization',
          `Colonisation échouée ${coords}`,
          `La position ${coords} est déjà occupée. Votre flotte fait demi-tour.\nDurée du trajet : ${duration}`,
        );
      }
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
      };
    }

    // Check max planets
    const userPlanets = await ctx.db
      .select()
      .from(planets)
      .where(eq(planets.userId, fleetEvent.userId));

    if (userPlanets.length >= maxPlanetsPerPlayer) {
      if (ctx.messageService) {
        await ctx.messageService.createSystemMessage(
          fleetEvent.userId,
          'colonization',
          `Colonisation échouée ${coords}`,
          `Nombre maximum de planètes atteint (${maxPlanetsPerPlayer}). Votre flotte fait demi-tour.\nDurée du trajet : ${duration}`,
        );
      }
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
      };
    }

    // Success: create new planet
    const planetTypeForPos = config.planetTypes.find(
      (pt) => pt.id !== homeworldType.id && (pt.positions as number[]).includes(fleetEvent.targetPosition),
    );

    const randomOffset = Math.floor(Math.random() * 41) - 20;
    const maxTemp = calculateMaxTemp(fleetEvent.targetPosition, randomOffset);
    const minTemp = calculateMinTemp(maxTemp);

    let diameter: number;
    let fieldsBonus = 1;
    if (planetTypeForPos) {
      const { diameterMin, diameterMax } = planetTypeForPos;
      diameter = Math.floor(diameterMin + (diameterMax - diameterMin) * Math.random());
      fieldsBonus = planetTypeForPos.fieldsBonus;
    } else {
      diameter = calculateDiameter(fleetEvent.targetPosition, Math.random());
    }
    const maxFields = calculateMaxFields(diameter, fieldsBonus);
    const planetImageIndex = getRandomPlanetImageIndex(planetTypeForPos?.id ?? homeworldType.id, ctx.assetsDir);

    const [newPlanet] = await ctx.db
      .insert(planets)
      .values({
        userId: fleetEvent.userId,
        name: 'Colonie',
        galaxy: fleetEvent.targetGalaxy,
        system: fleetEvent.targetSystem,
        position: fleetEvent.targetPosition,
        planetType: 'planet',
        planetClassId: planetTypeForPos?.id ?? null,
        diameter,
        maxFields,
        minTemp,
        maxTemp,
        planetImageIndex,
      })
      .returning();

    await ctx.db.insert(planetShips).values({ planetId: newPlanet.id });
    await ctx.db.insert(planetDefenses).values({ planetId: newPlanet.id });

    // Transfer cargo to the new planet
    if (mineraiCargo > 0 || siliciumCargo > 0 || hydrogeneCargo > 0) {
      await ctx.db
        .update(planets)
        .set({
          minerai: sql`${planets.minerai} + ${mineraiCargo}`,
          silicium: sql`${planets.silicium} + ${siliciumCargo}`,
          hydrogene: sql`${planets.hydrogene} + ${hydrogeneCargo}`,
        })
        .where(eq(planets.id, newPlanet.id));
    }

    // Colony ship is consumed
    const remainingShips = { ...ships };
    if (remainingShips[colonyShipDef.id]) {
      remainingShips[colonyShipDef.id] = Math.max(0, remainingShips[colonyShipDef.id] - 1);
    }

    // Mark original event completed
    await ctx.db
      .update(fleetEvents)
      .set({ status: 'completed' })
      .where(eq(fleetEvents.id, fleetEvent.id));

    if (ctx.messageService) {
      await ctx.messageService.createSystemMessage(
        fleetEvent.userId,
        'colonization',
        `Colonisation réussie ${coords}`,
        `Une nouvelle colonie a été fondée sur ${coords}. Diamètre : ${diameter}km, ${maxFields} cases disponibles.\nDurée du trajet : ${duration}`,
      );
    }

    // Return remaining ships in a new fleet event (cargo already transferred to planet)
    const hasRemainingShips = Object.values(remainingShips).some(v => v > 0);
    if (hasRemainingShips) {
      return {
        scheduleReturn: false,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
        createReturnEvent: {
          userId: fleetEvent.userId,
          originPlanetId: fleetEvent.originPlanetId,
          targetPlanetId: newPlanet.id,
          targetGalaxy: fleetEvent.targetGalaxy,
          targetSystem: fleetEvent.targetSystem,
          targetPosition: fleetEvent.targetPosition,
          mission: 'transport',
          phase: 'outbound',
          status: 'active',
          departureTime: new Date(),
          arrivalTime: new Date(),
          mineraiCargo: '0',
          siliciumCargo: '0',
          hydrogeneCargo: '0',
          ships: remainingShips,
        },
      };
    }

    // No remaining ships — nothing returns
    return { scheduleReturn: false };
  }
}
