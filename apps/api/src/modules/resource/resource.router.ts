import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { protectedProcedure, router } from '../../trpc/router.js';
import { planetTypes, planetShips } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import type { createResourceService } from './resource.service.js';
import type { createPlanetService } from '../planet/planet.service.js';

const percentSchema = z.number().int().min(0).max(100).refine((v) => v % 10 === 0, {
  message: 'Le pourcentage doit etre un multiple de 10',
});

export function createResourceRouter(
  resourceService: ReturnType<typeof createResourceService>,
  planetService: ReturnType<typeof createPlanetService>,
  db: Database,
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

        const buildingLevels = await resourceService.getBuildingLevels(input.planetId);
        const [ships] = await db.select({ solarSatellite: planetShips.solarSatellite })
          .from(planetShips).where(eq(planetShips.planetId, input.planetId)).limit(1);
        const rates = await resourceService.getProductionRates(input.planetId, planet, bonus);
        return {
          rates,
          resourcesUpdatedAt: planet.resourcesUpdatedAt.toISOString(),
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
          maxTemp: planet.maxTemp,
          planetClassId: planet.planetClassId,
          levels: {
            mineraiMine: buildingLevels['mineraiMine'] ?? 0,
            siliciumMine: buildingLevels['siliciumMine'] ?? 0,
            hydrogeneSynth: buildingLevels['hydrogeneSynth'] ?? 0,
            solarPlant: buildingLevels['solarPlant'] ?? 0,
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
  });
}
