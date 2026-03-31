import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../trpc/router.js';
import { planets, planetTypes, planetShips } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createResourceService } from './resource.service.js';
import type { createPlanetService } from '../planet/planet.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import { findBuildingByRole } from '../../lib/config-helpers.js';

const percentSchema = z.number().int().min(0).max(100).refine((v) => v % 10 === 0, {
  message: 'Le pourcentage doit etre un multiple de 10',
});

export function createResourceRouter(
  resourceService: ReturnType<typeof createResourceService>,
  planetService: ReturnType<typeof createPlanetService>,
  db: Database,
  gameConfigService: GameConfigService,
) {
  return router({
    production: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const planet = await planetService.getPlanet(ctx.userId!, input.planetId);

        let bonus: { mineraiBonus: number; siliciumBonus: number; hydrogeneBonus: number } | undefined;
        if (planet.planetClassId) {
          const [pt] = await db.select({
            mineraiBonus: planetTypes.mineraiBonus,
            siliciumBonus: planetTypes.siliciumBonus,
            hydrogeneBonus: planetTypes.hydrogeneBonus,
          }).from(planetTypes).where(eq(planetTypes.id, planet.planetClassId)).limit(1);
          bonus = pt ?? undefined;
        }

        const config = await gameConfigService.getFullConfig();
        const mineraiMineId = findBuildingByRole(config, 'producer_minerai').id;
        const siliciumMineId = findBuildingByRole(config, 'producer_silicium').id;
        const hydrogeneSynthId = findBuildingByRole(config, 'producer_hydrogene').id;
        const solarPlantId = findBuildingByRole(config, 'producer_energy').id;

        const buildingLevels = await resourceService.getBuildingLevels(input.planetId);
        const [ships] = await db.select({ solarSatellite: planetShips.solarSatellite })
          .from(planetShips).where(eq(planetShips.planetId, input.planetId)).limit(1);
        const rates = await resourceService.getProductionRates(input.planetId, planet, bonus, ctx.userId!);
        return {
          rates,
          resourcesUpdatedAt: planet.resourcesUpdatedAt.toISOString(),
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
          maxTemp: planet.maxTemp,
          planetClassId: planet.planetClassId,
          levels: {
            mineraiMine: buildingLevels[mineraiMineId] ?? 0,
            siliciumMine: buildingLevels[siliciumMineId] ?? 0,
            hydrogeneSynth: buildingLevels[hydrogeneSynthId] ?? 0,
            solarPlant: buildingLevels[solarPlantId] ?? 0,
            solarSatelliteCount: ships?.solarSatellite ?? 0,
          },
        };
      }),

    setProductionPercent: protectedProcedure
      .input(
        z.object({
          planetId: z.string().uuid(),
          mineraiMinePercent: percentSchema.optional(),
          siliciumMinePercent: percentSchema.optional(),
          hydrogeneSynthPercent: percentSchema.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await resourceService.setProductionPercent(input.planetId, ctx.userId!, {
          mineraiMinePercent: input.mineraiMinePercent,
          siliciumMinePercent: input.siliciumMinePercent,
          hydrogeneSynthPercent: input.hydrogeneSynthPercent,
        });
      }),

    setShieldPercent: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        percent: z.number().int().min(0).max(100).multipleOf(10),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify ownership
        const [planet] = await db.select({ userId: planets.userId }).from(planets).where(eq(planets.id, input.planetId)).limit(1);
        if (!planet || planet.userId !== ctx.userId) throw new TRPCError({ code: 'NOT_FOUND' });
        await db.update(planets).set({ shieldPercent: input.percent }).where(eq(planets.id, input.planetId));
        return { success: true };
      }),
  });
}
