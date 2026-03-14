import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createPlanetService } from './planet.service.js';

export function createPlanetRouter(planetService: ReturnType<typeof createPlanetService>) {
  return router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return planetService.listPlanets(ctx.userId!);
    }),

    get: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return planetService.getPlanet(ctx.userId!, input.planetId);
      }),

    rename: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        name: z.string().min(1).max(30),
      }))
      .mutation(async ({ ctx, input }) => {
        return planetService.rename(ctx.userId!, input.planetId, input.name);
      }),
  });
}
