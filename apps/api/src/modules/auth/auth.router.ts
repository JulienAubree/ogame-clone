import { z } from 'zod';
import { publicProcedure, router } from '../../trpc/router.js';
import type { createAuthService, AuthContext } from './auth.service.js';
import type { createPlanetService } from '../planet/planet.service.js';
import type { Context } from '../../trpc/context.js';

function authCtx(ctx: Context): AuthContext {
  const ua = ctx.req.headers['user-agent'];
  return {
    ip: ctx.req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  };
}

export function createAuthRouter(
  authService: ReturnType<typeof createAuthService>,
  planetService: ReturnType<typeof createPlanetService>,
) {
  return router({
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, 'Le pseudo ne peut contenir que des lettres, chiffres, tirets et underscores'),
          password: z.string().min(8).max(128),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const auth = authCtx(ctx);
        const user = await authService.register(input.email, input.username, input.password, auth);
        await planetService.createHomePlanet(user.id);
        const tokens = await authService.login(input.email, input.password, false, auth);
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
      .mutation(async ({ input, ctx }) => {
        return authService.login(input.email, input.password, input.rememberMe, authCtx(ctx));
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
