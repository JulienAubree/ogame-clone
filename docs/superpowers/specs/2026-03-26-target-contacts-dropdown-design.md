# Target Contacts Dropdown — Design Spec

## Goal

Add a "Contacts" dropdown next to the coordinate input on the fleet send form, allowing players to quickly select a destination from their own planets, friends' planets, or alliance members' planets — instead of typing coordinates manually.

## Context

Currently, sending a fleet to a friend or alliance member requires remembering their coordinates and typing them into the `[G:S:P]` input. This is error-prone and tedious for peaceful missions (transport, station) but also useful for any mission type.

The friendship system backend exists (`friend.list`, `friend.request`, etc.) and the alliance system is fully functional. Planet data is user-scoped (no endpoint exposes other users' planets yet).

## Design

### Backend — New `ContactService` and endpoint

#### New service: `apps/api/src/modules/fleet/contact.service.ts`

A dedicated service that aggregates contact data. It receives `db` (Drizzle instance), `friendService`, and `allianceService` as dependencies — following the existing service injection pattern.

**Method: `getContacts(userId: string)`**

Returns:
```ts
{
  myPlanets: { id: string; name: string; galaxy: number; system: number; position: number }[];
  friends: {
    userId: string;
    username: string;
    planets: { name: string; galaxy: number; system: number; position: number }[];
  }[];
  allianceMembers: {
    userId: string;
    username: string;
    role: string;
    planets: { name: string; galaxy: number; system: number; position: number }[];
  }[];
  allianceTag: string | null;
}
```

**Implementation steps:**
1. `myPlanets` — query `planets` table: `where(eq(planets.userId, userId))`, select `id, name, galaxy, system, position`. Order by `createdAt ASC`. Exclude moons (`where(eq(planets.planetType, 'planet'))`) — moons are not independently targetable as fleet destinations.
2. `friends` — call `friendService.list(userId)` to get accepted friend userIds, then batch-query planets: `where(inArray(planets.userId, friendUserIds))` with `eq(planets.planetType, 'planet')`. Group results by userId in JS.
3. `allianceMembers` — call `allianceService.myAlliance(userId)` to get member list. Filter out self (already in myPlanets) and any userIds already in friends list (deduplication — a player who is both a friend and alliance member appears only in the "Amis" section). Batch-query planets for remaining userIds. Group by userId.
4. `allianceTag` — from the alliance object returned by `myAlliance`.

All planet queries select only: `name`, `galaxy`, `system`, `position`. No sensitive data exposed.

#### Endpoint: `fleet.contacts`

**Location:** `apps/api/src/modules/fleet/fleet.router.ts`

The `createFleetRouter` function receives an additional `contactService` parameter. The endpoint is a simple `protectedProcedure.query()` that calls `contactService.getContacts(ctx.userId)`.

**Wiring in `app-router.ts`:** Create `contactService` with `db`, `friendService`, `allianceService` and pass it to `createFleetRouter`.

**Input:** None (uses `ctx.userId`).

**Caching:** React Query caches on the frontend with `staleTime: 60_000` (1 min) since planet coordinates rarely change.

### Frontend — `TargetContactsDropdown` component

**Location:** `apps/web/src/components/fleet/TargetContactsDropdown.tsx`

**Props:**
```ts
{
  onSelect: (coords: { galaxy: number; system: number; position: number }) => void;
  disabled?: boolean;
}
```

**Behavior:**
- An icon button (address book icon) displayed next to the `CoordinateInput`. Tooltip: "Contacts".
- On click, opens a dropdown/popover positioned below the button.
- **Search bar** at top — filters in real-time by player name or planet name (client-side filter on cached data).
- **Three grouped sections** with sticky headers:
  - **Mes planètes** (green accent) — list of own planets: `name [G:S:P]`, sorted by creation order
  - **Amis** (blue accent) — grouped by username (alphabetical), sub-entries per planet: `username` → `planetName [G:S:P]`
  - **Alliance [TAG]** (amber accent) — grouped by username (alphabetical) + role badge, sub-entries per planet. `allianceTag` is used for the section header label. Players already shown in "Amis" are excluded.
- Click on any planet entry → calls `onSelect({ galaxy, system, position })` and closes the dropdown.
- Closes on click outside, Escape key, or selection.
- Empty states per section: "Aucun ami ajouté" / "Pas d'alliance" when sections have no entries.
- Sections with 0 entries after search filter are hidden entirely.
- If total results across all sections = 0: "Aucun résultat".
- Max height with scroll for long lists (`max-h-80 overflow-y-auto`).

**Data fetching:** Calls `trpc.fleet.contacts.useQuery(undefined, { enabled: isOpen })`. Lazy-loaded on first open, then cached.

### Integration in Fleet.tsx

**Location:** `apps/web/src/pages/Fleet.tsx` — the destination section (around line 295).

Current:
```tsx
<div className="flex items-center justify-center gap-2">
  <span className="text-sm text-muted-foreground">Cible</span>
  <CoordinateInput ... />
</div>
```

After:
```tsx
<div className="flex items-center justify-center gap-2">
  <span className="text-sm text-muted-foreground">Cible</span>
  <CoordinateInput ... />
  {!(pveMode || tradeMode) && (
    <TargetContactsDropdown onSelect={setTarget} />
  )}
</div>
```

- Hidden when destination is locked (PvE/trade modes).
- Available for all mission types.
- Selecting a contact fills the coordinate fields; the rest of the form (fuel estimate, duration) recalculates automatically via existing reactivity.

## Out of Scope

- Friend management UI (add/remove friends) — separate feature.
- Favorite/bookmark system — not needed with contacts dropdown.
- Showing contacts on the Galaxy page — this spec only covers the fleet send form.
- Moon targeting — moons excluded from contact lists for simplicity.

## Files Affected

| File | Change |
|------|--------|
| `apps/api/src/modules/fleet/contact.service.ts` | New service aggregating contacts |
| `apps/api/src/modules/fleet/fleet.router.ts` | Add `contacts` query, accept `contactService` param |
| `apps/api/src/trpc/app-router.ts` | Wire `contactService` into fleet router |
| `apps/web/src/components/fleet/TargetContactsDropdown.tsx` | New component |
| `apps/web/src/pages/Fleet.tsx` | Integrate dropdown next to CoordinateInput |
