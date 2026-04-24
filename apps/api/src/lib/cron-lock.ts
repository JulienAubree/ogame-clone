import type Redis from 'ioredis';

export interface CronLockOptions {
  /** Stable identifier used as the lock key (e.g. `resource-tick`). */
  name: string;
  /** Interval between ticks in ms. Used as default lock TTL. */
  intervalMs: number;
  /**
   * Optional override for the lock TTL. Defaults to min(intervalMs - 1s, 60s)
   * so that a hung tick releases before the next one is scheduled.
   */
  lockTtlMs?: number;
}

/**
 * Wrap a cron tick with a Redis-backed lock so that at most one worker executes
 * it at a time, even across horizontally-scaled processes. Missed ticks are
 * dropped silently — cron logic must tolerate that (e.g. be idempotent or
 * catch up from DB state).
 *
 * Also swallows errors so a failing tick doesn't kill the process, and logs
 * them with the cron name for traceability.
 */
export function scheduleCron(
  redis: Redis,
  run: () => Promise<void>,
  opts: CronLockOptions,
): NodeJS.Timeout {
  const lockTtlMs = opts.lockTtlMs ?? Math.min(Math.max(opts.intervalMs - 1000, 1000), 60_000);
  const lockKey = `cron:lock:${opts.name}`;

  const tick = async () => {
    let acquired = false;
    try {
      const res = await redis.set(lockKey, String(process.pid), 'PX', lockTtlMs, 'NX');
      if (res !== 'OK') return;
      acquired = true;
      await run();
    } catch (err) {
      console.error(`[cron:${opts.name}] error:`, err);
    } finally {
      if (acquired) {
        // Release the lock only if we still own it — the value check guards
        // against releasing a lock grabbed by another worker after our TTL.
        await redis
          .eval(
            `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
            1,
            lockKey,
            String(process.pid),
          )
          .catch(() => {});
      }
    }
  };

  return setInterval(tick, opts.intervalMs);
}
