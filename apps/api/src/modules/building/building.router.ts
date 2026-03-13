import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createBuildingService } from './building.service.js';
import type { BuildingId } from '@ogame-clone/game-engine';

const buildingIds = [
  'metalMine',
  'crystalMine',
  'deutSynth',
  'solarPlant',
  'robotics',
  'shipyard',
  'researchLab',
  'storageMetal',
  'storageCrystal',
  'storageDeut',
] as const;

export function createBuildingRouter(buildingService: ReturnType<typeof createBuildingService>) {
  return router({
    list: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return buildingService.listBuildings(ctx.userId!, input.planetId);
      }),

    upgrade: protectedProcedure
      .input(
        z.object({
          planetId: z.string().uuid(),
          buildingId: z.enum(buildingIds),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return buildingService.startUpgrade(
          ctx.userId!,
          input.planetId,
          input.buildingId as BuildingId,
        );
      }),

    cancel: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return buildingService.cancelUpgrade(ctx.userId!, input.planetId);
      }),
  });
}
