import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import { createDb } from '@exilium/db';
import { buildAppRouter } from './trpc/app-router.js';
import { createContext } from './trpc/context.js';
import { env } from './config/env.js';
import { registerSSE } from './modules/notification/notification.sse.js';
import { registerAssetUploadRoute } from './modules/admin/asset-upload.route.js';

const isProd = env.NODE_ENV === 'production';

const server = Fastify({
  routerOptions: { maxParamLength: 500 },
  logger: {
    level: isProd ? 'warn' : 'info',
    // Redact anything that might contain a bearer token or short-lived SSE
    // token. Pino's redact paths apply to the structured log object, so the
    // common shapes produced by fastify's request logger are covered here.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.query.token',
        'headers.authorization',
        'headers.cookie',
      ],
      censor: '[redacted]',
    },
  },
});

// Allow the configured web app URL plus localhost dev origins. We can't use
// origin:true because it reflects any origin, which defeats CORS.
const allowedOrigins = new Set<string>([
  env.WEB_APP_URL,
  'http://localhost:5173',
  'http://localhost:5174',
]);

await server.register(cors, {
  origin(origin, cb) {
    // Same-origin or non-browser requests have no Origin header — allow them.
    if (!origin) return cb(null, true);
    cb(null, allowedOrigins.has(origin));
  },
  credentials: true,
});

// Helmet applies sane security headers (HSTS, X-Frame-Options, etc.).
// CSP is disabled for now — we serve uploaded assets and the Vite dev server
// from cross-origin, which would require a per-environment policy to tune.
await server.register(helmet, { contentSecurityPolicy: false });

await server.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 },
});

const db = createDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);
const { router: appRouter, authService } = buildAppRouter(db, redis);

// Global IP-based rate limit. The SPA polls tRPC ~6–12 req/min per user, and
// IPs can be shared (NAT, households), so 300/min keeps room for multi-device
// users while blocking obvious abuse. Per-endpoint limits (auth, messages…)
// remain defined in their services via enforceRateLimit for tighter control.
// /health is skipped so uptime monitors can poll freely.
await server.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  redis,
  keyGenerator: (req) => req.ip,
  allowList: (req) => req.url === '/health',
  errorResponseBuilder: (_req, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Trop de requêtes. Réessaie dans ${Math.ceil(context.ttl / 1000)}s.`,
  }),
});

// Liveness + dependency probe. Returns 503 when any dependency is unreachable
// so external uptime monitors can alert without parsing the body.
server.get('/health', async (_req, reply) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  const dbStart = Date.now();
  try {
    await db.execute(sql`select 1`);
    checks.db = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.db = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const redisStart = Date.now();
  try {
    const pong = await redis.ping();
    checks.redis = { ok: pong === 'PONG', latencyMs: Date.now() - redisStart };
  } catch (err) {
    checks.redis = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return reply
    .status(allOk ? 200 : 503)
    .send({ status: allOk ? 'ok' : 'degraded', timestamp: new Date().toISOString(), checks });
});

await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

registerSSE(server, env.REDIS_URL, redis, authService);
registerAssetUploadRoute(server, db);

try {
  await server.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${env.API_PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
