# Codebase Audit Cleanup - Plan d'implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nettoyer la codebase Exilium suite a l'audit complet : corriger les bugs, renforcer la securite, supprimer le code mort, eliminer les doublons, et ameliorer la qualite globale.

**Architecture:** Le travail est organise en 6 phases par priorite decroissante. Chaque phase est independante et produit un commit atomique. Les phases 1-2 sont critiques, les phases 3-6 sont des ameliorations progressives.

**Tech Stack:** TypeScript, React, tRPC, Drizzle ORM, Fastify, Vitest, Tailwind CSS, pnpm monorepo

---

## Phase 1 : Bug critique + Securite critique

### Task 1 : Fixer `computeSlagRate` (4 tests en echec)

**Files:**
- Modify: `packages/game-engine/src/formulas/pve.ts:78-83`

- [ ] **Step 1: Verifier les tests en echec**

Run: `cd packages/game-engine && npx vitest run src/formulas/pve.test.ts`
Expected: 4 tests FAIL dans le bloc `computeSlagRate`

- [ ] **Step 2: Corriger l'implementation**

Dans `packages/game-engine/src/formulas/pve.ts`, remplacer :

```ts
export function computeSlagRate(
  baseSlagRate: number,
  refiningLevel: number,
): number {
  return baseSlagRate / (1 + refiningLevel);
}
```

Par :

```ts
export function computeSlagRate(
  baseSlagRate: number,
  refiningLevel: number,
): number {
  const raw = baseSlagRate * 0.85 ** refiningLevel;
  return Math.min(0.99, Math.max(0, raw));
}
```

- [ ] **Step 3: Verifier que les tests passent**

Run: `cd packages/game-engine && npx vitest run src/formulas/pve.test.ts`
Expected: ALL PASS (216/216)

- [ ] **Step 4: Commit**

```bash
git add packages/game-engine/src/formulas/pve.ts
git commit -m "fix: computeSlagRate uses exponential decay with clamping per test spec"
```

---

### Task 2 : Supprimer le default du JWT_SECRET

**Files:**
- Modify: `apps/api/src/config/env.ts:11`

- [ ] **Step 1: Supprimer le default et augmenter le min**

Dans `apps/api/src/config/env.ts`, remplacer :

```ts
  JWT_SECRET: z.string().min(8).default('change-me-in-production'),
```

Par :

```ts
  JWT_SECRET: z.string().min(32),
```

- [ ] **Step 2: Verifier que le .env local contient bien un JWT_SECRET**

Run: `grep JWT_SECRET apps/api/.env`
Expected: une valeur est definie. Si non, en generer une :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
et l'ajouter au `.env`.

- [ ] **Step 3: Verifier que l'API demarre**

Run: `cd apps/api && npx tsx src/index.ts` (verifier qu'il n'y a pas d'erreur Zod)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/env.ts
git commit -m "fix(security): remove default JWT_SECRET, require min 32 chars"
```

---

### Task 3 : Ajouter validation username (anti-XSS)

**Files:**
- Modify: `apps/api/src/modules/auth/auth.router.ts:15`

- [ ] **Step 1: Ajouter un regex au champ username**

Dans `apps/api/src/modules/auth/auth.router.ts`, remplacer :

```ts
      username: z.string().min(3).max(32),
```

Par :

```ts
      username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, 'Le pseudo ne peut contenir que des lettres, chiffres, tirets et underscores'),
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/auth/auth.router.ts
git commit -m "fix(security): restrict username to alphanumeric + hyphen/underscore"
```

---

## Phase 2 : Index DB manquants

### Task 4 : Ajouter les index critiques

**Files:**
- Modify: `packages/db/src/schema/users.ts:21-27`
- Modify: `packages/db/src/schema/push-subscriptions.ts:4-19`
- Modify: `packages/db/src/schema/fleet-events.ts:47-50`

- [ ] **Step 1: Ajouter index sur `refreshTokens.tokenHash`**

Dans `packages/db/src/schema/users.ts`, ajouter l'import `index` et un callback de table :

```ts
import { pgTable, uuid, varchar, timestamp, boolean, text, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
```

Remplacer :

```ts
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Par :

```ts
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('refresh_tokens_token_hash_idx').on(table.tokenHash),
  index('refresh_tokens_expires_at_idx').on(table.expiresAt),
]);
```

- [ ] **Step 2: Ajouter index sur `pushSubscriptions.userId`**

Dans `packages/db/src/schema/push-subscriptions.ts`, ajouter l'import `index` :

```ts
import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
```

Remplacer :

```ts
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

Par :

```ts
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
}, (table) => [
  index('push_subscriptions_user_idx').on(table.userId),
]);
```

- [ ] **Step 3: Ajouter index sur `fleetEvents.originPlanetId`**

Dans `packages/db/src/schema/fleet-events.ts`, ajouter au tableau d'index existant :

```ts
}, (table) => [
  index('fleet_events_arrival_idx').on(table.arrivalTime).where(sql`status = 'active'`),
  index('fleet_events_user_idx').on(table.userId),
  index('fleet_events_origin_planet_idx').on(table.originPlanetId),
]);
```

- [ ] **Step 4: Generer la migration Drizzle**

Run: `cd packages/db && npx drizzle-kit generate`

- [ ] **Step 5: Commit**

```bash
git add packages/db/
git commit -m "perf(db): add missing indexes on refreshTokens, pushSubscriptions, fleetEvents"
```

---

## Phase 3 : Suppression du code mort

### Task 5 : Supprimer les fichiers entierement inutilises

**Files:**
- Delete: `apps/web/src/components/ui/tooltip.tsx`
- Delete: `apps/web/src/components/ui/table.tsx`
- Delete: `apps/web/src/hooks/useMediaQuery.ts`
- Delete: `apps/web/src/lib/prerequisites.ts`
- Delete: `apps/web/src/lib/entity-details.ts`
- Delete: `fleet-proposals.html`
- Delete: `apps/api/src/modules/universe/` (repertoire vide)

- [ ] **Step 1: Verifier qu'aucun fichier n'importe ces modules**

Run (pour chaque fichier) :
```bash
grep -r "ui/tooltip" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "tooltip.tsx"
grep -r "ui/table" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "table.tsx"
grep -r "useMediaQuery" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "useMediaQuery.ts"
grep -r "lib/prerequisites" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "prerequisites.ts"
grep -r "entity-details" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "entity-details.ts"
```
Expected: aucun resultat pour chaque commande

- [ ] **Step 2: Supprimer les fichiers**

```bash
rm apps/web/src/components/ui/tooltip.tsx
rm apps/web/src/components/ui/table.tsx
rm apps/web/src/hooks/useMediaQuery.ts
rm apps/web/src/lib/prerequisites.ts
rm apps/web/src/lib/entity-details.ts
rm fleet-proposals.html
rmdir apps/api/src/modules/universe
```

- [ ] **Step 3: Verifier que le build passe**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused components, hooks, and files identified by audit"
```

---

### Task 6 : Supprimer la fonction deprecated `buildCombatStats`

**Files:**
- Modify: `apps/api/src/modules/fleet/fleet.types.ts`

- [ ] **Step 1: Identifier et supprimer `buildCombatStats`**

Lire `apps/api/src/modules/fleet/fleet.types.ts`, trouver la fonction `buildCombatStats` (marquee `@deprecated`) et la supprimer entierement.

- [ ] **Step 2: Verifier qu'aucun import n'existe**

Run: `grep -r "buildCombatStats" apps/ packages/ --include="*.ts" --include="*.tsx"`
Expected: aucun resultat

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/fleet/fleet.types.ts
git commit -m "chore: remove deprecated buildCombatStats function"
```

---

### Task 7 : Supprimer les exports morts du game-engine

**Files:**
- Modify: `packages/game-engine/src/formulas/market.ts:27-37` (supprimer `totalPayment`)
- Modify: `packages/game-engine/src/formulas/combat.ts:26` (supprimer `researchBonusPerLevel` de `CombatConfig` si inutilise)

- [ ] **Step 1: Supprimer `totalPayment` de market.ts**

La fonction `totalPayment` n'est importee nulle part. La supprimer de `packages/game-engine/src/formulas/market.ts`.

- [ ] **Step 2: Verifier que le build game-engine passe**

Run: `cd packages/game-engine && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/
git commit -m "chore: remove unused totalPayment export from game-engine"
```

Note: Les types non importes externement (`BuildingCostDef`, `ResearchCostDef`, `UnitCostDef`, `PlanetResources`, `CombatSideStats`, `SpyReportVisibility`, `AttackDetectionResult`, `AttackVisibility`, `ResourceAmounts`, `MultiResourceExtraction`, `PrerequisiteResult`, `PrerequisiteDef`, `BuildingDef`, `ResearchDef`, `UnitDef`, `FlagshipBaseStats`) sont conserves car ils documentent les interfaces internes et pourraient etre utilises par de futurs consommateurs.

Les constantes `DEFAULT_PRODUCTION_CONFIG`, `DEFAULT_FLEET_CONFIG`, `FLAGSHIP_DEFAULT_STATS` sont conservees car elles servent de valeurs par defaut dans les parametres de fonctions.

---

### Task 8 : Supprimer les exports morts de shared

**Files:**
- Modify: `packages/shared/src/types/coordinates.ts:7-9`
- Modify: `packages/shared/src/types/missions.ts`

- [ ] **Step 1: Verifier que `formatCoordinates`, `FleetPhase`, `FleetStatus` ne sont pas utilises**

Run:
```bash
grep -r "formatCoordinates" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v "coordinates.ts"
grep -r "FleetPhase" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v "missions.ts"
grep -r "FleetStatus" apps/ packages/ --include="*.ts" --include="*.tsx" | grep -v "missions.ts"
```

- [ ] **Step 2: Supprimer `formatCoordinates`**

Dans `packages/shared/src/types/coordinates.ts`, supprimer :

```ts
export function formatCoordinates(coords: Coordinates): string {
  return `[${coords.galaxy}:${coords.system}:${coords.position}]`;
}
```

- [ ] **Step 3: Supprimer `FleetPhase` et `FleetStatus`**

Dans `packages/shared/src/types/missions.ts`, supprimer les enums `FleetPhase` et `FleetStatus`.

- [ ] **Step 4: Verifier le build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/
git commit -m "chore: remove unused exports from shared (formatCoordinates, FleetPhase, FleetStatus)"
```

---

## Phase 4 : Elimination des doublons (extraction vers shared/game-engine)

### Task 9 : Extraire `toKebab` et `AssetCategory` dans `packages/shared`

**Files:**
- Create: `packages/shared/src/utils/assets.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/lib/assets.ts`
- Modify: `apps/api/src/lib/image-processing.ts`
- Modify: `apps/admin/src/components/ui/AdminImageUpload.tsx`

- [ ] **Step 1: Creer le fichier shared**

Creer `packages/shared/src/utils/assets.ts` :

```ts
export type AssetCategory = 'buildings' | 'research' | 'ships' | 'defenses' | 'planets' | 'flagships';

/** Convert camelCase ID to kebab-case filename */
export function toKebab(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
```

- [ ] **Step 2: Exporter depuis shared/index.ts**

Ajouter dans `packages/shared/src/index.ts` :

```ts
export * from './utils/assets.js';
```

- [ ] **Step 3: Mettre a jour les consommateurs**

Dans `apps/web/src/lib/assets.ts`, remplacer :

```ts
export type AssetCategory = 'buildings' | 'research' | 'ships' | 'defenses';
```

Par :

```ts
import { toKebab } from '@exilium/shared';
export type { AssetCategory } from '@exilium/shared';
```

Et supprimer la fonction locale `toKebab` (lignes 10-13).

Dans `apps/api/src/lib/image-processing.ts`, remplacer le type local `AssetCategory` et la fonction locale `toKebab` par :

```ts
import { toKebab, type AssetCategory } from '@exilium/shared';
```

Dans `apps/admin/src/components/ui/AdminImageUpload.tsx`, remplacer le type local `AssetCategory` et la fonction locale `toKebab` par :

```ts
import { toKebab, type AssetCategory } from '@exilium/shared';
```

- [ ] **Step 4: Verifier le build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/ apps/web/src/lib/assets.ts apps/api/src/lib/image-processing.ts apps/admin/src/components/ui/AdminImageUpload.tsx
git commit -m "refactor: extract toKebab and AssetCategory to packages/shared"
```

---

### Task 10 : Extraire `buildProductionConfig` dans `packages/game-engine`

**Files:**
- Create: `packages/game-engine/src/formulas/production-config.ts`
- Modify: `packages/game-engine/src/index.ts`
- Modify: `apps/web/src/lib/production-config.ts`
- Modify: `apps/api/src/lib/production-config.ts`

- [ ] **Step 1: Creer le fichier dans game-engine**

Creer `packages/game-engine/src/formulas/production-config.ts` :

```ts
import type { ProductionConfig } from './resources.js';

export function buildProductionConfig(gameConfig: { production: Record<string, any>; universe: Record<string, unknown> }): ProductionConfig {
  const mc = gameConfig.production['mineraiMine'];
  const sc = gameConfig.production['siliciumMine'];
  const hc = gameConfig.production['hydrogeneSynth'];
  const sp = gameConfig.production['solarPlant'];
  return {
    minerai: { baseProduction: mc?.baseProduction ?? 30, exponentBase: mc?.exponentBase ?? 1.1 },
    silicium: { baseProduction: sc?.baseProduction ?? 20, exponentBase: sc?.exponentBase ?? 1.1 },
    hydrogene: {
      baseProduction: hc?.baseProduction ?? 10, exponentBase: hc?.exponentBase ?? 1.1,
      tempCoeffA: hc?.tempCoeffA ?? 1.36, tempCoeffB: hc?.tempCoeffB ?? 0.004,
    },
    solar: { baseProduction: sp?.baseProduction ?? 20, exponentBase: sp?.exponentBase ?? 1.1 },
    mineraiEnergy: { baseConsumption: mc?.energyConsumption ?? 10, exponentBase: mc?.exponentBase ?? 1.1 },
    siliciumEnergy: { baseConsumption: sc?.energyConsumption ?? 10, exponentBase: sc?.exponentBase ?? 1.1 },
    hydrogeneEnergy: { baseConsumption: hc?.energyConsumption ?? 20, exponentBase: hc?.exponentBase ?? 1.1 },
    storage: {
      storageBase: Number(gameConfig.universe.storage_base) || 5000,
      coeffA: Number(gameConfig.universe.storage_coeff_a) || 2.5,
      coeffB: Number(gameConfig.universe.storage_coeff_b) || 20,
      coeffC: Number(gameConfig.universe.storage_coeff_c) || 33,
    },
    satellite: {
      homePlanetEnergy: Number(gameConfig.universe.satellite_home_planet_energy) || 50,
      baseDivisor: Number(gameConfig.universe.satellite_base_divisor) || 4,
      baseOffset: Number(gameConfig.universe.satellite_base_offset) || 20,
    },
  };
}
```

- [ ] **Step 2: Exporter depuis game-engine/index.ts**

Ajouter dans `packages/game-engine/src/index.ts` :

```ts
export * from './formulas/production-config.js';
```

- [ ] **Step 3: Remplacer les deux copies locales**

Remplacer le contenu de `apps/web/src/lib/production-config.ts` par :

```ts
export { buildProductionConfig } from '@exilium/game-engine';
```

Remplacer le contenu de `apps/api/src/lib/production-config.ts` par :

```ts
export { buildProductionConfig } from '@exilium/game-engine';
```

- [ ] **Step 4: Verifier le build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/ apps/web/src/lib/production-config.ts apps/api/src/lib/production-config.ts
git commit -m "refactor: extract buildProductionConfig to packages/game-engine"
```

---

### Task 11 : Extraire `timeAgo` dans `apps/web/src/lib/format.ts`

**Files:**
- Modify: `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/lib/game-events.ts`
- Modify: `apps/web/src/pages/FeedbackDetail.tsx`
- Modify: `apps/web/src/components/feedback/FeedbackCard.tsx`
- Modify: `apps/web/src/components/reports/ReportCard.tsx`
- Modify: `apps/admin/src/pages/Feedbacks.tsx`

- [ ] **Step 1: Ajouter `timeAgo` dans format.ts**

Dans `apps/web/src/lib/format.ts`, ajouter a la fin :

```ts
export function timeAgo(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "a l'instant";
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}
```

- [ ] **Step 2: Remplacer les 4 copies locales dans apps/web**

Dans chaque fichier (`FeedbackDetail.tsx`, `FeedbackCard.tsx`, `ReportCard.tsx`), supprimer la fonction locale `timeAgo` et ajouter :

```ts
import { timeAgo } from '@/lib/format';
```

Dans `game-events.ts`, supprimer `formatRelativeTime` et importer `timeAgo` a la place, en remplacant les appels a `formatRelativeTime` par `timeAgo`.

- [ ] **Step 3: Pour admin, creer un import similaire ou copier la version avec format court**

Dans `apps/admin/src/pages/Feedbacks.tsx`, si admin a son propre format sans "il y a" prefix, garder une version locale. Sinon, importer.

- [ ] **Step 4: Verifier le build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format.ts apps/web/src/lib/game-events.ts apps/web/src/pages/FeedbackDetail.tsx apps/web/src/components/feedback/FeedbackCard.tsx apps/web/src/components/reports/ReportCard.tsx
git commit -m "refactor: deduplicate timeAgo into apps/web/src/lib/format.ts"
```

---

### Task 12 : Supprimer le `formatDuration` duplique dans `FleetSummaryBar.tsx`

**Files:**
- Modify: `apps/web/src/components/fleet/FleetSummaryBar.tsx`

- [ ] **Step 1: Remplacer la copie locale par un import**

Dans `FleetSummaryBar.tsx`, supprimer la fonction locale `formatDuration` (ligne 27) et ajouter :

```ts
import { formatDuration } from '@/lib/format';
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/fleet/FleetSummaryBar.tsx
git commit -m "refactor: import formatDuration from lib/format instead of local copy"
```

---

### Task 13 : Extraire `COMBAT_CATEGORIES` et `buildCombatConfig` partagees

**Files:**
- Create: `packages/game-engine/src/formulas/combat-config.ts`
- Modify: `packages/game-engine/src/index.ts`
- Modify: `apps/web/src/lib/combat-helpers.ts`
- Modify: `apps/api/src/modules/fleet/combat.helpers.ts`

- [ ] **Step 1: Creer `combat-config.ts` dans game-engine**

Creer `packages/game-engine/src/formulas/combat-config.ts` :

```ts
import type { CombatConfig, ShipCategory } from './combat.js';

export const COMBAT_CATEGORIES: ShipCategory[] = [
  { id: 'light', name: 'Leger', targetable: true, targetOrder: 1 },
  { id: 'medium', name: 'Moyen', targetable: true, targetOrder: 2 },
  { id: 'heavy', name: 'Lourd', targetable: true, targetOrder: 3 },
  { id: 'support', name: 'Support', targetable: false, targetOrder: 4 },
];

export function buildCombatConfig(
  universe: Record<string, unknown>,
  overrides?: Partial<CombatConfig>,
): CombatConfig {
  return {
    maxRounds: Number(universe['combat_max_rounds']) || 4,
    debrisRatio: Number(universe['combat_debris_ratio']) || 0.3,
    defenseRepairRate: Number(universe['combat_defense_repair_rate']) || 0.7,
    pillageRatio: Number(universe['combat_pillage_ratio']) || 0.33,
    minDamagePerHit: Number(universe['combat_min_damage_per_hit']) || 1,
    researchBonusPerLevel: Number(universe['combat_research_bonus_per_level']) || 0.1,
    categories: COMBAT_CATEGORIES,
    ...overrides,
  };
}
```

- [ ] **Step 2: Exporter depuis game-engine/index.ts**

Ajouter :

```ts
export * from './formulas/combat-config.js';
```

- [ ] **Step 3: Mettre a jour les consommateurs**

Dans `apps/web/src/lib/combat-helpers.ts`, supprimer le `COMBAT_CATEGORIES` local et la fonction `buildCombatConfig` locale, les importer depuis `@exilium/game-engine`.

Dans `apps/api/src/modules/fleet/combat.helpers.ts`, supprimer le `COMBAT_CATEGORIES` local et la fonction `buildCombatConfig` locale, les importer depuis `@exilium/game-engine`. Adapter l'appel : `buildCombatConfig(config.universe, overrides)` au lieu de `buildCombatConfig(config, overrides)`.

- [ ] **Step 4: Verifier le build et les tests**

Run: `pnpm build && pnpm test`

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/ apps/web/src/lib/combat-helpers.ts apps/api/src/modules/fleet/combat.helpers.ts
git commit -m "refactor: extract COMBAT_CATEGORIES and buildCombatConfig to game-engine"
```

---

### Task 14 : Fixer la duplication `Coordinates` dans game-engine

**Files:**
- Modify: `packages/game-engine/src/formulas/fleet.ts:9-13`
- Modify: `packages/game-engine/package.json` (si `@exilium/shared` n'est pas deja une dependance)

- [ ] **Step 1: Verifier si shared est deja une dependance de game-engine**

Run: `grep "@exilium/shared" packages/game-engine/package.json`

- [ ] **Step 2: Si non, ajouter la dependance**

Run: `cd packages/game-engine && pnpm add @exilium/shared`

- [ ] **Step 3: Remplacer l'interface locale**

Dans `packages/game-engine/src/formulas/fleet.ts`, supprimer l'interface locale `Coordinates` (lignes 9-13) et ajouter :

```ts
import type { Coordinates } from '@exilium/shared';
```

- [ ] **Step 4: Verifier le build et les tests**

Run: `cd packages/game-engine && npx tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/
git commit -m "refactor: import Coordinates from @exilium/shared instead of local copy"
```

---

### Task 15 : Dedupliquer `shipCost`/`defenseCost` et `shipTime`/`defenseTime`

**Files:**
- Modify: `packages/game-engine/src/formulas/shipyard-cost.ts`

- [ ] **Step 1: Fusionner en fonctions uniques**

Remplacer le contenu de `packages/game-engine/src/formulas/shipyard-cost.ts` par :

```ts
import type { ResourceCost } from './building-cost.js';

export interface UnitCostDef {
  cost: { minerai: number; silicium: number; hydrogene: number };
}

export function unitCost(def: UnitCostDef): ResourceCost {
  return { ...def.cost };
}

/** @deprecated Use unitCost instead */
export const shipCost = unitCost;
/** @deprecated Use unitCost instead */
export const defenseCost = unitCost;

/**
 * @param bonusMultiplier - result of resolveBonus for build time
 */
export function unitTime(def: UnitCostDef, bonusMultiplier: number, timeDivisor: number = 2500): number {
  const seconds = Math.floor(((def.cost.minerai + def.cost.silicium) / timeDivisor) * 3600 * bonusMultiplier);
  return Math.max(1, seconds);
}

/** @deprecated Use unitTime instead */
export const shipTime = unitTime;
/** @deprecated Use unitTime instead */
export const defenseTime = unitTime;
```

- [ ] **Step 2: Verifier que le build et les tests passent**

Run: `pnpm build && pnpm test`

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/src/formulas/shipyard-cost.ts
git commit -m "refactor: deduplicate shipCost/defenseCost and shipTime/defenseTime into unitCost/unitTime"
```

---

## Phase 5 : Nettoyage CSS/Tailwind

### Task 16 : Supprimer les classes et config CSS inutilisees

**Files:**
- Modify: `apps/web/src/styles/global.css:124-126`
- Modify: `apps/web/tailwind.config.js:45,56,67-69,96-101,104`
- Modify: `apps/web/src/styles/animations.css:1-29`

- [ ] **Step 1: Supprimer `.touch-target` de global.css**

Dans `apps/web/src/styles/global.css`, supprimer :

```css
  .touch-target {
    @apply min-h-[44px] min-w-[44px];
  }
```

- [ ] **Step 2: Supprimer les entries inutilisees de tailwind.config.js**

Dans `apps/web/tailwind.config.js` :

- Supprimer la ligne `'accent-glow': 'hsl(var(--accent-glow) / <alpha-value>)',` (ligne 45)
- Supprimer `'slide-in-left': 'slideInLeft 0.3s ease-out',` de `animation` (ligne 56)
- Supprimer le bloc `slideInLeft` des `keyframes` (lignes 67-69)
- Supprimer tout le bloc `boxShadow` (lignes 96-101)
- Supprimer `'safe-top': 'env(safe-area-inset-top)',` de `spacing` (ligne 104)

- [ ] **Step 3: Supprimer les keyframes dupliquees de animations.css**

Dans `apps/web/src/styles/animations.css`, supprimer les keyframes qui sont deja definies dans `tailwind.config.js` (lignes 1-29) : `fadeIn`, `slideInLeft`, `slideUp`, `pulseGlow`, `skeletonShimmer`, `slideInRight`.

Garder uniquement les keyframes specifiques CSS (a partir de ligne 31) : `planet-rotate`, `asteroid-drift`, `asteroid-spin`, `asteroid-dust`, `asteroid-sparkle`, `asteroid-trail` et les classes `.planet-dot`, `.asteroid-sparkle`, `.asteroid-trail`, `.asteroid-glow`.

- [ ] **Step 4: Verifier visuellement que le site fonctionne**

Run: `cd apps/web && pnpm dev` et verifier les animations.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles/ apps/web/tailwind.config.js
git commit -m "chore: remove unused CSS classes, Tailwind config entries, and duplicate keyframes"
```

---

## Phase 6 : Ameliorations qualite (non-bloquantes)

### Task 17 : Remplacer les `.catch(() => {})` par des warnings

**Files:**
- Tous les fichiers avec `.catch(() => {})` dans `apps/api/src/modules/`

- [ ] **Step 1: Rechercher tous les occurrences**

Run: `grep -rn "\.catch(() => {})" apps/api/src/ --include="*.ts"`

- [ ] **Step 2: Remplacer chaque occurrence par**

```ts
.catch((e) => console.warn('[side-effect] failed:', e))
```

Adapter le label `[side-effect]` selon le contexte (ex: `[daily-quest]`, `[exilium-drop]`, `[notification]`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/
git commit -m "fix: replace silently swallowed errors with console.warn"
```

---

### Task 18 : Corriger le retour HTTP 401 -> 403 pour acces admin

**Files:**
- Modify: `apps/api/src/routes/asset-upload.route.ts`

- [ ] **Step 1: Rechercher les 401 qui devraient etre 403**

Run: `grep -n "401" apps/api/src/routes/asset-upload.route.ts`

- [ ] **Step 2: Remplacer `reply.status(401).send({ error: 'Admin access required' })` par `reply.status(403)`**

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/asset-upload.route.ts
git commit -m "fix: return 403 Forbidden instead of 401 for admin access denied"
```

---

### Task 19 : Supprimer `humanize()` duplique dans entity-names/entity-details

Note: Si `entity-details.ts` a ete supprime a la Task 5, cette tache est deja resolue. Verifier et skip si c'est le cas.

---

### Task 20 : Nettoyer les scripts one-shot (optionnel)

**Files:**
- Delete (optionnel): `scripts/optimize-images.ts`
- Les scripts DB dans `packages/db/src/scripts/` sont deja exclus du tsconfig, les laisser comme archive.

- [ ] **Step 1: Decider avec l'utilisateur si les scripts doivent etre gardes ou supprimes**

Ces scripts sont des one-shot deja executes. Ils peuvent etre utiles comme reference ou archive.

---

## Recapitulatif des commits attendus

| # | Message | Phase |
|---|---------|-------|
| 1 | `fix: computeSlagRate uses exponential decay with clamping per test spec` | 1 |
| 2 | `fix(security): remove default JWT_SECRET, require min 32 chars` | 1 |
| 3 | `fix(security): restrict username to alphanumeric + hyphen/underscore` | 1 |
| 4 | `perf(db): add missing indexes on refreshTokens, pushSubscriptions, fleetEvents` | 2 |
| 5 | `chore: remove unused components, hooks, and files identified by audit` | 3 |
| 6 | `chore: remove deprecated buildCombatStats function` | 3 |
| 7 | `chore: remove unused totalPayment export from game-engine` | 3 |
| 8 | `chore: remove unused exports from shared` | 3 |
| 9 | `refactor: extract toKebab and AssetCategory to packages/shared` | 4 |
| 10 | `refactor: extract buildProductionConfig to packages/game-engine` | 4 |
| 11 | `refactor: deduplicate timeAgo into apps/web/src/lib/format.ts` | 4 |
| 12 | `refactor: import formatDuration from lib/format instead of local copy` | 4 |
| 13 | `refactor: extract COMBAT_CATEGORIES and buildCombatConfig to game-engine` | 4 |
| 14 | `refactor: import Coordinates from @exilium/shared instead of local copy` | 4 |
| 15 | `refactor: deduplicate shipCost/defenseCost and shipTime/defenseTime` | 4 |
| 16 | `chore: remove unused CSS classes, Tailwind config, and duplicate keyframes` | 5 |
| 17 | `fix: replace silently swallowed errors with console.warn` | 5 |
| 18 | `fix: return 403 Forbidden instead of 401 for admin access denied` | 6 |
