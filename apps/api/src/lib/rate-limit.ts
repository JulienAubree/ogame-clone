import type Redis from 'ioredis';
import { TRPCError } from '@trpc/server';

export interface RateLimitOptions {
  /** Redis key — caller composes the full key (e.g. `ratelimit:auth:login:<ip>`). */
  key: string;
  /** Max requests allowed in the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Current count after this request. */
  count: number;
  /** Seconds until the bucket resets. */
  retryAfter: number;
}

/**
 * Simple fixed-window rate limiter backed by Redis INCR + EXPIRE.
 * First hit in a window sets the TTL; subsequent hits only INCR.
 * Not a sliding window — accuracy is ±(windowSeconds/2), good enough for auth abuse.
 */
export async function checkRateLimit(redis: Redis, opts: RateLimitOptions): Promise<RateLimitResult> {
  const count = await redis.incr(opts.key);
  if (count === 1) {
    await redis.expire(opts.key, opts.windowSeconds);
  }
  const ttl = await redis.ttl(opts.key);
  const retryAfter = ttl > 0 ? ttl : opts.windowSeconds;
  return {
    allowed: count <= opts.limit,
    count,
    retryAfter,
  };
}

/** Enforce a rate limit: throws TRPCError TOO_MANY_REQUESTS if exceeded. */
export async function enforceRateLimit(redis: Redis, opts: RateLimitOptions): Promise<void> {
  const result = await checkRateLimit(redis, opts);
  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Trop de requêtes. Réessayez dans ${result.retryAfter}s.`,
    });
  }
}
