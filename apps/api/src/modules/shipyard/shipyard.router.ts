import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createShipyardService } from './shipyard.service.js';

const shipIds = [
  'smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter',
  'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler',
] as const;

const defenseIds = [
  'rocketLauncher', 'lightLaser', 'heavyLaser',
  'gaussCannon', 'plasmaTurret', 'smallShield', 'largeShield',
] as const;

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
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ input }) => {
        return shipyardService.getShipyardQueue(input.planetId);
      }),

    buildShip: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        shipId: z.enum(shipIds),
        quantity: z.number().int().min(1).max(9999),
      }))
      .mutation(async ({ ctx, input }) => {
        return shipyardService.startBuild(ctx.userId!, input.planetId, 'ship', input.shipId, input.quantity);
      }),

    buildDefense: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        defenseId: z.enum(defenseIds),
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
  });
}
