import { z } from 'zod';
import { publicProcedure, router } from '../../trpc/router.js';
import type { createAuthService } from './auth.service.js';
import type { createPlanetService } from '../planet/planet.service.js';

export function createAuthRouter(
  authService: ReturnType<typeof createAuthService>,
  planetService: ReturnType<typeof createPlanetService>,
) {
  return router({
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          username: z.string().min(3).max(32),
          password: z.string().min(8).max(128),
        }),
      )
      .mutation(async ({ input }) => {
        const user = await authService.register(input.email, input.username, input.password);
        await planetService.createHomePlanet(user.id);
        const tokens = await authService.login(input.email, input.password);
        return tokens;
      }),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string(),
          rememberMe: z.boolean().optional().default(false),
        }),
      )
      .mutation(async ({ input }) => {
        return authService.login(input.email, input.password, input.rememberMe);
      }),

    refresh: publicProcedure
      .input(z.object({ refreshToken: z.string() }))
      .mutation(async ({ input }) => {
        return authService.refresh(input.refreshToken);
      }),

    logout: publicProcedure
      .input(z.object({ refreshToken: z.string() }))
      .mutation(async ({ input }) => {
        await authService.logout(input.refreshToken);
        return { ok: true };
      }),
  });
}
