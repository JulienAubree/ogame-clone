import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, planetDefenses, fleetEvents } from '@ogame-clone/db';
import { calculateMaxTemp, calculateMinTemp, calculateDiameter, calculateMaxFields } from '@ogame-clone/game-engine';
import { BELT_POSITIONS } from '../../universe/universe.config.js';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';

export class ColonizeHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    for (const [shipType, count] of Object.entries(input.ships)) {
      if (count > 0 && shipType !== 'colonyShip') {
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

    // Check if position is an asteroid belt
    if ((BELT_POSITIONS as readonly number[]).includes(fleetEvent.targetPosition)) {
      if (ctx.messageService) {
        await ctx.messageService.createSystemMessage(
          fleetEvent.userId,
          'colonization',
          `Colonisation échouée ${coords}`,
          `La position ${coords} est une ceinture d'astéroïdes et ne peut pas être colonisée. Votre flotte fait demi-tour.`,
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
          `La position ${coords} est déjà occupée. Votre flotte fait demi-tour.`,
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

    if (userPlanets.length >= 9) {
      if (ctx.messageService) {
        await ctx.messageService.createSystemMessage(
          fleetEvent.userId,
          'colonization',
          `Colonisation échouée ${coords}`,
          `Nombre maximum de planètes atteint (9). Votre flotte fait demi-tour.`,
        );
      }
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
      };
    }

    // Success: create new planet
    const config = await ctx.gameConfigService.getFullConfig();
    const planetTypeForPos = config.planetTypes.find(
      (pt) => pt.id !== 'homeworld' && (pt.positions as number[]).includes(fleetEvent.targetPosition),
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
      })
      .returning();

    await ctx.db.insert(planetShips).values({ planetId: newPlanet.id });
    await ctx.db.insert(planetDefenses).values({ planetId: newPlanet.id });

    // Colony ship is consumed
    const remainingShips = { ...ships };
    if (remainingShips.colonyShip) {
      remainingShips.colonyShip = Math.max(0, remainingShips.colonyShip - 1);
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
        `Une nouvelle colonie a été fondée sur ${coords}. Diamètre : ${diameter}km, ${maxFields} cases disponibles.`,
      );
    }

    // Return remaining ships in a new fleet event
    const hasRemainingShips = Object.values(remainingShips).some(v => v > 0);
    if (hasRemainingShips) {
      return {
        scheduleReturn: false,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
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
          mineraiCargo: String(mineraiCargo),
          siliciumCargo: String(siliciumCargo),
          hydrogeneCargo: String(hydrogeneCargo),
          ships: remainingShips,
        },
      };
    }

    // No remaining ships — nothing returns
    return { scheduleReturn: false };
  }
}
