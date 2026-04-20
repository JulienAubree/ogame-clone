import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import type { createAuthService } from '../auth/auth.service.js';

/** Max concurrent SSE streams per user. Extra browser tabs beyond this are rejected. */
const SSE_MAX_CONNECTIONS_PER_USER = 3;

export function registerSSE(
  app: FastifyInstance,
  redisUrl: string,
  controlRedis: Redis,
  authService: ReturnType<typeof createAuthService>,
) {
  app.get('/sse', async (req, reply) => {
    const token = (req.query as { token?: string }).token;
    if (!token) return reply.status(401).send({ error: 'Missing token' });

    const userId = await authService.consumeSseToken(token);
    if (!userId) return reply.status(401).send({ error: 'Invalid or expired token' });

    // Enforce per-user connection cap. INCR first, then check: if we exceed,
    // DECR back and reject. Keeping a TTL means a crashed server won't leave
    // a counter stuck forever — it'll relax in a minute or two.
    const connKey = `sse:conn:${userId}`;
    const count = await controlRedis.incr(connKey);
    if (count === 1) {
      await controlRedis.expire(connKey, 120);
    }
    if (count > SSE_MAX_CONNECTIONS_PER_USER) {
      await controlRedis.decr(connKey);
      return reply.status(429).send({ error: 'Too many active connections' });
    }

    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });

    const subscriber = new Redis(redisUrl);
    const channel = `notifications:${userId}`;
    await subscriber.subscribe(channel);

    subscriber.on('message', (_ch: string, message: string) => {
      reply.raw.write(`data: ${message}\n\n`);
    });

    // Heartbeat keeps the connection alive AND refreshes the TTL on the
    // connection counter so long-lived streams don't get culled by the timeout.
    const heartbeat = setInterval(() => {
      reply.raw.write(':ping\n\n');
      void controlRedis.expire(connKey, 120);
    }, 30_000);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeat);
      void subscriber.unsubscribe(channel).catch(() => {});
      void subscriber.quit().catch(() => {});
      void controlRedis.decr(connKey);
    };

    req.raw.on('close', cleanup);
    req.raw.on('error', cleanup);
  });
}
