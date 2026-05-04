# Système d'XP Flagship — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Ajouter un système de progression XP au flagship — XP gagnée per-combat (`enemyFP × 0.10`) + bonus per-run (`depth × 100`), commit-on-grant. Cap level 60 = ×4 stats baseline (+5%/level sur weapons/shield/hull/armor).

**Architecture :** 2 colonnes sur `flagships` (xp + level). Engine pure formulas dans `@exilium/game-engine`. `flagshipService.grantXp()` pour grant + recompute level. `flagshipService.get()` applique `levelMultiplier` sur effectiveStats. `anomalyService.advance/retreat` grants XP aux moments appropriés. UI badge level + XP bar dans FlagshipIdentityCard + toasts dans Anomaly. Tune parallèle `anomaly_enemy_base_ratio` 0.7→0.5 dans la même migration.

**Tech Stack :** Drizzle/Postgres, tRPC 11, React 19, vitest, pnpm turbo.

**Spec source :** `docs/superpowers/specs/2026-05-04-flagship-xp-design.md`

---

## File Structure

### Files to CREATE

| Path | Responsabilité |
|---|---|
| `packages/db/drizzle/0071_flagship_xp.sql` | +2 colonnes flagships + 4 universe_config + tune anomaly_enemy_base_ratio + marker |
| `packages/game-engine/src/formulas/flagship-xp.ts` | Pure formulas : xpRequiredForLevel, xpToLevel, levelMultiplier, xpFromCombat, xpFromRunDepth |
| `packages/game-engine/src/formulas/flagship-xp.test.ts` | ~10 tests purs |
| `apps/api/src/modules/flagship/__tests__/flagship.service.grantXp.test.ts` | ~5 tests grantXp |

### Files to MODIFY

| Path | Changement |
|---|---|
| `packages/db/src/schema/flagships.ts` | +2 colonnes (xp, level) |
| `packages/game-engine/src/index.ts` | Export new flagship-xp module |
| `apps/api/src/modules/flagship/flagship.service.ts` | +grantXp method + levelMultiplier integration in get() |
| `apps/api/src/modules/anomaly/anomaly.service.ts` | XP grant in advance survived/runComplete + retreat |
| `apps/web/src/components/flagship/FlagshipIdentityCard.tsx` | Badge level + XP bar block |
| `apps/web/src/pages/Anomaly.tsx` | Toasts xpGained + levelUp dans onSuccess |
| `apps/web/src/components/anomaly/AnomalyEngageModal.tsx` | Ligne "Niveau pilote X (×Y)" dans stats card |

---

## Task 1 : Migration DB + Drizzle schema

**Files :**
- Create: `packages/db/drizzle/0071_flagship_xp.sql`
- Modify: `packages/db/src/schema/flagships.ts`

- [ ] **Step 1: Write the SQL migration**

Create `/opt/exilium/packages/db/drizzle/0071_flagship_xp.sql` with this EXACT content :

```sql
-- Flagship XP system (2026-05-04)
-- IF NOT EXISTS pour idempotence en cas de re-run partiel
ALTER TABLE flagships
  ADD COLUMN IF NOT EXISTS xp    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 1;

-- Universe config tunables (jsonb cast obligatoire — colonne value est jsonb)
INSERT INTO universe_config (key, value) VALUES
  ('flagship_xp_per_kill_fp_factor',    '0.10'::jsonb),
  ('flagship_xp_per_depth_bonus',       '100'::jsonb),
  ('flagship_xp_level_multiplier_pct',  '0.05'::jsonb),
  ('flagship_max_level',                '60'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Tune parallèle V4 : adoucir le early-game pour les flagships rang 1
UPDATE universe_config
SET value = '0.5'::jsonb
WHERE key = 'anomaly_enemy_base_ratio';

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('flagship_xp_init', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
```

- [ ] **Step 2: Update Drizzle schema**

Read `/opt/exilium/packages/db/src/schema/flagships.ts` first to see current structure (post-Talents-removal sprint).

Modify the file to add 2 columns BEFORE `createdAt`. Find the column block ending around `epicChargesMax` (sprint 1 modules) or `repairChargesMax` (V4) and insert :

```ts
  /** Flagship XP system (2026-05-04) : XP cumulée. */
  xp:    integer('xp').notNull().default(0),
  /** Level dérivé de xp via xpToLevel formula, persisté pour query rapide. */
  level: smallint('level').notNull().default(1),
```

Verify `integer` and `smallint` are already imported at the top of the file (they should be — many other tables use them).

- [ ] **Step 3: Verify lint + typecheck**

Run :
```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/db --filter=@exilium/api 2>&1 | tail -10
```

Expected : 0 errors. (Some errors related to `flagship.xp` / `flagship.level` not yet used in service code might surface — those are fine for this task, fixed in subsequent tasks.)

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/0071_flagship_xp.sql packages/db/src/schema/flagships.ts
git commit -m "feat(db): flagship XP system — colonnes xp/level + tune anomaly_enemy_base_ratio"
```

Do NOT push. Bundled with subsequent tasks.

---

## Task 2 : Engine formulas + tests

**Files :**
- Create: `packages/game-engine/src/formulas/flagship-xp.ts`
- Create: `packages/game-engine/src/formulas/flagship-xp.test.ts`
- Modify: `packages/game-engine/src/index.ts`

- [ ] **Step 1: Write the engine formulas file**

Create `/opt/exilium/packages/game-engine/src/formulas/flagship-xp.ts` with this EXACT content :

```ts
/**
 * Pure formulas for the Flagship XP system (2026-05-04).
 * All input/output are plain data — no DB, no I/O.
 *
 * See spec : docs/superpowers/specs/2026-05-04-flagship-xp-design.md
 */

export interface XpConfig {
  /** XP per enemy FP killed (default 0.10). */
  perKillFpFactor: number;
  /** XP bonus per depth atteinte en fin de run (default 100). */
  perDepthBonus: number;
  /** Multiplier % par level (default 0.05 = +5%/level). */
  levelMultiplierPct: number;
  /** Cap level (default 60). */
  maxLevel: number;
}

export const DEFAULT_XP_CONFIG: XpConfig = {
  perKillFpFactor: 0.10,
  perDepthBonus: 100,
  levelMultiplierPct: 0.05,
  maxLevel: 60,
};

/**
 * XP cumulative requise pour ATTEINDRE le level L (depuis L1).
 * Formule quadratic : 100 × (L-1) × L / 2.
 *  - L1 = 0 (starting)
 *  - L2 = 100
 *  - L5 = 1000
 *  - L10 = 4500
 *  - L20 = 19000
 *  - L60 = 177000
 */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(100 * (level - 1) * level / 2);
}

/** Inverse : à partir d'un XP cumulé, retourne le level atteint (capped). */
export function xpToLevel(xp: number, maxLevel: number): number {
  if (xp <= 0) return 1;
  for (let L = maxLevel; L >= 1; L--) {
    if (xpRequiredForLevel(L) <= xp) return L;
  }
  return 1;
}

/** Multiplier appliqué aux stats combat à un level donné. */
export function levelMultiplier(level: number, pctPerLevel: number): number {
  return 1 + level * pctPerLevel;
}

/** XP gagnée à un combat win (basé sur le FP total des ennemis tués). */
export function xpFromCombat(enemyFP: number, config: XpConfig): number {
  return Math.round(enemyFP * config.perKillFpFactor);
}

/** XP bonus en fin de run (basé sur la profondeur atteinte). */
export function xpFromRunDepth(depth: number, config: XpConfig): number {
  return Math.round(depth * config.perDepthBonus);
}
```

- [ ] **Step 2: Write the tests file**

Create `/opt/exilium/packages/game-engine/src/formulas/flagship-xp.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  xpRequiredForLevel,
  xpToLevel,
  levelMultiplier,
  xpFromCombat,
  xpFromRunDepth,
  DEFAULT_XP_CONFIG,
} from './flagship-xp.js';

describe('xpRequiredForLevel', () => {
  it('returns 0 for level 1 (starting)', () => {
    expect(xpRequiredForLevel(1)).toBe(0);
  });
  it('returns 0 for level <= 1 (defensive)', () => {
    expect(xpRequiredForLevel(0)).toBe(0);
    expect(xpRequiredForLevel(-5)).toBe(0);
  });
  it('returns 100 for level 2', () => {
    expect(xpRequiredForLevel(2)).toBe(100);
  });
  it('returns 1000 for level 5', () => {
    // 100 × 4 × 5 / 2 = 1000
    expect(xpRequiredForLevel(5)).toBe(1000);
  });
  it('returns 4500 for level 10', () => {
    // 100 × 9 × 10 / 2 = 4500
    expect(xpRequiredForLevel(10)).toBe(4500);
  });
  it('returns 19000 for level 20', () => {
    // 100 × 19 × 20 / 2 = 19000
    expect(xpRequiredForLevel(20)).toBe(19000);
  });
  it('returns 177000 for level 60 (cap)', () => {
    // 100 × 59 × 60 / 2 = 177000
    expect(xpRequiredForLevel(60)).toBe(177000);
  });
});

describe('xpToLevel', () => {
  it('returns 1 for 0 XP', () => {
    expect(xpToLevel(0, 60)).toBe(1);
  });
  it('returns 1 for 99 XP (just below L2)', () => {
    expect(xpToLevel(99, 60)).toBe(1);
  });
  it('returns 2 for exactly 100 XP', () => {
    expect(xpToLevel(100, 60)).toBe(2);
  });
  it('returns 10 for 4500 XP', () => {
    expect(xpToLevel(4500, 60)).toBe(10);
  });
  it('caps at maxLevel for very high XP', () => {
    expect(xpToLevel(999999, 60)).toBe(60);
  });
  it('respects custom maxLevel', () => {
    expect(xpToLevel(999999, 20)).toBe(20);
  });
});

describe('levelMultiplier', () => {
  it('returns 1.0 at level 0', () => {
    expect(levelMultiplier(0, 0.05)).toBe(1.0);
  });
  it('returns 1.05 at level 1 with 5% per level', () => {
    expect(levelMultiplier(1, 0.05)).toBeCloseTo(1.05);
  });
  it('returns 2.0 at level 20 with 5% per level', () => {
    expect(levelMultiplier(20, 0.05)).toBe(2.0);
  });
  it('returns 4.0 at level 60 cap', () => {
    expect(levelMultiplier(60, 0.05)).toBe(4.0);
  });
});

describe('xpFromCombat', () => {
  it('returns 100 for enemyFP 1000 with default factor (0.10)', () => {
    expect(xpFromCombat(1000, DEFAULT_XP_CONFIG)).toBe(100);
  });
  it('rounds correctly for non-integer factor', () => {
    expect(xpFromCombat(123, DEFAULT_XP_CONFIG)).toBe(12);
  });
  it('returns 0 for enemyFP 0', () => {
    expect(xpFromCombat(0, DEFAULT_XP_CONFIG)).toBe(0);
  });
});

describe('xpFromRunDepth', () => {
  it('returns 1000 for depth 10 with default bonus (100)', () => {
    expect(xpFromRunDepth(10, DEFAULT_XP_CONFIG)).toBe(1000);
  });
  it('returns 2000 for depth 20', () => {
    expect(xpFromRunDepth(20, DEFAULT_XP_CONFIG)).toBe(2000);
  });
  it('returns 0 for depth 0 (defensive)', () => {
    expect(xpFromRunDepth(0, DEFAULT_XP_CONFIG)).toBe(0);
  });
});
```

- [ ] **Step 3: Export from engine index**

Modify `/opt/exilium/packages/game-engine/src/index.ts` to add the new exports. Find the section listing other formulas exports and add :

```ts
export * from './formulas/flagship-xp.js';
```

If the file uses a different export pattern (e.g. explicit re-exports), match the existing pattern.

- [ ] **Step 4: Run the tests**

Run :
```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/game-engine 2>&1 | tail -10
```

Expected : all tests pass + new ~22 tests from flagship-xp.test.ts.

- [ ] **Step 5: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/game-engine 2>&1 | tail -5
```

Expected : 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/formulas/flagship-xp.ts packages/game-engine/src/formulas/flagship-xp.test.ts packages/game-engine/src/index.ts
git commit -m "feat(engine): formules pures pour XP flagship (xpToLevel + multiplier)"
```

Do NOT push.

---

## Task 3 : Backend `grantXp` service + tests

**Files :**
- Modify: `apps/api/src/modules/flagship/flagship.service.ts`
- Create: `apps/api/src/modules/flagship/__tests__/flagship.service.grantXp.test.ts`

- [ ] **Step 1: Add grantXp method to flagshipService**

Read `/opt/exilium/apps/api/src/modules/flagship/flagship.service.ts` to understand the current return object structure (around lines 43+). Add the new method INSIDE the returned object (placement near other read/mutate methods is fine).

Add at the top of the file, in the imports :
```ts
import { xpToLevel } from '@exilium/game-engine';
```

Add the new method to the returned object :

```ts
    /**
     * V4-XP (2026-05-04) : grant XP to the flagship + recompute level.
     * No-op for amount <= 0. Wrapped in transaction with advisory lock for
     * concurrent safety (multiple grantXp calls from concurrent advance/retreat).
     */
    async grantXp(userId: string, amount: number): Promise<{
      newXp: number;
      oldLevel: number;
      newLevel: number;
      levelUp: boolean;
    }> {
      if (amount <= 0) return { newXp: 0, oldLevel: 1, newLevel: 1, levelUp: false };

      const config = await gameConfigService.getFullConfig();
      const maxLevel = Number(config.universe.flagship_max_level) || 60;

      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        const [flagship] = await tx.select({
          id: flagships.id,
          xp: flagships.xp,
          level: flagships.level,
        }).from(flagships).where(eq(flagships.userId, userId)).for('update').limit(1);
        if (!flagship) {
          return { newXp: 0, oldLevel: 1, newLevel: 1, levelUp: false };
        }

        const oldLevel = flagship.level;
        const newXp = flagship.xp + amount;
        const newLevel = xpToLevel(newXp, maxLevel);

        await tx.update(flagships).set({
          xp: newXp,
          level: newLevel,
          updatedAt: new Date(),
        }).where(eq(flagships.id, flagship.id));

        return { newXp, oldLevel, newLevel, levelUp: newLevel > oldLevel };
      });
    },
```

Verify imports : `sql`, `eq` from `drizzle-orm`, `flagships` from `@exilium/db` are already imported.

- [ ] **Step 2: Write the tests file**

Create `/opt/exilium/apps/api/src/modules/flagship/__tests__/flagship.service.grantXp.test.ts` using the queue-based mock pattern from existing tests :

```ts
import { describe, it, expect, vi } from 'vitest';
import { createFlagshipService } from '../flagship.service.js';

function makeMockGameConfig() {
  return {
    getFullConfig: async () => ({
      universe: {
        flagship_max_level: 60,
      },
      hulls: {},
    }),
  };
}

function makeMockDb(selectResults: unknown[][], onUpdate?: (set: Record<string, unknown>) => void) {
  const queue = [...selectResults];
  const db: any = {
    transaction: async (cb: (tx: any) => Promise<any>) => cb(db),
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockImplementation(() => {
      const chain: any = {};
      const result = queue.shift() ?? [];
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.for = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(result);
      chain.then = (resolve: any) => resolve(result);
      return chain;
    }),
    update: vi.fn().mockImplementation(() => {
      const chain: any = {};
      chain.set = vi.fn().mockImplementation((data: Record<string, unknown>) => {
        if (onUpdate) onUpdate(data);
        return chain;
      });
      chain.where = vi.fn().mockResolvedValue(undefined);
      return chain;
    }),
  };
  return db;
}

function makeService(db: any) {
  return createFlagshipService(
    db,
    {} as any,  // exiliumService
    makeMockGameConfig() as any,
    {} as any,  // talentService (deprecated, optional)
    undefined,  // assetsDir
    {} as any,  // resourceService
    {} as any,  // reportService
  );
}

describe('flagshipService.grantXp', () => {
  it('grants 100 XP and reaches level 2', async () => {
    const flagship = { id: 'f1', xp: 0, level: 1 };
    let updateData: Record<string, unknown> = {};
    const db = makeMockDb([[flagship]], (data) => { updateData = data; });
    const result = await makeService(db).grantXp('user1', 100);
    expect(result.newXp).toBe(100);
    expect(result.newLevel).toBe(2);
    expect(result.oldLevel).toBe(1);
    expect(result.levelUp).toBe(true);
    expect(updateData.xp).toBe(100);
    expect(updateData.level).toBe(2);
  });

  it('returns no-op for amount = 0 (no DB call)', async () => {
    const db = makeMockDb([]);
    const result = await makeService(db).grantXp('user1', 0);
    expect(result.levelUp).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns no-op for negative amount (defensive)', async () => {
    const db = makeMockDb([]);
    const result = await makeService(db).grantXp('user1', -50);
    expect(result.levelUp).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns levelUp=false when amount keeps same level', async () => {
    const flagship = { id: 'f1', xp: 200, level: 2 };  // L2 = 100, L3 = 300
    const db = makeMockDb([[flagship]]);
    const result = await makeService(db).grantXp('user1', 50);  // 250 XP, still L2
    expect(result.newXp).toBe(250);
    expect(result.newLevel).toBe(2);
    expect(result.oldLevel).toBe(2);
    expect(result.levelUp).toBe(false);
  });

  it('caps at maxLevel 60 for huge XP grant', async () => {
    const flagship = { id: 'f1', xp: 0, level: 1 };
    const db = makeMockDb([[flagship]]);
    const result = await makeService(db).grantXp('user1', 9999999);
    expect(result.newLevel).toBe(60);
    expect(result.levelUp).toBe(true);
  });

  it('returns no-op when no flagship exists', async () => {
    const db = makeMockDb([[]]);  // empty result
    const result = await makeService(db).grantXp('user1', 100);
    expect(result.newXp).toBe(0);
    expect(result.levelUp).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/api -- flagship.service.grantXp 2>&1 | tail -10
```

Expected : 6 tests pass.

- [ ] **Step 4: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/api 2>&1 | tail -5
```

Expected : 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/flagship/flagship.service.ts apps/api/src/modules/flagship/__tests__/flagship.service.grantXp.test.ts
git commit -m "feat(flagship): méthode grantXp + 6 tests (V4-XP)"
```

Do NOT push.

---

## Task 4 : Backend `flagshipService.get()` — apply level multiplier

**Files :**
- Modify: `apps/api/src/modules/flagship/flagship.service.ts`

- [ ] **Step 1: Update get() to apply level multiplier**

Find the `effectiveStats` computation in `flagship.service.ts` (around lines 119-148, post-Talents-removal sprint). The current code looks like :

```ts
const config = await gameConfigService.getFullConfig();
const hullConfig = flagship.hullId ? (config.hulls[flagship.hullId] ?? null) : null;

const effectiveStats = {
  weapons: flagship.weapons,
  shield: flagship.shield,
  hull: flagship.hull,
  baseArmor: flagship.baseArmor,
  shotCount: flagship.shotCount,
  cargoCapacity: flagship.cargoCapacity,
  fuelConsumption: flagship.fuelConsumption,
  baseSpeed: flagship.baseSpeed,
  driveType: flagship.driveType,
};

if (hullConfig && flagship.status === 'active') {
  effectiveStats.weapons   += (hullConfig.passiveBonuses.bonus_weapons   ?? 0);
  effectiveStats.baseArmor += (hullConfig.passiveBonuses.bonus_armor     ?? 0);
  effectiveStats.shotCount += (hullConfig.passiveBonuses.bonus_shot_count ?? 0);
}
```

Replace with the level-multiplier-aware version :

```ts
const config = await gameConfigService.getFullConfig();
const hullConfig = flagship.hullId ? (config.hulls[flagship.hullId] ?? null) : null;

// V4-XP : compute level multiplier from config + flagship.level
const levelPct = Number(config.universe.flagship_xp_level_multiplier_pct) || 0.05;
const levelMult = levelMultiplier(flagship.level, levelPct);

const effectiveStats = {
  weapons:         Math.round(flagship.weapons * levelMult),
  shield:          Math.round(flagship.shield * levelMult),
  hull:            Math.round(flagship.hull * levelMult),
  baseArmor:       Math.round(flagship.baseArmor * levelMult),
  shotCount:       flagship.shotCount,        // pas multiplié (count entier)
  cargoCapacity:   flagship.cargoCapacity,    // pas multiplié (stat non-combat)
  fuelConsumption: flagship.fuelConsumption,  // pas multiplié
  baseSpeed:       flagship.baseSpeed,        // pas multiplié
  driveType:       flagship.driveType,
};

// Apply hull combat bonuses (only when stationed) — multiplied too
if (hullConfig && flagship.status === 'active') {
  effectiveStats.weapons   += Math.round((hullConfig.passiveBonuses.bonus_weapons   ?? 0) * levelMult);
  effectiveStats.baseArmor += Math.round((hullConfig.passiveBonuses.bonus_armor     ?? 0) * levelMult);
  effectiveStats.shotCount += (hullConfig.passiveBonuses.bonus_shot_count ?? 0);  // pas multiplié
}
```

Add the import at the top of the file :
```ts
import { xpToLevel, levelMultiplier } from '@exilium/game-engine';
```

(`xpToLevel` was added in Task 3, `levelMultiplier` is new.)

- [ ] **Step 2: Run typecheck**

```bash
cd /opt/exilium && pnpm turbo typecheck --filter=@exilium/api 2>&1 | tail -5
```

Expected : 0 errors.

- [ ] **Step 3: Run all flagship tests to verify nothing broke**

```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/api -- flagship 2>&1 | tail -10
```

Expected : all flagship tests pass (the existing flagship.service.test.ts should still pass — it doesn't assert on effectiveStats values directly, just structure).

If a test fails because it asserts a specific weapons/shield value that's now multiplied by `levelMultiplier(1, 0.05) = 1.05` then rounded :
- Old : weapons = 12
- New : Math.round(12 * 1.05) = 13

Either fix the test (use the new expected values for level=1) or, if the test wasn't designed for level mechanics, mock `flagship.level = 0` to disable the multiplier. Check the failing test and adapt minimally.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/flagship/flagship.service.ts
git commit -m "feat(flagship): apply level multiplier on effectiveStats (V4-XP)"
```

Do NOT push.

---

## Task 5 : Backend `anomalyService` integration

**Files :**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`

- [ ] **Step 1: Add XP imports**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.service.ts`, add at the top :

```ts
import { xpFromCombat, xpFromRunDepth, type XpConfig } from '@exilium/game-engine';
```

- [ ] **Step 2: Add XP grant in survived branch**

Find the `advance` method's `survived` branch (the one that doesn't trigger wipe or runComplete). Identify where the function builds the return object after the standard combat resolution. The location is somewhere around line 500-600 (look for `return { outcome: 'survived' as const, ... }`).

BEFORE the `return` of survived, add :

```ts
        // V4-XP : grant XP per-combat
        const xpConfig: XpConfig = {
          perKillFpFactor: Number(config.universe.flagship_xp_per_kill_fp_factor) || 0.10,
          perDepthBonus: Number(config.universe.flagship_xp_per_depth_bonus) || 100,
          levelMultiplierPct: Number(config.universe.flagship_xp_level_multiplier_pct) || 0.05,
          maxLevel: Number(config.universe.flagship_max_level) || 60,
        };
        const xpGained = xpFromCombat(result.enemyFP, xpConfig);
        const xpResult = await flagshipService.grantXp(userId, xpGained);
```

Then add `xpGained` and `levelUp` to the return :

```ts
        return {
          outcome: 'survived' as const,
          // ... existing fields ...
          xpGained,
          levelUp: xpResult.levelUp ? { newLevel: xpResult.newLevel, oldLevel: xpResult.oldLevel } : null,
        };
```

`config` is already fetched in the method scope, reuse it.

- [ ] **Step 3: Add XP grant in runComplete branch**

Find the `runComplete` branch (also in `advance`, when `newDepth >= ANOMALY_MAX_DEPTH`). It's typically inside the survived path with a `runComplete: true` flag OR a separate branch.

Add before the runComplete return :

```ts
        // V4-XP : grant XP per-combat (final win) + bonus per-run depth
        // (xpConfig already defined above in survived block — reuse if same scope, else redeclare)
        const xpGainedCombatFinal = xpFromCombat(result.enemyFP, xpConfig);
        const xpGainedDepthBonus = xpFromRunDepth(newDepth, xpConfig);
        const xpGainedTotal = xpGainedCombatFinal + xpGainedDepthBonus;
        const xpResult = await flagshipService.grantXp(userId, xpGainedTotal);
```

Add to the return :
```ts
        return {
          outcome: 'survived' as const,
          runComplete: true,
          // ... existing fields ...
          xpGained: xpGainedTotal,
          levelUp: xpResult.levelUp ? { newLevel: xpResult.newLevel, oldLevel: xpResult.oldLevel } : null,
        };
```

If the runComplete branch shares scope with survived, just check `runComplete` and conditionally add `xpFromRunDepth`. The cleanest implementation depends on the exact code layout — read it first.

- [ ] **Step 4: Add XP grant in retreat method**

Find the `retreat` method. Before the `return { ok: true }` (end of method), add :

```ts
        // V4-XP : grant XP bonus per-run (depth atteinte au moment du retreat)
        const xpConfig: XpConfig = {
          perKillFpFactor: Number(config.universe.flagship_xp_per_kill_fp_factor) || 0.10,
          perDepthBonus: Number(config.universe.flagship_xp_per_depth_bonus) || 100,
          levelMultiplierPct: Number(config.universe.flagship_xp_level_multiplier_pct) || 0.05,
          maxLevel: Number(config.universe.flagship_max_level) || 60,
        };
        const xpGainedDepth = xpFromRunDepth(row.currentDepth, xpConfig);
        const xpResult = await flagshipService.grantXp(userId, xpGainedDepth);
        
        return {
          ok: true,
          xpGained: xpGainedDepth,
          levelUp: xpResult.levelUp ? { newLevel: xpResult.newLevel, oldLevel: xpResult.oldLevel } : null,
        };
```

Note : the retreat method may already fetch `config` — reuse if so. If not, you'll need to add `const config = await gameConfigService.getFullConfig();` near the top of the method.

`row` here refers to the active anomaly row already loaded in the method scope.

- [ ] **Step 5: Add XP fields to wipe branch return (consistency)**

Find the wipe branch in `advance`. The wipe branch should NOT grant XP (no per-run bonus on wipe per spec) but the return shape needs `xpGained` and `levelUp` for front-end consistency :

```ts
        return {
          outcome: 'wiped' as const,
          // ... existing fields ...
          xpGained: 0,
          levelUp: null,
        };
```

- [ ] **Step 6: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/api 2>&1 | tail -10
```

Expected : 0 errors.

- [ ] **Step 7: Run tests**

```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/api 2>&1 | tail -10
```

Expected : all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/anomaly/anomaly.service.ts
git commit -m "feat(anomaly): grant XP per-combat + bonus per-run depth (V4-XP)"
```

Do NOT push.

---

## Task 6 : Frontend `FlagshipIdentityCard` — badge level + XP bar

**Files :**
- Modify: `apps/web/src/components/flagship/FlagshipIdentityCard.tsx`

- [ ] **Step 1: Read the current FlagshipIdentityCard structure**

```bash
cat /opt/exilium/apps/web/src/components/flagship/FlagshipIdentityCard.tsx
```

Identify where to insert the level badge + XP bar (probably near the bottom, after the existing stats display).

- [ ] **Step 2: Add level + XP display**

Add the imports at the top of the file :
```tsx
import { Star } from 'lucide-react';
import { xpRequiredForLevel } from '@exilium/game-engine';
```

Inside the component body (before the JSX return), add :
```tsx
const maxLevel = 60;  // hardcoded matches universe_config flagship_max_level default
const flagshipLevel = (flagship as { level?: number }).level ?? 1;
const flagshipXp = (flagship as { xp?: number }).xp ?? 0;
const currentLevelXp = xpRequiredForLevel(flagshipLevel);
const nextLevelXp = flagshipLevel >= maxLevel ? flagshipXp : xpRequiredForLevel(flagshipLevel + 1);
const xpProgress = flagshipLevel >= maxLevel
  ? 1
  : (flagshipXp - currentLevelXp) / (nextLevelXp - currentLevelXp);
```

Then in the JSX, find a good location (near other stat displays in the card) and add the level block. Look for an existing block with a top border separator pattern. Add after it :

```tsx
<div className="flex items-center gap-3 text-sm border-t border-panel-border pt-3 mt-3">
  <div className="flex items-center gap-1.5">
    <Star className="h-4 w-4 text-yellow-400" />
    <span className="font-bold">Niveau {flagshipLevel}</span>
    <span className="text-gray-500">/ {maxLevel}</span>
  </div>
  <div className="flex-1">
    <div className="h-1.5 bg-panel-light/50 rounded-full overflow-hidden">
      <div
        className="h-full bg-yellow-400/80 transition-all"
        style={{ width: `${Math.round(xpProgress * 100)}%` }}
      />
    </div>
    <div className="text-xs text-gray-500 mt-0.5">
      {flagshipLevel >= maxLevel
        ? `${flagshipXp.toLocaleString()} XP (max)`
        : `${flagshipXp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP`
      }
    </div>
  </div>
</div>
```

The `as { level?: number }` cast is a defensive workaround if the tRPC inferred type doesn't yet expose `level` (Drizzle should infer it from the new schema columns, but sometimes the TS server cache lags). After Vite restart it should be cleaner.

- [ ] **Step 3: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/web 2>&1 | tail -10
```

Expected : 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/flagship/FlagshipIdentityCard.tsx
git commit -m "feat(web): badge level + XP bar dans FlagshipIdentityCard (V4-XP)"
```

Do NOT push.

---

## Task 7 : Frontend `Anomaly.tsx` toasts + `AnomalyEngageModal` level

**Files :**
- Modify: `apps/web/src/pages/Anomaly.tsx`
- Modify: `apps/web/src/components/anomaly/AnomalyEngageModal.tsx`

- [ ] **Step 1: Add XP toasts in Anomaly.tsx**

Read `/opt/exilium/apps/web/src/pages/Anomaly.tsx` around the `advanceMutation.onSuccess` handler.

In the `onSuccess` handler, AFTER existing toast logic (combat result, drops, etc.), add :

```tsx
      if (data.xpGained && data.xpGained > 0) {
        addToast(`✨ +${data.xpGained} XP`, 'success');
      }
      if (data.levelUp) {
        addToast(`🌟 NIVEAU ${data.levelUp.newLevel} atteint !`, 'success');
      }
```

Same pattern in `retreatMutation.onSuccess` (after the existing retreat toast) :
```tsx
      if (data.xpGained && data.xpGained > 0) {
        addToast(`✨ +${data.xpGained} XP`, 'success');
      }
      if (data.levelUp) {
        addToast(`🌟 NIVEAU ${data.levelUp.newLevel} atteint !`, 'success');
      }
```

If TS complains that `data.xpGained` doesn't exist on the inferred type, the tRPC types should auto-update from Task 5's service changes. If still failing after typecheck, use a defensive cast :
```tsx
const xpGained = (data as { xpGained?: number }).xpGained;
const levelUp = (data as { levelUp?: { newLevel: number } }).levelUp;
```

- [ ] **Step 2: Add level display in AnomalyEngageModal**

Read `/opt/exilium/apps/web/src/components/anomaly/AnomalyEngageModal.tsx` (was rewritten in V4 sprint Task 7).

Find the stats preview block (around the middle of the modal). It currently has lines for Hull, Bouclier, Armes, Charges réparation. Add a new line for Niveau pilote :

```tsx
<div className="flex justify-between">
  <span className="text-gray-500 flex items-center gap-1.5">
    <Star className="h-3 w-3" /> Niveau pilote
  </span>
  <span>
    {(flagship as { level?: number }).level ?? 1}
    {' '}
    (×{(1 + ((flagship as { level?: number }).level ?? 1) * 0.05).toFixed(2)} stats)
  </span>
</div>
```

Add `Star` to the lucide-react imports if not already present :
```tsx
import { Zap, Sparkles, Wrench, X, Star } from 'lucide-react';
```

- [ ] **Step 3: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/web 2>&1 | tail -10
```

Expected : 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Anomaly.tsx apps/web/src/components/anomaly/AnomalyEngageModal.tsx
git commit -m "feat(web): toasts XP + niveau pilote dans EngageModal (V4-XP)"
```

Do NOT push.

---

## Task 8 : Final lint + tests + push + deploy + smoke + annonce

**Files :** all touched files this sprint.

- [ ] **Step 1: Full lint + typecheck across all packages**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/api --filter=@exilium/admin --filter=@exilium/web --filter=@exilium/game-engine --filter=@exilium/db --filter=@exilium/shared 2>&1 | tail -10
```

Expected : 0 errors. Pre-existing warnings (any-types) OK.

- [ ] **Step 2: Full test suite**

```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/api --filter=@exilium/game-engine 2>&1 | tail -10
```

Expected : all existing tests pass + 22 new engine tests + 6 new grantXp tests.

- [ ] **Step 3: Audit all consumers receive proper types**

```bash
grep -rn "xpGained\|levelUp\|grantXp\|flagship\.xp\|flagship\.level" /opt/exilium/apps/{api,web}/src --include="*.ts" --include="*.tsx" | head -20
```

Expected : refs in :
- `flagshipService.grantXp` (Task 3 service)
- `flagshipService.get` reading `flagship.level` (Task 4)
- `anomalyService.advance/retreat` returning xpGained/levelUp (Task 5)
- `Anomaly.tsx` consuming xpGained/levelUp toasts (Task 7)
- `FlagshipIdentityCard.tsx` rendering level/xp (Task 6)
- `AnomalyEngageModal.tsx` rendering level (Task 7)

If unexpected references appear, investigate.

- [ ] **Step 4: Push and deploy**

```bash
cd /opt/exilium && git push origin main
/opt/exilium/scripts/deploy.sh
```

Expected : Migration 0071 applied, PM2 reload OK, Caddy reload OK. Verify in deploy.sh output that `0071_flagship_xp.sql` is listed as applied.

If migration fails (cast errors, missing columns, etc.), debug and re-apply. The migration is idempotent via `IF NOT EXISTS` + marker.

- [ ] **Step 5: Smoke test in browser**

- Open https://exilium-game.com/flagship
  - Verify : "Niveau 1 / 60" badge + XP bar at 0 / 100 XP
  - Verify : effectiveStats values shown are matching `baseline × 1.05` (level 1 multiplier) — for combat hull : weapons (12 × 1.05) + (8 × 1.05) = 13 + 8 = 21 (or close)
- Open https://exilium-game.com/anomaly
  - Verify : engage modal shows "Niveau pilote 1 (×1.05 stats)"
  - Engage an anomaly
  - After first combat win : verify toast "✨ +X XP" appears (X based on enemy FP × 0.10)
  - Continue : after several wins, verify "🌟 NIVEAU 2 atteint !" toast when crossing 100 XP
  - Verify the FlagshipIdentityCard updates with new level + bar progress
- Try a retreat : verify "✨ +X XP" toast (depth bonus applied)

- [ ] **Step 6: Verify enemy scaling (parallel tune)**

Engage an anomaly with a fresh-ish flagship and verify the first node enemy FP feels ~50% of player FP (vs 70% before the tune). It should be much more manageable.

- [ ] **Step 7: Publish announcement**

Insert via `/admin/announcements` page. Suggested text (max 280 chars) :

> Système de progression flagship ! Votre vaisseau gagne de l'XP à chaque combat anomaly et peut atteindre le niveau 60 (×4 stats baseline). L'anomaly early-game est aussi adoucie pour vous laisser monter en puissance. Bon farming !

Set `variant: 'info'` and `active: true`.

- [ ] **Step 8: Monitor logs**

```bash
pm2 logs exilium-api --lines 100
```

Look for any errors related to `grantXp`, `flagship.level`, `xp`, `levelMultiplier`. Should be clean for at least 5 minutes after deploy.

If errors :
- "column xp does not exist" → migration didn't apply, re-run `deploy.sh`
- "grantXp is not a function" → service not deployed, restart PM2
- "Cannot read property 'level' of undefined" → flagship row doesn't have new columns yet (defensive `?? 1` should prevent this)

---

## Notes — décisions implémentation

1. **Tests intégration `anomaly.advance` / `retreat`** : pas couverts par les tests V4 existants (8 todo markers). Le pattern queue-based mock est bien rodé pour `grantXp` (6 nouveaux tests). Les paths combat-side resteront couverts par smoke prod.

2. **Type inference defensive casts** : si Vite/TS server cache lag empêche l'inférence des nouveaux champs `xp`/`level` sur `flagship.get` response, j'utilise `as { level?: number }` defensively. Restart Vite dev server résout généralement.

3. **Hardcoded `maxLevel = 60` dans le front** (FlagshipIdentityCard, AnomalyEngageModal) : si on tune le cap via universe_config un jour, le front continuera d'afficher 60 jusqu'au prochain deploy. Acceptable pour V1 — futur cleanup : exposer via `gameConfig.universe.flagship_max_level` si nécessaire.

4. **PvP balance** : cap level 60 = ×4 stats. Combiné modules max-équipés ~×5-6 vs L1 nu. À surveiller post-deploy. Si déséquilibrant, baisser `flagship_max_level` à 40-50 sans redeploy.
