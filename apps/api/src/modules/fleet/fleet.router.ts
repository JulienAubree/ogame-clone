import { z } from 'zod';
import { MissionType } from '@ogame-clone/shared';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFleetService } from './fleet.service.js';

const shipsSchema = z.record(z.string(), z.number().int().min(0).max(999999));
const missionValues = Object.values(MissionType) as [string, ...string[]];
const coordSchema = {
  targetGalaxy: z.number().int().min(1).max(999),
  targetSystem: z.number().int().min(1).max(9999),
  targetPosition: z.number().int().min(1).max(999),
};

export function createFleetRouter(fleetService: ReturnType<typeof createFleetService>) {
  return router({
    send: protectedProcedure
      .input(z.object({
        originPlanetId: z.string().uuid(),
        ...coordSchema,
        mission: z.enum(missionValues),
        ships: shipsSchema,
        mineraiCargo: z.number().min(0).default(0),
        siliciumCargo: z.number().min(0).default(0),
        hydrogeneCargo: z.number().min(0).default(0),
        pveMissionId: z.string().uuid().optional(),
        tradeId: z.string().uuid().optional(),
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
        ...coordSchema,
        ships: shipsSchema,
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

    inbound: protectedProcedure
      .query(async ({ ctx }) => {
        return fleetService.listInboundFleets(ctx.userId!);
      }),
  });
}
