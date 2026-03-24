# Multi-Resource Mining Deposits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-resource asteroid deposits with multi-resource deposits (2-3 resources per deposit), with proportional cargo loading and simplified slag rates.

**Architecture:** Each deposit stores per-resource totals/remaining in 6 numeric columns. The extraction formula distributes cargo proportionally to what remains. Slag is a single rate per belt position. Frontend shows up to 3 resource amounts per mining mission.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM + PostgreSQL, tRPC, React

**Spec:** `docs/superpowers/specs/2026-03-20-multi-resource-deposits-design.md`

---

### Task 1: Update `computeMiningExtraction` formula (game-engine, TDD)

**Files:**
- Modify: `packages/game-engine/src/formulas/pve.ts`
- Modify: `packages/game-engine/src/formulas/pve.test.ts`

The `computeMiningExtraction` function must accept per-resource remaining quantities and return per-resource `playerReceives` and `depositLoss`. The old `totalExtracted` function is no longer needed (its logic is subsumed by `computeMiningExtraction`).

- [ ] **Step 1: Write failing tests for new `computeMiningExtraction` signature**

Replace the 5 existing `computeMiningExtraction` tests and the 4 `totalExtracted` tests with new multi-resource tests in `pve.test.ts`:

```ts
// Remove the 'totalExtracted' describe block entirely.
// Replace the 'computeMiningExtraction' describe block with:

describe('computeMiningExtraction', () => {
  it('distributes proportionally to remaining quantities', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 50000,
      siliciumRemaining: 30000,
      hydrogeneRemaining: 20000,
      slagRate: 0.30,
    });
    // rawExtraction = 2000*3 = 6000, effectiveCargo = 10000*0.7 = 7000
    // maxExtractable = min(6000, 7000) = 6000
    // totalRemaining = 100000, ratios: 0.5 / 0.3 / 0.2
    // player: floor(6000*0.5)=3000, floor(6000*0.3)=1800, 6000-3000-1800=1200
    expect(result.playerReceives).toEqual({ minerai: 3000, silicium: 1800, hydrogene: 1200 });
    // depositLoss: floor(3000/0.7)=4285 (capped 50000), floor(1800/0.7)=2571 (capped 30000), floor(1200/0.7)=1714 (capped 20000)
    expect(result.depositLoss.minerai).toBeCloseTo(4285, 0);
    expect(result.depositLoss.silicium).toBeCloseTo(2571, 0);
    expect(result.depositLoss.hydrogene).toBeCloseTo(1714, 0);
  });

  it('handles deposit nearly depleted (all drained)', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 200,
      siliciumRemaining: 200,
      hydrogeneRemaining: 100,
      slagRate: 0.30,
    });
    // totalRemaining=500 < maxExtractable=6000 → fully drained
    expect(result.depositLoss).toEqual({ minerai: 200, silicium: 200, hydrogene: 100 });
    expect(result.playerReceives).toEqual({
      minerai: Math.floor(200 * 0.7),  // 140
      silicium: Math.floor(200 * 0.7), // 140
      hydrogene: Math.floor(100 * 0.7), // 70
    });
  });

  it('returns full extraction when slagRate is 0', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 50000,
      siliciumRemaining: 50000,
      hydrogeneRemaining: 0,
      slagRate: 0,
    });
    // effectiveCargo = 10000 (no slag reduction), rawExtraction = 6000
    // maxExtractable = 6000, totalRemaining = 100000, ratios: 0.5 / 0.5 / 0
    // player: 3000 / 3000 / 0, depositLoss = playerReceives when slag=0
    expect(result.playerReceives).toEqual({ minerai: 3000, silicium: 3000, hydrogene: 0 });
    expect(result.depositLoss).toEqual({ minerai: 3000, silicium: 3000, hydrogene: 0 });
  });

  it('handles only one resource remaining', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 0,
      siliciumRemaining: 0,
      hydrogeneRemaining: 80000,
      slagRate: 0.15,
    });
    // effectiveCargo = 10000*0.85 = 8500, rawExtraction = 6000
    // maxExtractable = 6000, all goes to hydrogene
    expect(result.playerReceives).toEqual({ minerai: 0, silicium: 0, hydrogene: 6000 });
    expect(result.depositLoss.hydrogene).toBeCloseTo(7058, 0);
  });

  it('returns all zeros when deposit is empty', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 0,
      siliciumRemaining: 0,
      hydrogeneRemaining: 0,
      slagRate: 0.30,
    });
    expect(result.playerReceives).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    expect(result.depositLoss).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
  });

  it('caps at effective cargo when extraction exceeds it', () => {
    const result = computeMiningExtraction({
      centerLevel: 10,
      nbProspectors: 10,
      cargoCapacity: 10000,
      mineraiRemaining: 200000,
      siliciumRemaining: 200000,
      hydrogeneRemaining: 100000,
      slagRate: 0.30,
    });
    // rawExtraction = 9200*10 = 92000, effectiveCargo = 7000
    // maxExtractable = 7000, ratios: 0.4 / 0.4 / 0.2
    expect(result.playerReceives.minerai).toBe(Math.floor(7000 * 0.4));   // 2800
    expect(result.playerReceives.silicium).toBe(Math.floor(7000 * 0.4));  // 2800
    expect(result.playerReceives.hydrogene).toBe(7000 - 2800 - 2800);     // 1400
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run`
Expected: FAIL — `computeMiningExtraction` doesn't accept new params, `totalExtracted` tests reference removed function.

- [ ] **Step 3: Implement new `computeMiningExtraction` and remove `totalExtracted`**

Update `packages/game-engine/src/formulas/pve.ts`:

```ts
// Remove the totalExtracted function entirely.

// Replace computeMiningExtraction with:

interface ResourceAmounts {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

export interface MultiResourceExtraction {
  playerReceives: ResourceAmounts;
  depositLoss: ResourceAmounts;
}

/**
 * Compute multi-resource mining extraction with slag mechanics.
 * Distributes cargo proportionally to what remains in the deposit.
 */
export function computeMiningExtraction(params: {
  centerLevel: number;
  nbProspectors: number;
  cargoCapacity: number;
  mineraiRemaining: number;
  siliciumRemaining: number;
  hydrogeneRemaining: number;
  slagRate: number;
}): MultiResourceExtraction {
  const { centerLevel, nbProspectors, cargoCapacity, mineraiRemaining, siliciumRemaining, hydrogeneRemaining, slagRate } = params;

  const zero: ResourceAmounts = { minerai: 0, silicium: 0, hydrogene: 0 };
  const totalRemaining = mineraiRemaining + siliciumRemaining + hydrogeneRemaining;
  if (totalRemaining <= 0) return { playerReceives: { ...zero }, depositLoss: { ...zero } };

  const effectiveProspectors = Math.min(nbProspectors, 10);
  const rawExtraction = baseExtraction(centerLevel) * effectiveProspectors;
  const effectiveCargo = slagRate === 0 ? cargoCapacity : cargoCapacity * (1 - slagRate);
  const maxExtractable = Math.min(rawExtraction, effectiveCargo);

  const ratioM = mineraiRemaining / totalRemaining;
  const ratioS = siliciumRemaining / totalRemaining;

  if (maxExtractable >= totalRemaining) {
    // Deposit fully drained
    const depositLoss: ResourceAmounts = {
      minerai: mineraiRemaining,
      silicium: siliciumRemaining,
      hydrogene: hydrogeneRemaining,
    };
    const playerReceives: ResourceAmounts = {
      minerai: Math.floor(mineraiRemaining * (1 - slagRate)),
      silicium: Math.floor(siliciumRemaining * (1 - slagRate)),
      hydrogene: Math.floor(hydrogeneRemaining * (1 - slagRate)),
    };
    if (slagRate === 0) {
      return { playerReceives: { ...depositLoss }, depositLoss };
    }
    return { playerReceives, depositLoss };
  }

  // Normal case
  const playerM = Math.floor(maxExtractable * ratioM);
  const playerS = Math.floor(maxExtractable * ratioS);
  const playerH = maxExtractable - playerM - playerS;

  if (slagRate === 0) {
    const amounts: ResourceAmounts = { minerai: playerM, silicium: playerS, hydrogene: playerH };
    return { playerReceives: { ...amounts }, depositLoss: { ...amounts } };
  }

  const depositLoss: ResourceAmounts = {
    minerai: Math.min(Math.floor(playerM / (1 - slagRate)), mineraiRemaining),
    silicium: Math.min(Math.floor(playerS / (1 - slagRate)), siliciumRemaining),
    hydrogene: Math.min(Math.floor(playerH / (1 - slagRate)), hydrogeneRemaining),
  };

  return {
    playerReceives: { minerai: playerM, silicium: playerS, hydrogene: playerH },
    depositLoss,
  };
}
```

Also update the export in `packages/game-engine/src/index.ts` — remove `totalExtracted` from the export if it's listed individually (it's currently `export * from './formulas/pve.js'` so no change needed there, but verify no other file imports `totalExtracted`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run`
Expected: All tests PASS.

- [ ] **Step 5: Verify no other file imports `totalExtracted`**

Run: `grep -r "totalExtracted" packages/ apps/ --include="*.ts" --include="*.tsx"` — should only appear in pve.test.ts (now removed) and pve.ts (now removed). If anything else imports it, update those files.

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/formulas/pve.ts packages/game-engine/src/formulas/pve.test.ts
git commit -m "feat: multi-resource computeMiningExtraction formula

Replace single-resource extraction with proportional multi-resource
distribution. Remove totalExtracted (subsumed by new logic).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Update DB schema + generate migration

**Files:**
- Modify: `packages/db/src/schema/asteroid-belts.ts`
- Create: `packages/db/drizzle/0008_multi_resource_deposits.sql` (generated by Drizzle)

- [ ] **Step 1: Update Drizzle schema**

Replace the `asteroidDeposits` table definition in `packages/db/src/schema/asteroid-belts.ts`:

```ts
import { pgTable, uuid, smallint, numeric, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const asteroidBelts = pgTable('asteroid_belts', {
  id: uuid('id').primaryKey().defaultRandom(),
  galaxy: smallint('galaxy').notNull(),
  system: smallint('system').notNull(),
  position: smallint('position').notNull(),  // 8 or 16
}, (table) => [
  uniqueIndex('unique_belt_coords').on(table.galaxy, table.system, table.position),
]);

export const asteroidDeposits = pgTable('asteroid_deposits', {
  id: uuid('id').primaryKey().defaultRandom(),
  beltId: uuid('belt_id').notNull().references(() => asteroidBelts.id, { onDelete: 'cascade' }),
  mineraiTotal: numeric('minerai_total', { precision: 20, scale: 2 }).notNull().default('0'),
  mineraiRemaining: numeric('minerai_remaining', { precision: 20, scale: 2 }).notNull().default('0'),
  siliciumTotal: numeric('silicium_total', { precision: 20, scale: 2 }).notNull().default('0'),
  siliciumRemaining: numeric('silicium_remaining', { precision: 20, scale: 2 }).notNull().default('0'),
  hydrogeneTotal: numeric('hydrogene_total', { precision: 20, scale: 2 }).notNull().default('0'),
  hydrogeneRemaining: numeric('hydrogene_remaining', { precision: 20, scale: 2 }).notNull().default('0'),
  regeneratesAt: timestamp('regenerates_at', { withTimezone: true }),
}, (table) => [
  index('deposits_belt_idx').on(table.beltId),
]);
```

Note: `varchar` import removed (no longer needed). `index` name changed from `deposits_belt_remaining_idx` to `deposits_belt_idx` since `remainingQuantity` column is gone.

- [ ] **Step 2: Generate migration**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/db drizzle-kit generate`

This should produce `0008_*.sql`. Verify it contains:
- DROP of `resource_type`, `total_quantity`, `remaining_quantity` columns
- ADD of the 6 new numeric columns
- DROP of old index `deposits_belt_remaining_idx`
- CREATE of new index `deposits_belt_idx`

If the generated migration doesn't handle data migration (it won't since Drizzle generates DDL only), that's fine — existing deposits will get `0` defaults and will be regenerated naturally.

- [ ] **Step 3: Rename the migration file**

Rename the generated file to `0008_multi_resource_deposits.sql` for clarity:

```bash
cd /Users/julienaubree/_projet/ogame-clone/packages/db/drizzle
mv 0008_*.sql 0008_multi_resource_deposits.sql
```

Update the `meta/_journal.json` entry for migration 0008 to match the new filename (tag: `multi_resource_deposits`).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/asteroid-belts.ts packages/db/drizzle/
git commit -m "feat: multi-resource deposit schema (6 per-resource columns)

Replace resource_type/total_quantity/remaining_quantity with
minerai_total/minerai_remaining/silicium_total/silicium_remaining/
hydrogene_total/hydrogene_remaining columns.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Simplify slag rate seed config

**Files:**
- Modify: `packages/db/src/seed-game-config.ts`

- [ ] **Step 1: Replace 6 slag rate entries with 2**

In `packages/db/src/seed-game-config.ts`, find the 6 lines (around line 343-348):

```ts
  { key: 'slag_rate.pos8.minerai', value: 0.35 },
  { key: 'slag_rate.pos8.silicium', value: 0.30 },
  { key: 'slag_rate.pos8.hydrogene', value: 0.20 },
  { key: 'slag_rate.pos16.minerai', value: 0.20 },
  { key: 'slag_rate.pos16.silicium', value: 0.15 },
  { key: 'slag_rate.pos16.hydrogene', value: 0.10 },
```

Replace with:

```ts
  { key: 'slag_rate.pos8', value: 0.30 },
  { key: 'slag_rate.pos16', value: 0.15 },
```

Update the comment above from `// Slag rates (scories) — per position and resource type` to `// Slag rates (scories) — per position`.

- [ ] **Step 2: Add cleanup SQL to migration for existing databases**

In the migration file `packages/db/drizzle/0008_multi_resource_deposits.sql`, append at the end:

```sql
-- Clean up old per-resource slag rate keys
DELETE FROM universe_config WHERE key IN (
  'slag_rate.pos8.minerai', 'slag_rate.pos8.silicium', 'slag_rate.pos8.hydrogene',
  'slag_rate.pos16.minerai', 'slag_rate.pos16.silicium', 'slag_rate.pos16.hydrogene'
);
-- Insert new single-position slag rate keys (ignore if already present)
INSERT INTO universe_config (key, value) VALUES ('slag_rate.pos8', 0.30) ON CONFLICT (key) DO NOTHING;
INSERT INTO universe_config (key, value) VALUES ('slag_rate.pos16', 0.15) ON CONFLICT (key) DO NOTHING;
```

This ensures live databases get the old keys removed and new keys added even without re-seeding.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/seed-game-config.ts packages/db/drizzle/0008_multi_resource_deposits.sql
git commit -m "feat: simplify slag rates to single value per position

Replace 6 per-resource-per-position rates with 2 per-position rates:
pos8=0.30, pos16=0.15.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Update asteroid-belt.service.ts (generation, extraction, regeneration)

**Files:**
- Modify: `apps/api/src/modules/pve/asteroid-belt.service.ts`

This task rewrites the service for multi-resource deposits: generation with probabilistic resource presence, multi-column extraction, and updated regeneration.

- [ ] **Step 1: Rewrite deposit generation logic**

Replace the top of `asteroid-belt.service.ts` (imports through `randomRegenDelay`):

```ts
import { eq, and, sql, lte, isNotNull } from 'drizzle-orm';
import { asteroidBelts, asteroidDeposits } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

const DEPOSITS_PER_BELT = { min: 3, max: 5 };

// Probability that each resource is present in a deposit
const PRESENCE_PROBABILITY = {
  8:  { minerai: 0.95, silicium: 0.90, hydrogene: 0.25 },
  16: { minerai: 0.60, silicium: 0.65, hydrogene: 0.90 },
} as const;

// Distribution weights (normalized to present resources)
const DISTRIBUTION_WEIGHTS = {
  8:  { minerai: 0.45, silicium: 0.45, hydrogene: 0.10 },
  16: { minerai: 0.25, silicium: 0.25, hydrogene: 0.50 },
} as const;

const QUANTITY_RANGE = {
  8:  { min: 20000, max: 40000 },
  16: { min: 40000, max: 80000 },
} as const;

type ResourceKey = 'minerai' | 'silicium' | 'hydrogene';
const ALL_RESOURCES: ResourceKey[] = ['minerai', 'silicium', 'hydrogene'];

function rollPresentResources(position: 8 | 16): ResourceKey[] {
  const probs = PRESENCE_PROBABILITY[position];
  let present: ResourceKey[];
  do {
    present = ALL_RESOURCES.filter(r => Math.random() < probs[r]);
  } while (present.length < 2);
  return present;
}

function distributeQuantity(
  totalQty: number,
  present: ResourceKey[],
  position: 8 | 16,
): Record<ResourceKey, number> {
  const weights = DISTRIBUTION_WEIGHTS[position];
  const totalWeight = present.reduce((sum, r) => sum + weights[r], 0);
  const result: Record<ResourceKey, number> = { minerai: 0, silicium: 0, hydrogene: 0 };
  for (const r of present) {
    result[r] = Math.floor(totalQty * weights[r] / totalWeight);
  }
  return result;
}

function randomQuantity(position: 8 | 16, centerLevel: number): number {
  const { min, max } = QUANTITY_RANGE[position];
  const levelMultiplier = 1 + 0.15 * (centerLevel - 1);
  const base = min + Math.random() * (max - min);
  return Math.floor(base * levelMultiplier);
}

function randomRegenDelay(): number {
  return (4 + Math.random() * 4) * 60 * 60 * 1000;
}
```

- [ ] **Step 2: Rewrite `generateDeposits` method**

In the service object returned by `createAsteroidBeltService`, replace `generateDeposits`:

```ts
    async generateDeposits(beltId: string, position: 8 | 16, centerLevel: number) {
      const count = DEPOSITS_PER_BELT.min + Math.floor(Math.random() * (DEPOSITS_PER_BELT.max - DEPOSITS_PER_BELT.min + 1));
      const values = [];
      for (let i = 0; i < count; i++) {
        const totalQty = randomQuantity(position, centerLevel);
        const present = rollPresentResources(position);
        const dist = distributeQuantity(totalQty, present, position);
        values.push({
          beltId,
          mineraiTotal: String(dist.minerai),
          mineraiRemaining: String(dist.minerai),
          siliciumTotal: String(dist.silicium),
          siliciumRemaining: String(dist.silicium),
          hydrogeneTotal: String(dist.hydrogene),
          hydrogeneRemaining: String(dist.hydrogene),
        });
      }
      await db.insert(asteroidDeposits).values(values);
    },
```

- [ ] **Step 3: Rewrite `extractFromDeposit` method**

Replace the current single-resource extraction with multi-resource:

```ts
    async extractFromDeposit(
      depositId: string,
      loss: { minerai: number; silicium: number; hydrogene: number },
    ): Promise<{ minerai: number; silicium: number; hydrogene: number }> {
      const regenDelayMs = randomRegenDelay();
      // CTE captures old values with FOR UPDATE lock, then UPDATE + RETURNING
      // computes actual deducted amounts (handles concurrent extraction).
      const result = await db.execute(sql`
        WITH pre AS (
          SELECT id, minerai_remaining, silicium_remaining, hydrogene_remaining
          FROM asteroid_deposits
          WHERE id = ${depositId}
            AND (minerai_remaining + silicium_remaining + hydrogene_remaining) > 0
          FOR UPDATE
        )
        UPDATE asteroid_deposits d
        SET minerai_remaining = GREATEST(0, d.minerai_remaining - ${loss.minerai}),
            silicium_remaining = GREATEST(0, d.silicium_remaining - ${loss.silicium}),
            hydrogene_remaining = GREATEST(0, d.hydrogene_remaining - ${loss.hydrogene}),
            regenerates_at = CASE
              WHEN GREATEST(0, d.minerai_remaining - ${loss.minerai})
                 + GREATEST(0, d.silicium_remaining - ${loss.silicium})
                 + GREATEST(0, d.hydrogene_remaining - ${loss.hydrogene}) <= 0
              THEN NOW() + make_interval(secs => ${regenDelayMs / 1000})
              ELSE NULL
            END
        FROM pre
        WHERE d.id = pre.id
        RETURNING
          LEAST(pre.minerai_remaining::numeric, ${loss.minerai}) AS deducted_minerai,
          LEAST(pre.silicium_remaining::numeric, ${loss.silicium}) AS deducted_silicium,
          LEAST(pre.hydrogene_remaining::numeric, ${loss.hydrogene}) AS deducted_hydrogene
      `);

      if (result.length === 0) return { minerai: 0, silicium: 0, hydrogene: 0 };

      const row = result[0] as { deducted_minerai: string; deducted_silicium: string; deducted_hydrogene: string };
      return {
        minerai: Number(row.deducted_minerai),
        silicium: Number(row.deducted_silicium),
        hydrogene: Number(row.deducted_hydrogene),
      };
    },
```

- [ ] **Step 4: Rewrite `regenerateDepletedDeposits` method**

```ts
    async regenerateDepletedDeposits() {
      const depleted = await db.select({
        deposit: asteroidDeposits,
        belt: asteroidBelts,
      })
        .from(asteroidDeposits)
        .innerJoin(asteroidBelts, eq(asteroidDeposits.beltId, asteroidBelts.id))
        .where(and(
          sql`${asteroidDeposits.mineraiRemaining} + ${asteroidDeposits.siliciumRemaining} + ${asteroidDeposits.hydrogeneRemaining} <= 0`,
          isNotNull(asteroidDeposits.regeneratesAt),
          lte(asteroidDeposits.regeneratesAt, new Date()),
        ));

      for (const { deposit, belt } of depleted) {
        const pos = belt.position as 8 | 16;
        const totalQty = randomQuantity(pos, 1);
        const present = rollPresentResources(pos);
        const dist = distributeQuantity(totalQty, present, pos);
        await db.update(asteroidDeposits)
          .set({
            mineraiTotal: String(dist.minerai),
            mineraiRemaining: String(dist.minerai),
            siliciumTotal: String(dist.silicium),
            siliciumRemaining: String(dist.silicium),
            hydrogeneTotal: String(dist.hydrogene),
            hydrogeneRemaining: String(dist.hydrogene),
            regeneratesAt: null,
          })
          .where(eq(asteroidDeposits.id, deposit.id));
      }
    },
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pve/asteroid-belt.service.ts
git commit -m "feat: multi-resource deposit generation, extraction, regeneration

Deposits now contain 2-3 resources with probabilistic presence and
weighted distribution. Extraction updates 3 columns atomically.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Update mine.handler.ts (multi-resource extraction flow)

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/mine.handler.ts`

- [ ] **Step 1: Update `processArrival` — use `*_total` for prospection duration**

In `processArrival`, change the deposit total lookup (around line 35-38):

```ts
    // Replace:
    const params = mission.parameters as { depositId: string; resourceType: string };
    const [deposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const depositTotal = deposit ? Number(deposit.totalQuantity) : 0;

    // With:
    const params = mission.parameters as { depositId: string };
    const [deposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const depositTotal = deposit
      ? Number(deposit.mineraiTotal) + Number(deposit.siliciumTotal) + Number(deposit.hydrogeneTotal)
      : 0;
```

- [ ] **Step 2: Rewrite `processMineDone` for multi-resource extraction**

Replace the entire `processMineDone` method body:

```ts
  private async processMineDone(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<PhaseResult> {
    const ships = fleetEvent.ships;
    const pveMissionId = fleetEvent.pveMissionId;
    const mission = pveMissionId
      ? await ctx.db.select().from(pveMissions).where(eq(pveMissions.id, pveMissionId)).limit(1).then(r => r[0])
      : null;

    if (!mission || !ctx.pveService || !ctx.asteroidBeltService) {
      return {
        scheduleReturn: true,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
      };
    }

    const params = mission.parameters as { depositId: string };
    const centerLevel = await ctx.pveService.getMissionCenterLevel(fleetEvent.userId);
    const prospectorCount = ships['prospector'] ?? 0;
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);
    const cargoCapacity = totalCargoCapacity(ships, shipStatsMap);

    // Single slag rate per position
    const position = fleetEvent.targetPosition as 8 | 16;
    const slagKey = `slag_rate.pos${position}`;
    const baseSlagRate = Number(config.universe[slagKey] ?? 0);

    const [research] = await ctx.db.select().from(userResearch).where(eq(userResearch.userId, fleetEvent.userId)).limit(1);
    const refiningLevel = research?.deepSpaceRefining ?? 0;
    const slagRate = computeSlagRate(baseSlagRate, refiningLevel);

    // Fetch deposit remaining
    const [deposit] = await ctx.db.select().from(asteroidDeposits)
      .where(eq(asteroidDeposits.id, params.depositId)).limit(1);
    const mineraiRemaining = deposit ? Number(deposit.mineraiRemaining) : 0;
    const siliciumRemaining = deposit ? Number(deposit.siliciumRemaining) : 0;
    const hydrogeneRemaining = deposit ? Number(deposit.hydrogeneRemaining) : 0;

    const extraction = computeMiningExtraction({
      centerLevel,
      nbProspectors: prospectorCount,
      cargoCapacity,
      mineraiRemaining,
      siliciumRemaining,
      hydrogeneRemaining,
      slagRate,
    });

    // Atomic extraction — returns actual deducted amounts
    const actualLoss = await ctx.asteroidBeltService.extractFromDeposit(params.depositId, extraction.depositLoss);

    // Recompute playerReceives from actual loss (handles concurrent access)
    const cargo = {
      minerai: slagRate > 0 ? Math.floor(actualLoss.minerai * (1 - slagRate)) : actualLoss.minerai,
      silicium: slagRate > 0 ? Math.floor(actualLoss.silicium * (1 - slagRate)) : actualLoss.silicium,
      hydrogene: slagRate > 0 ? Math.floor(actualLoss.hydrogene * (1 - slagRate)) : actualLoss.hydrogene,
    };

    await ctx.db.update(fleetEvents).set({
      mineraiCargo: String(cargo.minerai),
      siliciumCargo: String(cargo.silicium),
      hydrogeneCargo: String(cargo.hydrogene),
    }).where(eq(fleetEvents.id, fleetEvent.id));

    await ctx.pveService.completeMission(mission.id);

    // System message
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const meta = fleetEvent.metadata as { originalDepartureTime?: string } | null;
    const originalDeparture = meta?.originalDepartureTime ? new Date(meta.originalDepartureTime) : fleetEvent.departureTime;
    const totalDuration = formatDuration(Date.now() - originalDeparture.getTime());

    if (ctx.messageService) {
      const parts = [`Extraction terminée en ${coords}\n`];
      parts.push(`Durée totale : ${totalDuration}`);
      const resLines: string[] = [];
      if (cargo.minerai > 0) resLines.push(`Minerai: +${cargo.minerai.toLocaleString('fr-FR')}`);
      if (cargo.silicium > 0) resLines.push(`Silicium: +${cargo.silicium.toLocaleString('fr-FR')}`);
      if (cargo.hydrogene > 0) resLines.push(`Hydrogène: +${cargo.hydrogene.toLocaleString('fr-FR')}`);
      parts.push(resLines.join(' | '));
      if (slagRate > 0) {
        parts.push(`Pertes (scories) : ${Math.round(slagRate * 100)}%`);
      }
      await ctx.messageService.createSystemMessage(
        fleetEvent.userId,
        'mission',
        `Extraction terminée ${coords}`,
        parts.join('\n'),
      );
    }

    return {
      scheduleReturn: true,
      cargo,
    };
  }
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/mine.handler.ts
git commit -m "feat: multi-resource mine handler with single slag rate

processArrival uses *_total for duration. processMineDone extracts
all 3 resources proportionally. System message shows breakdown.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Update pve.service.ts (mission generation)

**Files:**
- Modify: `apps/api/src/modules/pve/pve.service.ts`

- [ ] **Step 1: Update `generateMiningMission` parameters and rewards format**

Replace the `generateMiningMission` method:

```ts
    async generateMiningMission(userId: string, galaxy: number, system: number, centerLevel: number) {
      const availablePositions: (8 | 16)[] = centerLevel >= 2 ? [8, 16] : [8];
      const position = availablePositions[Math.floor(Math.random() * availablePositions.length)];

      const belt = await asteroidBeltService.getOrCreateBelt(galaxy, system, position);
      const deposits = await asteroidBeltService.getDeposits(belt.id);

      const available = deposits.filter(d =>
        Number(d.mineraiRemaining) + Number(d.siliciumRemaining) + Number(d.hydrogeneRemaining) > 0,
      );
      if (available.length === 0) return;

      const deposit = available[Math.floor(Math.random() * available.length)];

      const resources: Record<string, number> = {};
      if (Number(deposit.mineraiRemaining) > 0) resources.minerai = Number(deposit.mineraiRemaining);
      if (Number(deposit.siliciumRemaining) > 0) resources.silicium = Number(deposit.siliciumRemaining);
      if (Number(deposit.hydrogeneRemaining) > 0) resources.hydrogene = Number(deposit.hydrogeneRemaining);

      await db.insert(pveMissions).values({
        userId,
        missionType: 'mine',
        parameters: {
          galaxy, system, position,
          beltId: belt.id,
          depositId: deposit.id,
          resources,
        },
        rewards: { ...resources },
        status: 'available',
      });
    },
```

- [ ] **Step 2: Verify `pve.router.ts` needs no changes**

Read `apps/api/src/modules/pve/pve.router.ts`. The `getMissions` endpoint returns `missions` directly from the DB query. Since `parameters` and `rewards` are JSONB columns, the new shape flows through automatically with no TS type narrowing. Confirm that no explicit type casting references `resourceType` or `estimatedQuantity`. If it does, update accordingly.

The current router (35 lines) simply passes through DB results — no changes needed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/pve/pve.service.ts
git commit -m "feat: multi-resource mining mission parameters/rewards

Mission parameters now include resources:{minerai?,silicium?,hydrogene?}
instead of single resourceType/remainingQuantity.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — multi-resource display on mission cards and banner

**Files:**
- Modify: `apps/web/src/pages/Missions.tsx`
- Modify: `apps/web/src/components/fleet/PveMissionBanner.tsx`

- [ ] **Step 1: Update Missions.tsx mining mission card**

In `apps/web/src/pages/Missions.tsx`, replace the mining mission display section (lines 104-114):

```tsx
                {isMining ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Ressources estimées :</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {rewards.minerai > 0 && (
                        <span className="text-minerai">M: {Number(rewards.minerai).toLocaleString('fr-FR')}</span>
                      )}
                      {rewards.silicium > 0 && (
                        <span className="text-silicium">S: {Number(rewards.silicium).toLocaleString('fr-FR')}</span>
                      )}
                      {rewards.hydrogene > 0 && (
                        <span className="text-hydrogene">H: {Number(rewards.hydrogene).toLocaleString('fr-FR')}</span>
                      )}
                    </div>
                  </div>
                ) : (
```

This replaces the single `resourceType + estimatedQuantity` display with the same multi-resource pattern used by pirate missions.

- [ ] **Step 2: Update PveMissionBanner.tsx mining banner**

Replace the mining section in `PveMissionBanner.tsx` (lines 32-45):

```tsx
  if (mission.missionType === 'mine') {
    const miningRewards = rewards as Record<string, number>;
    const resParts: string[] = [];
    if (miningRewards.minerai > 0) resParts.push(`${Number(miningRewards.minerai).toLocaleString()} minerai`);
    if (miningRewards.silicium > 0) resParts.push(`${Number(miningRewards.silicium).toLocaleString()} silicium`);
    if (miningRewards.hydrogene > 0) resParts.push(`${Number(miningRewards.hydrogene).toLocaleString()} H₂`);
    return (
      <div className="flex items-center gap-3 rounded-lg border border-blue-800/60 bg-blue-950/40 p-3">
        <span className="text-xl">⛏</span>
        <div>
          <div className="text-sm font-semibold text-blue-300">Extraction minière</div>
          <div className="text-xs text-blue-400/80">
            {resParts.join(', ')} — Ceinture {coords}
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Remove unused RESOURCE_LABELS from Missions.tsx**

The `RESOURCE_LABELS` constant (lines 19-23) is no longer used — remove it.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Missions.tsx apps/web/src/components/fleet/PveMissionBanner.tsx
git commit -m "feat: multi-resource display on mission cards and banner

Mining missions now show up to 3 resource types with quantities,
matching the pirate mission reward display pattern.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Build verification + type-check

**Files:** None (verification only)

- [ ] **Step 1: Run full type-check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm build`
Expected: Clean build, no TS errors.

If there are errors, they likely come from:
- Other files importing `totalExtracted` — remove those imports
- `extractFromDeposit` callers expecting `number` return — update to accept `{ minerai, silicium, hydrogene }`
- Schema column references in queries (`resourceType`, `totalQuantity`, `remainingQuantity`) — update to new columns

Fix any errors before proceeding.

- [ ] **Step 2: Run all tests**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm test -- --run`
Expected: All tests pass.

- [ ] **Step 3: Commit any fixes**

If fixes were needed:
```bash
git add -A
git commit -m "fix: resolve type errors from multi-resource migration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
