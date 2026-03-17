import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Redis from 'ioredis';
import { createDb } from '@ogame-clone/db';
import { buildAppRouter } from './trpc/app-router.js';
import { createContext } from './trpc/context.js';
import { env } from './config/env.js';
import { registerSSE } from './modules/notification/notification.sse.js';

const server = Fastify({ logger: true, maxParamLength: 500 });

await server.register(cors, { origin: true });

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

try {
  await server.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`Server listening on http://localhost:${env.API_PORT}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
