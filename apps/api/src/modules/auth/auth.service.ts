import { eq, sql } from 'drizzle-orm';
import { hash, verify } from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'crypto';
import { TRPCError } from '@trpc/server';
import { users, refreshTokens, loginEvents } from '@exilium/db';
import type { Database } from '@exilium/db';
import type Redis from 'ioredis';
import { env } from '../../config/env.js';
import { enforceRateLimit } from '../../lib/rate-limit.js';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

/** Max failed login attempts before the account is temporarily locked. */
const LOCKOUT_THRESHOLD = 5;
/** How long the account stays locked after LOCKOUT_THRESHOLD failed attempts (minutes). */
const LOCKOUT_DURATION_MINUTES = 15;
/** Auth endpoint rate limit: max attempts per IP per window. */
const AUTH_RATE_LIMIT = 10;
/** Auth endpoint rate limit window (seconds). */
const AUTH_RATE_LIMIT_WINDOW_SECONDS = 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry: ${expiry}`);
  const [, num, unit] = match;
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(num!) * multipliers[unit!]!;
}

export interface AuthContext {
  ip?: string | null;
  userAgent?: string | null;
}

export function createAuthService(db: Database, redis: Redis) {
  async function recordLoginEvent(params: {
    userId: string | null;
    email: string;
    success: boolean;
    reason?: string;
    ctx: AuthContext;
  }) {
    await db.insert(loginEvents).values({
      userId: params.userId,
      email: params.email,
      success: params.success,
      reason: params.reason ?? null,
      ipAddress: params.ctx.ip ?? null,
      userAgent: params.ctx.userAgent ?? null,
    });
  }

  async function rateLimitAuth(endpoint: 'login' | 'register', ctx: AuthContext) {
    // Fall back to a single bucket when IP is missing so we still cap abuse.
    const ipKey = ctx.ip ?? 'unknown';
    await enforceRateLimit(redis, {
      key: `ratelimit:auth:${endpoint}:${ipKey}`,
      limit: AUTH_RATE_LIMIT,
      windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
    });
  }

  return {
    async register(email: string, username: string, password: string, ctx: AuthContext = {}) {
      await rateLimitAuth('register', ctx);
      const passwordHash = await hash(password);

      const [user] = await db
        .insert(users)
        .values({ email, username, passwordHash })
        .returning({ id: users.id, email: users.email, username: users.username });

      if (!user) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return user;
    },

    async login(email: string, password: string, rememberMe = false, ctx: AuthContext = {}) {
      await rateLimitAuth('login', ctx);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        await recordLoginEvent({ userId: null, email, success: false, reason: 'unknown_email', ctx });
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
      }

      // Lockout check — reject before even verifying the password.
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingMin = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        await recordLoginEvent({ userId: user.id, email, success: false, reason: 'locked', ctx });
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Compte verrouillé suite à trop de tentatives. Réessayez dans ${remainingMin} min.`,
        });
      }

      const valid = await verify(user.passwordHash, password);
      if (!valid) {
        const nextAttempts = user.failedLoginAttempts + 1;
        const shouldLock = nextAttempts >= LOCKOUT_THRESHOLD;
        await db
          .update(users)
          .set({
            failedLoginAttempts: nextAttempts,
            lockedUntil: shouldLock
              ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000)
              : user.lockedUntil,
          })
          .where(eq(users.id, user.id));
        await recordLoginEvent({
          userId: user.id,
          email,
          success: false,
          reason: shouldLock ? 'bad_password_locked' : 'bad_password',
          ctx,
        });
        if (shouldLock) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Trop de tentatives échouées. Compte verrouillé ${LOCKOUT_DURATION_MINUTES} min.`,
          });
        }
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
      }

      if (user.bannedAt) {
        await recordLoginEvent({ userId: user.id, email, success: false, reason: 'banned', ctx });
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Account banned' });
      }

      // Success: reset lockout state, record last login, audit.
      await db
        .update(users)
        .set({
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: sql`now()`,
        })
        .where(eq(users.id, user.id));
      await recordLoginEvent({ userId: user.id, email, success: true, ctx });

      const jwtExpiry = rememberMe ? '14d' : env.JWT_EXPIRES_IN;
      const accessToken = await new SignJWT({ userId: user.id, isAdmin: user.isAdmin })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(jwtExpiry)
        .sign(JWT_SECRET);

      const rawRefresh = randomBytes(32).toString('hex');
      const refreshExpiry = rememberMe ? '30d' : env.REFRESH_TOKEN_EXPIRES_IN;
      const expiresAt = new Date(Date.now() + parseExpiry(refreshExpiry) * 1000);

      await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(rawRefresh),
        expiresAt,
      });

      return {
        accessToken,
        refreshToken: rawRefresh,
        user: { id: user.id, email: user.email, username: user.username, isAdmin: user.isAdmin, avatarId: user.avatarId },
      };
    },

    async refresh(rawRefreshToken: string) {
      const tokenHash = hashToken(rawRefreshToken);

      const [stored] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);

      if (!stored || stored.expiresAt < new Date()) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' });
      }

      await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

      const accessToken = await new SignJWT({ userId: stored.userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(env.JWT_EXPIRES_IN)
        .sign(JWT_SECRET);

      const newRawRefresh = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + parseExpiry(env.REFRESH_TOKEN_EXPIRES_IN) * 1000);

      await db.insert(refreshTokens).values({
        userId: stored.userId,
        tokenHash: hashToken(newRawRefresh),
        expiresAt,
      });

      return { accessToken, refreshToken: newRawRefresh };
    },

    async logout(rawRefreshToken: string) {
      const tokenHash = hashToken(rawRefreshToken);
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    },

    async verifyAccessToken(token: string): Promise<{ userId: string }> {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return { userId: payload.userId as string };
      } catch {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid token' });
      }
    },
  };
}
