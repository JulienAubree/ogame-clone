# Anomaly V4 (flagship-only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Refondre le mode Anomalie en flagship-only — un seul vaisseau côté joueur, charges réparation, wipe radical, audit + extension des events, gating par hull/recherche, migration legacy via forced retreat.

**Architecture :** Garde le moteur `simulateCombat` existant (juste `playerShipCounts = { flagship: 1 }`), pas de refonte engine. Ajoute `repair_charges_*` colonnes sur `anomalies`, mutation `useRepairCharge`, extension du schéma events (`moduleDrop`, `requiredHull`, `requiredResearch`), audit script qui désactive ~15-20 events incompatibles. Migration legacy via script TS one-shot qui force-retreat les anomalies actives.

**Tech Stack :** Drizzle/Postgres, tRPC 11, React 19, Vite 6, vitest, pnpm turbo.

**Spec source :** `docs/superpowers/specs/2026-05-03-anomaly-v4-flagship-only-design.md`

---

## File Structure

### Files to CREATE

| Path | Responsabilité |
|---|---|
| `packages/db/drizzle/0070_anomaly_v4.sql` | Ajout colonnes repair_charges_* + universe_config tunables + marker |
| `apps/api/src/scripts/migrate-anomaly-v4.ts` | One-shot forced retreat des anomalies actives |
| `apps/api/src/scripts/audit-anomaly-events.ts` | One-shot audit + désactivation events incompatibles |
| `apps/api/src/modules/anomaly/__tests__/anomaly.useRepairCharge.test.ts` | Tests mutation repair charge |
| `apps/api/src/modules/anomaly/__tests__/anomaly.v4.test.ts` | Tests intégration V4 (engage + advance wipe + advance survived) |

### Files to MODIFY

| Path | Changement |
|---|---|
| `packages/db/src/schema/anomalies.ts` | +2 colonnes (repairChargesCurrent, repairChargesMax) |
| `apps/api/src/modules/anomaly-content/anomaly-content.types.ts` | +moduleDrop sur outcome, +requiredHull/requiredResearch sur choice |
| `apps/api/src/modules/anomaly-content/anomaly-events.seed.ts` | enabled: false sur events incompatibles (audit script applique) |
| `apps/api/src/modules/anomaly/anomaly.router.ts` | Add `useRepairCharge` mutation + simplify `engage` input |
| `apps/api/src/modules/anomaly/anomaly.service.ts` | engage simplifié + advance wipe-only refactor + useRepairCharge + resolveEvent gating + moduleDrop |
| `apps/api/src/modules/anomaly/anomaly.combat.ts` | playerShipCounts = { flagship: 1 } only, simplification |
| `apps/api/src/modules/modules/modules.service.ts` | +rollByRarity helper (utilisé par moduleDrop dans events) |
| `apps/api/src/trpc/app-router.ts` | Pass modulesService to anomalyService (déjà fait sprint 1) — rien à changer probablement |
| `apps/web/src/components/anomaly/AnomalyEngageModal.tsx` | Suppression selecteur ships, bouton simple |
| `apps/web/src/pages/Anomaly.tsx` | Ajout indicateur charges + bouton repair, mutation hook |
| `apps/web/src/components/anomaly/AnomalyEventCard.tsx` | Gris-out choix non éligibles + tooltip + module drop badge |
| `apps/web/src/components/anomaly/AnomalyCombatPreview.tsx` | Adapter preview pour 1 ship ally |

---

## Task 1 : Migration DB + script forced retreat

**Files :**
- Create: `packages/db/drizzle/0070_anomaly_v4.sql`
- Create: `apps/api/src/scripts/migrate-anomaly-v4.ts`
- Modify: `packages/db/src/schema/anomalies.ts`

- [ ] **Step 1: Write the SQL migration**

Create `/opt/exilium/packages/db/drizzle/0070_anomaly_v4.sql`:

```sql
-- Anomaly V4 — flagship-only schema additions

-- Nouvelles colonnes pour les charges réparation
ALTER TABLE anomalies
  ADD COLUMN repair_charges_current SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN repair_charges_max     SMALLINT NOT NULL DEFAULT 3;

-- Universe config tunables
INSERT INTO universe_config (key, value) VALUES
  ('anomaly_repair_charges_per_run', 3),
  ('anomaly_repair_charge_hull_pct', 0.30)
ON CONFLICT (key) DO NOTHING;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('anomaly_v4_schema', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
```

- [ ] **Step 2: Update Drizzle schema**

Modify `/opt/exilium/packages/db/src/schema/anomalies.ts` — add 2 columns at the end of the column block (before `createdAt` / `completedAt`) :

```ts
  /** Anomaly V4 (2026-05-03) : nombre de charges réparation restantes dans la run. */
  repairChargesCurrent: smallint('repair_charges_current').notNull().default(0),
  /** Max charges réparation (initialisé à `anomaly_repair_charges_per_run` à l'engage). */
  repairChargesMax:     smallint('repair_charges_max').notNull().default(3),
```

- [ ] **Step 3: Write the forced-retreat migration script**

Create `/opt/exilium/apps/api/src/scripts/migrate-anomaly-v4.ts`:

```ts
/**
 * One-off script: V4 migration of anomaly mode (flagship-only).
 *
 * Steps:
 *   1. Force-retreat every active anomaly (refund Exilium, return loot
 *      resources + escort ships to origin planet, restore flagship to base).
 *   2. Set _migrations_state.anomaly_v4_migrated = 'done' (idempotence).
 *
 * Safe to re-run : the marker prevents double-refund. Re-run = no-op.
 *
 * Usage:
 *   pnpm --filter @exilium/api exec tsx --env-file=/opt/exilium/.env apps/api/src/scripts/migrate-anomaly-v4.ts
 */
import { sql, eq, and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  anomalies, flagships, planets, planetShips, userExilium, exiliumLog,
} from '@exilium/db';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    // ── Idempotence check ────────────────────────────────────────────
    const [existing] = await db.execute<{ value: string }>(sql`
      SELECT value FROM _migrations_state WHERE key = 'anomaly_v4_migrated' LIMIT 1
    `);
    if (existing && existing.value === 'done') {
      console.log('✓ Migration already applied (marker present). Skipping.');
      await client.end();
      return;
    }

    // ── Step 1: Find active anomalies ────────────────────────────────
    const activeRows = await db.select().from(anomalies)
      .where(eq(anomalies.status, 'active'));
    console.log(`Found ${activeRows.length} active anomalies to force-retreat.`);

    let refundedCount = 0;
    let totalRefunded = 0;

    for (const row of activeRows) {
      await db.transaction(async (tx) => {
        // 1a. Mark completed
        await tx.update(anomalies).set({
          status: 'completed',
          completedAt: new Date(),
          nextNodeAt: null,
          nextEnemyFleet: null,
          nextEnemyFp: null,
        }).where(eq(anomalies.id, row.id));

        // 1b. Refund Exilium
        if (row.exiliumPaid > 0) {
          await tx.update(userExilium).set({
            balance: sql`${userExilium.balance} + ${row.exiliumPaid}`,
            totalEarned: sql`${userExilium.totalEarned} + ${row.exiliumPaid}`,
            updatedAt: new Date(),
          }).where(eq(userExilium.userId, row.userId));
          await tx.insert(exiliumLog).values({
            userId: row.userId,
            amount: row.exiliumPaid,
            source: 'pve',
            details: { source: 'anomaly_v4_migration', anomalyId: row.id },
          });
          totalRefunded += row.exiliumPaid;
        }

        // 1c. Credit loot resources to origin planet
        const lootMinerai = Number(row.lootMinerai);
        const lootSilicium = Number(row.lootSilicium);
        const lootHydrogene = Number(row.lootHydrogene);
        if (lootMinerai > 0 || lootSilicium > 0 || lootHydrogene > 0) {
          await tx.update(planets).set({
            minerai: sql`${planets.minerai} + ${lootMinerai}`,
            silicium: sql`${planets.silicium} + ${lootSilicium}`,
            hydrogene: sql`${planets.hydrogene} + ${lootHydrogene}`,
          }).where(eq(planets.id, row.originPlanetId));
        }

        // 1d. Return escort ships + loot ships to origin planet's planet_ships
        const fleet = (row.fleet ?? {}) as Record<string, { count: number; hullPercent: number }>;
        const lootShips = (row.lootShips ?? {}) as Record<string, number>;
        const totalToInject: Record<string, number> = {};
        for (const [shipId, entry] of Object.entries(fleet)) {
          if (shipId === 'flagship') continue;
          if (entry.count > 0) totalToInject[shipId] = (totalToInject[shipId] ?? 0) + entry.count;
        }
        for (const [shipId, count] of Object.entries(lootShips)) {
          if (count > 0) totalToInject[shipId] = (totalToInject[shipId] ?? 0) + count;
        }
        if (Object.keys(totalToInject).length > 0) {
          const incrementUpdate: Record<string, unknown> = {};
          for (const [shipId, count] of Object.entries(totalToInject)) {
            const col = (planetShips as unknown as Record<string, unknown>)[shipId];
            if (col) incrementUpdate[shipId] = sql`${col} + ${count}`;
          }
          if (Object.keys(incrementUpdate).length > 0) {
            await tx.update(planetShips).set(incrementUpdate as never)
              .where(eq(planetShips.planetId, row.originPlanetId));
          }
        }

        // 1e. Flagship returns to base, status active
        await tx.update(flagships).set({
          status: 'active',
          planetId: row.originPlanetId,
          updatedAt: new Date(),
        }).where(eq(flagships.userId, row.userId));

        refundedCount++;
      });
    }

    console.log(`✓ Force-retreated ${refundedCount} anomalies, refunded ${totalRefunded} Exilium total.`);

    // ── Step 2: Set marker ───────────────────────────────────────────
    await db.execute(sql`
      INSERT INTO _migrations_state (key, value) VALUES ('anomaly_v4_migrated', 'done')
      ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now()
    `);
    console.log('✓ Marker set — script will skip on re-run.');

  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Lint + typecheck**

Run: `pnpm turbo lint typecheck --filter=@exilium/api --filter=@exilium/db`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/0070_anomaly_v4.sql packages/db/src/schema/anomalies.ts apps/api/src/scripts/migrate-anomaly-v4.ts
git commit -m "feat(db): anomaly v4 — colonnes repair_charges + script migration legacy"
```

Do NOT push — bundled with subsequent tasks.

---

## Task 2 : Backend — engage simplifié + combat refondu

**Files :**
- Modify: `apps/api/src/modules/anomaly/anomaly.combat.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.router.ts`

- [ ] **Step 1: Modify `anomaly.combat.ts` runAnomalyNode for flagship-only**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.combat.ts`, find the section building `playerShipCounts` (around lines 213-216):

```ts
// AVANT
const playerShipCounts: Record<string, number> = {};
for (const [shipId, entry] of Object.entries(args.fleet)) {
  if (entry.count > 0) playerShipCounts[shipId] = entry.count;
}
```

Replace with:

```ts
// V4 : flagship-only. Tout autre ship dans args.fleet est ignoré (legacy data).
const flagshipEntry = args.fleet['flagship'];
if (!flagshipEntry || flagshipEntry.count <= 0) {
  // Cas impossible si engage V4 a fait son job, mais défensif
  throw new Error('V4 anomaly: flagship missing or destroyed before combat start');
}
const playerShipCounts: Record<string, number> = { flagship: 1 };
```

Find the section building `attackerSurvivors` (around lines 290-302). Simplify to flagship-only:

```ts
// AVANT
const attackerSurvivors: Record<string, FleetEntry> = {};
for (const [shipId, entry] of Object.entries(args.fleet)) {
  const finalCount = lastRound?.attackerShips[shipId] ?? 0;
  if (finalCount <= 0) continue;
  const hp = lastRound?.attackerHPByType?.[shipId];
  let newHullPercent = entry.hullPercent;
  if (hp && hp.hullMax > 0) {
    newHullPercent = Math.max(0.05, hp.hullRemaining / hp.hullMax);
  }
  attackerSurvivors[shipId] = { count: finalCount, hullPercent: newHullPercent };
}
```

Replace with:

```ts
// V4 : seul le flagship est tracké côté player
const attackerSurvivors: Record<string, FleetEntry> = {};
const flagshipFinalCount = lastRound?.attackerShips['flagship'] ?? 0;
if (flagshipFinalCount > 0) {
  const hp = lastRound?.attackerHPByType?.['flagship'];
  let newHullPercent = flagshipEntry.hullPercent;
  if (hp && hp.hullMax > 0) {
    newHullPercent = Math.max(0.05, hp.hullRemaining / hp.hullMax);
  }
  attackerSurvivors['flagship'] = { count: 1, hullPercent: newHullPercent };
}
// Si flagshipFinalCount = 0 → attackerSurvivors = {} → wipe
```

- [ ] **Step 2: Simplify `engage` in anomaly.service.ts**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.service.ts`, find the `engage` method (around lines 74-211).

The current flow validates `input.ships`, locks `planet_ships`, validates availability, decrements ships, builds fleet with escort. **In V4, we strip all of that.**

Replace the entire `engage` method body with:

```ts
    /**
     * V4 (2026-05-03) : flagship-only engagement.
     *
     * No more escort selection — the flagship is the only ship engaged.
     * The `input.ships` argument is accepted for back-compat but ignored
     * (the router still passes an empty object).
     *
     * Wrapped in a transaction with a per-user advisory lock so concurrent
     * engage / advance / retreat from the same user are serialized.
     */
    async engage(userId: string, _input: { ships: Record<string, number> }) {
      const config = await gameConfigService.getFullConfig();
      const cost = Number(config.universe.anomaly_entry_cost_exilium) || 5;
      const repairChargesMax = Number(config.universe.anomaly_repair_charges_per_run) || 3;

      return await db.transaction(async (tx) => {
        // 1. Per-user advisory lock
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        // 2. No active anomaly
        const [active] = await tx.select({ id: anomalies.id }).from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .limit(1);
        if (active) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Une anomalie est déjà en cours' });
        }

        // 3. Flagship validation
        const flagship = await flagshipService.get(userId);
        if (!flagship) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral requis' });
        }
        if (flagship.status !== 'active') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vaisseau amiral indisponible' });
        }
        const originPlanetId = flagship.planetId;

        // 4. Origin planet ownership
        const [origin] = await tx.select({ id: planets.id, userId: planets.userId })
          .from(planets).where(eq(planets.id, originPlanetId)).limit(1);
        if (!origin || origin.userId !== userId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Planète invalide' });
        }

        // 5. Spend Exilium
        const [exRecord] = await tx.select({ balance: userExilium.balance })
          .from(userExilium)
          .where(eq(userExilium.userId, userId))
          .for('update')
          .limit(1);
        if (!exRecord || exRecord.balance < cost) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Solde Exilium insuffisant (${exRecord?.balance ?? 0} disponible, ${cost} requis)`,
          });
        }
        await tx.update(userExilium).set({
          balance: sql`${userExilium.balance} - ${cost}`,
          totalSpent: sql`${userExilium.totalSpent} + ${cost}`,
          updatedAt: new Date(),
        }).where(eq(userExilium.userId, userId));
        await tx.insert(exiliumLog).values({
          userId, amount: -cost, source: 'pve', details: { source: 'anomaly_engage' },
        });

        // 6. Flagship → in_mission
        await flagshipService.setInMission(userId);

        // 7. Snapshot module loadout (sprint 1 logic)
        const [flagshipRow] = await tx.select({
          loadout: flagships.moduleLoadout,
          chargesMax: flagships.epicChargesMax,
        }).from(flagships).where(eq(flagships.userId, userId)).limit(1);
        const equippedSnapshot = flagshipRow?.loadout ?? {};
        await tx.update(flagships).set({
          epicChargesCurrent: flagshipRow?.chargesMax ?? 1,
        }).where(eq(flagships.userId, userId));

        // 8. Build fleet (flagship only) + first enemy
        const fleet: FleetMap = { flagship: { count: 1, hullPercent: 1.0 } };
        const firstEnemy = await generateAnomalyEnemy(tx as unknown as Database, gameConfigService, modulesService, {
          userId,
          fleet,
          depth: 1,
        });

        // 9. Insert anomaly row — V4 flagship-only with repair charges
        const nextNodeAt = new Date(Date.now() + nodeTravelMs(config));
        const [created] = await tx.insert(anomalies).values({
          userId,
          originPlanetId,
          status: 'active',
          currentDepth: 0,
          fleet,
          exiliumPaid: cost,
          nextNodeAt,
          nextEnemyFleet: firstEnemy.enemyFleet,
          nextEnemyFp: Math.round(firstEnemy.enemyFP),
          nextNodeType: 'combat',
          combatsUntilNextEvent: pickEventGap(Math.random),
          equippedModules: equippedSnapshot,
          pendingEpicEffect: null,
          repairChargesCurrent: repairChargesMax,
          repairChargesMax,
        }).returning();

        return created;
      });
    },
```

This removes :
- All `input.ships` validation/sanitization
- planet_ships lock + decrement
- The complex fleet building loop

Keeps :
- Advisory lock
- Active-anomaly check
- Flagship validation
- Exilium spend
- setInMission + module loadout snapshot (sprint 1)
- First enemy pre-generation

- [ ] **Step 3: Simplify the `engage` router input**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.router.ts`, change the `engage` mutation:

```ts
// AVANT
engage: protectedProcedure
  .input(z.object({
    ships: z.record(z.string(), z.number().int().min(0)),
  }))
  .mutation(async ({ ctx, input }) => {
    return anomalyService.engage(ctx.userId!, input);
  }),

// APRÈS
engage: protectedProcedure
  // V4 : input shape kept for back-compat but the field is ignored server-side
  .input(z.object({
    ships: z.record(z.string(), z.number().int().min(0)).optional().default({}),
  }))
  .mutation(async ({ ctx, input }) => {
    return anomalyService.engage(ctx.userId!, { ships: input.ships ?? {} });
  }),
```

- [ ] **Step 4: Lint + typecheck**

Run: `pnpm turbo lint typecheck --filter=@exilium/api`
Expected: 0 errors. The `_input` parameter prefix avoids "unused param" warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/anomaly/anomaly.combat.ts apps/api/src/modules/anomaly/anomaly.service.ts apps/api/src/modules/anomaly/anomaly.router.ts
git commit -m "refactor(anomaly): engage flagship-only + combat playerShipCounts simplifié"
```

---

## Task 3 : Backend — advance wipe-only refactor

**Files :**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`

- [ ] **Step 1: Refactor `advance` to remove forced_retreat branch**

In V3, `advance` had 4 outcomes: wiped, forced_retreat, survived, runComplete. In V4, `forced_retreat` is gone — flagship destroyed = `wiped` (no escort to fall back on).

Find the `advance` method in `anomaly.service.ts` (around lines 218-573). Locate the outcome decision block:

```ts
// AVANT (lignes ~277-281)
const flagshipSurvived = !!result.attackerSurvivors['flagship'];
const anySurvivor = Object.keys(result.attackerSurvivors).length > 0;
const totalWipe = !anySurvivor;
const forcedRetreat = !totalWipe && (!flagshipSurvived || result.outcome !== 'attacker');
```

Replace with:

```ts
// V4 : flagship-only. Pas de "forced_retreat" partiel — flagship détruit = wipe radical.
const flagshipSurvived = !!result.attackerSurvivors['flagship'];
const wipe = !flagshipSurvived;
```

- [ ] **Step 2: Simplify wipe branch (delete forced_retreat block)**

In the same method, find the `if (totalWipe) { ... }` block (around lines 333-366) and the `if (forcedRetreat) { ... }` block (around lines 368-452).

**DELETE the entire `if (forcedRetreat)` block.**

**Modify the wipe branch** to match V4 semantics. Find:

```ts
if (totalWipe) {
  // ... existing code ...
}
```

Replace with:

```ts
if (wipe) {
  // V4 wipe semantics :
  //  - status 'wiped'
  //  - Exilium engagé : non remboursé (perdu)
  //  - Loot ressources accumulé : non rendu à la planète (perdu)
  //  - Modules drops déjà obtenus : restent en inventaire (committed à chaque grant)
  //  - Pas de drop sur ce combat fatal (pas de roll dans le wipe branch)
  //  - Pas de per-run final drop (réservé à retreat/runComplete)
  //  - Flagship → incapacitated (30 min de réparation)
  const wipedRows = await tx.update(anomalies).set({
    status: 'wiped',
    fleet: result.attackerSurvivors,  // = {} (flagship détruit)
    reportIds: updatedReportIds,
    completedAt: new Date(),
    nextNodeAt: null,
    nextEnemyFleet: null,
    nextEnemyFp: null,
    ...(row.pendingEpicEffect ? { pendingEpicEffect: null } : {}),
  }).where(and(
    eq(anomalies.id, row.id),
    eq(anomalies.status, 'active'),
    eq(anomalies.currentDepth, row.currentDepth),
  )).returning({ id: anomalies.id });
  if (wipedRows.length === 0) {
    throw new TRPCError({ code: 'CONFLICT', message: 'État de l\'anomalie a changé entre-temps' });
  }
  await flagshipService.incapacitate(userId);

  return {
    outcome: 'wiped' as const,
    fleet: result.attackerSurvivors,
    enemyFP: result.enemyFP,
    combatRounds: result.combatRounds,
    reportId: report.id,
    droppedModule: null,
    finalDrops: [],
  };
}
```

The `survived` and `runComplete` branches further down stay as-is (sprint 1 logic for drops + nodeLoot still applies). The `forcedRetreat` flagshipLost / combatOutcome fields are gone from the response shape — front consumers will need updating in Task 9.

- [ ] **Step 3: Update `retreat` method — no Exilium refund in V4**

Find the `retreat` method (around lines 764-849). Locate the Exilium refund block:

```ts
// AVANT
if (row.exiliumPaid > 0) {
  await tx.update(userExilium).set({
    balance: sql`${userExilium.balance} + ${row.exiliumPaid}`,
    totalEarned: sql`${userExilium.totalEarned} + ${row.exiliumPaid}`,
    updatedAt: new Date(),
  }).where(eq(userExilium.userId, userId));
  await tx.insert(exiliumLog).values({
    userId, amount: row.exiliumPaid, source: 'pve',
    details: { source: 'anomaly_retreat' },
  });
}
```

**DELETE this block.** V4 : retreat volontaire ne refund pas l'Exilium (le coût d'engage est assumé).

The rest of `retreat` (rendu loot ressources + ships, return flagship to base) stays.

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck --filter=@exilium/api`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/anomaly/anomaly.service.ts
git commit -m "refactor(anomaly): advance wipe-only + retreat sans refund (V4)"
```

---

## Task 4 : Backend — useRepairCharge mutation + service

**Files :**
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.router.ts`
- Create: `apps/api/src/modules/anomaly/__tests__/anomaly.useRepairCharge.test.ts`

- [ ] **Step 1: Add useRepairCharge to the service**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.service.ts`, add a new method to the returned object (right after `current` or `engage`, your choice — doesn't matter for behavior):

```ts
    /**
     * Use 1 repair charge : restores +N% hull on the flagship (clamped at 1.0).
     * Refused if no charges left, no active anomaly, or hull already at 1.0.
     */
    async useRepairCharge(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const repairPct = Number(config.universe.anomaly_repair_charge_hull_pct) || 0.30;

      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}::text))`);

        const [active] = await tx.select().from(anomalies)
          .where(and(eq(anomalies.userId, userId), eq(anomalies.status, 'active')))
          .for('update').limit(1);
        if (!active) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune anomalie active' });
        }
        if (active.repairChargesCurrent <= 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune charge de réparation' });
        }

        const fleet = (active.fleet ?? {}) as Record<string, { count: number; hullPercent: number }>;
        const currentHp = fleet.flagship?.hullPercent ?? 1.0;
        if (currentHp >= 1.0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Flagship à pleine santé' });
        }

        const newHp = Math.min(1.0, currentHp + repairPct);
        const newFleet = {
          ...fleet,
          flagship: { count: 1, hullPercent: newHp },
        };

        await tx.update(anomalies).set({
          fleet: newFleet,
          repairChargesCurrent: sql`${anomalies.repairChargesCurrent} - 1`,
        }).where(eq(anomalies.id, active.id));

        return {
          newHullPercent: newHp,
          remainingCharges: active.repairChargesCurrent - 1,
        };
      });
    },
```

- [ ] **Step 2: Add useRepairCharge to the router**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.router.ts`, add (right before `history`):

```ts
    useRepairCharge: protectedProcedure.mutation(async ({ ctx }) => {
      return anomalyService.useRepairCharge(ctx.userId!);
    }),
```

- [ ] **Step 3: Write tests for useRepairCharge**

Create `/opt/exilium/apps/api/src/modules/anomaly/__tests__/anomaly.useRepairCharge.test.ts`. Use the same queue-based mock pattern as `anomaly.activateEpic.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createAnomalyService } from '../anomaly.service.js';

function makeMockGameConfig() {
  return {
    getFullConfig: async () => ({
      universe: {
        anomaly_repair_charge_hull_pct: 0.30,
        anomaly_entry_cost_exilium: 5,
        anomaly_repair_charges_per_run: 3,
      },
    }),
  };
}

function makeMockDb(selectResults: unknown[][], onUpdate?: (updates: unknown[]) => void) {
  const queue = [...selectResults];
  const updates: unknown[] = [];
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
      chain.set = vi.fn().mockImplementation((data: unknown) => {
        updates.push(data);
        if (onUpdate) onUpdate(updates);
        return chain;
      });
      chain.where = vi.fn().mockResolvedValue(undefined);
      return chain;
    }),
    _updates: () => updates,
  };
  return db;
}

function makeService(db: any) {
  return createAnomalyService(
    db,
    makeMockGameConfig() as any,
    {} as any,  // exiliumService — not used by useRepairCharge
    {} as any,  // flagshipService — not used by useRepairCharge
    {} as any,  // reportService
    {} as any,  // anomalyContentService
    {} as any,  // modulesService
  );
}

describe('anomalyService.useRepairCharge', () => {
  it('restores +30% hull and decrements charges', async () => {
    const active = {
      id: 'a1',
      status: 'active',
      fleet: { flagship: { count: 1, hullPercent: 0.5 } },
      repairChargesCurrent: 3,
    };
    const db = makeMockDb([[active]]);
    const result = await makeService(db).useRepairCharge('user1');
    expect(result.newHullPercent).toBeCloseTo(0.8);
    expect(result.remainingCharges).toBe(2);
  });

  it('clamps hull to 1.0 when overflow', async () => {
    const active = {
      id: 'a1',
      status: 'active',
      fleet: { flagship: { count: 1, hullPercent: 0.85 } },
      repairChargesCurrent: 1,
    };
    const db = makeMockDb([[active]]);
    const result = await makeService(db).useRepairCharge('user1');
    expect(result.newHullPercent).toBe(1.0);  // 0.85 + 0.30 = 1.15 → clamp 1.0
    expect(result.remainingCharges).toBe(0);
  });

  it('throws NOT_FOUND when no active anomaly', async () => {
    const db = makeMockDb([[]]);  // no active row
    await expect(makeService(db).useRepairCharge('user1')).rejects.toThrow(TRPCError);
    await expect(makeService(db).useRepairCharge('user1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BAD_REQUEST when no charges left', async () => {
    const active = {
      id: 'a1',
      status: 'active',
      fleet: { flagship: { count: 1, hullPercent: 0.5 } },
      repairChargesCurrent: 0,
    };
    const db = makeMockDb([[active]]);
    await expect(makeService(db).useRepairCharge('user1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('Aucune charge'),
    });
  });

  it('throws BAD_REQUEST when hull already at 1.0', async () => {
    const active = {
      id: 'a1',
      status: 'active',
      fleet: { flagship: { count: 1, hullPercent: 1.0 } },
      repairChargesCurrent: 3,
    };
    const db = makeMockDb([[active]]);
    await expect(makeService(db).useRepairCharge('user1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('pleine santé'),
    });
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/api -- anomaly.useRepairCharge
```

Expected: 5 tests pass.

If the mock pattern doesn't trigger correctly (Drizzle chain quirks), inspect `apps/api/src/modules/anomaly/__tests__/anomaly.activateEpic.test.ts` for the working pattern and copy verbatim.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm turbo lint typecheck --filter=@exilium/api`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/anomaly/anomaly.service.ts apps/api/src/modules/anomaly/anomaly.router.ts apps/api/src/modules/anomaly/__tests__/anomaly.useRepairCharge.test.ts
git commit -m "feat(anomaly): mutation useRepairCharge + tests (V4)"
```

---

## Task 5 : Backend — events extension (schema + gating + moduleDrop)

**Files :**
- Modify: `apps/api/src/modules/anomaly-content/anomaly-content.types.ts`
- Modify: `apps/api/src/modules/modules/modules.service.ts`
- Modify: `apps/api/src/modules/anomaly/anomaly.service.ts`

- [ ] **Step 1: Extend the anomaly-content schema**

In `/opt/exilium/apps/api/src/modules/anomaly-content/anomaly-content.types.ts`, modify the `outcomeSchema` to add `moduleDrop`:

```ts
const outcomeSchema = z.object({
  minerai: z.number().int().default(0),
  silicium: z.number().int().default(0),
  hydrogene: z.number().int().default(0),
  exilium: z.number().int().default(0),
  hullDelta: z.number().min(-1).max(1).default(0),
  shipsGain: shipDeltaSchema.default({}),  // KEPT for legacy events (now disabled)
  shipsLoss: shipDeltaSchema.default({}),  // KEPT for legacy events (now disabled)
  /** V4 : si set, grant 1 module de la rareté demandée (random pick dans le pool de la coque). */
  moduleDrop: z.enum(['common', 'rare', 'epic']).optional(),
});
```

Modify the `choiceSchema` to add gating fields:

```ts
const choiceSchema = z.object({
  label: z.string().min(1).max(80),
  hidden: z.boolean().default(false),
  outcome: outcomeSchema.default({}),
  resolutionText: z.string().max(500).default(''),
  /** V4 : restreint l'éligibilité à un hull spécifique. */
  requiredHull: z.enum(['combat', 'industrial', 'scientific']).optional(),
  /** V4 : restreint l'éligibilité à un niveau de recherche. */
  requiredResearch: z.object({
    researchId: z.string(),
    minLevel: z.number().int().min(1),
  }).optional(),
});
```

- [ ] **Step 2: Add `rollByRarity` helper to modulesService**

In `/opt/exilium/apps/api/src/modules/modules/modules.service.ts`, add a new method (right after `rollPerRunFinalDrop`):

```ts
    /**
     * V4 : pick a random module of the given rarity from the flagship's hull pool.
     * Used by anomaly events with `outcome.moduleDrop`.
     */
    async rollByRarity(
      args: {
        flagshipHullId: string;
        rarity: 'common' | 'rare' | 'epic';
        rng?: () => number;
        executor?: Database;
      },
    ): Promise<string | null> {
      const rng = args.rng ?? Math.random;
      const pool = await getPool(args.executor ?? db);
      const cands = pool.filter(
        (m) => m.hullId === args.flagshipHullId && m.rarity === args.rarity,
      );
      if (cands.length === 0) return null;
      return cands[Math.floor(rng() * cands.length)].id;
    },
```

- [ ] **Step 3: Wire gating + moduleDrop in resolveEvent**

In `/opt/exilium/apps/api/src/modules/anomaly/anomaly.service.ts`, find the `resolveEvent` method. Locate the section after `const choice = event.choices[choiceIndex];` (around line 643).

Add gating validation + moduleDrop application :

```ts
        const choice = event.choices[choiceIndex];

        // V4 : gating par hull
        if (choice.requiredHull) {
          const [flagshipHull] = await tx.select({ hullId: flagships.hullId })
            .from(flagships).where(eq(flagships.userId, userId)).limit(1);
          if (flagshipHull?.hullId !== choice.requiredHull) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Choix réservé à la coque ${choice.requiredHull}`,
            });
          }
        }

        // V4 : gating par recherche
        if (choice.requiredResearch) {
          const [research] = await tx.select({ level: userResearch.level })
            .from(userResearch).where(and(
              eq(userResearch.userId, userId),
              eq(userResearch.researchId, choice.requiredResearch.researchId),
            )).limit(1);
          if ((research?.level ?? 0) < choice.requiredResearch.minLevel) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Recherche ${choice.requiredResearch.researchId} niveau ${choice.requiredResearch.minLevel} requis`,
            });
          }
        }

        const outcome = choice.outcome;
```

Add `userResearch` to the existing imports if not already present. Check the top of `anomaly.service.ts` :

```ts
import { anomalies, planets, planetShips, users, userExilium, exiliumLog, flagships, moduleDefinitions, userResearch } from '@exilium/db';
```

Then, in the same method, after the existing outcome application logic but BEFORE the `tx.update(anomalies)` call, add the moduleDrop handler :

```ts
        // V4 : moduleDrop outcome — grant 1 module of requested rarity
        let droppedEventModule: { id: string; name: string; rarity: string; image: string } | null = null;
        if (choice.outcome.moduleDrop) {
          const [flagshipForDrop] = await tx.select({ id: flagships.id, hullId: flagships.hullId })
            .from(flagships).where(eq(flagships.userId, userId)).limit(1);
          if (flagshipForDrop && flagshipForDrop.hullId) {
            const moduleId = await modulesService.rollByRarity({
              flagshipHullId: flagshipForDrop.hullId,
              rarity: choice.outcome.moduleDrop,
              executor: tx as unknown as Database,
            });
            if (moduleId) {
              await modulesService.grantModule(flagshipForDrop.id, moduleId, tx as unknown as Database);
              const [def] = await tx.select({
                id: moduleDefinitions.id, name: moduleDefinitions.name,
                rarity: moduleDefinitions.rarity, image: moduleDefinitions.image,
              }).from(moduleDefinitions).where(eq(moduleDefinitions.id, moduleId)).limit(1);
              if (def) droppedEventModule = def;
            }
          }
        }
```

In the `return` of `resolveEvent`, add `droppedModule: droppedEventModule` :

```ts
        return {
          outcome: 'event_resolved' as const,
          eventId: event.id,
          choiceIndex,
          resolutionText: choice.resolutionText,
          outcomeApplied: newLogEntry.outcomeApplied,
          nextNodeAt: nextNodeAt.toISOString(),
          nextEnemyFp: Math.round(nextEnemy.enemyFP),
          droppedModule: droppedEventModule,  // V4
        };
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck --filter=@exilium/api`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/anomaly-content/anomaly-content.types.ts apps/api/src/modules/modules/modules.service.ts apps/api/src/modules/anomaly/anomaly.service.ts
git commit -m "feat(anomaly): events V4 — moduleDrop outcome + gating hull/research"
```

---

## Task 6 : Audit + désactivation events incompatibles

**Files :**
- Create: `apps/api/src/scripts/audit-anomaly-events.ts`
- Modify: `apps/api/src/modules/anomaly-content/anomaly-events.seed.ts`

- [ ] **Step 1: Write the audit script**

Create `/opt/exilium/apps/api/src/scripts/audit-anomaly-events.ts`:

```ts
/**
 * One-shot audit script for V4 anomaly events.
 *
 * Scans DEFAULT_ANOMALY_EVENTS and reports which events have outcomes
 * incompatible with flagship-only mode (shipsGain / shipsLoss). Outputs
 * a list to stdout — the engineer manually edits the seed file to set
 * `enabled: false` on the incompatible events.
 *
 * Usage:
 *   pnpm --filter @exilium/api exec tsx apps/api/src/scripts/audit-anomaly-events.ts
 */
import { DEFAULT_ANOMALY_EVENTS } from '../modules/anomaly-content/anomaly-events.seed.js';

const incompatible: string[] = [];
const compatible: string[] = [];

for (const event of DEFAULT_ANOMALY_EVENTS) {
  const hasShipChanges = event.choices.some((c) => {
    const out = c.outcome ?? {};
    const gain = out.shipsGain ?? {};
    const loss = out.shipsLoss ?? {};
    return Object.keys(gain).length > 0 || Object.keys(loss).length > 0;
  });
  (hasShipChanges ? incompatible : compatible).push(event.id);
}

console.log(`Total events: ${DEFAULT_ANOMALY_EVENTS.length}`);
console.log(`\nCompatible (${compatible.length}) — keep enabled:`);
for (const id of compatible) console.log(`  ✓ ${id}`);
console.log(`\nIncompatible (${incompatible.length}) — set enabled: false in seed:`);
for (const id of incompatible) console.log(`  ✗ ${id}`);
```

- [ ] **Step 2: Run the audit**

```bash
cd /opt/exilium && pnpm --filter @exilium/api exec tsx apps/api/src/scripts/audit-anomaly-events.ts
```

Expected output : a list of ~10-15 compatible events and ~15-20 incompatible.

- [ ] **Step 3: Apply `enabled: false` to incompatible events in the seed file**

Open `/opt/exilium/apps/api/src/modules/anomaly-content/anomaly-events.seed.ts` and for each incompatible event id from Step 2, add `enabled: false` to its definition.

Pattern :

```ts
// AVANT
{
  id: 'salvage-derelict',
  tier: 'early',
  title: 'Vaisseaux abandonnés',
  description: '...',
  choices: [
    { label: '...', outcome: { shipsGain: { interceptor: 5 } }, ... },
    ...
  ],
},

// APRÈS — add enabled: false above tier
{
  id: 'salvage-derelict',
  enabled: false,  // V4 (2026-05-03) : outcome shipsGain incompatible flagship-only — à refondre en V5
  tier: 'early',
  title: 'Vaisseaux abandonnés',
  description: '...',
  choices: [
    { label: '...', outcome: { shipsGain: { interceptor: 5 } }, ... },
    ...
  ],
},
```

If the audit identifies, say, 17 incompatible events, you add 17 `enabled: false` entries. Be systematic — each event id from the audit output gets one.

- [ ] **Step 4: Verify by re-running the seed parse**

```bash
cd /opt/exilium && pnpm turbo typecheck --filter=@exilium/api
```

Expected: 0 errors.

Optional sanity check : in a `node` REPL or a quick test, parse `DEFAULT_ANOMALY_EVENTS` and count `events.filter(e => e.enabled !== false).length` → should match the compatible count from Step 2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/audit-anomaly-events.ts apps/api/src/modules/anomaly-content/anomaly-events.seed.ts
git commit -m "chore(anomaly): audit + désactivation events incompatibles V4"
```

---

## Task 7 : Frontend — AnomalyEngageModal simplifié

**Files :**
- Modify: `apps/web/src/components/anomaly/AnomalyEngageModal.tsx`

- [ ] **Step 1: Read the current modal**

```bash
cat /opt/exilium/apps/web/src/components/anomaly/AnomalyEngageModal.tsx
```

The current modal (203 lines) has a ship selector. We're going to drastically simplify it.

- [ ] **Step 2: Replace the modal with a flagship-only version**

Overwrite `/opt/exilium/apps/web/src/components/anomaly/AnomalyEngageModal.tsx` with :

```tsx
import { useState } from 'react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { Button } from '@/components/ui/button';
import { Zap, Sparkles, Wrench, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AnomalyEngageModal({ open, onClose }: Props) {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const [confirming, setConfirming] = useState(false);

  const { data: flagship } = trpc.flagship.get.useQuery(undefined, { enabled: open });
  const { data: gameConfig } = useGameConfig();  // wraps trpc.gameConfig.getAll
  const { data: exilium } = trpc.exilium.getBalance.useQuery(undefined, { enabled: open });

  const cost = Number(gameConfig?.universe?.anomaly_entry_cost_exilium) || 5;
  const repairCharges = Number(gameConfig?.universe?.anomaly_repair_charges_per_run) || 3;
  const balance = exilium?.balance ?? 0;
  const insufficientFunds = balance < cost;

  const engageMutation = trpc.anomaly.engage.useMutation({
    onSuccess: () => {
      addToast(`✨ Anomaly engagée — flagship en mission`, 'success');
      utils.anomaly.current.invalidate();
      utils.exilium.getBalance.invalidate();
      utils.flagship.get.invalidate();
      onClose();
    },
    onError: (err) => addToast(err.message ?? 'Engage impossible', 'error'),
  });

  if (!open) return null;
  if (!flagship) return null;

  function handleEngage() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    engageMutation.mutate({ ships: {} });
  }

  const hullName = flagship.hullConfig?.name ?? 'Flagship';
  const effectiveStats = flagship.effectiveStats as Record<string, number | string> | null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Engager une anomalie
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-400 leading-relaxed">
          Votre <strong>{hullName}</strong> part seul dans l'anomalie. Pas d'escorte —
          vos modules équipés et vos charges réparation feront la différence.
        </p>

        <div className="rounded-md bg-panel-light/50 border border-panel-border p-3 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Hull</span><span>{effectiveStats?.hull ?? flagship.hull}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Bouclier</span><span>{effectiveStats?.shield ?? flagship.shield}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Armes</span><span>{effectiveStats?.weapons ?? flagship.weapons}</span></div>
          <div className="flex justify-between items-center pt-1 border-t border-panel-border/50">
            <span className="text-gray-500 flex items-center gap-1.5"><Wrench className="h-3 w-3" /> Charges réparation</span>
            <span>{repairCharges}/{repairCharges}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm border-t border-panel-border pt-3">
          <span className="text-gray-500 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-purple-400" /> Coût
          </span>
          <span className={insufficientFunds ? 'text-red-400 font-bold' : 'font-bold'}>
            {cost} Exilium {insufficientFunds && '(insuffisant)'}
          </span>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleEngage}
            disabled={insufficientFunds || engageMutation.isPending}
          >
            {confirming ? 'Confirmer ?' : engageMutation.isPending ? 'Engage…' : 'Engager'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Verified tRPC query paths** (used in code above) :
- `useGameConfig()` from `@/hooks/useGameConfig` — wraps `trpc.gameConfig.getAll.useQuery()` with cache
- `trpc.exilium.getBalance.useQuery()` — confirmed in `FlagshipProfile.tsx:35`
- `trpc.flagship.get.useQuery()` — confirmed everywhere

- [ ] **Step 3: Verify typecheck on web**

Run: `pnpm turbo typecheck --filter=@exilium/web`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/anomaly/AnomalyEngageModal.tsx
git commit -m "refactor(web): AnomalyEngageModal flagship-only (V4)"
```

---

## Task 8 : Frontend — run view repair charges + indicateur

**Files :**
- Modify: `apps/web/src/pages/Anomaly.tsx`

- [ ] **Step 1: Add repair mutation hook**

In `/opt/exilium/apps/web/src/pages/Anomaly.tsx`, find the section where `advanceMutation` and `retreatMutation` are declared (around line 35-78). Add :

```tsx
  const repairMutation = trpc.anomaly.useRepairCharge.useMutation({
    onSuccess: (data) => {
      addToast(
        `🔧 Hull réparé : ${Math.round(data.newHullPercent * 100)}% (${data.remainingCharges} charges restantes)`,
        'success',
      );
      utils.anomaly.current.invalidate();
    },
    onError: (err) => addToast(err.message ?? 'Réparation impossible', 'error'),
  });
```

- [ ] **Step 2: Add the repair button + charges indicator to the run view**

Find the run view section in `Anomaly.tsx` (look for `RunView` or the active-anomaly JSX block). The hero/header probably already shows `epicChargesCurrent` / `epicChargesMax`. Add a similar block for repair charges + a button.

Search for the EpicActivateButton (added Task 9 sprint 1) — the repair button should sit nearby. Pattern :

```tsx
{/* Around the existing EpicActivateButton */}
{current.repairChargesCurrent > 0 && (() => {
  const flagshipHp = (current.fleet as Record<string, { hullPercent: number }>)?.flagship?.hullPercent ?? 1;
  const canRepair = flagshipHp < 1.0;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => repairMutation.mutate()}
      disabled={!canRepair || repairMutation.isPending}
      title={!canRepair ? 'Flagship à pleine santé' : `Restaure +30% hull (${current.repairChargesCurrent}/${current.repairChargesMax} charges)`}
    >
      🔧 Réparer ({current.repairChargesCurrent}/{current.repairChargesMax})
    </Button>
  );
})()}
```

Place it next to the activate-epic button (search "EpicActivateButton" in the file to find the location).

If the page references `current.repairChargesCurrent` and TS complains because the type doesn't expose it, the issue is that the tRPC return type for `anomaly.current` needs to include the new column. Drizzle's `select()` infers from the schema — since Task 1 added the columns to the Drizzle schema, the inference should be automatic. If TS still complains, restart the TS server (or in Vite, restart the dev server).

- [ ] **Step 3: Verify typecheck on web**

Run: `pnpm turbo typecheck --filter=@exilium/web`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Anomaly.tsx
git commit -m "feat(web): bouton repair charges dans run view (V4)"
```

---

## Task 9 : Frontend — events grayed-out + adapt combat preview/report

**Files :**
- Modify: `apps/web/src/components/anomaly/AnomalyEventCard.tsx`
- Modify: `apps/web/src/components/anomaly/AnomalyCombatPreview.tsx` (smoke check)

- [ ] **Step 1: Read AnomalyEventCard**

```bash
cat /opt/exilium/apps/web/src/components/anomaly/AnomalyEventCard.tsx
```

Identify how choices are currently rendered (likely a `.map()` over `event.choices` with a clickable button per choice).

- [ ] **Step 2: Pre-fetch flagship + research, gris-out non-eligible choices**

In `AnomalyEventCard.tsx`, add data hooks at component top :

```tsx
import { trpc } from '@/trpc';

// Inside the component:
const { data: flagship } = trpc.flagship.get.useQuery();
const { data: researchData } = trpc.research.list.useQuery();
const flagshipHullId = flagship?.hullId ?? null;
// researchData shape : verify via existing usage in `Research.tsx` or
// `FlagshipStatsCard.tsx`. Likely `researchData.researches: Array<{ researchId, level }>`
// or `researchData.userResearches: ...`. Adapt the reduce accordingly :
const researchLevels = (researchData?.researches ?? []).reduce<Record<string, number>>((acc, r) => {
  acc[r.researchId] = r.level ?? 0;
  return acc;
}, {});
```

For each choice, compute eligibility :

```tsx
function isChoiceEligible(choice: { requiredHull?: string; requiredResearch?: { researchId: string; minLevel: number } }) {
  if (choice.requiredHull && flagshipHullId !== choice.requiredHull) return false;
  if (choice.requiredResearch && (researchLevels[choice.requiredResearch.researchId] ?? 0) < choice.requiredResearch.minLevel) return false;
  return true;
}

function getIneligibilityReason(choice: { requiredHull?: string; requiredResearch?: { researchId: string; minLevel: number } }): string | null {
  if (choice.requiredHull && flagshipHullId !== choice.requiredHull) {
    return `Requiert coque ${choice.requiredHull}`;
  }
  if (choice.requiredResearch && (researchLevels[choice.requiredResearch.researchId] ?? 0) < choice.requiredResearch.minLevel) {
    return `Requiert recherche ${choice.requiredResearch.researchId} niv. ${choice.requiredResearch.minLevel}`;
  }
  return null;
}
```

Wrap the choice button rendering :

```tsx
{event.choices.map((choice, i) => {
  const eligible = isChoiceEligible(choice);
  const reason = getIneligibilityReason(choice);
  return (
    <button
      key={i}
      onClick={() => eligible && resolveMutation.mutate({ choiceIndex: i })}
      disabled={!eligible || disabled || resolveMutation.isPending}
      className={`... existing classes ... ${!eligible ? 'opacity-40 cursor-not-allowed' : ''}`}
      title={reason ?? undefined}
    >
      {choice.label}
      {choice.outcome.moduleDrop && (
        <span className="ml-2 text-violet-400 text-xs">+1 module {choice.outcome.moduleDrop}</span>
      )}
      {!eligible && <span className="block text-xs text-amber-400/70 mt-1">🔒 {reason}</span>}
    </button>
  );
})}
```

- [ ] **Step 3: Smoke-check AnomalyCombatPreview for 1-ship rendering**

Open `/opt/exilium/apps/web/src/components/anomaly/AnomalyCombatPreview.tsx`. Verify that the player-side rendering doesn't assume multiple ships (e.g. doesn't crash on a `Object.entries(playerFleet)` that returns just `flagship`).

If the component renders a list of player ships, ensure it gracefully handles the case where the only entry is `flagship`. Most likely no change needed — generic `.map()` over `Object.entries` works for 1 entry too.

If you find an issue, fix it. Else just confirm it works visually post-deploy.

- [ ] **Step 4: Verify typecheck on web**

Run: `pnpm turbo typecheck --filter=@exilium/web`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/anomaly/AnomalyEventCard.tsx
# also AnomalyCombatPreview.tsx if you touched it
git commit -m "feat(web): events V4 — gris-out choix non éligibles + module drop badge"
```

---

## Task 10 : Tests intégration V4

**Files :**
- Create: `apps/api/src/modules/anomaly/__tests__/anomaly.v4.test.ts`

- [ ] **Step 1: Write integration tests for V4 flow**

Create `/opt/exilium/apps/api/src/modules/anomaly/__tests__/anomaly.v4.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createAnomalyService } from '../anomaly.service.js';

// Reuse the mock pattern from anomaly.useRepairCharge.test.ts (queue-based)

function makeMockGameConfig(overrides = {}) {
  return {
    getFullConfig: async () => ({
      universe: {
        anomaly_entry_cost_exilium: 5,
        anomaly_repair_charges_per_run: 3,
        anomaly_repair_charge_hull_pct: 0.30,
        anomaly_node_travel_seconds: 600,
        ...overrides,
      },
      ships: {},
      hulls: {},
    }),
  };
}

describe('anomalyService V4 — engage', () => {
  it('inserts anomaly with flagship-only fleet + repair charges initialized', async () => {
    // Mock the chain: select(no active) → flagshipService.get → select origin planet
    //   → select+update userExilium → setInMission → snapshot loadout
    //   → generateAnomalyEnemy (mocked) → insert anomaly
    // Validate the inserted row has fleet={flagship: {count:1, hullPercent:1}},
    // repairChargesCurrent=3, repairChargesMax=3, exiliumPaid=5

    // (Skeleton — fill in with the queue-based mock pattern from
    //  anomaly.useRepairCharge.test.ts. If full integration mocking is too
    //  heavy, mark this test as `it.todo(...)` and rely on smoke prod.)
    expect(true).toBe(true);  // Replace with actual assertion
  });

  it('refuses if Exilium balance < cost', async () => {
    expect(true).toBe(true);  // Replace
  });

  it('refuses if flagship is not active', async () => {
    expect(true).toBe(true);  // Replace
  });
});

describe('anomalyService V4 — advance wipe', () => {
  it('marks status=wiped and incapacitates flagship when flagship destroyed', async () => {
    expect(true).toBe(true);  // Replace
  });

  it('does NOT refund Exilium on wipe', async () => {
    expect(true).toBe(true);  // Replace
  });

  it('does NOT credit loot resources to planet on wipe', async () => {
    expect(true).toBe(true);  // Replace
  });
});

describe('anomalyService V4 — retreat', () => {
  it('does NOT refund Exilium on voluntary retreat (V4 change)', async () => {
    expect(true).toBe(true);  // Replace
  });

  it('credits loot resources to origin planet on retreat', async () => {
    expect(true).toBe(true);  // Replace
  });
});
```

**Reality check on integration testing:** the existing `anomaly.activateEpic.test.ts` works with a queue-based mock but covers a single method. Mocking the full `engage`/`advance` flow (which calls 8+ DB queries + flagshipService + modulesService + reportService + buildCombatReportData) is a significant effort. Two practical options :

- **Option A (recommended for V4)** : write the test SKELETONS as `it.todo(...)`, rely on prod smoke testing and the existing useRepairCharge tests for the new mutation. Document the gap in the commit message. Faster to ship.
- **Option B** : write full integration tests using a real test DB (vitest globalSetup with a Postgres container). Way more work, but bullet-proof. Defer to a future hardening sprint.

Apply Option A. Replace each `expect(true).toBe(true)` with `it.todo(...)` markers and a comment :

```ts
describe('anomalyService V4 — engage', () => {
  it.todo('inserts anomaly with flagship-only fleet + repair charges initialized');
  it.todo('refuses if Exilium balance < cost');
  it.todo('refuses if flagship is not active');
});

describe('anomalyService V4 — advance wipe', () => {
  it.todo('marks status=wiped and incapacitates flagship when flagship destroyed');
  it.todo('does NOT refund Exilium on wipe');
  it.todo('does NOT credit loot resources to planet on wipe');
});

describe('anomalyService V4 — retreat', () => {
  it.todo('does NOT refund Exilium on voluntary retreat (V4 change)');
  it.todo('credits loot resources to origin planet on retreat');
});
```

This makes the test gap visible in the test report (vitest reports `todo` separately) without blocking CI. Future sprint can implement them properly.

- [ ] **Step 2: Run all anomaly tests**

```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/api -- anomaly
```

Expected : useRepairCharge 5 tests pass + activateEpic 8 tests still pass + 8 todo markers reported but not failing.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/anomaly/__tests__/anomaly.v4.test.ts
git commit -m "test(anomaly): squelette tests V4 (todo markers, smoke prod retenu)"
```

---

## Task 11 : Final lint + tests + push + deploy + smoke + annonce

**Files :** all touched files this sprint.

- [ ] **Step 1: Full lint + typecheck across all packages**

Run :
```bash
cd /opt/exilium && pnpm turbo lint typecheck --filter=@exilium/api --filter=@exilium/admin --filter=@exilium/web --filter=@exilium/game-engine --filter=@exilium/db --filter=@exilium/shared
```

Expected : 0 errors. Pre-existing warnings (any-types) OK if untouched.

If any error mentions `repairCharges` or `forced_retreat`, scan with :
```bash
grep -rn "repairCharges\|forcedRetreat\|forced_retreat" /opt/exilium/apps/{api,web,admin}/src --include="*.ts" --include="*.tsx"
```

Common issues post-Task 3 :
- Front consumers that destructure `result.flagshipLost` or `result.combatOutcome` from the old `forced_retreat` outcome → these fields are gone, replace with derived state from `outcome === 'wiped'`

- [ ] **Step 2: Full test suite**

```bash
cd /opt/exilium && pnpm turbo test --filter=@exilium/api --filter=@exilium/game-engine
```

Expected : All existing tests pass + 5 new `useRepairCharge` tests + 8 todo markers (anomaly.v4.test.ts).

- [ ] **Step 3: Audit no remaining old-API references**

```bash
grep -rn "anomaly\.engage" /opt/exilium/apps/web/src
```
Expected : only the simplified call `anomaly.engage.useMutation` from Task 7. Any other place passing a non-empty `ships` object is fine (input is now optional + ignored server-side).

```bash
grep -rn "trpc\.anomaly\.useRepairCharge\|anomaly\.useRepairCharge" /opt/exilium/apps/web/src
```
Expected : at least 1 hit (Task 8 hook).

- [ ] **Step 4: Push and deploy**

```bash
cd /opt/exilium && git push origin main
/opt/exilium/scripts/deploy.sh
```

Expected : Migration 0070 applied, PM2 reload OK, Caddy reload OK.

- [ ] **Step 5: Run the V4 migration script post-deploy**

The forced retreat of legacy active anomalies needs to run AFTER the SQL migration but BEFORE players can engage new V4 anomalies. The `deploy.sh` script applies the SQL migration (Task 1 Step 1) but doesn't execute the TS migration script. Run it manually :

```bash
cd /opt/exilium && pnpm --filter @exilium/api exec tsx --env-file=/opt/exilium/.env apps/api/src/scripts/migrate-anomaly-v4.ts
```

Expected output :
```
Found N active anomalies to force-retreat.
✓ Force-retreated N anomalies, refunded X Exilium total.
✓ Marker set — script will skip on re-run.
```

If N is 0, no work to do. The marker is set anyway so re-runs are no-op.

⚠️ This script mutates production data (refunds Exilium, returns ships, completes anomalies). The user has standing approval for `deploy.sh` but a one-shot data migration script may need explicit confirmation per the project's safety policy. **Coordinate with the user before running** if unsure.

- [ ] **Step 6: Smoke test in browser**

Open https://exilium-game.com/anomaly :
- If you had an active anomaly pre-deploy, verify it's been retreated (your ships are back, Exilium refunded)
- Click « Engager » : verify the new modal appears (no ship selector, just stats + cost)
- Engage : verify status pages reflect 1 flagship in mission
- After the first node travel (~10 min default OR force advance via admin), the run starts
- Verify the run view shows the new "Réparer (3/3)" button
- Click "Réparer" once : verify the hull bar increases + charges = 2/3
- Try clicking "Réparer" at full hull : verify error toast "Flagship à pleine santé"

If a combat happens and the flagship is destroyed :
- Verify status = `wiped`
- Verify Exilium NOT refunded
- Verify flagship status = `incapacitated` for 30 min
- Verify modules already collected during the run are STILL in inventory (check `/flagship` page)

- [ ] **Step 7: Publish announcement**

Insert via `/admin/announcements` page. Suggested text (max 280 chars) :

> Anomaly V4 ! Le mode passe en flagship-only : votre vaisseau amiral seul, équipé de modules. 3 charges réparation par run. Wipe radical : si le flagship tombe, tout est perdu (Exilium + ressources). Vos anomalies en cours ont été automatiquement clôturées avec compensation.

Set `variant: 'warning'` (changement de mécaniques majeur) and `active: true`.

- [ ] **Step 8: Monitor logs**

```bash
pm2 logs exilium-api --lines 100
```

Look for any errors related to `anomaly`, `repairCharges`, `useRepairCharge`, `engage`, `wipe`. Should be clean for at least 5 minutes.

If errors appear :
- "column repair_charges_current does not exist" → migration didn't apply, re-run `deploy.sh`
- "TRPCError BAD_REQUEST flagship-only mismatch" → some legacy anomaly slipped through migration, re-run `migrate-anomaly-v4.ts`
- "useRepairCharge is not a function" → router/service not deployed properly, restart PM2

---

## Notes — décisions implémentation

1. **Tests intégration `it.todo`** (Task 10) : volontairement non-implémentés pour livrer le sprint dans le budget 14h. Les 5 tests `useRepairCharge` couvrent la nouvelle mutation. Smoke prod (Task 11 Step 6) couvre les paths critiques (engage, wipe, retreat). Sprint hardening futur peut ajouter les vrais tests d'intégration.

2. **`forced_retreat` outcome supprimé** : le front consume potentiellement `result.flagshipLost` / `result.combatOutcome` qui n'existent plus. Si typecheck remonte des erreurs, c'est dans un consumer du résultat `advanceMutation.onSuccess`. Fix : destructurer uniquement `outcome === 'wiped'` ou `outcome === 'survived'` ou `outcome === 'forced_retreat'` (ce dernier n'arrivera plus en V4 mais le type peut le permettre transitoirement — pas grave).

3. **`shipsGain` / `shipsLoss` dans events désactivés** : conservés dans le schéma pour back-compat data. Les events `enabled: false` ne sont jamais picked par `pickEventForTier`, donc leurs outcomes ne s'appliquent jamais. À retirer dans un futur cleanup quand on est sûr qu'aucun deploy ne nécessitera de les ré-activer.

4. **Cosmétique** : `anomaly.combat.ts` garde du code conditionnel pour le cas multi-ship qui n'arrive plus. Cleanup possible mais hors scope (V4 = pivot fonctionnel, pas refacto exhaustif).
