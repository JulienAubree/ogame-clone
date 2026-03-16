import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createResourceService } from './resource.service.js';
import type { createPlanetService } from '../planet/planet.service.js';

const percentSchema = z.number().int().min(0).max(100).refine((v) => v % 10 === 0, {
  message: 'Le pourcentage doit etre un multiple de 10',
});

export function createResourceRouter(
  resourceService: ReturnType<typeof createResourceService>,
  planetService: ReturnType<typeof createPlanetService>,
) {
  return router({
    production: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const planet = await planetService.getPlanet(ctx.userId!, input.planetId);
        const rates = resourceService.getProductionRates(planet);
        return {
          rates,
          resourcesUpdatedAt: planet.resourcesUpdatedAt.toISOString(),
          metal: Number(planet.metal),
          crystal: Number(planet.crystal),
          deuterium: Number(planet.deuterium),
          maxTemp: planet.maxTemp,
          levels: {
            metalMineLevel: planet.metalMineLevel,
            crystalMineLevel: planet.crystalMineLevel,
            deutSynthLevel: planet.deutSynthLevel,
            solarPlantLevel: planet.solarPlantLevel,
          },
        };
      }),

    setProductionPercent: protectedProcedure
      .input(
        z.object({
          planetId: z.string().uuid(),
          metalMinePercent: percentSchema.optional(),
          crystalMinePercent: percentSchema.optional(),
          deutSynthPercent: percentSchema.optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await resourceService.setProductionPercent(input.planetId, ctx.userId!, {
          metalMinePercent: input.metalMinePercent,
          crystalMinePercent: input.crystalMinePercent,
          deutSynthPercent: input.deutSynthPercent,
        });
      }),
  });
}
