import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import Redis from 'ioredis';
import { scheduleCron } from '../cron-lock.js';

const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';

describe('scheduleCron', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
  });

  afterAll(async () => {
    await redis.quit();
  });

  afterEach(async () => {
    const keys = await redis.keys('cron:lock:test-*');
    if (keys.length) await redis.del(...keys);
  });

  it('runs the callback on the configured interval', async () => {
    let count = 0;
    const timer = scheduleCron(redis, async () => { count++; }, {
      name: `test-${Date.now()}-interval`,
      intervalMs: 50,
      lockTtlMs: 1000,
    });
    await new Promise((r) => setTimeout(r, 170));
    clearInterval(timer);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('prevents two concurrent workers from running the same tick', async () => {
    const name = `test-${Date.now()}-lock`;
    const timers: NodeJS.Timeout[] = [];
    let runs = 0;

    const slowRun = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 200));
    };

    // Three parallel schedulers for the same cron name — simulates 3 workers.
    for (let i = 0; i < 3; i++) {
      timers.push(scheduleCron(redis, slowRun, { name, intervalMs: 100, lockTtlMs: 5000 }));
    }

    await new Promise((r) => setTimeout(r, 250));
    timers.forEach(clearInterval);

    // Only one worker should have acquired the lock before it expires.
    expect(runs).toBe(1);

    // Wait for cleanup before the lock expires.
    await new Promise((r) => setTimeout(r, 200));
  });

  it('releases the lock after the tick completes so the next tick can run', async () => {
    const name = `test-${Date.now()}-release`;
    let runs = 0;
    const timer = scheduleCron(redis, async () => { runs++; }, {
      name,
      intervalMs: 50,
      lockTtlMs: 5000,
    });
    await new Promise((r) => setTimeout(r, 170));
    clearInterval(timer);
    expect(runs).toBeGreaterThanOrEqual(2);
  });
});
