# Friend Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time SSE notifications and persistent game events for friend request/accept/decline actions.

**Architecture:** Extend `createFriendService` factory to receive `redis` and `gameEventService` via closure. After each friend action (request/accept/decline), publish an SSE notification and insert a game event. Frontend handles the 3 new event types in `useNotifications()` and `game-events.ts`.

**Tech Stack:** TypeScript, ioredis, tRPC, Drizzle ORM, React

---

## File Map

**Modify:**
- `apps/api/src/modules/game-event/game-event.service.ts` — add 3 types to `GameEventType` union
- `apps/api/src/modules/friend/friend.service.ts` — add redis + gameEventService to factory, add notifications to request/accept/decline
- `apps/api/src/trpc/app-router.ts` — reorder instantiation, pass redis + gameEventService to friend service
- `apps/web/src/hooks/useNotifications.ts` — handle 3 new SSE event types
- `apps/web/src/lib/game-events.ts` — add colors, labels, navigation targets for 3 types

---

### Task 1: Backend — extend GameEventType + friend service notifications

**Files:**
- Modify: `apps/api/src/modules/game-event/game-event.service.ts`
- Modify: `apps/api/src/modules/friend/friend.service.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Add friend event types to GameEventType**

In `apps/api/src/modules/game-event/game-event.service.ts`, update the type union:

```ts
// OLD:
export type GameEventType = 'building-done' | 'research-done' | 'shipyard-done' | 'fleet-arrived' | 'fleet-returned' | 'pve-mission-done' | 'tutorial-quest-done';

// NEW:
export type GameEventType = 'building-done' | 'research-done' | 'shipyard-done' | 'fleet-arrived' | 'fleet-returned' | 'pve-mission-done' | 'tutorial-quest-done' | 'friend-request' | 'friend-accepted' | 'friend-declined';
```

- [ ] **Step 2: Update friend service factory signature and add notifications**

Read `apps/api/src/modules/friend/friend.service.ts`. The existing imports (`eq`, `and`, `or`, `TRPCError`, `friendships`, `users`, `Database`) stay as-is. Add these 3 new imports:

```ts
import type Redis from 'ioredis';
import { publishNotification } from '../notification/notification.publisher.js';
import type { createGameEventService } from '../game-event/game-event.service.js';
```

Then update the factory signature from `createFriendService(db: Database)` to:

```ts
export function createFriendService(
  db: Database,
  redis: Redis,
  gameEventService: ReturnType<typeof createGameEventService>,
) {
```

Then add a helper inside the factory (before the return):

```ts
  async function getUsername(userId: string): Promise<string> {
    const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1);
    return user?.username ?? 'Joueur inconnu';
  }
```

Then modify the 3 methods. After the existing DB action in each, add the notification + game event:

**In `request()` — after `const [row] = await db.insert(friendships)...returning();` and before `return row;`:**

```ts
      const username = await getUsername(requesterId);
      const payload = { fromUserId: requesterId, fromUsername: username };
      await publishNotification(redis, addresseeId, { type: 'friend-request', payload });
      await gameEventService.insert(addresseeId, null, 'friend-request', payload);

      return row; // keep existing return
```

**In `accept()` — after `db.update(friendships)...`:**

```ts
      const username = await getUsername(userId);
      const payload = { fromUserId: userId, fromUsername: username };
      await publishNotification(redis, fs.requesterId, { type: 'friend-accepted', payload });
      await gameEventService.insert(fs.requesterId, null, 'friend-accepted', payload);
```

**In `decline()` — before `db.delete(friendships)...` (capture requesterId before deletion):**

```ts
      const username = await getUsername(userId);
      const payload = { fromUserId: userId, fromUsername: username };
      // Notify before delete (fs.requesterId still available)
      await publishNotification(redis, fs.requesterId, { type: 'friend-declined', payload });
      await gameEventService.insert(fs.requesterId, null, 'friend-declined', payload);
```

- [ ] **Step 3: Update app-router.ts wiring**

In `apps/api/src/trpc/app-router.ts`, two changes:

1. Move `gameEventService` instantiation (currently line 69) **before** `friendService` (currently line 65).
2. Update the `createFriendService` call:

```ts
// OLD:
const friendService = createFriendService(db);

// NEW:
const friendService = createFriendService(db, redis, gameEventService);
```

- [ ] **Step 4: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit and push**

```bash
git add apps/api/src/modules/game-event/game-event.service.ts apps/api/src/modules/friend/friend.service.ts apps/api/src/trpc/app-router.ts
git commit -m "feat: add SSE notifications + game events for friend actions

Notify on friend request received, accepted, and declined.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push
```

---

### Task 2: Frontend — handle friend notification events

**Files:**
- Modify: `apps/web/src/hooks/useNotifications.ts`
- Modify: `apps/web/src/lib/game-events.ts`

- [ ] **Step 1: Add 3 cases to useNotifications()**

In `apps/web/src/hooks/useNotifications.ts`, add these cases to the switch statement (before the closing `}`). Note: the existing block at lines 52-56 already invalidates `gameEvent.unreadCount`, `gameEvent.recent`, `gameEvent.byPlanet` for all non-message events — no need to duplicate that.

```ts
      case 'friend-request':
        utils.friend.pendingReceived.invalidate();
        addToast(`${event.payload.fromUsername} vous a envoyé une demande d'ami`);
        showBrowserNotification('Demande d\'ami', `${event.payload.fromUsername} vous a envoyé une demande d'ami`);
        break;
      case 'friend-accepted':
        utils.friend.list.invalidate();
        utils.friend.pendingSent.invalidate();
        addToast(`${event.payload.fromUsername} a accepté votre demande d'ami`);
        showBrowserNotification('Ami accepté', `${event.payload.fromUsername} a accepté votre demande d'ami`);
        break;
      case 'friend-declined':
        utils.friend.pendingSent.invalidate();
        addToast(`${event.payload.fromUsername} a refusé votre demande d'ami`);
        showBrowserNotification('Demande refusée', `${event.payload.fromUsername} a refusé votre demande d'ami`);
        break;
```

- [ ] **Step 2: Add friend event colors to eventTypeColor()**

In `apps/web/src/lib/game-events.ts`, add 3 cases to `eventTypeColor()`:

```ts
    case 'friend-request': return 'bg-sky-500';
    case 'friend-accepted': return 'bg-emerald-500';
    case 'friend-declined': return 'bg-red-500';
```

- [ ] **Step 3: Add friend event text to formatEventText()**

In the same file, add 3 cases to `formatEventText()`:

```ts
    case 'friend-request': return `Demande d'ami de ${p.fromUsername}`;
    case 'friend-accepted': return `${p.fromUsername} a accepté votre demande`;
    case 'friend-declined': return `${p.fromUsername} a refusé votre demande`;
```

- [ ] **Step 4: Add friend event navigation targets to eventNavigationTarget()**

In the same file, add 3 cases to `eventNavigationTarget()`:

```ts
    case 'friend-request': return '/profile';
    case 'friend-accepted': return p?.fromUserId ? `/player/${p.fromUserId}` : '/profile';
    case 'friend-declined': return '/profile';
```

- [ ] **Step 5: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors

- [ ] **Step 6: Commit and push**

```bash
git add apps/web/src/hooks/useNotifications.ts apps/web/src/lib/game-events.ts
git commit -m "feat: handle friend notification events in frontend

Toast + browser notification + game event history for friend-request/accepted/declined.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push
```

---

### Task 3: Final verification

**Files:** None (verification only)

- [ ] **Step 1: TS check all projects**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors

- [ ] **Step 2: Run API tests**

Run: `cd apps/api && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run game-engine tests**

Run: `cd packages/game-engine && npx vitest run`
Expected: All tests pass
