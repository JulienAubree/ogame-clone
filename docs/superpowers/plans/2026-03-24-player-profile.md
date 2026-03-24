# Player Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add player profile pages (editable own profile + public view), avatar selection from a pixel art gallery, game/technical preferences, and a mutual friend request system.

**Architecture:** Extend the `users` table with profile columns (bio, avatarId, playstyle, etc.) and create a new `friendships` table for mutual friend requests. New `friend` tRPC router handles the friend lifecycle. Two new frontend pages (`/profile` and `/player/:userId`) use a two-column layout. Avatars are static files in `ASSETS_DIR/avatars/`, scanned by the API at runtime.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), tRPC, React, Zod

---

## File Map

**Create:**
- `packages/db/src/schema/friendships.ts` — friendships table + enums
- `apps/api/src/modules/friend/friend.service.ts` — friend request logic
- `apps/api/src/modules/friend/friend.router.ts` — tRPC friend routes
- `apps/web/src/pages/Profile.tsx` — own profile page (editable)
- `apps/web/src/pages/PlayerProfile.tsx` — public profile page (read-only)
- `apps/web/src/components/profile/AvatarPicker.tsx` — avatar selection modal
- `apps/web/src/components/profile/FriendList.tsx` — friend list component
- `apps/web/src/components/profile/FriendRequests.tsx` — pending requests UI

**Modify:**
- `packages/db/src/schema/users.ts` — add profile columns
- `packages/db/src/schema/index.ts` — export new schema
- `apps/api/src/modules/user/user.service.ts` — add profile methods
- `apps/api/src/modules/user/user.router.ts` — add profile routes
- `apps/api/src/trpc/app-router.ts` — wire friend service/router
- `apps/web/src/router.tsx` — add profile routes
- `apps/web/src/lib/icons.tsx` — add ProfileIcon
- `apps/web/src/components/layout/Sidebar.tsx` — add Profil nav link
- `apps/web/src/components/layout/BottomTabBar.tsx` — add Profil to social section

---

### Task 1: DB schema — profile columns on `users` + `friendships` table

**Files:**
- Modify: `packages/db/src/schema/users.ts`
- Create: `packages/db/src/schema/friendships.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Add profile columns to users table**

In `packages/db/src/schema/users.ts`, add imports and columns:

```ts
import { pgTable, uuid, varchar, timestamp, boolean, text, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const playstyleEnum = pgEnum('playstyle', ['miner', 'warrior', 'explorer']);

export const users = pgTable('users', {
  // ... existing columns ...
  bio: text('bio'),
  avatarId: varchar('avatar_id', { length: 128 }),
  playstyle: playstyleEnum('playstyle'),
  seekingAlliance: boolean('seeking_alliance').notNull().default(false),
  theme: varchar('theme', { length: 16 }).notNull().default('dark'),
  profileVisibility: jsonb('profile_visibility').notNull().default({ bio: true, playstyle: true, stats: true }),
});
```

- [ ] **Step 2: Create friendships schema**

Create `packages/db/src/schema/friendships.ts`:

```ts
import { pgTable, uuid, timestamp, pgEnum, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const friendshipStatusEnum = pgEnum('friendship_status', ['pending', 'accepted']);

export const friendships = pgTable('friendships', {
  id: uuid('id').primaryKey().defaultRandom(),
  requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  addresseeId: uuid('addressee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: friendshipStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('friendships_pair_idx').on(table.requesterId, table.addresseeId),
  index('friendships_addressee_idx').on(table.addresseeId),
  check('friendships_no_self', sql`${table.requesterId} != ${table.addresseeId}`),
]);
```

- [ ] **Step 3: Export from schema barrel**

Add to `packages/db/src/schema/index.ts`:

```ts
export * from './friendships.js';
```

- [ ] **Step 4: Generate migration**

Run: `cd packages/db && npx drizzle-kit generate`
Expected: New migration file created in `packages/db/drizzle/`

- [ ] **Step 5: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/users.ts packages/db/src/schema/friendships.ts packages/db/src/schema/index.ts packages/db/drizzle/
git commit -m "feat: add profile columns to users + friendships table

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: API — extend user service with profile methods

**Files:**
- Modify: `apps/api/src/modules/user/user.service.ts`
- Modify: `apps/api/src/modules/user/user.router.ts`

- [ ] **Step 1: Add profile methods to user service**

Read `apps/api/src/modules/user/user.service.ts`, then add these methods to the returned object:

```ts
import { eq, and, or, count } from 'drizzle-orm';
import { users, planets, rankings, allianceMembers, alliances, friendships } from '@ogame-clone/db';
import { readdirSync } from 'fs';
import { join } from 'path';
import { TRPCError } from '@trpc/server';
import type { Database } from '@ogame-clone/db';

export function createUserService(db: Database, assetsDir: string) {
  return {
    // ... existing searchUsers method ...

    async getMyProfile(userId: string) {
      const [user] = await db.select({
        id: users.id,
        username: users.username,
        bio: users.bio,
        avatarId: users.avatarId,
        playstyle: users.playstyle,
        seekingAlliance: users.seekingAlliance,
        theme: users.theme,
        profileVisibility: users.profileVisibility,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      const stats = await this.getPlayerStats(userId);
      return { ...user, ...stats };
    },

    async getProfile(userId: string, currentUserId: string) {
      const [user] = await db.select({
        id: users.id,
        username: users.username,
        bio: users.bio,
        avatarId: users.avatarId,
        playstyle: users.playstyle,
        seekingAlliance: users.seekingAlliance,
        profileVisibility: users.profileVisibility,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      const visibility = (user.profileVisibility ?? { bio: true, playstyle: true, stats: true }) as Record<string, boolean>;
      const stats = await this.getPlayerStats(userId);
      const friendship = await this.getFriendshipStatus(userId, currentUserId);

      return {
        id: user.id,
        username: user.username,
        avatarId: user.avatarId,
        bio: (visibility.bio !== false) ? user.bio : null,
        playstyle: (visibility.playstyle !== false) ? user.playstyle : null,
        seekingAlliance: (visibility.playstyle !== false) ? user.seekingAlliance : null, // grouped with playstyle visibility
        stats: (visibility.stats !== false) ? stats : null,
        friendshipStatus: friendship.status,
        friendshipId: friendship.friendshipId,
      };
    },

    async updateProfile(userId: string, data: {
      bio?: string;
      avatarId?: string | null;
      playstyle?: 'miner' | 'warrior' | 'explorer' | null;
      seekingAlliance?: boolean;
      theme?: string;
      profileVisibility?: Record<string, boolean>;
    }) {
      if (data.avatarId !== undefined && data.avatarId !== null) {
        const avatars = this.listAvatars();
        if (!avatars.includes(data.avatarId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Avatar invalide' });
        }
      }
      if (data.bio !== undefined && data.bio !== null && data.bio.length > 500) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bio trop longue (max 500)' });
      }

      const update: Record<string, unknown> = {};
      if (data.bio !== undefined) update.bio = data.bio;
      if (data.avatarId !== undefined) update.avatarId = data.avatarId;
      if (data.playstyle !== undefined) update.playstyle = data.playstyle;
      if (data.seekingAlliance !== undefined) update.seekingAlliance = data.seekingAlliance;
      if (data.theme !== undefined) update.theme = data.theme;
      if (data.profileVisibility !== undefined) update.profileVisibility = data.profileVisibility;

      if (Object.keys(update).length > 0) {
        await db.update(users).set(update).where(eq(users.id, userId));
      }
    },

    listAvatars(): string[] {
      try {
        const dir = join(assetsDir, 'avatars');
        return readdirSync(dir)
          .filter(f => f.endsWith('.webp'))
          .map(f => f.replace('.webp', ''));
      } catch {
        return [];
      }
    },

    async getPlayerStats(userId: string) {
      const [ranking] = await db.select({
        rank: rankings.rank,
        totalPoints: rankings.totalPoints,
      }).from(rankings).where(eq(rankings.userId, userId)).limit(1);

      const [planetCount] = await db.select({
        count: count(),
      }).from(planets).where(eq(planets.userId, userId));

      const [membership] = await db.select({
        allianceName: alliances.name,
      }).from(allianceMembers)
        .innerJoin(alliances, eq(allianceMembers.allianceId, alliances.id))
        .where(eq(allianceMembers.userId, userId))
        .limit(1);

      return {
        rank: ranking?.rank ?? null,
        totalPoints: ranking?.totalPoints ?? 0,
        planetCount: planetCount?.count ?? 0,
        allianceName: membership?.allianceName ?? null,
      };
    },

    async getFriendshipStatus(targetUserId: string, currentUserId: string): Promise<{ status: 'none' | 'pending_sent' | 'pending_received' | 'friends'; friendshipId: string | null }> {
      const [fs] = await db.select()
        .from(friendships)
        .where(or(
          and(eq(friendships.requesterId, currentUserId), eq(friendships.addresseeId, targetUserId)),
          and(eq(friendships.requesterId, targetUserId), eq(friendships.addresseeId, currentUserId)),
        ))
        .limit(1);

      if (!fs) return { status: 'none', friendshipId: null };
      if (fs.status === 'accepted') return { status: 'friends', friendshipId: fs.id };
      if (fs.requesterId === currentUserId) return { status: 'pending_sent', friendshipId: fs.id };
      return { status: 'pending_received', friendshipId: fs.id };
    },
  };
}
```

Note: the factory signature changes from `createUserService(db)` to `createUserService(db, assetsDir)`. Update the call in `app-router.ts` accordingly (Step 3).

- [ ] **Step 2: Add profile routes to user router**

Read `apps/api/src/modules/user/user.router.ts`, then add these procedures:

```ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createUserService } from './user.service.js';

export function createUserRouter(userService: ReturnType<typeof createUserService>) {
  return router({
    // ... existing search procedure ...

    getMyProfile: protectedProcedure
      .query(async ({ ctx }) => {
        return userService.getMyProfile(ctx.userId!);
      }),

    getProfile: protectedProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return userService.getProfile(input.userId, ctx.userId!);
      }),

    updateProfile: protectedProcedure
      .input(z.object({
        bio: z.string().max(500).nullable().optional(),
        avatarId: z.string().max(128).nullable().optional(),
        playstyle: z.enum(['miner', 'warrior', 'explorer']).nullable().optional(),
        seekingAlliance: z.boolean().optional(),
        theme: z.enum(['dark', 'light']).optional(),
        profileVisibility: z.record(z.string(), z.boolean()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await userService.updateProfile(ctx.userId!, input);
      }),

    listAvatars: protectedProcedure
      .query(async () => {
        return userService.listAvatars();
      }),
  });
}
```

- [ ] **Step 3: Update app-router.ts wiring**

In `apps/api/src/trpc/app-router.ts`, update the `createUserService` call to pass `assetsDir`:

```ts
// OLD:
const userService = createUserService(db);

// NEW:
const userService = createUserService(db, env.ASSETS_DIR);
```

- [ ] **Step 4: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/user/ apps/api/src/trpc/app-router.ts
git commit -m "feat: add profile methods to user service + router

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: API — friend service + router

**Files:**
- Create: `apps/api/src/modules/friend/friend.service.ts`
- Create: `apps/api/src/modules/friend/friend.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Create friend service**

Create `apps/api/src/modules/friend/friend.service.ts`:

```ts
import { eq, and, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { friendships, users } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

export function createFriendService(db: Database) {
  return {
    async list(userId: string) {
      const rows = await db.select({
        friendshipId: friendships.id,
        friendUserId: users.id,
        username: users.username,
        avatarId: users.avatarId,
      }).from(friendships)
        .innerJoin(users, or(
          and(eq(friendships.requesterId, userId), eq(users.id, friendships.addresseeId)),
          and(eq(friendships.addresseeId, userId), eq(users.id, friendships.requesterId)),
        ))
        .where(and(
          eq(friendships.status, 'accepted'),
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
        ));

      return rows.map(r => ({
        friendshipId: r.friendshipId,
        userId: r.friendUserId, // aliased in select to avoid collision with requesterId/addresseeId
        username: r.username,
        avatarId: r.avatarId,
      }));
    },

    async pendingReceived(userId: string) {
      return db.select({
        friendshipId: friendships.id,
        userId: users.id,
        username: users.username,
        avatarId: users.avatarId,
        createdAt: friendships.createdAt,
      }).from(friendships)
        .innerJoin(users, eq(users.id, friendships.requesterId))
        .where(and(
          eq(friendships.addresseeId, userId),
          eq(friendships.status, 'pending'),
        ));
    },

    async pendingSent(userId: string) {
      return db.select({
        friendshipId: friendships.id,
        userId: users.id,
        username: users.username,
        avatarId: users.avatarId,
        createdAt: friendships.createdAt,
      }).from(friendships)
        .innerJoin(users, eq(users.id, friendships.addresseeId))
        .where(and(
          eq(friendships.requesterId, userId),
          eq(friendships.status, 'pending'),
        ));
    },

    async request(requesterId: string, addresseeId: string) {
      if (requesterId === addresseeId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Auto-demande impossible' });
      }

      const [existing] = await db.select()
        .from(friendships)
        .where(or(
          and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)),
          and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId)),
        ))
        .limit(1);

      if (existing) {
        if (existing.status === 'accepted') throw new TRPCError({ code: 'CONFLICT', message: 'Deja amis' });
        throw new TRPCError({ code: 'CONFLICT', message: 'Demande deja existante' });
      }

      const [row] = await db.insert(friendships).values({
        requesterId,
        addresseeId,
      }).returning();

      return row;
    },

    async accept(friendshipId: string, userId: string) {
      const [fs] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
      if (!fs) throw new TRPCError({ code: 'NOT_FOUND' });
      if (fs.addresseeId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (fs.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Demande non en attente' });

      await db.update(friendships)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(friendships.id, friendshipId));
    },

    async decline(friendshipId: string, userId: string) {
      const [fs] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
      if (!fs) throw new TRPCError({ code: 'NOT_FOUND' });
      if (fs.addresseeId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (fs.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST' });

      await db.delete(friendships).where(eq(friendships.id, friendshipId));
    },

    async cancel(friendshipId: string, userId: string) {
      const [fs] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
      if (!fs) throw new TRPCError({ code: 'NOT_FOUND' });
      if (fs.requesterId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (fs.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST' });

      await db.delete(friendships).where(eq(friendships.id, friendshipId));
    },

    async remove(friendshipId: string, userId: string) {
      const [fs] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
      if (!fs) throw new TRPCError({ code: 'NOT_FOUND' });
      if (fs.requesterId !== userId && fs.addresseeId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await db.delete(friendships).where(eq(friendships.id, friendshipId));
    },
  };
}
```

- [ ] **Step 2: Create friend router**

Create `apps/api/src/modules/friend/friend.router.ts`:

```ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFriendService } from './friend.service.js';

export function createFriendRouter(friendService: ReturnType<typeof createFriendService>) {
  return router({
    list: protectedProcedure
      .query(async ({ ctx }) => friendService.list(ctx.userId!)),

    pendingReceived: protectedProcedure
      .query(async ({ ctx }) => friendService.pendingReceived(ctx.userId!)),

    pendingSent: protectedProcedure
      .query(async ({ ctx }) => friendService.pendingSent(ctx.userId!)),

    request: protectedProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.request(ctx.userId!, input.userId)),

    accept: protectedProcedure
      .input(z.object({ friendshipId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.accept(input.friendshipId, ctx.userId!)),

    decline: protectedProcedure
      .input(z.object({ friendshipId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.decline(input.friendshipId, ctx.userId!)),

    cancel: protectedProcedure
      .input(z.object({ friendshipId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.cancel(input.friendshipId, ctx.userId!)),

    remove: protectedProcedure
      .input(z.object({ friendshipId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => friendService.remove(input.friendshipId, ctx.userId!)),
  });
}
```

- [ ] **Step 3: Wire into app-router.ts**

In `apps/api/src/trpc/app-router.ts`, add imports and wiring:

```ts
import { createFriendService } from '../modules/friend/friend.service.js';
import { createFriendRouter } from '../modules/friend/friend.router.js';

// Inside buildAppRouter:
const friendService = createFriendService(db);
const friendRouter = createFriendRouter(friendService);

// In the returned router:
friend: friendRouter,
```

- [ ] **Step 4: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/friend/ apps/api/src/trpc/app-router.ts
git commit -m "feat: add friend service + router (request, accept, decline, cancel, remove)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — ProfileIcon + navigation links

**Files:**
- Modify: `apps/web/src/lib/icons.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/components/layout/BottomTabBar.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Add ProfileIcon to icons.tsx**

Add to `apps/web/src/lib/icons.tsx`:

```tsx
export function ProfileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
```

- [ ] **Step 2: Add Profil to Sidebar**

In `apps/web/src/components/layout/Sidebar.tsx`, import `ProfileIcon` and add to the `Social` section items array:

```ts
{ label: 'Profil', path: '/profile', icon: ProfileIcon },
```

Add it as the first item in the Social section.

- [ ] **Step 3: Add Profil to BottomTabBar**

In `apps/web/src/components/layout/BottomTabBar.tsx`:
- Import `ProfileIcon`
- Add `'/profile'` to `TAB_GROUPS.social` array
- Add `{ label: 'Profil', path: '/profile', icon: ProfileIcon }` as first item in `SHEET_ITEMS.social` array

- [ ] **Step 4: Add routes to router.tsx**

In `apps/web/src/router.tsx`, add two route entries inside the `children` array:

```ts
{
  path: 'profile',
  lazy: lazyLoad(() => import('./pages/Profile')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
{
  path: 'player/:userId',
  lazy: lazyLoad(() => import('./pages/PlayerProfile')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
```

- [ ] **Step 5: Create placeholder pages**

Create `apps/web/src/pages/Profile.tsx`:

```tsx
export default function Profile() {
  return <div className="p-4">Profile — TODO</div>;
}
```

Create `apps/web/src/pages/PlayerProfile.tsx`:

```tsx
export default function PlayerProfile() {
  return <div className="p-4">Player Profile — TODO</div>;
}
```

- [ ] **Step 6: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/icons.tsx apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/layout/BottomTabBar.tsx apps/web/src/router.tsx apps/web/src/pages/Profile.tsx apps/web/src/pages/PlayerProfile.tsx
git commit -m "feat: add profile routes, icon, and navigation links

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — AvatarPicker component

**Files:**
- Create: `apps/web/src/components/profile/AvatarPicker.tsx`

- [ ] **Step 1: Create AvatarPicker**

Create `apps/web/src/components/profile/AvatarPicker.tsx`:

```tsx
import { trpc } from '@/trpc';

interface AvatarPickerProps {
  currentAvatarId: string | null;
  onSelect: (avatarId: string) => void;
  onClose: () => void;
}

export function AvatarPicker({ currentAvatarId, onSelect, onClose }: AvatarPickerProps) {
  const { data: avatars, isLoading } = trpc.user.listAvatars.useQuery();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Choisir un avatar</h3>
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Chargement...</div>
        ) : !avatars?.length ? (
          <div className="text-muted-foreground text-sm">Aucun avatar disponible</div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-80 overflow-y-auto">
            {avatars.map(id => (
              <button
                key={id}
                onClick={() => { onSelect(id); onClose(); }}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                  id === currentAvatarId ? 'border-primary ring-2 ring-primary/50' : 'border-white/10 hover:border-white/30'
                }`}
              >
                <img src={`/assets/avatars/${id}.webp`} alt={id} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Fermer</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/profile/AvatarPicker.tsx
git commit -m "feat: add AvatarPicker component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — FriendList + FriendRequests components

**Files:**
- Create: `apps/web/src/components/profile/FriendList.tsx`
- Create: `apps/web/src/components/profile/FriendRequests.tsx`

- [ ] **Step 1: Create FriendList**

Create `apps/web/src/components/profile/FriendList.tsx`:

```tsx
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { UserAvatar } from '@/components/chat/UserAvatar';

export function FriendList() {
  const { data: friends, isLoading } = trpc.friend.list.useQuery();

  if (isLoading) return <div className="text-muted-foreground text-sm">Chargement...</div>;
  if (!friends?.length) return <div className="text-muted-foreground text-sm">Aucun ami</div>;

  return (
    <div className="flex flex-wrap gap-2">
      {friends.map(f => (
        <Link key={f.userId} to={`/player/${f.userId}`} title={f.username}>
          {f.avatarId ? (
            <img src={`/assets/avatars/${f.avatarId}.webp`} alt={f.username} className="w-8 h-8 rounded-full object-cover border border-white/10" />
          ) : (
            <UserAvatar username={f.username} size="sm" />
          )}
        </Link>
      ))}
    </div>
  );
}
```

Note: `UserAvatar` is the existing CSS gradient avatar component. Read the existing component to verify the import path and props — adjust if needed.

- [ ] **Step 2: Create FriendRequests**

Create `apps/web/src/components/profile/FriendRequests.tsx`:

```tsx
import { Link } from 'react-router';
import { trpc } from '@/trpc';

export function FriendRequests() {
  const utils = trpc.useUtils();
  const { data: received } = trpc.friend.pendingReceived.useQuery();
  const { data: sent } = trpc.friend.pendingSent.useQuery();
  const acceptMut = trpc.friend.accept.useMutation({ onSuccess: () => { utils.friend.invalidate(); } });
  const declineMut = trpc.friend.decline.useMutation({ onSuccess: () => { utils.friend.invalidate(); } });
  const cancelMut = trpc.friend.cancel.useMutation({ onSuccess: () => { utils.friend.invalidate(); } });

  return (
    <div className="space-y-4">
      {received && received.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Demandes recues</h4>
          <ul className="space-y-2">
            {received.map(r => (
              <li key={r.friendshipId} className="flex items-center justify-between gap-2">
                <Link to={`/player/${r.userId}`} className="text-sm hover:text-primary">{r.username}</Link>
                <div className="flex gap-1">
                  <button onClick={() => acceptMut.mutate({ friendshipId: r.friendshipId })} className="text-xs px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30">Accepter</button>
                  <button onClick={() => declineMut.mutate({ friendshipId: r.friendshipId })} className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive hover:bg-destructive/30">Refuser</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sent && sent.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Demandes envoyees</h4>
          <ul className="space-y-2">
            {sent.map(s => (
              <li key={s.friendshipId} className="flex items-center justify-between gap-2">
                <Link to={`/player/${s.userId}`} className="text-sm hover:text-primary">{s.username}</Link>
                <button onClick={() => cancelMut.mutate({ friendshipId: s.friendshipId })} className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/80">Annuler</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(!received?.length && !sent?.length) && (
        <div className="text-muted-foreground text-sm">Aucune demande en attente</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors (or minor import path adjustments needed for UserAvatar)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/profile/FriendList.tsx apps/web/src/components/profile/FriendRequests.tsx
git commit -m "feat: add FriendList and FriendRequests components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — Profile page (own profile, editable)

**Files:**
- Modify: `apps/web/src/pages/Profile.tsx`

- [ ] **Step 1: Implement Profile page**

Replace the placeholder in `apps/web/src/pages/Profile.tsx` with the full two-column editable profile page. The component should:

- Call `trpc.user.getMyProfile.useQuery()` for profile data
- Call `trpc.user.updateProfile.useMutation()` for saves
- Show avatar (with AvatarPicker on click), username, rank, playstyle badge in the left column
- Show FriendList and FriendRequests in the left column
- Show editable bio (textarea), stats grid (rank, points, planets, alliance), playstyle select, seekingAlliance toggle, theme toggle, visibility checkboxes in the right column
- Use `glass-card` CSS class for card sections
- Debounce or use a save button for profile updates
- Handle loading state with a skeleton

The page is too large to include inline — the implementer should follow the two-column layout from the design spec and use existing UI patterns from pages like `Ranking.tsx` and `Alliance.tsx`. Key patterns:
- `<div className="space-y-4 p-4 lg:space-y-6 lg:p-6">` for page container
- `<div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-6">` for two-column layout
- `glass-card` for card sections
- `PageHeader` for page title

- [ ] **Step 2: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Profile.tsx
git commit -m "feat: implement editable Profile page

Two-column layout with avatar, bio, stats, preferences, friends, and visibility settings.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — PlayerProfile page (public, read-only)

**Files:**
- Modify: `apps/web/src/pages/PlayerProfile.tsx`

- [ ] **Step 1: Implement PlayerProfile page**

Replace the placeholder in `apps/web/src/pages/PlayerProfile.tsx`. The component should:

- Read `userId` from `useParams()`
- Call `trpc.user.getProfile.useQuery({ userId })` for the public profile data
- Show avatar, username, rank in the left column
- Show bio, playstyle, stats in the right column — only if the profile owner has made them visible (fields are `null` when hidden)
- Show a contextual friend action button based on `friendshipStatus`:
  - `'none'` → "Ajouter en ami" button calling `trpc.friend.request.useMutation()`
  - `'pending_sent'` → "Annuler la demande" button calling `trpc.friend.cancel.useMutation()` (need to fetch the friendshipId — or pass it from the profile response; alternatively, add a `friendshipId` field to the `getProfile` response)
  - `'pending_received'` → "Accepter / Refuser" buttons
  - `'friends'` → "Retirer des amis" button
- Show "Envoyer un message" button that opens the chat overlay (use existing `useChatStore` from `@/stores/chat.store`)
- Same two-column layout as Profile page, but read-only

**Important:** The `getProfile` response needs to include `friendshipId` when a friendship row exists, so the action buttons can call `friend.accept/decline/cancel/remove`. Update `user.service.ts > getProfile` to include this field.

- [ ] **Step 2: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/PlayerProfile.tsx apps/api/src/modules/user/user.service.ts
git commit -m "feat: implement public PlayerProfile page with friend actions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Make usernames clickable in ranking + messages

**Files:**
- Modify: `apps/web/src/pages/Ranking.tsx`
- Modify: `apps/web/src/components/chat/ConversationList.tsx` (or equivalent message list component)

- [ ] **Step 1: Make ranking usernames link to player profiles**

In `apps/web/src/pages/Ranking.tsx`, wrap usernames in `<Link to={`/player/${userId}`}>`. Read the file first to find the exact location where username is rendered.

- [ ] **Step 2: Make conversation usernames clickable**

In the messages/conversation components, wrap the `otherUser.username` in a `<Link to={`/player/${userId}`}>`. Read the relevant files to find the exact components.

- [ ] **Step 3: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Ranking.tsx apps/web/src/components/chat/
git commit -m "feat: make usernames clickable to player profiles

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

**Note:** The spec mentions a `ProfileCard` reusable component (avatar + username + rank). This is deferred — FriendList and ranking links work with inline rendering for now. `ProfileCard` can be extracted as a refactor once the profile pages are stable.

---

### Task 10: Final verification

**Files:** None (verification only)

- [ ] **Step 1: TS check all projects**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json && npx tsc --noEmit -p apps/admin/tsconfig.json`
Expected: No errors

- [ ] **Step 2: Run API tests**

Run: `cd apps/api && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run game-engine tests**

Run: `cd packages/game-engine && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Push**

```bash
git push
```
