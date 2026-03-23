import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createGalaxyService } from './galaxy.service.js';
import { UNIVERSE_CONFIG } from '../universe/universe.config.js';

export function createGalaxyRouter(galaxyService: ReturnType<typeof createGalaxyService>) {
  return router({
    system: protectedProcedure
      .input(z.object({
        galaxy: z.number().int().min(1).max(UNIVERSE_CONFIG.galaxies),
        system: z.number().int().min(1).max(UNIVERSE_CONFIG.systems),
      }))
      .query(async ({ ctx, input }) => {
        return galaxyService.getSystem(input.galaxy, input.system, ctx.userId);
      }),
  });
}
