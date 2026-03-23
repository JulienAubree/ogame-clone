import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFleetService } from './fleet.service.js';

const shipIds = [
  'smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter',
  'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler',
  'prospector', 'explorer',
] as const;

const missionTypes = ['transport', 'station', 'spy', 'attack', 'colonize', 'recycle', 'mine', 'pirate'] as const;

export function createFleetRouter(fleetService: ReturnType<typeof createFleetService>) {
  return router({
    send: protectedProcedure
      .input(z.object({
        originPlanetId: z.string().uuid(),
        targetGalaxy: z.number().int().min(1).max(9),
        targetSystem: z.number().int().min(1).max(499),
        targetPosition: z.number().int().min(1).max(16),
        mission: z.enum(missionTypes),
        ships: z.record(z.enum(shipIds), z.number().int().min(0).max(999999)),
        mineraiCargo: z.number().min(0).default(0),
        siliciumCargo: z.number().min(0).default(0),
        hydrogeneCargo: z.number().min(0).default(0),
        pveMissionId: z.string().uuid().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return fleetService.sendFleet(ctx.userId!, input);
      }),

    recall: protectedProcedure
      .input(z.object({ fleetEventId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return fleetService.recallFleet(ctx.userId!, input.fleetEventId);
      }),

    estimate: protectedProcedure
      .input(z.object({
        originPlanetId: z.string().uuid(),
        targetGalaxy: z.number().int().min(1).max(9),
        targetSystem: z.number().int().min(1).max(499),
        targetPosition: z.number().int().min(1).max(16),
        ships: z.record(z.enum(shipIds), z.number().int().min(0).max(999999)),
      }))
      .query(async ({ ctx, input }) => {
        return fleetService.estimateFleet(ctx.userId!, input);
      }),

    slots: protectedProcedure
      .query(async ({ ctx }) => {
        return fleetService.getFleetSlots(ctx.userId!);
      }),

    movements: protectedProcedure
      .query(async ({ ctx }) => {
        return fleetService.listMovements(ctx.userId!);
      }),
  });
}
