import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { nonEmptyString } from '../../lib/zod-schemas.js';
import { publicProcedure, protectedProcedure, router } from '../../trpc/router.js';
import type { createAuthService, AuthContext } from './auth.service.js';
import type { createPlanetService } from '../planet/planet.service.js';
import type { Context } from '../../trpc/context.js';
import type { Database } from '@exilium/db';

function authCtx(ctx: Context): AuthContext {
  const ua = ctx.req.headers['user-agent'];
  return {
    ip: ctx.req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  };
}

/**
 * Translate Postgres unique-violation errors that escape the service layer
 * into a clean tRPC CONFLICT. We never want raw SQL ("duplicate key value
 * violates unique constraint …") reaching the front (Korbo bug, 2026-05-02).
 */
function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505';
}

export function createAuthRouter(
  db: Database,
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

        // User and homeworld are created in a single transaction. If the
        // homeworld insert fails for any reason (coords race, DB hiccup),
        // the user row is rolled back so we never end up with an orphan
        // account that cannot play. Verification email is sent AFTER commit
        // so a rollback never leaks a confirmation pointing at a missing user.
        let user: { id: string; email: string; username: string };
        try {
          user = await db.transaction(async (tx) => {
            const created = await authService.register(input.email, input.username, input.password, auth, tx);
            await planetService.createHomePlanet(created.id, tx);
            return created;
          });
        } catch (err) {
          if (err instanceof TRPCError) throw err;
          if (isPgUniqueViolation(err)) {
            // The unique violation may be on `users.email`, `users.username` or
            // `planets.unique_coordinates`. We surface a generic, retry-friendly
            // message rather than guessing which constraint fired.
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Conflit lors de la création du compte. Vérifiez votre email/pseudo, puis réessayez.',
              cause: err instanceof Error ? err : undefined,
            });
          }
          throw err;
        }

        // Mailer errors must never fail registration — sendVerificationEmail
        // already swallows transport errors internally. We still wrap to
        // protect against unexpected throws in the token insert path.
        try {
          await authService.sendVerificationEmail(user);
        } catch (mailErr) {
          console.error('[auth] post-register verification email failed:', mailErr);
        }

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

    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        await authService.requestPasswordReset(input.email, authCtx(ctx));
        // Always return the same response — do not leak whether the email exists.
        return { ok: true };
      }),

    resetPassword: publicProcedure
      .input(
        z.object({
          token: nonEmptyString,
          password: z.string().min(8).max(128),
        }),
      )
      .mutation(async ({ input }) => {
        await authService.resetPassword(input.token, input.password);
        return { ok: true };
      }),

    verifyEmail: publicProcedure
      .input(z.object({ token: nonEmptyString }))
      .mutation(async ({ input }) => {
        await authService.verifyEmail(input.token);
        return { ok: true };
      }),

    resendVerification: protectedProcedure.mutation(async ({ ctx }) => {
      await authService.resendVerification(ctx.userId!);
      return { ok: true };
    }),

    /**
     * Mint a short-lived SSE ticket. The browser's EventSource API cannot set
     * custom headers, so we would otherwise have to pass the JWT in the URL.
     * Instead, the client asks for this ticket over tRPC (Authorization header)
     * and passes it to /sse, so the long-lived JWT never appears in access logs.
     */
    getSseToken: protectedProcedure.mutation(async ({ ctx }) => {
      const token = await authService.issueSseToken(ctx.userId!);
      return { token };
    }),
  });
}
