import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFleetService } from './fleet.service.js';

const shipIds = [
  'smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter',
  'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler',
] as const;

const missionTypes = ['transport', 'station', 'spy', 'attack', 'colonize'] as const;

export function createFleetRouter(fleetService: ReturnType<typeof createFleetService>) {
  return router({
    send: protectedProcedure
      .input(z.object({
        originPlanetId: z.string().uuid(),
        targetGalaxy: z.number().int().min(1).max(9),
        targetSystem: z.number().int().min(1).max(499),
        targetPosition: z.number().int().min(1).max(15),
        mission: z.enum(missionTypes),
        ships: z.record(z.enum(shipIds), z.number().int().min(0).max(999999)),
        metalCargo: z.number().min(0).default(0),
        crystalCargo: z.number().min(0).default(0),
        deuteriumCargo: z.number().min(0).default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        return fleetService.sendFleet(ctx.userId!, input);
      }),

    recall: protectedProcedure
      .input(z.object({ fleetEventId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return fleetService.recallFleet(ctx.userId!, input.fleetEventId);
      }),

    movements: protectedProcedure
      .query(async ({ ctx }) => {
        return fleetService.listMovements(ctx.userId!);
      }),
  });
}
