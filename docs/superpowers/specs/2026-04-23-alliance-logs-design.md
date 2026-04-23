# Alliance Logs — Design

**Goal:** A per-alliance activity feed that surfaces military and membership events in near real-time, giving members collective awareness of what's happening inside their alliance.

**Scope v1:** Military events (combats, detected espionage) + membership events (join/leave/kick/promote/demote). Economic/research/diplomacy events are deferred to v2 when the corresponding features ship.

**Non-goals:** This is *not* a sharing system. A player cannot manually post a detailed report here. That is a separate future feature ("partage de rapport") that will plug into the chat, not this feed.

---

## 1. Architecture

A new service `allianceLog.add(tx, { allianceId, type, visibility, payload })` is called from three places inside the existing transactions that already mutate the relevant state:

- `alliance.service.ts` — for membership events (join via invitation or application, leave, kick, promote, demote).
- `fleet.worker.ts` — at combat resolution and at espionage resolution when detection occurred. Only at resolution, never at fleet launch, so there is exactly one log line per mission.

The service inserts one row into `alliance_logs` and then fans out a lightweight SSE ping to every member.

### Real-time transport (hybrid)

Reuse the existing per-user Redis channel `notifications:{userId}` rather than introducing a new alliance-scoped channel. After the transaction commits, the service publishes a small event `{ type: 'alliance-log:new', payload: { allianceId, logId, visibility } }` to each member's channel.

The web client listens via the existing `useSSE` hook. When it receives an `alliance-log:new` event, it invalidates the `alliance.activity` and `alliance.activityUnreadCount` tRPC queries, which causes React Query to refetch.

As a fallback, the "Activité" tab runs a `refetchInterval` of 30 seconds while visible. So a member who is not connected via SSE still sees fresh data within 30 seconds.

### Retention

Rows are kept 30 days. A purge worker runs hourly and deletes rows older than 30 days. If an hourly cron already exists in the codebase, this purge hooks into it; otherwise a dedicated worker is added.

---

## 2. Data model

### New table: `alliance_logs` (migration `0054`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `alliance_id` | uuid NOT NULL | FK `alliances(id)` ON DELETE CASCADE |
| `type` | varchar(64) NOT NULL | discriminant, see §3 |
| `visibility` | varchar(16) NOT NULL | `all` or `officers` |
| `payload` | jsonb NOT NULL | shape depends on `type`, see §3 |
| `created_at` | timestamp NOT NULL | default `now()` |

**Index:** `(alliance_id, created_at DESC)`. No composite with `visibility` — visibility is filtered in memory on the small result batch (≤ 30 rows).

### Altered table: `alliance_members` (migration `0055`)

Add one column:

| Column | Type | Notes |
|---|---|---|
| `activity_seen_at` | timestamp NOT NULL | default `now()` |

Set to `now()` at insert time so a new member does not see pre-existing history as "unread". Backfill for existing members: default `now()` at migration time.

---

## 3. Event catalog

All payloads store **both IDs and snapshots** (usernames, planet names, coords) at emission time. IDs enable click-through; snapshots keep the feed readable if a player is later renamed or a planet is renamed. Each type has a dedicated Zod schema in `packages/shared/src/alliance-log.ts`, combined into a discriminated union over `type`. The `allianceLog.add()` signature is typed strictly against that union.

### Military events (visibility: `all`)

**`combat.defense`** — A member was attacked and combat resolved.
```ts
{
  memberId: uuid, memberName: string,
  planetId: uuid, planetName: string, coords: string,
  attackerId: uuid, attackerName: string, attackerAllianceTag?: string,
  outcome: 'victory' | 'defeat' | 'draw',
  reportId: uuid,
}
```

**`combat.attack`** — A member attacked a target and combat resolved.
```ts
{
  memberId: uuid, memberName: string,
  targetId: uuid, targetName: string, targetAllianceTag?: string,
  planetName: string, coords: string,
  outcome: 'victory' | 'defeat' | 'draw',
  reportId: uuid,
}
```

**`espionage.incoming`** — A member was spied on AND detection succeeded. If detection fails, no log is emitted (the defender does not know it happened).
```ts
{
  memberId: uuid, memberName: string,
  planetName: string, coords: string,
  spyId: uuid, spyName: string, spyAllianceTag?: string,
  reportId: uuid,
}
```

**`espionage.outgoing`** — A member was spying AND got detected. By symmetry with `incoming`, a stealthy (undetected) spy mission is not logged — it stays operationally discreet. If the member wants to share it, they use the chat.
```ts
{
  memberId: uuid, memberName: string,
  targetId: uuid, targetName: string, targetAllianceTag?: string,
  planetName: string, coords: string,
  reportId: uuid,
}
```

### Membership events

**`member.joined`** (visibility: `all`) — A player joined via invitation acceptance or application acceptance.
```ts
{ memberId: uuid, memberName: string, via: 'invitation' | 'application' }
```

**`member.left`** (visibility: `all`)
```ts
{ memberId: uuid, memberName: string }
```

**`member.kicked`** (visibility: `officers`)
```ts
{ memberId: uuid, memberName: string, byId: uuid, byName: string }
```

**`member.promoted`** (visibility: `all`)
```ts
{
  memberId: uuid, memberName: string,
  byId: uuid, byName: string,
  fromRole: 'member', toRole: 'officer',
}
```

**`member.demoted`** (visibility: `all`)
```ts
{
  memberId: uuid, memberName: string,
  byId: uuid, byName: string,
  fromRole: 'officer', toRole: 'member',
}
```

**Out of v1:** applications and invitations. They are already notified to leaders via the existing `alliance-activity` notification path; their value as historical feed entries is low.

### Payload budget

~200–400 bytes per row. At 30 events/day × 30 days × thousands of alliances, the table stays well under 1 GB. No concern.

---

## 4. tRPC API

New procedures in `alliance.router.ts`:

```ts
activity: protectedProcedure
  .input(z.object({
    categories: z.array(z.enum(['military', 'members'])).optional(),
    cursor: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(50).default(30),
  }))
  .query(/* → { items: AllianceLog[], nextCursor: string | null } */),

activityUnreadCount: protectedProcedure
  .query(/* → { count: number } */),

activityMarkSeen: protectedProcedure
  .mutation(/* → { seenAt: Date } */),
```

All three are guarded by a "caller is a member of this alliance" check. The `activity` query also filters out `visibility = 'officers'` rows unless the caller's role is `founder` or `officer`. Same filter applies to `activityUnreadCount`.

### Pagination

Cursor-based on `created_at` (DESC). The cursor is the `created_at` of the last returned row; the next page selects rows strictly older than the cursor. Batches of 30.

### Category filter

Server-side on the `type` column prefix: `military` matches `combat.*` and `espionage.*`; `members` matches `member.*`. Omitting `categories` returns everything the caller is allowed to see.

### Unread count

```
SELECT COUNT(*) FROM alliance_logs
WHERE alliance_id = :myAllianceId
  AND created_at > :activity_seen_at
  AND (visibility = 'all' OR :myRole IN ('founder', 'officer'))
```

---

## 5. Writer service

New file `apps/api/src/modules/alliance/alliance-log.service.ts`:

```ts
allianceLog.add(tx, { allianceId, type, visibility, payload }) {
  // 1. INSERT INTO alliance_logs (...) RETURNING id
  // 2. SELECT user_id FROM alliance_members WHERE alliance_id = ?
  // 3. fire-and-forget (post-commit) per member:
  //      publishNotification(redis, userId,
  //        { type: 'alliance-log:new',
  //          payload: { allianceId, logId, visibility } })
}
```

The Redis publish is fire-and-forget **after** the transaction commits (post-commit hook pattern). If Redis is down, the 30-second poll still catches up.

The function signature is typed against the discriminated union from `packages/shared/src/alliance-log.ts`, so call sites cannot pass a malformed `{ type, payload }` combination.

### Call sites

| Event | Hook | File |
|---|---|---|
| `combat.defense`, `combat.attack` | fleet worker, at combat resolution | `apps/api/src/workers/fleet.worker.ts` |
| `espionage.incoming`, `espionage.outgoing` | fleet worker, at espionage resolution, only if detected | `apps/api/src/workers/fleet.worker.ts` |
| `member.joined` (invitation) | acceptance flow | `alliance.service.ts` |
| `member.joined` (application) | acceptance flow | `alliance.service.ts` |
| `member.left` | leave flow | `alliance.service.ts` |
| `member.kicked` | kick flow | `alliance.service.ts` |
| `member.promoted`, `member.demoted` | setRole flow | `alliance.service.ts` |

If a combat involves two alliance members (cross-alliance combat), two separate logs are written — one per alliance. Each points to the same `reportId` but shows from the respective side.

---

## 6. Purge

New worker `alliance-log-purge.worker.ts`, runs hourly:

```sql
DELETE FROM alliance_logs WHERE created_at < now() - interval '30 days';
```

If an hourly scheduler already exists in the codebase, the purge is wired into it. Otherwise a dedicated lightweight worker is added.

---

## 7. Web UI

### Placement

A new "Activité" tab is added in `apps/web/src/pages/Alliance.tsx`, between "Membres" and "Gestion". Visible to every member.

### Layout

Top bar: two category chips — `Militaire` / `Membres`. Default "Tous" (no chip active). Filter is sent server-side via the `categories` input.

Feed: vertical list of log rows, newest first. Each row shows:

- An SVG icon from `apps/web/src/components/icons/` that matches the event type (sword/cross for `combat.*`, eye for `espionage.*`, silhouette for `member.*`). No emojis in the UI.
- A relative timestamp ("il y a 2 min").
- A human-readable French sentence rendered from the payload (one renderer component per type, switch on `type`).
- For events that have a `reportId`, a "Rapport" link opening the existing combat/espionage report view.

Bottom: a "Charger plus" button that fetches the next page (cursor-based). No infinite scroll — the button is explicit, mobile-safe, and keeps the user in control.

### Empty state

"Aucune activité pour le moment." with a discreet SVG pictogram.

### Unread badge

A count or pastille on the "Activité" tab based on `activityUnreadCount`. The count auto-refreshes via the SSE ping handler and via the same 30-second poll.

### Mark-as-seen

When the user opens the "Activité" tab, after the initial fetch resolves, the front calls `activityMarkSeen`. The mutation is idempotent; it sets `activity_seen_at = now()` on the caller's row in `alliance_members`.

### SSE integration

The `useSSE` handler recognises `alliance-log:new` events. It calls `utils.alliance.activity.invalidate()` and `utils.alliance.activityUnreadCount.invalidate()` so React Query refetches. No direct store mutation.

---

## 8. Tests

Vitest, API side. Each item is a test target, not a full list of test cases:

- `allianceLog.add` inserts one row and publishes N notifications, where N equals the current member count.
- `allianceLog.add` does not publish if the transaction rolls back (post-commit semantics).
- `activity` enforces alliance membership and returns 403 for non-members.
- `activity` hides `visibility = 'officers'` rows when the caller is a plain member.
- `activity` returns them when the caller is `founder` or `officer`.
- `activity` filters correctly by `categories` (military, members, both, neither).
- `activity` cursor pagination: no duplicate, no gap across two sequential fetches.
- `activityUnreadCount` correctly excludes rows older than `activity_seen_at`.
- `activityUnreadCount` respects visibility rules identically to `activity`.
- `activityMarkSeen` is idempotent; calling twice in a row does not regress the timestamp.
- Each emission call site writes the expected log: combat resolution, espionage resolution with detection, espionage resolution without detection (no log), join via invitation, join via application, leave, kick, promote, demote.

No dedicated frontend tests beyond typecheck — the logic lives in the API.

---

## 9. Out of scope (v2+)

- Economy events (treasury donations, distributions) — needs treasury feature.
- Research events (alliance research completed) — needs alliance research feature.
- Station events (module upgraded, station under siege) — needs alliance station feature.
- Diplomacy events (pact signed, war declared) — needs diplomacy feature.
- Player-initiated report sharing — separate feature plugging into the chat, not this feed.
- Per-event read state — YAGNI; `activity_seen_at` per member is enough for the badge.
- Dedicated alliance-scoped Redis channel — YAGNI as long as per-user fan-out performs acceptably.
- Founder succession events (when the founder leaves and another member auto-becomes founder). Covered implicitly by `member.left` in v1; if user feedback calls for a dedicated log line, add a `member.promoted` with `toRole: 'founder'` later.
