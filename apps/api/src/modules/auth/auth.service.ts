import { eq, sql, and, isNull, gt, desc, notInArray } from 'drizzle-orm';
import { hash, verify } from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'crypto';
import { TRPCError } from '@trpc/server';
import { users, refreshTokens, loginEvents, passwordResetTokens, emailVerificationTokens } from '@exilium/db';
import type { Database } from '@exilium/db';
import type Redis from 'ioredis';
import { env } from '../../config/env.js';
import { enforceRateLimit } from '../../lib/rate-limit.js';
import type { MailerService } from '../mailer/mailer.service.js';
import { passwordResetEmail, emailVerificationEmail } from '../mailer/templates.js';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

/** Max failed login attempts before the account is temporarily locked. */
const LOCKOUT_THRESHOLD = 5;
/** How long the account stays locked after LOCKOUT_THRESHOLD failed attempts (minutes). */
const LOCKOUT_DURATION_MINUTES = 15;
/** Auth endpoint rate limit: max attempts per IP per window. */
const AUTH_RATE_LIMIT = 10;
/** Auth endpoint rate limit window (seconds). */
const AUTH_RATE_LIMIT_WINDOW_SECONDS = 60;
/** How long a password reset token stays valid. */
const PASSWORD_RESET_EXPIRES_MINUTES = 30;
/** Max password reset requests allowed per email per hour — abuse mitigation. */
const PASSWORD_RESET_PER_EMAIL_LIMIT = 3;
/** Window (seconds) for PASSWORD_RESET_PER_EMAIL_LIMIT. */
const PASSWORD_RESET_PER_EMAIL_WINDOW_SECONDS = 3600;
/** How long an email verification token stays valid. */
const EMAIL_VERIFY_EXPIRES_HOURS = 24;
/** Max verification resend requests per user per hour. */
const EMAIL_VERIFY_RESEND_LIMIT = 3;
/** Window (seconds) for EMAIL_VERIFY_RESEND_LIMIT. */
const EMAIL_VERIFY_RESEND_WINDOW_SECONDS = 3600;
/** Max concurrent refresh tokens per user. Oldest are evicted when exceeded. */
const MAX_SESSIONS_PER_USER = 5;
/** Lifetime of a single-use SSE ticket (seconds). Short to limit log exposure. */
const SSE_TICKET_TTL_SECONDS = 60;

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

export function createAuthService(db: Database, redis: Redis, mailer: MailerService) {
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

  /** Generate a fresh verification token and email the user. Mailer errors are swallowed. */
  async function sendVerificationEmail(user: { id: string; email: string; username: string }) {
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFY_EXPIRES_HOURS * 3600_000);
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
    });
    const verifyUrl = `${env.WEB_APP_URL.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
    const mail = emailVerificationEmail({
      username: user.username,
      verifyUrl,
      expiresInHours: EMAIL_VERIFY_EXPIRES_HOURS,
    });
    try {
      await mailer.send({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
    } catch (err) {
      console.error('[auth] verification email failed:', err);
    }
  }

  /** Enforce per-user session cap: keep the N most recent tokens, drop the rest. */
  async function evictExcessSessions(userId: string) {
    const keep = await db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId))
      .orderBy(desc(refreshTokens.createdAt))
      .limit(MAX_SESSIONS_PER_USER);
    if (keep.length < MAX_SESSIONS_PER_USER) return;
    const keepIds = keep.map((r) => r.id);
    await db
      .delete(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), notInArray(refreshTokens.id, keepIds)));
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

      // Fire-and-log: don't block registration if the mailer is misconfigured.
      await sendVerificationEmail(user);

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
      await evictExcessSessions(user.id);

      return {
        accessToken,
        refreshToken: rawRefresh,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isAdmin: user.isAdmin,
          avatarId: user.avatarId,
          emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
        },
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

      // Update lastLoginAt so admin "Actifs 1h/24h/7j" reflects ongoing activity,
      // not just explicit logins. Refresh fires ~every JWT lifetime (15 min by default).
      await db
        .update(users)
        .set({ lastLoginAt: sql`now()` })
        .where(eq(users.id, stored.userId));

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

    /**
     * Issue a password reset token and email it to the user.
     * Always returns void from the caller's perspective — we never leak whether the
     * email exists. Mailer failures are swallowed (logged server-side) for the same reason.
     */
    async requestPasswordReset(email: string, ctx: AuthContext = {}) {
      // Per-IP rate limit (shared with other auth endpoints would be stronger, but we
      // want this flow to stay usable even if the user just hit the login limit).
      const ipKey = ctx.ip ?? 'unknown';
      await enforceRateLimit(redis, {
        key: `ratelimit:auth:forgot:${ipKey}`,
        limit: AUTH_RATE_LIMIT,
        windowSeconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
      });
      // Per-email rate limit: stops someone from spamming a victim with reset emails.
      await enforceRateLimit(redis, {
        key: `ratelimit:auth:forgot:email:${email.toLowerCase()}`,
        limit: PASSWORD_RESET_PER_EMAIL_LIMIT,
        windowSeconds: PASSWORD_RESET_PER_EMAIL_WINDOW_SECONDS,
      });

      const [user] = await db
        .select({ id: users.id, email: users.email, username: users.username })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!user) return; // Silent no-op for unknown emails.

      const rawToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_MINUTES * 60_000);
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
      });

      const resetUrl = `${env.WEB_APP_URL.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
      const mail = passwordResetEmail({
        username: user.username,
        resetUrl,
        expiresInMinutes: PASSWORD_RESET_EXPIRES_MINUTES,
      });
      try {
        await mailer.send({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
      } catch (err) {
        console.error('[auth] password reset email failed:', err);
      }
    },

    /**
     * Consume a reset token and set a new password.
     * On success, all existing refresh tokens for the user are revoked so every
     * logged-in device is kicked out. Lockout state is also cleared.
     */
    async resetPassword(rawToken: string, newPassword: string) {
      const tokenHash = hashToken(rawToken);
      const [stored] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (!stored) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.',
        });
      }

      const passwordHash = await hash(newPassword);

      await db
        .update(users)
        .set({
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, stored.userId));

      // Mark token as consumed.
      await db
        .update(passwordResetTokens)
        .set({ usedAt: sql`now()` })
        .where(eq(passwordResetTokens.id, stored.id));

      // Revoke all existing sessions — force re-login everywhere.
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, stored.userId));
    },

    /** Consume a verification token and mark the user's email as verified. Idempotent-ish: already-verified users succeed silently. */
    async verifyEmail(rawToken: string) {
      const tokenHash = hashToken(rawToken);
      const [stored] = await db
        .select()
        .from(emailVerificationTokens)
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, tokenHash),
            isNull(emailVerificationTokens.usedAt),
            gt(emailVerificationTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (!stored) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Lien invalide ou expiré. Demandez un nouveau lien de vérification.',
        });
      }

      await db
        .update(users)
        .set({ emailVerifiedAt: sql`now()` })
        .where(eq(users.id, stored.userId));

      await db
        .update(emailVerificationTokens)
        .set({ usedAt: sql`now()` })
        .where(eq(emailVerificationTokens.id, stored.id));
    },

    /** Resend a verification email to the current user. Rate-limited per-user to prevent spam. */
    async resendVerification(userId: string) {
      await enforceRateLimit(redis, {
        key: `ratelimit:auth:verify-resend:${userId}`,
        limit: EMAIL_VERIFY_RESEND_LIMIT,
        windowSeconds: EMAIL_VERIFY_RESEND_WINDOW_SECONDS,
      });

      const [user] = await db
        .select({ id: users.id, email: users.email, username: users.username, emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      if (user.emailVerifiedAt) return; // Already verified — silent no-op.

      await sendVerificationEmail(user);
    },

    /**
     * Issue a short-lived, single-use ticket for opening an SSE stream.
     * The raw ticket goes to the caller; we store only its hash in Redis so
     * server log leaks don't reveal the underlying bearer JWT (the prior design
     * put the JWT directly in the /sse query string, where it ended up in access logs).
     */
    async issueSseToken(userId: string): Promise<string> {
      const raw = randomBytes(32).toString('hex');
      await redis.set(`sse-ticket:${hashToken(raw)}`, userId, 'EX', SSE_TICKET_TTL_SECONDS);
      return raw;
    },

    /** Consume a ticket. Returns the owning userId on success, null on miss/expired. */
    async consumeSseToken(rawToken: string): Promise<string | null> {
      const key = `sse-ticket:${hashToken(rawToken)}`;
      const userId = await redis.get(key);
      if (!userId) return null;
      await redis.del(key);
      return userId;
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
