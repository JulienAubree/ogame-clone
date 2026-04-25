import { z } from 'zod';
import { idSchema } from '../../lib/zod-schemas.js';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createShipyardService } from './shipyard.service.js';

export function createShipyardRouter(shipyardService: ReturnType<typeof createShipyardService>) {
  return router({
    ships: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return shipyardService.listShips(ctx.userId!, input.planetId);
      }),

    defenses: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return shipyardService.listDefenses(ctx.userId!, input.planetId);
      }),

    queue: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        facilityId: z.enum(['shipyard', 'commandCenter', 'arsenal']).optional(),
      }))
      .query(async ({ ctx, input }) => {
        // Verify planet ownership — getShipyardQueue itself is unchecked
        // because internal batch processors call it without a user context.
        await shipyardService.getOwnedPlanet(ctx.userId!, input.planetId);
        return shipyardService.getShipyardQueue(input.planetId, input.facilityId);
      }),

    buildShip: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        shipId: idSchema,
        quantity: z.number().int().min(1).max(9999),
      }))
      .mutation(async ({ ctx, input }) => {
        return shipyardService.startBuild(ctx.userId!, input.planetId, 'ship', input.shipId, input.quantity);
      }),

    buildDefense: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        defenseId: idSchema,
        quantity: z.number().int().min(1).max(9999),
      }))
      .mutation(async ({ ctx, input }) => {
        return shipyardService.startBuild(ctx.userId!, input.planetId, 'defense', input.defenseId, input.quantity);
      }),

    cancelBatch: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        batchId: z.string().uuid(),
      }))
      .mutation(async ({ ctx, input }) => {
        return shipyardService.cancelBatch(ctx.userId!, input.planetId, input.batchId);
      }),

    reduceQuantity: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        batchId: z.string().uuid(),
        removeCount: z.number().int().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return shipyardService.reduceQuantity(ctx.userId!, input.planetId, input.batchId, input.removeCount);
      }),
  });
}
