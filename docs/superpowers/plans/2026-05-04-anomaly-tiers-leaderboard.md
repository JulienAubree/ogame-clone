# Anomaly Tiers + Leaderboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Ajouter un système de paliers à l'anomaly mode V4 — chaque palier = depth 1-20 avec difficulté ×N. Compléter depth 20 d'un palier débloque le suivant. Loot ×N capped à palier 10. Nouveau leaderboard PvE basé sur le palier max complété.

**Architecture :** Extension simple par-dessus V4 — 1 column `tier` sur `anomalies`, 2 columns `max_tier_unlocked` / `max_tier_completed` sur `flagships`. Engine ajoute `tierMultiplier` à `anomalyEnemyFP`. `engage` prend `tier` param et le valide. `advance` applique le multiplier au scaling enemy + loot. `runComplete` unlock le tier suivant. Nouveau endpoint `anomaly.leaderboard` + nouvelle page `/anomalies/leaderboard`.

**Tech Stack :** Drizzle/Postgres, tRPC 11, React 19, vitest, pnpm turbo.

**Spec source :** `docs/superpowers/specs/2026-05-04-anomaly-tiers-leaderboard-design.md`

---

## File Structure

### Files to CREATE

| Path | Responsabilité |
|---|---|
| `packages/db/drizzle/0072_anomaly_tiers.sql` | +1 col anomalies + 2 cols flagships + 3 universe_config + marker |
| `apps/web/src/pages/AnomalyLeaderboard.tsx` | Page leaderboard top 50 |
| `apps/web/src/components/common/RankMedalIcon.tsx` | SVG médailles top 3 (or, argent, bronze) — pattern ExiliumIcon |

### Files to MODIFY

| Path | Changement |
|---|---|
| `packages/db/src/schema/anomalies.ts` | +tier (smallint default 1) |
| `packages/db/src/schema/flagships.ts` | +maxTierUnlocked, +maxTierCompleted |
| `packages/game-engine/src/formulas/anomaly.ts` | +tierMultiplier param dans AnomalyDifficulty + helper tierMultiplier() |
| `packages/game-engine/src/formulas/anomaly.test.ts` | +tests pour tierMultiplier |
| `apps/api/src/modules/anomaly/anomaly.router.ts` | engage prend tier + nouveau endpoint leaderboard |
| `apps/api/src/modules/anomaly/anomaly.service.ts` | engage cost+tier validation, advance scaling, runComplete unlock, getLeaderboard |
| `apps/api/src/modules/anomaly/anomaly.combat.ts` | generateAnomalyEnemy + runAnomalyNode passent tier au scaling |
| `apps/web/src/components/anomaly/AnomalyEngageModal.tsx` | Sélecteur palier + cost scaled + difficulty/loot preview |
| `apps/web/src/pages/Anomaly.tsx` | Hero indicator "Palier N", toast unlock, lien leaderboard |
| `apps/web/src/router.tsx` | +route `/anomalies/leaderboard` |

---

## Task 1 : Migration DB + Drizzle schemas

**Files :**
- Create: `packages/db/drizzle/0072_anomaly_tiers.sql`
- Modify: `packages/db/src/schema/anomalies.ts`
- Modify: `packages/db/src/schema/flagships.ts`

- [ ] **Step 1: Write the SQL migration**

Create `/opt/exilium/packages/db/drizzle/0072_anomaly_tiers.sql` with this EXACT content :

```sql
-- Anomaly tiers system (2026-05-04)

-- Tier sur l'anomaly row (default 1 pour back-compat des anomalies actives)
ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS tier SMALLINT NOT NULL DEFAULT 1;

-- Tier progression sur le flagship
ALTER TABLE flagships
  ADD COLUMN IF NOT EXISTS max_tier_unlocked  SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_tier_completed SMALLINT NOT NULL DEFAULT 0;

-- Universe config tunables (jsonb cast obligatoire)
INSERT INTO universe_config (key, value) VALUES
  ('anomaly_tier_multiplier_factor',  '1.0'::jsonb),
  ('anomaly_loot_tier_cap',           '10'::jsonb),
  ('anomaly_tier_engage_cost_factor', '1.0'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('anomaly_tiers_init', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
```

- [ ] **Step 2: Update Drizzle schema — anomalies**

Read `/opt/exilium/packages/db/src/schema/anomalies.ts` first. Add after the existing column block (probably after `pendingEpicEffect` from V4 sprint, before `createdAt`) :

```ts
  /** Anomaly tiers (2026-05-04) : palier sélectionné à l'engage. */
  tier: smallint('tier').notNull().default(1),
```

Verify `smallint` is already imported (it should be — used by other columns).

- [ ] **Step 3: Update Drizzle schema — flagships**

Read `/opt/exilium/packages/db/src/schema/flagships.ts`. Add after `level` (from XP sprint), before `createdAt` :

```ts
  /** Anomaly tiers (2026-05-04) : palier max débloqué (peut engager 1..maxTierUnlocked). */
  maxTierUnlocked:  smallint('max_tier_unlocked').notNull().default(1),
  /** Anomaly tiers : palier max complété (depth 20 atteint). Utilisé par leaderboard. */
  maxTierCompleted: smallint('max_tier_completed').notNull().default(0),
```

- [ ] **Step 4: Verify lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/db --filter=@exilium/api 2>&1 | tail -10
```

Expected : 0 errors. (Errors related to `flagship.maxTierUnlocked` or `anomalies.tier` not yet used in service code might surface later — fixed in subsequent tasks.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/0072_anomaly_tiers.sql packages/db/src/schema/anomalies.ts packages/db/src/schema/flagships.ts
git commit -m "feat(db): anomaly tiers — colonnes tier/max_tier_* + universe_config"
```

Do NOT push. Bundled with subsequent tasks.

---

## Task 2 : Engine `tierMultiplier` + extension formulas

**Files :**
- Modify: `packages/game-engine/src/formulas/anomaly.ts`
- Modify: `packages/game-engine/src/formulas/anomaly.test.ts`

- [ ] **Step 1: Update AnomalyDifficulty interface**

Read `/opt/exilium/packages/game-engine/src/formulas/anomaly.ts`. Find the `AnomalyDifficulty` interface (around line 12). Modify to add `tierMultiplier` :

```ts
export interface AnomalyDifficulty {
  /** Base ratio at depth 1 (default 0.5). */
  baseRatio: number;
  /** Geometric growth applied each depth (default 1.15). */
  growth: number;
  /** Cap on the intra-tier ratio (default 1.3). */
  maxRatio: number;
  /** V5-Tiers (2026-05-04) : multiplier appliqué APRÈS le cap intra-palier (default 1.0 = palier 1). */
  tierMultiplier?: number;
}

export const DEFAULT_DIFFICULTY: AnomalyDifficulty = {
  baseRatio: 0.5,
  growth: 1.15,
  maxRatio: 1.3,
  tierMultiplier: 1.0,
};
```

- [ ] **Step 2: Update `anomalyEnemyFP` to apply tierMultiplier**

Find the `anomalyEnemyFP` function (around line 37). Modify :

```ts
export function anomalyEnemyFP(
  playerFP: number,
  depth: number,
  difficulty: Partial<AnomalyDifficulty> = {},
): number {
  const baseRatio = difficulty.baseRatio ?? DEFAULT_DIFFICULTY.baseRatio;
  const growth = difficulty.growth ?? DEFAULT_DIFFICULTY.growth;
  const maxRatio = difficulty.maxRatio ?? DEFAULT_DIFFICULTY.maxRatio;
  const tierMult = difficulty.tierMultiplier ?? DEFAULT_DIFFICULTY.tierMultiplier!;
  const rawRatio = baseRatio * Math.pow(growth, depth - 1);
  const ratio = Math.min(maxRatio, rawRatio);
  // V5-Tiers : tierMultiplier appliqué post-cap pour différencier les paliers
  return playerFP * ratio * tierMult;
}
```

- [ ] **Step 3: Add `tierMultiplier` helper**

Add right after `anomalyEnemyFP` :

```ts
/**
 * V5-Tiers (2026-05-04) : compute the difficulty multiplier for a given tier.
 * Linear by default (factor=1.0) : tier N → multiplier = N.
 * For exponential progression, increase factor : tier N → 1 + (N-1) × factor.
 */
export function tierMultiplier(tier: number, factor: number = 1.0): number {
  return 1 + (tier - 1) * factor;
}
```

- [ ] **Step 4: Add tests for tierMultiplier**

Read `/opt/exilium/packages/game-engine/src/formulas/anomaly.test.ts`. Add new `describe` block at the end :

```ts
describe('tierMultiplier (V5-Tiers)', () => {
  it('returns 1.0 at tier 1 (default factor)', () => {
    expect(tierMultiplier(1)).toBe(1.0);
    expect(tierMultiplier(1, 1.0)).toBe(1.0);
    expect(tierMultiplier(1, 2.5)).toBe(1.0);
  });
  it('returns N at tier N with factor 1.0 (linear)', () => {
    expect(tierMultiplier(5, 1.0)).toBe(5.0);
    expect(tierMultiplier(10, 1.0)).toBe(10.0);
    expect(tierMultiplier(50, 1.0)).toBe(50.0);
  });
  it('respects custom factor', () => {
    // tier 5, factor 2.0 → 1 + 4×2 = 9
    expect(tierMultiplier(5, 2.0)).toBe(9.0);
    // tier 10, factor 0.5 → 1 + 9×0.5 = 5.5
    expect(tierMultiplier(10, 0.5)).toBe(5.5);
  });
});

describe('anomalyEnemyFP with tierMultiplier (V5-Tiers)', () => {
  it('returns same as V4 baseline when tierMultiplier=1.0', () => {
    const v4 = anomalyEnemyFP(1000, 5);  // default tierMultiplier 1.0
    const v5 = anomalyEnemyFP(1000, 5, { tierMultiplier: 1.0 });
    expect(v5).toBe(v4);
  });
  it('multiplies enemy FP by tierMultiplier post-cap', () => {
    // depth 5 : ratio = min(1.3, 0.5 × 1.15^4) = min(1.3, 0.874) = 0.874
    // playerFP 1000 × 0.874 × 3 (tier 3) = 2624
    const result = anomalyEnemyFP(1000, 5, { tierMultiplier: 3.0 });
    expect(result).toBeCloseTo(2624, 0);
  });
  it('high tier breaks past the maxRatio cap', () => {
    // depth 20 : ratio capped to 1.3, but tierMult 10 → final ratio 13
    const result = anomalyEnemyFP(1000, 20, { tierMultiplier: 10.0 });
    expect(result).toBeCloseTo(13000, 0);
  });
});
```

Verify imports at top of test file include `tierMultiplier` :
```ts
import { anomalyEnemyFP, anomalyLoot, anomalyEnemyRecoveryCount, tierMultiplier } from './anomaly.js';
```

- [ ] **Step 5: Run the tests**

```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/game-engine 2>&1 | tail -10
```

Expected : all existing tests pass + 7 new tests for tierMultiplier (3 in tierMultiplier describe + 3 in anomalyEnemyFP V5 describe + the wrapper). Adjust count based on actual.

- [ ] **Step 6: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/game-engine 2>&1 | tail -5
```

Expected : 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/game-engine/src/formulas/anomaly.ts packages/game-engine/src/formulas/anomaly.test.ts
git commit -m "feat(engine): tierMultiplier + anomalyEnemyFP V5-Tiers (paliers)"
```

Do NOT push.

---

## Task 3 : Backend `engage` — tier validation + cost scaling

**Files :**
- Modify: `apps/api/src/modules/anomaly/anomaly.router.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`

- [ ] **Step 1: Update engage router input**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.router.ts`, find the `engage` mutation. Update the input schema :

```ts
engage: protectedProcedure
  .input(z.object({
    ships: z.record(z.string(), z.number().int().min(0)).optional().default({}),
    tier: z.number().int().min(1).max(1000).default(1),  // V5-Tiers
  }))
  .mutation(async ({ ctx, input }) => {
    return anomalyService.engage(ctx.userId!, { ships: input.ships ?? {}, tier: input.tier });
  }),
```

- [ ] **Step 2: Update engage service signature + tier validation + cost scaling**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.service.ts`, find the `engage` method. Modify :

```ts
async engage(userId: string, input: { ships: Record<string, number>; tier: number }) {
  const config = await gameConfigService.getFullConfig();
  const baseCost = Number(config.universe.anomaly_entry_cost_exilium) || 5;
  // V5-Tiers : cost scales with tier
  const costFactor = parseConfigNumber(config.universe.anomaly_tier_engage_cost_factor, 1.0);
  const cost = Math.round(baseCost * (1 + (input.tier - 1) * costFactor));
  const repairChargesMax = Number(config.universe.anomaly_repair_charges_per_run) || 3;
```

Then INSIDE the existing transaction, AFTER the flagship validation (status 'active' check), BEFORE the planet ownership check, add tier validation :

```ts
        // V5-Tiers : validate tier ≤ max_tier_unlocked
        const maxTierUnlocked = (flagship as { maxTierUnlocked?: number }).maxTierUnlocked ?? 1;
        if (input.tier > maxTierUnlocked) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Palier ${input.tier} non débloqué (max disponible : ${maxTierUnlocked})`,
          });
        }
```

Finally, in the `tx.insert(anomalies).values({...})` call (the run insert at the end of the engage transaction), add `tier: input.tier` :

```ts
        const [created] = await tx.insert(anomalies).values({
          userId,
          originPlanetId,
          status: 'active',
          currentDepth: 0,
          fleet,
          exiliumPaid: cost,
          // ... existing fields ...
          repairChargesCurrent: repairChargesMax,
          repairChargesMax,
          tier: input.tier,  // V5-Tiers
        }).returning();
```

- [ ] **Step 3: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/api 2>&1 | tail -10
```

Expected : 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/anomaly/anomaly.router.ts apps/api/src/modules/anomaly/anomaly.service.ts
git commit -m "feat(anomaly): engage prend tier + cost scaling (V5-Tiers)"
```

Do NOT push.

---

## Task 4 : Backend `advance` — enemy FP scaling + loot scaling + runComplete unlock

**Files :**
- Modify: `apps/api/src/modules/anomaly/anomaly.combat.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`

- [ ] **Step 1: Update generateAnomalyEnemy to accept and use tier**

Read `/opt/exilium/apps/api/src/modules/anomaly/anomaly.combat.ts`. Find `generateAnomalyEnemy` function. Add `tier` to its args :

```ts
export async function generateAnomalyEnemy(
  db: Database,
  gameConfigService: GameConfigService,
  modulesService: ReturnType<typeof createModulesService>,
  args: {
    userId: string;
    fleet: Record<string, FleetEntry>;
    depth: number;
    tier: number;  // V5-Tiers
    equippedModules?: unknown;
    pendingEpicEffect?: { ability: string; magnitude: number } | null;
  },
)
```

Inside the function, after fetching `config`, compute the tier multiplier :

```ts
import { tierMultiplier } from '@exilium/game-engine';
// ... in the function body ...
const tierFactor = parseConfigNumber(config.universe.anomaly_tier_multiplier_factor, 1.0);
const tierMult = tierMultiplier(args.tier, tierFactor);
```

Add `parseConfigNumber` helper at the top of the file (or import from a shared util — same pattern as `anomaly.service.ts` uses) :

```ts
function parseConfigNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}
```

Then update the call to `anomalyEnemyFP` (probably around line 280-290) to pass `tierMultiplier` :

```ts
const enemyFP = anomalyEnemyFP(playerFP, args.depth, {
  baseRatio: parseConfigNumber(config.universe.anomaly_enemy_base_ratio, 0.5),
  growth: parseConfigNumber(config.universe.anomaly_difficulty_growth, 1.15),
  maxRatio: parseConfigNumber(config.universe.anomaly_enemy_max_ratio, 1.3),
  tierMultiplier: tierMult,  // V5-Tiers
});
```

(If the existing call uses `Number(...) || default` pattern, replace with `parseConfigNumber` for consistency with the kill-switch fix.)

- [ ] **Step 2: Update runAnomalyNode to pass tier**

Find `runAnomalyNode` in same file. Add `tier` to its args + pass it to `generateAnomalyEnemy` if called internally + use it in the FP calc :

```ts
export async function runAnomalyNode(
  db: Database,
  gameConfigService: GameConfigService,
  modulesService: ReturnType<typeof createModulesService>,
  args: {
    userId: string;
    fleet: Record<string, FleetEntry>;
    depth: number;
    predefinedEnemy: { fleet: Record<string, number>; fp: number };
    tier: number;  // V5-Tiers
    equippedModules?: unknown;
    pendingEpicEffect?: { ability: string; magnitude: number } | null;
  },
): Promise<AnomalyCombatResult>
```

Inside the function, the enemy FP is already pre-computed (`predefinedEnemy.fp`), so the tier multiplier was applied at the previous node's `generateAnomalyEnemy` call. No additional scaling needed here.

- [ ] **Step 3: Update advance() to pass tier**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.service.ts`, find the `advance` method. Find the calls to `generateAnomalyEnemy` and `runAnomalyNode` (multiple call sites in the file). Each call needs `tier: row.tier ?? 1` added to the args :

For example :
```ts
// AVANT
const enemyData = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
  userId,
  fleet,
  depth: nextDepth,
  equippedModules: row.equippedModules,
  pendingEpicEffect: row.pendingEpicEffect as { ability: string; magnitude: number } | null,
});

// APRÈS
const enemyData = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
  userId,
  fleet,
  depth: nextDepth,
  tier: row.tier ?? 1,  // V5-Tiers
  equippedModules: row.equippedModules,
  pendingEpicEffect: row.pendingEpicEffect as { ability: string; magnitude: number } | null,
});
```

Same for `runAnomalyNode` calls. Search via :
```bash
grep -n "generateAnomalyEnemy\|runAnomalyNode" /opt/exilium/apps/api/src/modules/anomaly/anomaly.service.ts
```

Expected : 4-6 call sites (engage, advance, resolveEvent maybe). Add `tier: row.tier ?? 1` (or `tier: 1` for the engage where the row doesn't exist yet — actually engage already passes input.tier, so use that).

For `engage` specifically, the call is :
```ts
const firstEnemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
  userId,
  fleet,
  depth: 1,
  tier: input.tier,  // V5-Tiers : use the chosen tier
  equippedModules: equippedSnapshot,
});
```

- [ ] **Step 4: Update advance() loot scaling (survived branch)**

Still in `anomaly.service.ts`, find the `survived` branch of `advance`. Locate where `anomalyLoot` is called. Add tier-based loot multiplier :

```ts
// V5-Tiers : loot scales with tier, capped to anomaly_loot_tier_cap
const lootBase = Number(config.universe.anomaly_loot_base) || 5000;
const lootGrowth = Number(config.universe.anomaly_loot_growth) || 1.4;
const lootTierCap = Number(config.universe.anomaly_loot_tier_cap) || 10;
const effectiveTierForLoot = Math.min(row.tier ?? 1, lootTierCap);
const scaledLootBase = lootBase * effectiveTierForLoot;

const loot = anomalyLoot(newDepth, scaledLootBase, lootGrowth);
```

(If `anomalyLoot` is currently called with just `lootBase`, replace with `scaledLootBase`.)

- [ ] **Step 5: Update advance() runComplete branch — unlock next tier**

In the runComplete branch (when `newDepth >= ANOMALY_MAX_DEPTH` with flagship survived), AFTER the existing logic (XP grant, final drops, status update), BEFORE the return, add :

```ts
// V5-Tiers : unlock next tier if this was the highest tier ever completed
const oldMaxUnlocked = (flagship as { maxTierUnlocked?: number }).maxTierUnlocked ?? 1;
const oldMaxCompleted = (flagship as { maxTierCompleted?: number }).maxTierCompleted ?? 0;
const newMaxCompleted = Math.max(oldMaxCompleted, row.tier ?? 1);
const newMaxUnlocked = Math.max(oldMaxUnlocked, (row.tier ?? 1) + 1);

if (newMaxCompleted > oldMaxCompleted || newMaxUnlocked > oldMaxUnlocked) {
  await tx.update(flagships).set({
    maxTierCompleted: newMaxCompleted,
    maxTierUnlocked: newMaxUnlocked,
    updatedAt: new Date(),
  }).where(eq(flagships.userId, userId));
}

const newTierUnlocked = newMaxUnlocked > oldMaxUnlocked ? newMaxUnlocked : null;
```

Update the runComplete return shape to include `tierCompleted` and `newTierUnlocked` :

```ts
return {
  outcome: 'survived' as const,
  runComplete: true,
  // ... existing fields (xpGained, finalDrops, etc.) ...
  tierCompleted: row.tier ?? 1,
  newTierUnlocked,  // null if no new unlock (re-run lower tier)
};
```

Other branches (wipe, regular survived, retreat) should also include the fields for return shape consistency :

For wipe/regular survived/retreat returns :
```ts
tierCompleted: null,
newTierUnlocked: null,
```

- [ ] **Step 6: Lint + typecheck + tests**

```bash
cd /opt/exilium && pnpm turbo lint typecheck test --filter=@exilium/api 2>&1 | tail -10
```

Expected : 0 errors. All existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/anomaly/anomaly.combat.ts apps/api/src/modules/anomaly/anomaly.service.ts
git commit -m "feat(anomaly): advance scaling + loot scaling + runComplete unlock (V5-Tiers)"
```

Do NOT push.

---

## Task 5 : Backend `getLeaderboard` endpoint

**Files :**
- Modify: `apps/api/src/modules/anomaly/anomaly.router.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`

- [ ] **Step 1: Add leaderboard route**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.router.ts`, add a new route (right before `history` to keep alphabetical-ish ordering, or at the end — wherever readable) :

```ts
leaderboard: protectedProcedure
  .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
  .query(async ({ input }) => {
    return anomalyService.getLeaderboard(input?.limit ?? 50);
  }),
```

- [ ] **Step 2: Add getLeaderboard to service**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.service.ts`, add this new method to the returned object :

```ts
    /**
     * V5-Tiers (2026-05-04) : leaderboard PvE basé sur le palier max complété.
     * Tiebreakers : level pilote DESC, puis xp DESC.
     */
    async getLeaderboard(limit: number) {
      const rows = await db.select({
        username: users.username,
        maxTierCompleted: flagships.maxTierCompleted,
        maxTierUnlocked: flagships.maxTierUnlocked,
        level: flagships.level,
        xp: flagships.xp,
        hullId: flagships.hullId,
      })
        .from(flagships)
        .innerJoin(users, eq(users.id, flagships.userId))
        .where(gt(flagships.maxTierCompleted, 0))
        .orderBy(
          desc(flagships.maxTierCompleted),
          desc(flagships.level),
          desc(flagships.xp),
        )
        .limit(limit);
      return { entries: rows };
    },
```

Verify imports : `users`, `flagships` from `@exilium/db` ; `eq`, `desc`, `gt` from `drizzle-orm` (gt may need to be added).

- [ ] **Step 3: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/api 2>&1 | tail -5
```

Expected : 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/anomaly/anomaly.router.ts apps/api/src/modules/anomaly/anomaly.service.ts
git commit -m "feat(anomaly): nouveau endpoint anomaly.leaderboard (V5-Tiers)"
```

Do NOT push.

---

## Task 6 : Frontend AnomalyEngageModal — sélecteur palier

**Files :**
- Modify: `apps/web/src/components/anomaly/AnomalyEngageModal.tsx`

- [ ] **Step 1: Add tier selector state + computed values**

Read the current `AnomalyEngageModal.tsx` (V4 + research multipliers fix). Add `useState` import + `Trophy` icon :

```tsx
import { useState } from 'react';
// ... existing imports ...
import { Zap, Sparkles, Wrench, X, Star, Trophy } from 'lucide-react';
```

Inside the component body, add state + derived values (after the existing `const cost = ...` and similar) :

```tsx
const maxUnlocked = (flagship as { maxTierUnlocked?: number }).maxTierUnlocked ?? 1;
const [selectedTier, setSelectedTier] = useState(maxUnlocked);

// V5-Tiers : difficulty + loot + cost scaled by tier
const tierFactor = Number(gameConfig?.universe?.anomaly_tier_multiplier_factor) || 1.0;
const tierMult = 1 + (selectedTier - 1) * tierFactor;
const lootTierCap = Number(gameConfig?.universe?.anomaly_loot_tier_cap) || 10;
const lootMult = Math.min(selectedTier, lootTierCap);
const costFactor = Number(gameConfig?.universe?.anomaly_tier_engage_cost_factor) || 1.0;
const scaledCost = Math.round(cost * (1 + (selectedTier - 1) * costFactor));
const insufficientFundsScaled = balance < scaledCost;
```

- [ ] **Step 2: Add tier selector UI**

Find the stats card block (the `<div className="rounded-md bg-panel-light/50 ...">`). AFTER this block, BEFORE the cost display block, insert the tier selector. **Toujours visible** (même à maxUnlocked=1) pour que les nouveaux joueurs voient l'existence du système :

```tsx
<div className="border-t border-panel-border pt-3 space-y-2">
  <div className="flex items-center gap-3">
    <span className="text-gray-500 text-sm flex items-center gap-1.5">
      <Trophy className="h-4 w-4 text-yellow-400" /> Palier
    </span>
    <button
      onClick={() => setSelectedTier(Math.max(1, selectedTier - 1))}
      disabled={selectedTier <= 1}
      className="px-2 py-1 rounded hover:bg-panel-hover disabled:opacity-30 text-sm"
    >◀</button>
    <span className="font-bold text-lg w-8 text-center">{selectedTier}</span>
    <button
      onClick={() => setSelectedTier(Math.min(maxUnlocked, selectedTier + 1))}
      disabled={selectedTier >= maxUnlocked}
      className="px-2 py-1 rounded hover:bg-panel-hover disabled:opacity-30 text-sm"
    >▶</button>
    <span className="text-xs text-gray-500">/ {maxUnlocked}</span>
  </div>
  <div className="text-xs text-gray-500 flex justify-between">
    <span>Difficulté : ×{tierMult.toFixed(1)} enemy FP</span>
    <span>Loot : ×{lootMult} ressources</span>
  </div>
</div>
```

Note : sélecteur visible dès le palier 1 (même si maxUnlocked=1), pour éducation du joueur. Les boutons ◀▶ sont disabled si on ne peut pas changer.

- [ ] **Step 3: Update the cost display + button**

Find the existing cost display :
```tsx
<div className="flex items-center justify-between text-sm border-t border-panel-border pt-3">
  <span className="text-gray-500 flex items-center gap-1.5">
    <Zap className="h-4 w-4 text-purple-400" /> Coût
  </span>
  <span className={insufficientFunds ? 'text-red-400 font-bold' : 'font-bold'}>
    {cost} Exilium {insufficientFunds && '(insuffisant)'}
  </span>
</div>
```

Replace `cost` with `scaledCost` and `insufficientFunds` with `insufficientFundsScaled` :

```tsx
<div className="flex items-center justify-between text-sm border-t border-panel-border pt-3">
  <span className="text-gray-500 flex items-center gap-1.5">
    <Zap className="h-4 w-4 text-purple-400" /> Coût
  </span>
  <span className={insufficientFundsScaled ? 'text-red-400 font-bold' : 'font-bold'}>
    {scaledCost} Exilium {insufficientFundsScaled && '(insuffisant)'}
  </span>
</div>
```

Same for the engage button :
```tsx
<Button
  onClick={handleEngage}
  disabled={insufficientFundsScaled || engageMutation.isPending}
>
  {confirming ? 'Confirmer ?' : engageMutation.isPending ? 'Engage…' : 'Engager'}
</Button>
```

- [ ] **Step 4: Update the engage mutation call**

Find `engageMutation.mutate({ ships: {} })`. Replace with :
```tsx
engageMutation.mutate({ ships: {}, tier: selectedTier });
```

- [ ] **Step 5: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/web 2>&1 | tail -10
```

Expected : 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/anomaly/AnomalyEngageModal.tsx
git commit -m "feat(web): EngageModal sélecteur palier + cost/loot/difficulty preview (V5-Tiers)"
```

Do NOT push.

---

## Task 7 : Frontend Anomaly.tsx — tier indicator + toast unlock + lien leaderboard

**Files :**
- Modify: `apps/web/src/pages/Anomaly.tsx`

- [ ] **Step 1: Add tier indicator in run view hero**

Read `/opt/exilium/apps/web/src/pages/Anomaly.tsx`. Find the run view hero (probably around lines 400-500, look for the depth indicator). Add an indicator showing the current tier alongside depth :

```tsx
import { Trophy } from 'lucide-react';

// In the run view hero, near the depth display :
<div className="flex items-center gap-1.5 text-sm text-violet-300">
  <Trophy className="h-4 w-4 text-yellow-400" />
  <span>Palier {(current as { tier?: number }).tier ?? 1}</span>
  <span className="text-gray-500">•</span>
  <span>Profondeur {current.currentDepth}</span>
</div>
```

Add `Trophy` to the lucide-react imports at the top.

- [ ] **Step 2: Add toast for newTierUnlocked in advanceMutation.onSuccess**

Find `advanceMutation.onSuccess`. After the existing toast logic (combat result, XP toasts, drop toasts), add :

```tsx
const newTierUnlocked = (data as { newTierUnlocked?: number | null }).newTierUnlocked;
if (newTierUnlocked) {
  addToast(`🏆 PALIER ${newTierUnlocked} DÉBLOQUÉ !`, 'success');
}
```

- [ ] **Step 3: Add lien vers leaderboard**

Find a good location in the page (probably near the engage button or in the page header). Add a button/link :

```tsx
<Link to="/anomalies/leaderboard">
  <Button variant="outline" size="sm" className="gap-2">
    <Trophy className="h-4 w-4 text-yellow-400" />
    Leaderboard
  </Button>
</Link>
```

Verify `Link` is imported from `react-router` (probably already is).

- [ ] **Step 4: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/web 2>&1 | tail -10
```

Expected : 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Anomaly.tsx
git commit -m "feat(web): tier indicator + toast unlock + lien leaderboard (V5-Tiers)"
```

Do NOT push.

---

## Task 8 : Frontend leaderboard page + route + RankMedalIcon SVG

**Files :**
- Create: `apps/web/src/components/common/RankMedalIcon.tsx`
- Create: `apps/web/src/pages/AnomalyLeaderboard.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Create the RankMedalIcon SVG component**

Create `/opt/exilium/apps/web/src/components/common/RankMedalIcon.tsx` (pattern repris de `ExiliumIcon.tsx` — SVG inline avec `currentColor` + `size`/`className` props) :

```tsx
/**
 * SVG médaille pour les rangs leaderboard top 3.
 * rank 1 → médaille or, rank 2 → argent, rank 3 → bronze.
 * Pour rang ≥ 4, retourne null (le caller affiche `#N` à la place).
 */
interface Props {
  rank: number;
  size?: number;
  className?: string;
}

const MEDAL_COLORS: Record<number, { fill: string; stroke: string; ribbon: string }> = {
  1: { fill: '#FCD34D', stroke: '#F59E0B', ribbon: '#DC2626' },  // Or
  2: { fill: '#E5E7EB', stroke: '#9CA3AF', ribbon: '#3B82F6' },  // Argent
  3: { fill: '#FCA561', stroke: '#C2410C', ribbon: '#16A34A' },  // Bronze
};

export function RankMedalIcon({ rank, size = 20, className = '' }: Props) {
  const colors = MEDAL_COLORS[rank];
  if (!colors) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label={`Rang ${rank}`}
    >
      {/* Ribbon (drape de la médaille) */}
      <path
        d="M8 2 L10 11 L12 9 L14 11 L16 2"
        stroke={colors.ribbon}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={colors.ribbon}
        opacity="0.9"
      />
      {/* Disque de la médaille */}
      <circle
        cx="12"
        cy="16"
        r="6"
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth="1.5"
      />
      {/* Numéro du rang centré */}
      <text
        x="12"
        y="19"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fill={colors.stroke}
      >
        {rank}
      </text>
    </svg>
  );
}
```

- [ ] **Step 2: Create the leaderboard page**

Create `/opt/exilium/apps/web/src/pages/AnomalyLeaderboard.tsx` :

```tsx
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { RankMedalIcon } from '@/components/common/RankMedalIcon';
import { Button } from '@/components/ui/button';
import { Trophy, ArrowLeft } from 'lucide-react';

export default function AnomalyLeaderboard() {
  const { data: leaderboard, isLoading } = trpc.anomaly.leaderboard.useQuery({ limit: 50 });

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Leaderboard Anomaly" />
        <Link to="/anomalies">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
        </Link>
      </div>

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Chargement…</div>
        ) : !leaderboard?.entries || leaderboard.entries.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Aucun joueur n'a encore complété un palier.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-panel-light/50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Rang</th>
                <th className="px-3 py-2 text-left">Joueur</th>
                <th className="px-3 py-2 text-right">Palier max</th>
                <th className="px-3 py-2 text-right">Niveau</th>
                <th className="px-3 py-2 text-right">XP</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.entries.map((entry, i) => {
                const rank = i + 1;
                return (
                  <tr
                    key={entry.username + '-' + i}
                    className="border-t border-panel-border hover:bg-panel-hover transition-colors"
                  >
                    <td className="px-3 py-2 font-mono">
                      {rank <= 3 ? (
                        <RankMedalIcon rank={rank} size={24} />
                      ) : (
                        `#${rank}`
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{entry.username}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 font-bold text-yellow-400">
                        <Trophy className="h-3.5 w-3.5" />
                        {entry.maxTierCompleted}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{entry.level}</td>
                    <td className="px-3 py-2 text-right text-gray-400">
                      {entry.xp.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-500 text-center">
        Tiebreakers : niveau pilote, puis XP cumulé.
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the route**

Read `/opt/exilium/apps/web/src/router.tsx`. Find the `path: 'anomalies'` route entry (around line 186). Add a sibling route for the leaderboard right after :

```tsx
{
  path: 'anomalies',
  lazy: lazyLoad(() => import('./pages/Anomaly')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
{
  path: 'anomalies/leaderboard',
  lazy: lazyLoad(() => import('./pages/AnomalyLeaderboard')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
```

- [ ] **Step 4: Lint + typecheck**

```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/web 2>&1 | tail -10
```

Expected : 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/AnomalyLeaderboard.tsx apps/web/src/components/common/RankMedalIcon.tsx apps/web/src/router.tsx
git commit -m "feat(web): page leaderboard + RankMedalIcon SVG (V5-Tiers)"
```

Do NOT push.

---

## Task 9 : Final lint + tests + push + deploy + smoke + annonce

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

Expected : all existing tests pass + 6+ new engine tests for tierMultiplier.

- [ ] **Step 3: Push and deploy**

```bash
cd /opt/exilium && git push origin main
/opt/exilium/scripts/deploy.sh
```

Expected : Migration 0072 applied, PM2 reload OK, Caddy reload OK. Verify in deploy output that `0072_anomaly_tiers.sql` is listed as applied.

- [ ] **Step 4: Smoke test in browser**

- Open https://exilium-game.com/anomalies
  - Verify : page chargée, bouton "Leaderboard" visible
- Click "Engager" :
  - Si tu n'as encore aucun palier complété : sélecteur DOIT être caché (maxUnlocked=1, condition `maxUnlocked > 1` false) — OU si la condition est inverse, vérifier qu'il s'affiche à 1/1
  - Vérifier le coût (5 Exilium au palier 1)
- Open https://exilium-game.com/anomalies/leaderboard
  - Vérifier : page chargée, table affiche soit "Aucun joueur" si aucun palier complété, soit les top players
- (Optional) Engager + advance jusqu'à depth 20 pour valider que la mention "🏆 PALIER 2 DÉBLOQUÉ !" apparaît

- [ ] **Step 5: Publish announcement**

Insert via `/admin/announcements` page. Suggested text (max 280 chars) :

> Anomaly V5 — Paliers ! Compléter depth 20 d'un palier débloque le suivant (×N difficulté). Loot ×N capped à palier 10. Nouveau leaderboard PvE en live : grimpe les paliers et montre qui domine la galaxie. Bon courage !

Set `variant: 'info'` and `active: true`.

- [ ] **Step 6: Monitor logs**

```bash
pm2 logs exilium-api --lines 100
```

Look for any errors related to `tier`, `maxTierUnlocked`, `leaderboard`. Should be clean for at least 5 minutes after deploy.

If errors :
- "column tier does not exist" → migration didn't apply, re-run `deploy.sh`
- "leaderboard is not a function" → router/service not deployed, restart PM2
- "Cannot read property 'maxTierUnlocked' of undefined" → defensive `?? 1` should prevent this

---

## Notes — décisions implémentation

1. **Hardcoded `tierMultiplierPctFactor` defaults dans le frontend** (Task 6 Step 1) : si l'admin tune `anomaly_tier_multiplier_factor` via universe_config, le frontend continuera à afficher `tierFactor || 1.0`. Tunable côté admin sans redeploy. Le backend respecte aussi le tune.

2. **Migration legacy** : les anomalies actives V4 ont `tier = 1` par défaut (back-compat assured). Aucun script TS de migration nécessaire.

3. **Defensive `(flagship as { maxTierUnlocked?: number }).maxTierUnlocked ?? 1`** : pattern utilisé pour éviter les erreurs TS pendant la transition (Drizzle inférence parfois lag). À nettoyer dans une PR ultérieure si typecheck propre.

4. **Pas de re-run "free" pour grinder modules** : le coût d'engage est scaled même pour un palier déjà completed. Cohérent avec la philosophie V4 ("tu paies pour jouer").

5. **Leaderboard limit 50** : peut être augmenté à 100 (max input). Si demande joueur dans le futur, adapter via param query.
