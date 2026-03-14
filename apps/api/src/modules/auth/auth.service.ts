import { eq } from 'drizzle-orm';
import { hash, verify } from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'crypto';
import { TRPCError } from '@trpc/server';
import { users, refreshTokens } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { env } from '../../config/env.js';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

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

export function createAuthService(db: Database) {
  return {
    async register(email: string, username: string, password: string) {
      const passwordHash = await hash(password);

      const [user] = await db
        .insert(users)
        .values({ email, username, passwordHash })
        .returning({ id: users.id, email: users.email, username: users.username });

      if (!user) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return user;
    },

    async login(email: string, password: string, rememberMe = false) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });

      const valid = await verify(user.passwordHash, password);
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });

      const accessToken = await new SignJWT({ userId: user.id })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(env.JWT_EXPIRES_IN)
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
        user: { id: user.id, email: user.email, username: user.username },
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
