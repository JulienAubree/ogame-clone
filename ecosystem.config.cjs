module.exports = {
  apps: [
    {
      // API in cluster mode: PM2 + Node cluster share the port, each fork
      // handles its own requests. Rate-limit uses Redis, SSE uses Redis
      // pub/sub, JWT is stateless — all cluster-safe. The in-process
      // gameConfig cache is invalidated across forks via Redis pub/sub on
      // `game-config:invalidate` (see game-config.service.ts).
      name: 'exilium-api',
      script: 'apps/api/dist/index.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      exec_mode: 'cluster',
      instances: 4, // VPS has 4 cores
      autorestart: true,
      max_memory_restart: '1G',
    },
    {
      // Worker stays single-instance: BullMQ queues are already shared and
      // crons use Redis SETNX locks. Running multiple workers would only
      // multiply concurrent job processing, which isn't the bottleneck today.
      name: 'exilium-worker',
      script: 'apps/api/dist/workers/worker.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
    },
  ],
};
