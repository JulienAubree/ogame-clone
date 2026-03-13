import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createGalaxyService } from './galaxy.service.js';

export function createGalaxyRouter(galaxyService: ReturnType<typeof createGalaxyService>) {
  return router({
    system: protectedProcedure
      .input(z.object({
        galaxy: z.number().int().min(1).max(9),
        system: z.number().int().min(1).max(499),
      }))
      .query(async ({ input }) => {
        return galaxyService.getSystem(input.galaxy, input.system);
      }),
  });
}
