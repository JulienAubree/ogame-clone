import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createPlanetService } from './planet.service.js';
import type { createPlanetAbandonService } from './planet-abandon.service.js';

const abandonInputSchema = z.object({
  planetId: z.string().uuid(),
  destinationPlanetId: z.string().uuid(),
}).refine(
  (v) => v.planetId !== v.destinationPlanetId,
  { message: 'La destination doit être différente de la planète abandonnée', path: ['destinationPlanetId'] },
);

export function createPlanetRouter(
  planetService: ReturnType<typeof createPlanetService>,
  abandonService: ReturnType<typeof createPlanetAbandonService>,
) {
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

    reorder: protectedProcedure
      .input(z.object({
        order: z.array(z.object({
          planetId: z.string().uuid(),
          sortOrder: z.number().int().min(0),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return planetService.reorderPlanets(ctx.userId!, input.order);
      }),

    empire: protectedProcedure.query(async ({ ctx }) => {
      return planetService.getEmpireOverview(ctx.userId!);
    }),

    abandonPreview: protectedProcedure
      .input(abandonInputSchema)
      .query(async ({ ctx, input }) => {
        return abandonService.preview(ctx.userId!, input.planetId, input.destinationPlanetId);
      }),

    abandon: protectedProcedure
      .input(abandonInputSchema)
      .mutation(async ({ ctx, input }) => {
        return abandonService.abandon(ctx.userId!, input.planetId, input.destinationPlanetId);
      }),
  });
}
