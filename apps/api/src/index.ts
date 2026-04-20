import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Redis from 'ioredis';
import { createDb } from '@exilium/db';
import { buildAppRouter } from './trpc/app-router.js';
import { createContext } from './trpc/context.js';
import { env } from './config/env.js';
import { registerSSE } from './modules/notification/notification.sse.js';
import { registerAssetUploadRoute } from './modules/admin/asset-upload.route.js';

const server = Fastify({ logger: true, maxParamLength: 500 });

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

server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const db = createDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL);
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const appRouter = buildAppRouter(db, redis);

await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
  },
});

registerSSE(server, env.REDIS_URL, JWT_SECRET);
registerAssetUploadRoute(server, db);

try {
  await server.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${env.API_PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
