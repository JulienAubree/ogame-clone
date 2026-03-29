# Exilium Mobile PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Exilium into a full PWA (installable, offline, push notifications) and polish mobile UX across all layouts and key pages.

**Architecture:** vite-plugin-pwa with Workbox handles the service worker, precaching, and runtime caching. Push notifications use the Web Push API with VAPID keys, integrated into the existing BullMQ worker pipeline. Mobile UX improvements target layout components, modals, touch targets, and tables.

**Tech Stack:** vite-plugin-pwa, workbox, web-push (API), Tailwind CSS, React 19

---

### Task 1: Install and configure vite-plugin-pwa

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/public/manifest-icons/icon-192x192.png`
- Create: `apps/web/public/manifest-icons/icon-512x512.png`
- Create: `apps/web/public/manifest-icons/icon-maskable-192x192.png`
- Create: `apps/web/public/manifest-icons/icon-maskable-512x512.png`

- [ ] **Step 1: Install vite-plugin-pwa**

```bash
cd apps/web && pnpm add -D vite-plugin-pwa
```

- [ ] **Step 2: Generate placeholder PWA icons**

Create 4 placeholder PNG icons (192x192, 512x512, maskable variants) in `apps/web/public/manifest-icons/`. Use a simple space-themed placeholder — a dark circle with "EX" text centered. These can be replaced with real assets later.

```bash
mkdir -p apps/web/public/manifest-icons
```

Use any available tool (e.g., sharp, canvas, or imagemagick if installed) to generate simple placeholder icons. If no tool is available, create minimal valid PNG files.

- [ ] **Step 3: Configure vite-plugin-pwa in vite.config.ts**

Replace the entire `apps/web/vite.config.ts` with:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'assets/**/*'],
      manifest: {
        name: 'Exilium',
        short_name: 'Exilium',
        description: 'Jeu de stratégie spatiale',
        theme_color: '#5cb8d6',
        background_color: '#070a12',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/manifest-icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/manifest-icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/manifest-icons/icon-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/manifest-icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/trpc\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'trpc-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24h
              },
            },
          },
          {
            urlPattern: /\/assets\/.+\.(png|jpg|jpeg|webp|svg|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            urlPattern: /\.(?:woff|woff2|ttf|otf)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/trpc': 'http://localhost:3000',
      '/sse': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 4: Build and verify manifest generation**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds, `dist/manifest.webmanifest` is generated, `dist/sw.js` is generated.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/public/manifest-icons/
git commit -m "feat(web): configure vite-plugin-pwa with manifest and workbox caching"
```

---

### Task 2: Add iOS meta tags and update prompt

**Files:**
- Modify: `apps/web/index.html`
- Create: `apps/web/src/components/pwa/UpdatePrompt.tsx`
- Modify: `apps/web/src/components/layout/Layout.tsx`

- [ ] **Step 1: Add iOS meta tags and manifest link to index.html**

Replace the `<head>` section in `apps/web/index.html`:

```html
<!doctype html>
<html lang="fr" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#5cb8d6" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Exilium" />
    <link rel="apple-touch-icon" href="/manifest-icons/icon-192x192.png" />
    <title>Exilium</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the UpdatePrompt component**

Create `apps/web/src/components/pwa/UpdatePrompt.tsx`:

```tsx
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-16 left-4 right-4 z-50 lg:bottom-4 lg:left-auto lg:right-4 lg:w-80">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-card/95 p-3 shadow-lg backdrop-blur-lg">
        <span className="text-sm">Nouvelle version disponible</span>
        <button
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Mettre à jour
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add UpdatePrompt to Layout**

In `apps/web/src/components/layout/Layout.tsx`, add the import and render `<UpdatePrompt />` after `<Toaster />`:

```typescript
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt';
```

Add inside the return, after `<Toaster />`:

```tsx
<UpdatePrompt />
```

- [ ] **Step 4: Add vite-plugin-pwa type reference**

In `apps/web/src/vite-env.d.ts` (create if it doesn't exist):

```typescript
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
```

- [ ] **Step 5: Build and verify**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/index.html apps/web/src/components/pwa/ apps/web/src/components/layout/Layout.tsx apps/web/src/vite-env.d.ts
git commit -m "feat(web): add PWA update prompt, iOS meta tags"
```

---

### Task 3: Add offline indicator

**Files:**
- Create: `apps/web/src/hooks/useOnlineStatus.ts`
- Create: `apps/web/src/components/pwa/OfflineBanner.tsx`
- Modify: `apps/web/src/components/layout/Layout.tsx`

- [ ] **Step 1: Create useOnlineStatus hook**

Create `apps/web/src/hooks/useOnlineStatus.ts`:

```typescript
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
```

- [ ] **Step 2: Create OfflineBanner component**

Create `apps/web/src/components/pwa/OfflineBanner.tsx`:

```tsx
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-12 left-0 right-0 z-50 flex items-center justify-center bg-destructive/90 px-4 py-1.5 text-xs font-medium text-destructive-foreground lg:top-14">
      Hors ligne — les données affichées peuvent ne pas être à jour
    </div>
  );
}
```

- [ ] **Step 3: Add OfflineBanner to Layout**

In `apps/web/src/components/layout/Layout.tsx`, add import and render after `<TopBar />`:

```typescript
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
```

Add inside the inner `<div className="flex flex-1 flex-col lg:ml-56">`, right after `<TopBar ... />`:

```tsx
<OfflineBanner />
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useOnlineStatus.ts apps/web/src/components/pwa/OfflineBanner.tsx apps/web/src/components/layout/Layout.tsx
git commit -m "feat(web): add offline banner indicator"
```

---

### Task 4: Push notifications — API schema and service

**Files:**
- Create: `packages/db/src/schema/push-subscriptions.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config/env.ts`
- Create: `apps/api/src/modules/push/push.service.ts`
- Create: `apps/api/src/modules/push/push.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Create push_subscriptions schema**

Create `packages/db/src/schema/push-subscriptions.ts`:

```typescript
import { pgTable, uuid, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  keysP256dh: text('keys_p256dh').notNull(),
  keysAuth: text('keys_auth').notNull(),
  preferences: jsonb('preferences').notNull().default({
    building: true,
    research: true,
    shipyard: true,
    fleet: true,
    combat: true,
    message: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Export from schema index**

In `packages/db/src/schema/index.ts`, add:

```typescript
export * from './push-subscriptions.js';
```

- [ ] **Step 3: Generate and run migration**

```bash
cd packages/db && pnpm drizzle-kit generate && pnpm drizzle-kit migrate
```

Expected: Migration creates `push_subscriptions` table.

- [ ] **Step 4: Install web-push in API**

```bash
cd apps/api && pnpm add web-push && pnpm add -D @types/web-push
```

- [ ] **Step 5: Add VAPID env vars**

In `apps/api/src/config/env.ts`, add to the `envSchema` object (before the closing `}`):

```typescript
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@exilium.app'),
```

- [ ] **Step 6: Create push service**

Create `apps/api/src/modules/push/push.service.ts`:

```typescript
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import type { Database } from '@exilium/db';
import { pushSubscriptions } from '@exilium/db';
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

    async sendToUser(userId: string, category: PushCategory, payload: { title: string; body: string; url?: string }) {
      if (!env.VAPID_PUBLIC_KEY) return;

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
        } catch (err: any) {
          // 404 or 410 = subscription expired, remove it
          if (err.statusCode === 404 || err.statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          }
        }
      }
    },
  };
}
```

- [ ] **Step 7: Create push router**

Create `apps/api/src/modules/push/push.router.ts`:

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc/router.js';
import type { createPushService } from './push.service.js';

export function createPushRouter(pushService: ReturnType<typeof createPushService>) {
  return router({
    getPublicKey: protectedProcedure.query(() => {
      return { publicKey: pushService.getPublicKey() };
    }),

    subscribe: protectedProcedure
      .input(z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        await pushService.subscribe(ctx.userId, input);
        return { ok: true };
      }),

    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        await pushService.unsubscribe(ctx.userId, input.endpoint);
        return { ok: true };
      }),

    getPreferences: protectedProcedure.query(async ({ ctx }) => {
      return pushService.getPreferences(ctx.userId);
    }),

    updatePreferences: protectedProcedure
      .input(z.object({
        building: z.boolean().optional(),
        research: z.boolean().optional(),
        shipyard: z.boolean().optional(),
        fleet: z.boolean().optional(),
        combat: z.boolean().optional(),
        message: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await pushService.updatePreferences(ctx.userId, input);
        return { ok: true };
      }),
  });
}
```

- [ ] **Step 8: Wire push router into app-router**

In `apps/api/src/trpc/app-router.ts`:

Add import at the top:

```typescript
import { createPushService } from '../modules/push/push.service.js';
import { createPushRouter } from '../modules/push/push.router.js';
```

Inside `buildAppRouter()`, after `const marketService = ...`, add:

```typescript
  const pushService = createPushService(db);
```

After `const marketRouter = ...`, add:

```typescript
  const pushRouter = createPushRouter(pushService);
```

In the `return router({...})` object, add after `market: marketRouter,`:

```typescript
    push: pushRouter,
```

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/push-subscriptions.ts packages/db/src/schema/index.ts apps/api/package.json apps/api/src/config/env.ts apps/api/src/modules/push/ apps/api/src/trpc/app-router.ts
git commit -m "feat(api): add push notification service, schema, and tRPC router"
```

---

### Task 5: Push notifications — Service Worker handler

**Files:**
- Create: `apps/web/src/sw-push.ts`
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: Create custom service worker push handler**

Create `apps/web/src/sw-push.ts`:

```typescript
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json() as { title: string; body: string; url?: string };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/manifest-icons/icon-192x192.png',
      badge: '/manifest-icons/icon-192x192.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string })?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if found
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 2: Configure vite-plugin-pwa to import custom SW code**

In `apps/web/vite.config.ts`, add `importScripts` to the `workbox` config, inside the `VitePWA({...})` config object's `workbox` property:

```typescript
      workbox: {
        importScripts: ['/sw-push.js'],
        // ... rest of existing workbox config
```

Also add a Vite build entry to output `sw-push.ts` — or simpler: copy the file as a static asset. Add to the `VitePWA` config:

```typescript
      injectManifest: undefined, // ensure we use generateSW mode
```

Actually, the simpler approach: place the push handler as a static file. Move `sw-push.ts` to `apps/web/public/sw-push.js` instead (plain JS since it's loaded by the SW directly):

Create `apps/web/public/sw-push.js`:

```javascript
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/manifest-icons/icon-192x192.png',
      badge: '/manifest-icons/icon-192x192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
```

Delete `apps/web/src/sw-push.ts` if it was created in step 1.

- [ ] **Step 3: Verify workbox importScripts config**

Ensure the VitePWA workbox config in `vite.config.ts` includes:

```typescript
        importScripts: ['/sw-push.js'],
```

- [ ] **Step 4: Build and verify**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds, `dist/sw.js` contains the importScripts directive.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/sw-push.js apps/web/vite.config.ts
git commit -m "feat(web): add push notification handler to service worker"
```

---

### Task 6: Push notifications — Frontend subscription

**Files:**
- Create: `apps/web/src/hooks/usePushSubscription.ts`
- Modify: `apps/web/src/hooks/useNotifications.ts`

- [ ] **Step 1: Create usePushSubscription hook**

Create `apps/web/src/hooks/usePushSubscription.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { trpc } from '@/trpc';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription() {
  const { data: keyData } = trpc.push.getPublicKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const attempted = useRef(false);

  useEffect(() => {
    if (!keyData?.publicKey || attempted.current) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;

    attempted.current = true;

    (async () => {
      try {
        // Wait for SW to be ready
        const registration = await navigator.serviceWorker.ready;

        // Check existing subscription
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          // Already subscribed, send to server in case it's a new device
          const json = existing.toJSON();
          subscribeMutation.mutate({
            endpoint: existing.endpoint,
            keys: {
              p256dh: json.keys!.p256dh!,
              auth: json.keys!.auth!,
            },
          });
          return;
        }

        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        });

        const json = subscription.toJSON();
        subscribeMutation.mutate({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: json.keys!.p256dh!,
            auth: json.keys!.auth!,
          },
        });
      } catch {
        // Push not supported or permission denied — fail silently
      }
    })();
  }, [keyData?.publicKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
```

- [ ] **Step 2: Integrate usePushSubscription in useNotifications**

In `apps/web/src/hooks/useNotifications.ts`, add the import and call at the top of the `useNotifications` function:

```typescript
import { usePushSubscription } from './usePushSubscription';
```

Inside `useNotifications()`, before the `useSSE(...)` call, add:

```typescript
  usePushSubscription();
```

Remove the existing `requestNotificationPermission()` function and the `permissionRequested` ref + the permission request block inside `useSSE` callback (lines 32-49), since push subscription now handles permission.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/usePushSubscription.ts apps/web/src/hooks/useNotifications.ts
git commit -m "feat(web): add push subscription hook, integrate with notifications"
```

---

### Task 7: Push notifications — Wire into workers

**Files:**
- Modify: `apps/api/src/workers/build-completion.worker.ts`
- Modify: `apps/api/src/workers/fleet.worker.ts`
- Modify: `apps/api/src/workers/worker.ts`

- [ ] **Step 1: Add pushService to build-completion worker**

In `apps/api/src/workers/build-completion.worker.ts`:

Add to the `Services` type:

```typescript
import type { createPushService } from '../modules/push/push.service.js';
```

```typescript
type Services = {
  buildingService: ReturnType<typeof createBuildingService>;
  researchService: ReturnType<typeof createResearchService>;
  shipyardService: ReturnType<typeof createShipyardService>;
  tutorialService: ReturnType<typeof createTutorialService>;
  pushService: ReturnType<typeof createPushService>;
};
```

After the `publishNotification(...)` call (line 48-51), add:

```typescript
      // Push notification
      const categoryMap: Record<string, 'building' | 'research' | 'shipyard'> = {
        'building': 'building',
        'research': 'research',
        'shipyard-unit': 'shipyard',
      };
      const pushCategory = categoryMap[job.name];
      if (pushCategory) {
        const name = String(result.notificationPayload.name ?? result.notificationPayload.buildingId ?? result.notificationPayload.techId ?? result.notificationPayload.unitId);
        const level = result.notificationPayload.level ? ` niv. ${result.notificationPayload.level}` : '';
        const labels: Record<string, string> = { building: 'Construction terminée', research: 'Recherche terminée', shipyard: 'Production terminée' };
        await services.pushService.sendToUser(result.userId, pushCategory, {
          title: labels[pushCategory],
          body: `${name}${level}`,
          url: pushCategory === 'building' ? '/buildings' : pushCategory === 'research' ? '/research' : '/shipyard',
        });
      }
```

- [ ] **Step 2: Add pushService to fleet worker**

In `apps/api/src/workers/fleet.worker.ts`:

Add import and extend Services type:

```typescript
import type { createPushService } from '../modules/push/push.service.js';
```

```typescript
type Services = {
  fleetService: ReturnType<typeof createFleetService>;
  tutorialService: ReturnType<typeof createTutorialService>;
  pushService: ReturnType<typeof createPushService>;
};
```

After the `publishNotification(redis, result.userId, ...)` call (line 54-57), add:

```typescript
        // Push notification
        const fleetCombatTypes = ['fleet-attack-landed', 'fleet-hostile-inbound'];
        const pushCategory = fleetCombatTypes.includes(result.eventType) ? 'combat' as const : 'fleet' as const;
        await services.pushService.sendToUser(result.userId, pushCategory, {
          title: result.eventType.includes('arrive') ? 'Flotte arrivée' : result.eventType.includes('return') ? 'Flotte de retour' : 'Événement de flotte',
          body: String(result.notificationPayload.targetCoords ?? result.notificationPayload.originName ?? ''),
          url: '/fleet',
        });
```

After the `notifyUsers` loop (line 67-74), add push notifications for other users:

```typescript
        if (result.notifyUsers) {
          for (const notify of result.notifyUsers) {
            const cat = notify.type.includes('attack') || notify.type.includes('hostile') ? 'combat' as const : 'fleet' as const;
            await services.pushService.sendToUser(notify.userId, cat, {
              title: notify.type.includes('attack') ? 'Planète attaquée !' : 'Flotte en approche',
              body: String(notify.payload.targetCoords ?? ''),
              url: notify.type.includes('attack') ? '/reports' : '/fleet',
            });
          }
        }
```

- [ ] **Step 3: Pass pushService when starting workers**

In `apps/api/src/workers/worker.ts`, ensure `pushService` is created and passed to both `startBuildCompletionWorker` and `startFleetWorker`.

Add import:

```typescript
import { createPushService } from '../modules/push/push.service.js';
```

In the function where workers are started, create the service:

```typescript
const pushService = createPushService(db);
```

Pass it to both workers:

```typescript
startBuildCompletionWorker(db, redis, { buildingService, researchService, shipyardService, tutorialService, pushService });
startFleetWorker(db, redis, { fleetService, tutorialService, pushService });
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/ apps/api/src/modules/push/
git commit -m "feat(api): wire push notifications into build-completion and fleet workers"
```

---

### Task 8: Push notification preferences UI

**Files:**
- Modify: `apps/web/src/pages/Profile.tsx`

- [ ] **Step 1: Add notification preferences section to Profile page**

In `apps/web/src/pages/Profile.tsx`, add after the "Visibilité du profil" section (before the closing `</div>` of the right column):

Add these queries/mutations at the top of the `Profile` component (after the existing queries):

```typescript
  const { data: pushPrefs } = trpc.push.getPreferences.useQuery();
  const updatePushPrefs = trpc.push.updatePreferences.useMutation({
    onSuccess: () => utils.push.getPreferences.invalidate(),
  });
```

Add this JSX section after the visibility card:

```tsx
          {/* Push Notifications */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Notifications push</h3>
            <p className="text-xs text-muted-foreground">Recevez des alertes même quand le jeu est fermé.</p>
            <div className="space-y-2">
              {([
                { key: 'building' as const, label: 'Construction' },
                { key: 'research' as const, label: 'Recherche' },
                { key: 'shipyard' as const, label: 'Chantier spatial' },
                { key: 'fleet' as const, label: 'Flotte' },
                { key: 'combat' as const, label: 'Combat' },
                { key: 'message' as const, label: 'Messages' },
              ]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushPrefs?.[key] !== false}
                    onChange={(e) => updatePushPrefs.mutate({ [key]: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/Profile.tsx
git commit -m "feat(web): add push notification preferences to profile page"
```

---

### Task 9: Push notifications for messages

**Files:**
- Modify: `apps/api/src/modules/message/message.service.ts`

- [ ] **Step 1: Find message sending logic and add push**

In the message service, find the function that sends messages (likely `sendMessage` or similar) and add push notification after the existing `publishNotification` call.

Add import at the top:

```typescript
import type { createPushService } from '../push/push.service.js';
```

Add `pushService` as a dependency to the `createMessageService` factory. Then after the Redis notification publish for new messages, add:

```typescript
await pushService.sendToUser(recipientId, 'message', {
  title: 'Nouveau message',
  body: `Message de ${senderUsername}`,
  url: '/messages',
});
```

Note: The exact integration point depends on the message service's internal structure. The pattern is the same as the worker integration: find where `publishNotification` is called for `new-message` type, and add `pushService.sendToUser` right after.

Also update `apps/api/src/trpc/app-router.ts` to pass `pushService` to `createMessageService` if needed:

```typescript
const messageService = createMessageService(db, redis, pushService);
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/message/ apps/api/src/trpc/app-router.ts
git commit -m "feat(api): add push notifications for new messages"
```

---

### Task 10: Generate VAPID keys

**Files:**
- Modify: `apps/api/.env` (or `.env.example`)

- [ ] **Step 1: Generate VAPID keys**

```bash
cd apps/api && npx web-push generate-vapid-keys
```

Expected: Outputs a public key and private key.

- [ ] **Step 2: Add keys to .env**

Add the generated keys to `apps/api/.env` (DO NOT commit the actual private key — only update `.env.example` with placeholder):

```bash
VAPID_PUBLIC_KEY=<generated-public-key>
VAPID_PRIVATE_KEY=<generated-private-key>
VAPID_SUBJECT=mailto:admin@exilium.app
```

Update `.env.example`:

```
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:admin@exilium.app
```

- [ ] **Step 3: Commit (only .env.example)**

```bash
git add .env.example
git commit -m "docs: add VAPID key placeholders to .env.example"
```

---

### Task 11: Mobile UX — Touch feedback and base utilities

**Files:**
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/tailwind.config.js`

- [ ] **Step 1: Add touch feedback utilities to global.css**

In `apps/web/src/styles/global.css`, add at the end of the `@layer components` block:

```css
  /* Touch feedback for interactive elements on mobile */
  .touch-target {
    @apply min-h-[44px] min-w-[44px];
  }

  .touch-feedback {
    @apply transition-transform duration-150 active:scale-[0.97] active:opacity-80;
  }
```

- [ ] **Step 2: Add safe-area utilities to tailwind config**

In `apps/web/tailwind.config.js`, add to `theme.extend`:

```javascript
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/styles/global.css apps/web/tailwind.config.js
git commit -m "feat(web): add touch feedback utilities and safe-area spacing"
```

---

### Task 12: Mobile UX — BottomTabBar improvements

**Files:**
- Modify: `apps/web/src/components/layout/BottomTabBar.tsx`
- Modify: `apps/web/src/components/layout/BottomSheet.tsx`

- [ ] **Step 1: Improve BottomTabBar touch targets**

In `apps/web/src/components/layout/BottomTabBar.tsx`, update the tab button styling.

Replace the `<nav>` element (the bottom bar itself, line 114):

```tsx
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-white/10 bg-card/95 backdrop-blur-lg pb-safe-bottom lg:hidden">
```

Replace the tab button className (line 121-123):

```tsx
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-all touch-feedback ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
```

Update icon size from 22 to 24 (line 126):

```tsx
                <tab.icon width={24} height={24} />
```

Update label text size from `text-[10px]` to `text-xs` (line 133):

```tsx
              <span className="text-xs font-medium">{tab.label}</span>
```

- [ ] **Step 2: Update main content padding to match new tab bar height**

In `apps/web/src/components/layout/Layout.tsx`, change `pb-14` to `pb-16`:

```tsx
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
```

- [ ] **Step 3: Improve BottomSheet menu items**

In `apps/web/src/components/layout/BottomSheet.tsx`, add safe-area padding. Replace the inner sheet div:

```tsx
        <div
          ref={sheetRef}
          className="absolute bottom-0 left-0 right-0 animate-slide-up-sheet rounded-t-2xl border-t border-white/10 bg-card/95 backdrop-blur-lg p-4 pb-safe-bottom"
        >
          {children}
        </div>
```

- [ ] **Step 4: Improve BottomSheet menu item sizes in BottomTabBar**

In `apps/web/src/components/layout/BottomTabBar.tsx`, update the sheet item button styling (inside the `SHEET_ITEMS` render, line 100-101):

```tsx
                className={`flex items-center gap-3 rounded-lg p-4 text-left transition-all touch-feedback ${
                  location.pathname === item.path
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
```

Update icon size in sheet items from 20 to 22 (line 106):

```tsx
                <item.icon width={22} height={22} />
```

Update label from `text-sm` to `text-base` (line 107):

```tsx
                <span className="text-base font-medium">{item.label}</span>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/BottomTabBar.tsx apps/web/src/components/layout/BottomSheet.tsx apps/web/src/components/layout/Layout.tsx
git commit -m "feat(web): improve bottom navigation touch targets and sizing"
```

---

### Task 13: Mobile UX — Modal to bottom sheet on mobile

**Files:**
- Modify: `apps/web/src/components/ui/Modal.tsx`

- [ ] **Step 1: Make Modal responsive — center on desktop, bottom sheet on mobile**

Replace the entire `apps/web/src/components/ui/Modal.tsx`:

```tsx
import { type ReactNode, type HTMLAttributes, useEffect, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ open, onClose, children, title, className, ...props }, ref) => {
    useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      if (open) {
        document.addEventListener('keydown', handleEsc);
        document.body.style.overflow = 'hidden';
      }
      return () => {
        document.removeEventListener('keydown', handleEsc);
        document.body.style.overflow = '';
      };
    }, [open, onClose]);

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
        <div className="fixed inset-0 bg-black/60" onClick={onClose} />
        <div
          ref={ref}
          className={cn(
            'relative z-50 w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-card p-5 pb-safe-bottom shadow-lg animate-slide-up-sheet',
            'lg:max-w-lg lg:rounded-lg lg:animate-fade-in lg:pb-6',
            className,
          )}
          {...props}
        >
          {title && <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>}
          {children}
        </div>
      </div>
    );
  },
);
Modal.displayName = 'Modal';

export { Modal };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/ui/Modal.tsx
git commit -m "feat(web): make Modal responsive — bottom sheet on mobile, centered on desktop"
```

---

### Task 14: Mobile UX — TopBar touch improvements

**Files:**
- Modify: `apps/web/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Improve touch targets in TopBar**

In `apps/web/src/components/layout/TopBar.tsx`:

Update planet selector button (line 153-154) — make it larger:

```tsx
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent touch-feedback"
```

Update message button (line 218-221) — increase padding:

```tsx
          className="relative rounded-lg p-2.5 text-muted-foreground hover:bg-accent hover:text-foreground touch-feedback"
```

Update notification bell button (line 237-239) — increase padding:

```tsx
            className="relative rounded-lg p-2.5 text-muted-foreground hover:bg-accent hover:text-foreground touch-feedback"
```

Update notification dropdown items — make them taller (line 261-263):

```tsx
                      className={cn(
                        'flex w-full items-start gap-2 px-3 py-3 text-left text-sm hover:bg-accent touch-feedback',
                        !event.read && 'bg-primary/5 font-medium',
                      )}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/TopBar.tsx
git commit -m "feat(web): improve TopBar touch targets for mobile"
```

---

### Task 15: Mobile UX — ResourceBar improvements

**Files:**
- Modify: `apps/web/src/components/layout/ResourceBar.tsx`

- [ ] **Step 1: Make ResourceBar taller and more tappable**

In `apps/web/src/components/layout/ResourceBar.tsx`:

Update the main bar height (line 45) — increase from `h-10` to `h-11`:

```tsx
        className="sticky top-12 z-30 flex h-11 cursor-pointer items-center justify-around border-b border-white/5 bg-card/80 backdrop-blur-md px-3 lg:hidden"
```

Update resource counter text size from `text-xs` to `text-sm` (line 77):

```tsx
      <span className={`text-sm font-medium tabular-nums ${colorClass}`}>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/ResourceBar.tsx
git commit -m "feat(web): improve ResourceBar sizing for mobile"
```

---

### Task 16: Mobile UX — Button touch feedback

**Files:**
- Modify: `apps/web/src/components/ui/Button.tsx`

- [ ] **Step 1: Add touch feedback to Button component**

In `apps/web/src/components/ui/Button.tsx`, add `touch-feedback` to the base variant classes.

Find the `cva()` call's base classes string and append `touch-feedback`:

In the base classes of the CVA definition, add `touch-feedback` at the end:

```typescript
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 touch-feedback',
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/ui/Button.tsx
git commit -m "feat(web): add touch feedback to Button component"
```

---

### Task 17: Mobile UX — Form input improvements

**Files:**
- Modify: `apps/web/src/styles/global.css`

- [ ] **Step 1: Add mobile form input styles**

In `apps/web/src/styles/global.css`, add within the `@layer base` block, after the existing iOS Safari auto-zoom rule:

```css
  /* Ensure form inputs are comfortable on mobile */
  input[type="number"],
  input[type="text"],
  select {
    @apply min-h-[44px];
  }
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/styles/global.css
git commit -m "feat(web): ensure minimum touch target height for form inputs"
```

---

### Task 18: Final build verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

```bash
cd apps/web && pnpm build
```

Expected: Build succeeds, no type errors.

- [ ] **Step 2: Check generated files**

```bash
ls -la apps/web/dist/sw.js apps/web/dist/manifest.webmanifest
```

Expected: Both files exist.

- [ ] **Step 3: Verify manifest content**

```bash
cat apps/web/dist/manifest.webmanifest
```

Expected: Contains correct app name, icons, display mode, colors.

- [ ] **Step 4: API build**

```bash
cd apps/api && pnpm build
```

Expected: Build succeeds with push module included.

- [ ] **Step 5: Commit any remaining changes**

```bash
git status
```

If any uncommitted changes remain, commit them:

```bash
git add -A && git commit -m "chore: final build verification for mobile PWA"
```
