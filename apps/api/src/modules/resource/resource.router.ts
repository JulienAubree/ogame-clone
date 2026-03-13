import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createResourceService } from './resource.service.js';
import type { createPlanetService } from '../planet/planet.service.js';

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
        };
      }),
  });
}
