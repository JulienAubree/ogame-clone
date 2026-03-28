# Flagship Dynamic Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded flagship base stats with dynamic values = max of each stat across all ships the player has ever built.

**Architecture:** New `unlockedShips` text[] column on flagships tracks which ship types have been built. A pure function `computeBaseStatsFromShips()` in game-engine computes max stats. Shipyard's `completeUnit` triggers recalc on first build of a new ship type. Migration backfills existing players.

**Tech Stack:** Drizzle ORM, PostgreSQL, TypeScript, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/game-engine/src/formulas/flagship-stats.ts` | Create | `computeBaseStatsFromShips()` pure function + `FLAGSHIP_EXCLUDED_SHIPS` constant + `FLAGSHIP_DEFAULT_STATS` constant |
| `packages/game-engine/src/index.ts` | Modify | Re-export new module |
| `packages/game-engine/src/__tests__/flagship-stats.test.ts` | Create | Unit tests for `computeBaseStatsFromShips()` |
| `packages/db/src/schema/flagships.ts` | Modify | Add `unlockedShips` column |
| `packages/db/drizzle/0025_flagship_dynamic_stats.sql` | Create | Migration: add column + backfill existing players |
| `packages/db/drizzle/meta/_journal.json` | Modify | Add migration entry |
| `apps/api/src/modules/flagship/flagship.service.ts` | Modify | Add `recalculateBaseStats(userId)` method |
| `apps/api/src/modules/shipyard/shipyard.service.ts` | Modify | Add flagship service dep + hook in `completeUnit` |
| `apps/api/src/trpc/app-router.ts` | Modify | Pass flagshipService to shipyardService |

---

### Task 1: Pure function `computeBaseStatsFromShips`

**Files:**
- Create: `packages/game-engine/src/formulas/flagship-stats.ts`
- Create: `packages/game-engine/src/__tests__/flagship-stats.test.ts`
- Modify: `packages/game-engine/src/index.ts`

- [ ] **Step 1: Write the test file**

```typescript
// packages/game-engine/src/__tests__/flagship-stats.test.ts
import { describe, it, expect } from 'vitest';
import { computeBaseStatsFromShips, FLAGSHIP_EXCLUDED_SHIPS, FLAGSHIP_DEFAULT_STATS } from '../formulas/flagship-stats.js';

const mockShips = {
  interceptor: { weapons: 4, shield: 8, hull: 12, baseArmor: 1, shotCount: 3, baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50 },
  frigate: { weapons: 12, shield: 16, hull: 30, baseArmor: 2, shotCount: 2, baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100 },
  cruiser: { weapons: 45, shield: 28, hull: 55, baseArmor: 4, shotCount: 1, baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800 },
  smallCargo: { weapons: 1, shield: 8, hull: 12, baseArmor: 0, shotCount: 1, baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000 },
};

type ShipStats = typeof mockShips[keyof typeof mockShips];

describe('computeBaseStatsFromShips', () => {
  it('returns default stats when no ships unlocked', () => {
    expect(computeBaseStatsFromShips([], {})).toEqual(FLAGSHIP_DEFAULT_STATS);
  });

  it('returns the single ship stats when only one ship unlocked', () => {
    const result = computeBaseStatsFromShips(['frigate'], mockShips as Record<string, ShipStats>);
    expect(result).toEqual({
      weapons: 12, shield: 16, hull: 30, baseArmor: 2,
      shotCount: 2, baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100,
    });
  });

  it('takes max of each stat across multiple ships', () => {
    const result = computeBaseStatsFromShips(
      ['interceptor', 'frigate', 'cruiser'],
      mockShips as Record<string, ShipStats>,
    );
    expect(result).toEqual({
      weapons: 45,      // cruiser
      shield: 28,        // cruiser
      hull: 55,          // cruiser
      baseArmor: 4,      // cruiser
      shotCount: 3,      // interceptor
      baseSpeed: 15000,  // cruiser
      fuelConsumption: 20, // interceptor (MIN)
      cargoCapacity: 800,  // cruiser
    });
  });

  it('uses min for fuelConsumption', () => {
    const result = computeBaseStatsFromShips(
      ['cruiser', 'smallCargo'],
      mockShips as Record<string, ShipStats>,
    );
    expect(result.fuelConsumption).toBe(10); // smallCargo has lowest
  });

  it('skips ship IDs not found in shipDefs', () => {
    const result = computeBaseStatsFromShips(
      ['interceptor', 'nonexistent'],
      mockShips as Record<string, ShipStats>,
    );
    expect(result.weapons).toBe(4); // only interceptor counts
  });

  it('returns defaults when all unlocked ships are missing from defs', () => {
    const result = computeBaseStatsFromShips(['nonexistent'], {});
    expect(result).toEqual(FLAGSHIP_DEFAULT_STATS);
  });
});

describe('FLAGSHIP_EXCLUDED_SHIPS', () => {
  it('excludes espionageProbe, solarSatellite, explorer', () => {
    expect(FLAGSHIP_EXCLUDED_SHIPS).toContain('espionageProbe');
    expect(FLAGSHIP_EXCLUDED_SHIPS).toContain('solarSatellite');
    expect(FLAGSHIP_EXCLUDED_SHIPS).toContain('explorer');
    expect(FLAGSHIP_EXCLUDED_SHIPS).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/game-engine && npx vitest run src/__tests__/flagship-stats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/game-engine/src/formulas/flagship-stats.ts

export const FLAGSHIP_EXCLUDED_SHIPS = ['espionageProbe', 'solarSatellite', 'explorer'] as const;

export const FLAGSHIP_DEFAULT_STATS = {
  weapons: 12,
  shield: 16,
  hull: 30,
  baseArmor: 2,
  shotCount: 2,
  baseSpeed: 10000,
  fuelConsumption: 75,
  cargoCapacity: 5000,
} as const;

export interface FlagshipBaseStats {
  weapons: number;
  shield: number;
  hull: number;
  baseArmor: number;
  shotCount: number;
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
}

interface ShipStatInput {
  weapons: number;
  shield: number;
  hull: number;
  baseArmor: number;
  shotCount: number;
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
}

/**
 * Compute flagship base stats = max of each stat across unlocked ships.
 * fuelConsumption uses min (advantage to the player).
 * Returns defaults if no valid ships provided.
 */
export function computeBaseStatsFromShips(
  unlockedShipIds: string[],
  shipDefs: Record<string, ShipStatInput>,
): FlagshipBaseStats {
  const ships = unlockedShipIds
    .map((id) => shipDefs[id])
    .filter((s): s is ShipStatInput => s != null);

  if (ships.length === 0) return { ...FLAGSHIP_DEFAULT_STATS };

  return {
    weapons: Math.max(...ships.map((s) => s.weapons)),
    shield: Math.max(...ships.map((s) => s.shield)),
    hull: Math.max(...ships.map((s) => s.hull)),
    baseArmor: Math.max(...ships.map((s) => s.baseArmor)),
    shotCount: Math.max(...ships.map((s) => s.shotCount)),
    baseSpeed: Math.max(...ships.map((s) => s.baseSpeed)),
    fuelConsumption: Math.min(...ships.map((s) => s.fuelConsumption)),
    cargoCapacity: Math.max(...ships.map((s) => s.cargoCapacity)),
  };
}
```

- [ ] **Step 4: Add export to game-engine index**

Add this line at the end of `packages/game-engine/src/index.ts`:

```typescript
export * from './formulas/flagship-stats.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/game-engine && npx vitest run src/__tests__/flagship-stats.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/formulas/flagship-stats.ts packages/game-engine/src/__tests__/flagship-stats.test.ts packages/game-engine/src/index.ts
git commit -m "feat: add computeBaseStatsFromShips pure function in game-engine"
```

---

### Task 2: Add `unlockedShips` column to schema + migration

**Files:**
- Modify: `packages/db/src/schema/flagships.ts`
- Create: `packages/db/drizzle/0025_flagship_dynamic_stats.sql`
- Modify: `packages/db/drizzle/meta/_journal.json`

- [ ] **Step 1: Add column to Drizzle schema**

In `packages/db/src/schema/flagships.ts`, add import and column.

Add to imports at line 1:

```typescript
import { pgTable, uuid, varchar, integer, smallint, timestamp, uniqueIndex, text } from 'drizzle-orm/pg-core';
```

Add after the `shotCount` line (line 28), before `combatCategoryId`:

```typescript
  unlockedShips: text('unlocked_ships').array().notNull().default([]),
```

Note: Drizzle uses `text('col').array()` for `TEXT[]` columns.

- [ ] **Step 2: Write the migration SQL**

```sql
-- packages/db/drizzle/0025_flagship_dynamic_stats.sql

-- Add unlocked_ships tracking column
ALTER TABLE "flagships" ADD COLUMN "unlocked_ships" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill existing players: scan planet_ships across all planets
-- For each ship type column, if any planet has count > 0, add to unlocked_ships
-- Excluded ships (espionageProbe, solarSatellite, explorer) are filtered out
WITH user_unlocks AS (
  SELECT
    f."id" AS flagship_id,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN SUM(ps."prospector") > 0 THEN 'prospector' END,
      CASE WHEN SUM(ps."small_cargo") > 0 THEN 'smallCargo' END,
      CASE WHEN SUM(ps."large_cargo") > 0 THEN 'largeCargo' END,
      CASE WHEN SUM(ps."colony_ship") > 0 THEN 'colonyShip' END,
      CASE WHEN SUM(ps."recycler") > 0 THEN 'recycler' END,
      CASE WHEN SUM(ps."interceptor") > 0 THEN 'interceptor' END,
      CASE WHEN SUM(ps."frigate") > 0 THEN 'frigate' END,
      CASE WHEN SUM(ps."cruiser") > 0 THEN 'cruiser' END,
      CASE WHEN SUM(ps."battlecruiser") > 0 THEN 'battlecruiser' END
    ], NULL) AS ships
  FROM "flagships" f
  JOIN "planets" p ON p."user_id" = f."user_id"
  JOIN "planet_ships" ps ON ps."planet_id" = p."id"
  GROUP BY f."id"
)
UPDATE "flagships" f
SET "unlocked_ships" = u.ships
FROM user_unlocks u
WHERE f."id" = u.flagship_id
  AND ARRAY_LENGTH(u.ships, 1) > 0;

-- Recalculate base stats for existing players based on their unlocked ships
-- Stats use MAX across unlocked ships, except fuel_consumption which uses MIN
-- Ship stats reference (from seed data):
--   prospector:    w=1  s=8  h=15  a=0 sc=1 spd=3000  fuel=50  cargo=750
--   smallCargo:    w=1  s=8  h=12  a=0 sc=1 spd=5000  fuel=10  cargo=5000
--   largeCargo:    w=1  s=20 h=36  a=0 sc=1 spd=7500  fuel=50  cargo=25000
--   colonyShip:    w=4  s=80 h=90  a=0 sc=1 spd=2500  fuel=1000 cargo=7500
--   recycler:      w=1  s=8  h=48  a=0 sc=1 spd=2000  fuel=300 cargo=20000
--   interceptor:   w=4  s=8  h=12  a=1 sc=3 spd=12500 fuel=20  cargo=50
--   frigate:       w=12 s=16 h=30  a=2 sc=2 spd=10000 fuel=75  cargo=100
--   cruiser:       w=45 s=28 h=55  a=4 sc=1 spd=15000 fuel=300 cargo=800
--   battlecruiser: w=70 s=40 h=100 a=6 sc=1 spd=10000 fuel=500 cargo=1500

-- We use a function approach: for each flagship with unlocked_ships, compute max/min from the known values
-- This is done via a lateral join with VALUES containing the ship stat lookup

WITH ship_stats(ship_id, w, s, h, a, sc, spd, fuel, cargo) AS (
  VALUES
    ('prospector',   1,  8, 15, 0, 1,  3000,   50,   750),
    ('smallCargo',   1,  8, 12, 0, 1,  5000,   10,  5000),
    ('largeCargo',   1, 20, 36, 0, 1,  7500,   50, 25000),
    ('colonyShip',   4, 80, 90, 0, 1,  2500, 1000,  7500),
    ('recycler',     1,  8, 48, 0, 1,  2000,  300, 20000),
    ('interceptor',  4,  8, 12, 1, 3, 12500,   20,    50),
    ('frigate',     12, 16, 30, 2, 2, 10000,   75,   100),
    ('cruiser',     45, 28, 55, 4, 1, 15000,  300,   800),
    ('battlecruiser',70, 40,100, 6, 1, 10000,  500,  1500)
),
flagship_new_stats AS (
  SELECT
    f."id",
    MAX(ss.w) AS weapons,
    MAX(ss.s) AS shield,
    MAX(ss.h) AS hull,
    MAX(ss.a) AS base_armor,
    MAX(ss.sc) AS shot_count,
    MAX(ss.spd) AS base_speed,
    MIN(ss.fuel) AS fuel_consumption,
    MAX(ss.cargo) AS cargo_capacity
  FROM "flagships" f
  JOIN LATERAL UNNEST(f."unlocked_ships") AS uid(ship_id) ON TRUE
  JOIN ship_stats ss ON ss.ship_id = uid.ship_id
  WHERE ARRAY_LENGTH(f."unlocked_ships", 1) > 0
  GROUP BY f."id"
)
UPDATE "flagships" f
SET
  "weapons" = ns.weapons,
  "shield" = ns.shield,
  "hull" = ns.hull,
  "base_armor" = ns.base_armor,
  "shot_count" = ns.shot_count,
  "base_speed" = ns.base_speed,
  "fuel_consumption" = ns.fuel_consumption,
  "cargo_capacity" = ns.cargo_capacity
FROM flagship_new_stats ns
WHERE f."id" = ns."id";
```

- [ ] **Step 3: Update migration journal**

In `packages/db/drizzle/meta/_journal.json`, add entry after the last one (idx 24):

```json
    {
      "idx": 25,
      "version": "7",
      "when": 1775100000000,
      "tag": "0025_flagship_dynamic_stats",
      "breakpoints": true
    }
```

- [ ] **Step 4: Type-check**

Run: `cd packages/db && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/flagships.ts packages/db/drizzle/0025_flagship_dynamic_stats.sql packages/db/drizzle/meta/_journal.json
git commit -m "feat: add unlocked_ships column with backfill migration"
```

---

### Task 3: Add `recalculateBaseStats` to flagship service

**Files:**
- Modify: `apps/api/src/modules/flagship/flagship.service.ts`

- [ ] **Step 1: Add imports**

At line 3 of `apps/api/src/modules/flagship/flagship.service.ts`, add `planetShips` and `planets` to the DB import, and add game-engine import:

```typescript
import { flagships, planets, planetShips } from '@exilium/db';
import type { Database } from '@exilium/db';
import { computeBaseStatsFromShips, FLAGSHIP_EXCLUDED_SHIPS } from '@exilium/game-engine';
```

Note: `planets` is already imported. Just add `planetShips` and the game-engine import.

- [ ] **Step 2: Add `recalculateBaseStats` method**

Add this method inside the returned object of `createFlagshipService`, after the existing methods:

```typescript
    async recalculateBaseStats(userId: string) {
      const [flagship] = await db
        .select({ id: flagships.id, unlockedShips: flagships.unlockedShips })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) return;

      const config = await gameConfigService.getFullConfig();
      const shipDefs: Record<string, { weapons: number; shield: number; hull: number; baseArmor: number; shotCount: number; baseSpeed: number; fuelConsumption: number; cargoCapacity: number }> = {};
      for (const [id, def] of Object.entries(config.ships)) {
        shipDefs[id] = {
          weapons: def.weapons,
          shield: def.shield,
          hull: def.hull,
          baseArmor: def.baseArmor,
          shotCount: def.shotCount,
          baseSpeed: def.baseSpeed,
          fuelConsumption: def.fuelConsumption,
          cargoCapacity: def.cargoCapacity,
        };
      }

      const stats = computeBaseStatsFromShips(flagship.unlockedShips, shipDefs);

      await db
        .update(flagships)
        .set({ ...stats, updatedAt: new Date() })
        .where(eq(flagships.id, flagship.id));
    },

    async addUnlockedShip(userId: string, shipId: string) {
      if ((FLAGSHIP_EXCLUDED_SHIPS as readonly string[]).includes(shipId)) return;

      const [flagship] = await db
        .select({ id: flagships.id, unlockedShips: flagships.unlockedShips })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) return;
      if (flagship.unlockedShips.includes(shipId)) return;

      const updatedList = [...flagship.unlockedShips, shipId];

      const config = await gameConfigService.getFullConfig();
      const shipDefs: Record<string, { weapons: number; shield: number; hull: number; baseArmor: number; shotCount: number; baseSpeed: number; fuelConsumption: number; cargoCapacity: number }> = {};
      for (const [id, def] of Object.entries(config.ships)) {
        shipDefs[id] = {
          weapons: def.weapons,
          shield: def.shield,
          hull: def.hull,
          baseArmor: def.baseArmor,
          shotCount: def.shotCount,
          baseSpeed: def.baseSpeed,
          fuelConsumption: def.fuelConsumption,
          cargoCapacity: def.cargoCapacity,
        };
      }

      const stats = computeBaseStatsFromShips(updatedList, shipDefs);

      await db
        .update(flagships)
        .set({ unlockedShips: updatedList, ...stats, updatedAt: new Date() })
        .where(eq(flagships.id, flagship.id));
    },
```

- [ ] **Step 3: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/flagship/flagship.service.ts
git commit -m "feat: add recalculateBaseStats and addUnlockedShip to flagship service"
```

---

### Task 4: Hook shipyard `completeUnit` to update flagship

**Files:**
- Modify: `apps/api/src/modules/shipyard/shipyard.service.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Add flagshipService parameter to createShipyardService**

In `apps/api/src/modules/shipyard/shipyard.service.ts`, change the function signature (lines 11-17) to add a `flagshipService` parameter:

```typescript
export function createShipyardService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  completionQueue: Queue,
  gameConfigService: GameConfigService,
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
  flagshipService?: { addUnlockedShip(userId: string, shipId: string): Promise<void> },
) {
```

- [ ] **Step 2: Add hook in `completeUnit` after ship count increment**

In `completeUnit`, after the ship count is incremented (after line 267 `where(eq(planetShips.planetId, entry.planetId));`), add the flagship update call:

```typescript
          // Update flagship base stats if this is a new ship type
          if (flagshipService) {
            await flagshipService.addUnlockedShip(entry.userId, entry.itemId);
          }
```

This goes inside the `if (shipDef)` block, after the `await db.update(planetShips)...` call, before the closing `}` of that block.

- [ ] **Step 3: Pass flagshipService in app-router**

In `apps/api/src/trpc/app-router.ts`, find the line where `createShipyardService` is called and add `flagshipService` as the last argument. The current call looks like:

```typescript
  const shipyardService = createShipyardService(db, resourceService, buildCompletionQueue, gameConfigService, talentService);
```

Change to:

```typescript
  const shipyardService = createShipyardService(db, resourceService, buildCompletionQueue, gameConfigService, talentService, flagshipService);
```

Make sure `flagshipService` is defined before `shipyardService` in the file (it currently is — flagship is created before shipyard in the service initialization order).

- [ ] **Step 4: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Lint**

Run: `npx eslint apps/api/src/modules/shipyard/shipyard.service.ts apps/api/src/trpc/app-router.ts`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/shipyard/shipyard.service.ts apps/api/src/trpc/app-router.ts
git commit -m "feat: hook shipyard completeUnit to update flagship stats on new ship type"
```

---

### Task 5: Final verification + push

- [ ] **Step 1: Run game-engine tests**

Run: `cd packages/game-engine && npx vitest run`
Expected: all tests pass

- [ ] **Step 2: Run API type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run full lint**

Run: `npx eslint packages/game-engine/src/formulas/flagship-stats.ts packages/game-engine/src/__tests__/flagship-stats.test.ts apps/api/src/modules/flagship/flagship.service.ts apps/api/src/modules/shipyard/shipyard.service.ts apps/api/src/trpc/app-router.ts`
Expected: no errors

- [ ] **Step 4: Push**

```bash
git push
```
