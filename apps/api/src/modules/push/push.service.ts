import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import type { Database } from '@exilium/db';
import { pushSubscriptions, notificationPreferences } from '@exilium/db';
import { env } from '../../config/env.js';

export type PushCategory = 'building' | 'research' | 'shipyard' | 'fleet' | 'combat' | 'message';

export function createPushService(db: Database) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  }

  return {
    getPublicKey() {
      return env.VAPID_PUBLIC_KEY;
    },

    async subscribe(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
      await db
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint: subscription.endpoint,
          keysP256dh: subscription.keys.p256dh,
          keysAuth: subscription.keys.auth,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            userId,
            keysP256dh: subscription.keys.p256dh,
            keysAuth: subscription.keys.auth,
          },
        });
    },

    async unsubscribe(userId: string, endpoint: string) {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
    },

    async updatePreferences(userId: string, preferences: Partial<Record<PushCategory, boolean>>) {
      const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));

      for (const sub of subs) {
        const current = (sub.preferences ?? {}) as Record<string, boolean>;
        await db
          .update(pushSubscriptions)
          .set({ preferences: { ...current, ...preferences } })
          .where(eq(pushSubscriptions.id, sub.id));
      }
    },

    async getPreferences(userId: string) {
      const [sub] = await db
        .select({ preferences: pushSubscriptions.preferences })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
        .limit(1);
      return (sub?.preferences ?? {
        building: true, research: true, shipyard: true,
        fleet: true, combat: true, message: true,
      }) as Record<PushCategory, boolean>;
    },

    async sendToUser(userId: string, category: PushCategory, payload: { title: string; body: string; url?: string }, eventType?: string) {
      if (!env.VAPID_PUBLIC_KEY) return;

      // Check user notification preferences
      const [prefs] = await db
        .select({ pushDisabled: notificationPreferences.pushDisabled })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);
      if (eventType && prefs?.pushDisabled?.includes(eventType)) return;
      if (!eventType && prefs?.pushDisabled?.includes(category)) return;

      const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));

      for (const sub of subs) {
        const prefs = (sub.preferences ?? {}) as Record<string, boolean>;
        if (prefs[category] === false) continue;

        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keysP256dh, auth: sub.keysAuth },
            },
            JSON.stringify(payload),
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          }
        }
      }
    },
  };
}
