import type Redis from 'ioredis';

export interface NotificationEvent {
  type: 'new-message' | 'building-done' | 'research-done' | 'shipyard-done' | 'fleet-arrived' | 'fleet-returned';
  payload: Record<string, unknown>;
}

export function publishNotification(redis: Redis, userId: string, event: NotificationEvent) {
  return redis.publish(`notifications:${userId}`, JSON.stringify(event));
}
