> 🗄️ **ARCHIVÉ** — Le système de Talents a été retiré le 2026-05-03. Voir [`../specs/2026-05-03-talents-removal-design.md`](../specs/2026-05-03-talents-removal-design.md) pour la migration.

---

# Phase 2 — Arbre de talents du Flagship — Plan d'implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementer l'arbre de talents du flagship — systeme de progression WoW-style ou le joueur depense de l'Exilium pour debloquer des talents qui ameliorent son vaisseau amiral et impactent son gameplay global.

**Architecture:** 100% data-driven. Les talents sont definis dans la game config (seed). Le code fournit des handlers d'effets generiques (`modify_stat`, `global_bonus`, `planet_bonus`, `timed_buff`). Deux nouvelles tables DB (`flagship_talents`, `flagship_cooldowns`) + un service dedie + router tRPC + page frontend avec arbre visuel.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, tRPC, Zod, React, TanStack Query, Tailwind CSS

**Spec :** `docs/superpowers/specs/2026-03-27-flagship-talent-tree-design.md`

---

## File Structure

### Nouvelles tables DB
- `packages/db/src/schema/flagship-talents.ts` — table `flagship_talents` (flagshipId, talentId, currentRank)
- `packages/db/src/schema/flagship-cooldowns.ts` — table `flagship_cooldowns` (flagshipId, talentId, activatedAt, expiresAt, cooldownEnds)

### Game config (tables + seed)
- `packages/db/src/schema/game-config.ts` — ajout tables `talent_branch_definitions`, `talent_definitions`
- `packages/db/src/seed-game-config.ts` — ajout des 3 branches + 33 talents

### Backend
- `apps/api/src/modules/flagship/talent.service.ts` — service talents (invest, respec, reset, activate, bonus queries)
- `apps/api/src/modules/flagship/talent.router.ts` — router tRPC talents

### Frontend
- `apps/web/src/pages/FlagshipTalents.tsx` — page principale avec arbre visuel

### Modifications
- `packages/db/src/schema/index.ts` — exports des nouvelles tables
- `apps/api/src/modules/admin/game-config.service.ts` — chargement des talents dans GameConfig
- `apps/api/src/modules/flagship/flagship.service.ts` — get() enrichi avec bonus talents
- `apps/api/src/trpc/app-router.ts` — wiring du talent service + router
- `apps/web/src/trpc.ts` ou router — ajout route /flagship/talents

---

## Tache 1 — Schema DB

### Objectif

Creer les tables `flagship_talents`, `flagship_cooldowns`, `talent_branch_definitions`, `talent_definitions` + mettre a jour les exports.

### Fichiers

- Creer : `packages/db/src/schema/flagship-talents.ts`
- Creer : `packages/db/src/schema/flagship-cooldowns.ts`
- Modifier : `packages/db/src/schema/game-config.ts`
- Modifier : `packages/db/src/schema/index.ts`

- [ ] **Step 1 : Creer la table flagship_talents**

```typescript
// packages/db/src/schema/flagship-talents.ts
import { pgTable, uuid, varchar, smallint, primaryKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { flagships } from './flagships.js';

export const flagshipTalents = pgTable('flagship_talents', {
  flagshipId: uuid('flagship_id')
    .notNull()
    .references(() => flagships.id, { onDelete: 'cascade' }),
  talentId: varchar('talent_id', { length: 64 }).notNull(),
  currentRank: smallint('current_rank').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.flagshipId, table.talentId] }),
  check('check_rank_positive', sql`${table.currentRank} >= 0`),
]);
```

- [ ] **Step 2 : Creer la table flagship_cooldowns**

```typescript
// packages/db/src/schema/flagship-cooldowns.ts
import { pgTable, uuid, varchar, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { flagships } from './flagships.js';

export const flagshipCooldowns = pgTable('flagship_cooldowns', {
  flagshipId: uuid('flagship_id')
    .notNull()
    .references(() => flagships.id, { onDelete: 'cascade' }),
  talentId: varchar('talent_id', { length: 64 }).notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  cooldownEnds: timestamp('cooldown_ends', { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.flagshipId, table.talentId] }),
]);
```

- [ ] **Step 3 : Ajouter les tables de definition de talents dans game-config.ts**

Ajouter a la fin de `packages/db/src/schema/game-config.ts` :

```typescript
// ── Talent Branch Definitions ──

export const talentBranchDefinitions = pgTable('talent_branch_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  color: varchar('color', { length: 32 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ── Talent Definitions ──

export const talentDefinitions = pgTable('talent_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  branchId: varchar('branch_id', { length: 64 }).notNull().references(() => talentBranchDefinitions.id, { onDelete: 'cascade' }),
  tier: smallint('tier').notNull(),
  position: varchar('position', { length: 16 }).notNull(), // 'left' | 'center' | 'right'
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  maxRanks: smallint('max_ranks').notNull().default(1),
  prerequisiteId: varchar('prerequisite_id', { length: 64 }).references(() => talentDefinitions.id, { onDelete: 'set null' }),
  effectType: varchar('effect_type', { length: 32 }).notNull(), // 'modify_stat' | 'global_bonus' | 'planet_bonus' | 'timed_buff' | 'unlock'
  effectParams: jsonb('effect_params').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});
```

- [ ] **Step 4 : Mettre a jour les exports dans index.ts**

Ajouter dans `packages/db/src/schema/index.ts` :

```typescript
export * from './flagship-talents.js';
export * from './flagship-cooldowns.js';
```

- [ ] **Step 5 : Generer et appliquer la migration**

```bash
cd packages/db && pnpm drizzle-kit generate && pnpm drizzle-kit push
```

- [ ] **Step 6 : Commit**

```bash
git add packages/db/src/schema/flagship-talents.ts packages/db/src/schema/flagship-cooldowns.ts packages/db/src/schema/game-config.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add talent tree schema (flagship_talents, flagship_cooldowns, talent definitions)"
```

---

## Tache 2 — Seed game config

### Objectif

Ajouter les 3 branches et les 33 talents dans le seed, mettre a jour le GameConfig pour charger les talents.

### Fichiers

- Modifier : `packages/db/src/seed-game-config.ts`
- Modifier : `apps/api/src/modules/admin/game-config.service.ts`

- [ ] **Step 1 : Ajouter les donnees de talent dans le seed**

Ajouter dans `packages/db/src/seed-game-config.ts`, apres les imports existants, importer les nouvelles tables :

```typescript
import { talentBranchDefinitions, talentDefinitions } from './schema/game-config.js';
```

Puis ajouter les constantes de donnees (avant la fonction `seed()`) :

```typescript
// ── Talent Branches ──

const TALENT_BRANCHES = [
  { id: 'combattant', name: 'Combattant', description: 'Puissance de feu & domination militaire', color: '#ff6b6b', sortOrder: 0 },
  { id: 'explorateur', name: 'Explorateur', description: 'Vitesse, mobilité & découverte', color: '#4ecdc4', sortOrder: 1 },
  { id: 'negociant', name: 'Négociant', description: 'Cargo, commerce & économie', color: '#ffd93d', sortOrder: 2 },
];

// ── Talent Definitions ──

const TALENT_DEFINITIONS = [
  // === COMBATTANT ===
  // Tier 1
  { id: 'combat_weapons', branchId: 'combattant', tier: 1, position: 'left', name: 'Armes renforcées', description: '+2 armes par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'weapons', perRank: 2 }, sortOrder: 0 },
  { id: 'combat_armor', branchId: 'combattant', tier: 1, position: 'center', name: 'Blindage réactif', description: '+2 blindage par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'baseArmor', perRank: 2 }, sortOrder: 1 },
  { id: 'combat_shield', branchId: 'combattant', tier: 1, position: 'right', name: 'Boucliers amplifiés', description: '+3 bouclier par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'shield', perRank: 3 }, sortOrder: 2 },
  // Tier 2
  { id: 'combat_shots', branchId: 'combattant', tier: 2, position: 'left', name: 'Tirs multiples', description: '+1 tir par rang', maxRanks: 2, prerequisiteId: 'combat_weapons', effectType: 'modify_stat', effectParams: { stat: 'shotCount', perRank: 1 }, sortOrder: 3 },
  { id: 'combat_war_march', branchId: 'combattant', tier: 2, position: 'center', name: 'Marche de guerre', description: '+1 vaisseau militaire en construction simultanée', maxRanks: 1, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'military_parallel_build', perRank: 1 }, sortOrder: 4 },
  { id: 'combat_hull', branchId: 'combattant', tier: 2, position: 'right', name: 'Coque renforcée', description: '+5 coque par rang', maxRanks: 3, prerequisiteId: 'combat_shield', effectType: 'modify_stat', effectParams: { stat: 'hull', perRank: 5 }, sortOrder: 5 },
  // Tier 3
  { id: 'combat_garrison', branchId: 'combattant', tier: 3, position: 'left', name: 'Garnison', description: '+10% défense planétaire par rang', maxRanks: 2, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'defense_power', perRank: 0.10 }, sortOrder: 6 },
  { id: 'combat_assault', branchId: 'combattant', tier: 3, position: 'center', name: 'Assaut coordonné', description: '+25% dégâts des flottes depuis cette planète pendant 1h', maxRanks: 1, prerequisiteId: null, effectType: 'timed_buff', effectParams: { key: 'fleet_damage_boost', multiplier: 1.25, durationSeconds: 3600, cooldownSeconds: 86400 }, sortOrder: 7 },
  { id: 'combat_fury', branchId: 'combattant', tier: 3, position: 'right', name: 'Furie', description: 'x1.25 dégâts du flagship par rang', maxRanks: 2, prerequisiteId: 'combat_shots', effectType: 'modify_stat', effectParams: { stat: 'damageMultiplier', perRank: 0.25 }, sortOrder: 8 },
  // Tier 4
  { id: 'combat_master', branchId: 'combattant', tier: 4, position: 'left', name: "Maître d'armes", description: '-15% temps de construction vaisseaux militaires', maxRanks: 1, prerequisiteId: 'combat_garrison', effectType: 'global_bonus', effectParams: { key: 'military_build_time_reduction', perRank: 0.15 }, sortOrder: 9 },
  { id: 'combat_arsenal', branchId: 'combattant', tier: 4, position: 'right', name: 'Arsenal avancé', description: '+20% puissance des défenses planétaires', maxRanks: 1, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'defense_power', perRank: 0.20 }, sortOrder: 10 },
  // Tier 5 — Capstone
  { id: 'combat_supremacy', branchId: 'combattant', tier: 5, position: 'center', name: 'Suprématie', description: '+10% stats combat du flagship par type de vaisseau différent dans la flotte', maxRanks: 1, prerequisiteId: 'combat_master', effectType: 'modify_stat', effectParams: { stat: 'combatBonusPerShipType', perRank: 0.10 }, sortOrder: 11 },

  // === EXPLORATEUR ===
  // Tier 1
  { id: 'explore_speed', branchId: 'explorateur', tier: 1, position: 'left', name: 'Réacteurs optimisés', description: '+10% vitesse flagship par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'speedPercent', perRank: 0.10 }, sortOrder: 0 },
  { id: 'explore_fuel', branchId: 'explorateur', tier: 1, position: 'center', name: 'Économiseur', description: '-1 consommation carburant par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'fuelConsumption', perRank: -1 }, sortOrder: 1 },
  { id: 'explore_scanners', branchId: 'explorateur', tier: 1, position: 'right', name: 'Scanners longue portée', description: '+1 sonde d\'espionnage par rang', maxRanks: 2, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'spy_probe_bonus', perRank: 1 }, sortOrder: 2 },
  // Tier 2
  { id: 'explore_impulse', branchId: 'explorateur', tier: 2, position: 'left', name: 'Propulsion impulsion', description: 'Change la propulsion du flagship en impulsion', maxRanks: 1, prerequisiteId: 'explore_speed', effectType: 'unlock', effectParams: { key: 'drive_impulse' }, sortOrder: 3 },
  { id: 'explore_navigation', branchId: 'explorateur', tier: 2, position: 'center', name: 'Navigation stellaire', description: '-5% temps de trajet toutes flottes par rang', maxRanks: 3, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'fleet_travel_time_reduction', perRank: 0.05 }, sortOrder: 4 },
  { id: 'explore_control', branchId: 'explorateur', tier: 2, position: 'right', name: 'Centre de contrôle', description: '+1 slot flotte depuis cette planète', maxRanks: 1, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'fleet_slot_bonus', perRank: 1 }, sortOrder: 5 },
  // Tier 3
  { id: 'explore_cartographer', branchId: 'explorateur', tier: 3, position: 'left', name: 'Cartographe', description: '+10% réussite expéditions par rang', maxRanks: 2, prerequisiteId: 'explore_impulse', effectType: 'global_bonus', effectParams: { key: 'expedition_success_bonus', perRank: 0.10 }, sortOrder: 6 },
  { id: 'explore_hyperscan', branchId: 'explorateur', tier: 3, position: 'center', name: 'Hyperscan', description: 'Révèle les flottes en approche pendant 4h', maxRanks: 1, prerequisiteId: null, effectType: 'timed_buff', effectParams: { key: 'reveal_incoming_fleets', multiplier: 1, durationSeconds: 14400, cooldownSeconds: 43200 }, sortOrder: 7 },
  { id: 'explore_scout', branchId: 'explorateur', tier: 3, position: 'right', name: 'Éclaireur', description: '+1 slot de flotte global', maxRanks: 1, prerequisiteId: 'explore_control', effectType: 'global_bonus', effectParams: { key: 'fleet_slot_global', perRank: 1 }, sortOrder: 8 },
  // Tier 4
  { id: 'explore_hyperdrive', branchId: 'explorateur', tier: 4, position: 'left', name: 'Hyperdrive', description: 'Change la propulsion en hyperespace', maxRanks: 1, prerequisiteId: 'explore_cartographer', effectType: 'unlock', effectParams: { key: 'drive_hyperspace' }, sortOrder: 9 },
  { id: 'explore_emergency', branchId: 'explorateur', tier: 4, position: 'right', name: "Saut d'urgence", description: 'Rappel instantané d\'une flotte en cours', maxRanks: 1, prerequisiteId: null, effectType: 'timed_buff', effectParams: { key: 'instant_fleet_recall', multiplier: 1, durationSeconds: 1, cooldownSeconds: 86400 }, sortOrder: 10 },
  // Tier 5 — Capstone
  { id: 'explore_legendary', branchId: 'explorateur', tier: 5, position: 'center', name: 'Navigateur légendaire', description: 'Toutes les flottes partant de la planète du flagship +15% vitesse', maxRanks: 1, prerequisiteId: 'explore_hyperdrive', effectType: 'planet_bonus', effectParams: { key: 'fleet_speed_bonus', perRank: 0.15 }, sortOrder: 11 },

  // === NEGOCIANT ===
  // Tier 1
  { id: 'trade_cargo', branchId: 'negociant', tier: 1, position: 'left', name: 'Soute étendue', description: '+100 cargo flagship par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'cargoCapacity', perRank: 100 }, sortOrder: 0 },
  { id: 'trade_negotiator', branchId: 'negociant', tier: 1, position: 'center', name: 'Négociateur', description: '-5% frais marché par rang', maxRanks: 2, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'market_fee_reduction', perRank: 0.05 }, sortOrder: 1 },
  { id: 'trade_logistics', branchId: 'negociant', tier: 1, position: 'right', name: 'Logisticien', description: '+5% capacité stockage par rang', maxRanks: 3, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'storage_capacity_bonus', perRank: 0.05 }, sortOrder: 2 },
  // Tier 2
  { id: 'trade_armored', branchId: 'negociant', tier: 2, position: 'left', name: 'Convoi blindé', description: '+5 coque flagship par rang', maxRanks: 2, prerequisiteId: 'trade_cargo', effectType: 'modify_stat', effectParams: { stat: 'hull', perRank: 5 }, sortOrder: 3 },
  { id: 'trade_network', branchId: 'negociant', tier: 2, position: 'center', name: 'Réseau commercial', description: '+1 offre simultanée marché', maxRanks: 1, prerequisiteId: 'trade_negotiator', effectType: 'global_bonus', effectParams: { key: 'market_offer_slots', perRank: 1 }, sortOrder: 4 },
  { id: 'trade_prospector', branchId: 'negociant', tier: 2, position: 'right', name: 'Prospecteur', description: '+3% production mines par rang', maxRanks: 3, prerequisiteId: 'trade_logistics', effectType: 'planet_bonus', effectParams: { key: 'mine_production_bonus', perRank: 0.03 }, sortOrder: 5 },
  // Tier 3
  { id: 'trade_smuggler', branchId: 'negociant', tier: 3, position: 'left', name: 'Contrebandier', description: '30% du cargo de toutes les flottes protégé du pillage', maxRanks: 1, prerequisiteId: 'trade_armored', effectType: 'global_bonus', effectParams: { key: 'pillage_protection', perRank: 0.30 }, sortOrder: 6 },
  { id: 'trade_overclock', branchId: 'negociant', tier: 3, position: 'center', name: 'Overclock minier', description: '+50% production mines pendant 2h', maxRanks: 1, prerequisiteId: 'trade_prospector', effectType: 'timed_buff', effectParams: { key: 'mine_overclock', multiplier: 1.5, durationSeconds: 7200, cooldownSeconds: 86400 }, sortOrder: 7 },
  { id: 'trade_hangars', branchId: 'negociant', tier: 3, position: 'right', name: 'Maître des hangars', description: '+10% cargo toutes flottes par rang', maxRanks: 2, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'fleet_cargo_bonus', perRank: 0.10 }, sortOrder: 8 },
  // Tier 4
  { id: 'trade_boom', branchId: 'negociant', tier: 4, position: 'left', name: 'Boom économique', description: '+25% production ressources planète pendant 4h', maxRanks: 1, prerequisiteId: 'trade_overclock', effectType: 'timed_buff', effectParams: { key: 'resource_production_boost', multiplier: 1.25, durationSeconds: 14400, cooldownSeconds: 172800 }, sortOrder: 9 },
  { id: 'trade_mogul', branchId: 'negociant', tier: 4, position: 'right', name: 'Magnat', description: 'Transactions marché sans frais', maxRanks: 1, prerequisiteId: 'trade_network', effectType: 'global_bonus', effectParams: { key: 'market_fee_reduction', perRank: 1.0 }, sortOrder: 10 },
  // Tier 5 — Capstone
  { id: 'trade_empire', branchId: 'negociant', tier: 5, position: 'center', name: 'Empire commercial', description: '+5% production ressources sur toutes les planètes', maxRanks: 1, prerequisiteId: 'trade_boom', effectType: 'global_bonus', effectParams: { key: 'global_production_bonus', perRank: 0.05 }, sortOrder: 11 },
];
```

- [ ] **Step 2 : Ajouter l'insertion dans la fonction seed()**

Dans la fonction `seed()` de `seed-game-config.ts`, ajouter les insertions (apres les upserts existants — meme pattern que les autres tables) :

```typescript
// Talent branches
await db.delete(talentBranchDefinitions);
await db.insert(talentBranchDefinitions).values(TALENT_BRANCHES);
console.log(`  ✓ ${TALENT_BRANCHES.length} talent branches`);

// Talent definitions
await db.delete(talentDefinitions);
await db.insert(talentDefinitions).values(TALENT_DEFINITIONS);
console.log(`  ✓ ${TALENT_DEFINITIONS.length} talent definitions`);
```

- [ ] **Step 3 : Ajouter le type TalentConfig dans game-config.service.ts**

Ajouter dans `apps/api/src/modules/admin/game-config.service.ts` :

```typescript
export interface TalentBranchConfig {
  id: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
}

export interface TalentConfig {
  id: string;
  branchId: string;
  tier: number;
  position: string;
  name: string;
  description: string;
  maxRanks: number;
  prerequisiteId: string | null;
  effectType: string;
  effectParams: Record<string, unknown>;
  sortOrder: number;
}
```

- [ ] **Step 4 : Ajouter les talents dans l'interface GameConfig**

Dans `game-config.service.ts`, ajouter a l'interface `GameConfig` :

```typescript
export interface GameConfig {
  // ... existant ...
  talentBranches: TalentBranchConfig[];
  talents: Record<string, TalentConfig>;
}
```

- [ ] **Step 5 : Charger les talents dans getFullConfig()**

Dans la fonction `getFullConfig()` de `game-config.service.ts` :

1. Importer les tables :
```typescript
import { talentBranchDefinitions, talentDefinitions } from '@exilium/db';
```

2. Ajouter les requetes dans le `Promise.all` :
```typescript
db.select().from(talentBranchDefinitions).orderBy(talentBranchDefinitions.sortOrder),
db.select().from(talentDefinitions),
```

3. Destructurer les resultats :
```typescript
const [...existingVars, talentBranchRows, talentRows] = await Promise.all([...]);
```

4. Transformer et ajouter au config avant le `cache = config; return config;` :
```typescript
// Talent branches
const talentBranches: TalentBranchConfig[] = talentBranchRows.map(b => ({
  id: b.id,
  name: b.name,
  description: b.description,
  color: b.color,
  sortOrder: b.sortOrder,
}));

// Talents
const talents: Record<string, TalentConfig> = {};
for (const t of talentRows) {
  talents[t.id] = {
    id: t.id,
    branchId: t.branchId,
    tier: t.tier,
    position: t.position,
    name: t.name,
    description: t.description,
    maxRanks: t.maxRanks,
    prerequisiteId: t.prerequisiteId,
    effectType: t.effectType,
    effectParams: (t.effectParams ?? {}) as Record<string, unknown>,
    sortOrder: t.sortOrder,
  };
}
```

- [ ] **Step 6 : Seed et commit**

```bash
pnpm --filter @exilium/db exec tsx src/seed-game-config.ts
git add packages/db/src/seed-game-config.ts apps/api/src/modules/admin/game-config.service.ts
git commit -m "feat(db): seed talent tree config (3 branches, 33 talents)"
```

---

## Tache 3 — Service talents (core)

### Objectif

Creer le service de talents avec les methodes list, invest et getStatBonuses.

### Fichiers

- Creer : `apps/api/src/modules/flagship/talent.service.ts`

- [ ] **Step 1 : Creer le service**

```typescript
// apps/api/src/modules/flagship/talent.service.ts
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { flagships, flagshipTalents, flagshipCooldowns } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { GameConfigService, TalentConfig } from '../admin/game-config.service.js';

export function createTalentService(
  db: Database,
  exiliumService: ReturnType<typeof createExiliumService>,
  gameConfigService: GameConfigService,
) {
  async function getFlagship(userId: string) {
    const [flagship] = await db
      .select({ id: flagships.id, userId: flagships.userId, planetId: flagships.planetId, status: flagships.status })
      .from(flagships)
      .where(eq(flagships.userId, userId))
      .limit(1);
    if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun vaisseau amiral' });
    return flagship;
  }

  async function getTalentRanks(flagshipId: string): Promise<Record<string, number>> {
    const rows = await db.select().from(flagshipTalents).where(eq(flagshipTalents.flagshipId, flagshipId));
    return Object.fromEntries(rows.map(r => [r.talentId, r.currentRank]));
  }

  function getTierCost(tier: number, config: Awaited<ReturnType<typeof gameConfigService.getFullConfig>>): number {
    const key = `talent_cost_tier_${tier}`;
    return Number(config.universe[key]) || tier;
  }

  function getTierThreshold(tier: number, config: Awaited<ReturnType<typeof gameConfigService.getFullConfig>>): number {
    if (tier <= 1) return 0;
    const key = `talent_tier_${tier}_threshold`;
    return Number(config.universe[key]) || (tier - 1) * 5;
  }

  function getPointsInBranch(branchId: string, ranks: Record<string, number>, talents: Record<string, TalentConfig>): number {
    let total = 0;
    for (const [talentId, rank] of Object.entries(ranks)) {
      const def = talents[talentId];
      if (def && def.branchId === branchId) total += rank;
    }
    return total;
  }

  return {
    async list(userId: string) {
      const flagship = await getFlagship(userId);
      const config = await gameConfigService.getFullConfig();
      const ranks = await getTalentRanks(flagship.id);

      // Cooldowns actifs
      const cooldownRows = await db.select().from(flagshipCooldowns).where(eq(flagshipCooldowns.flagshipId, flagship.id));
      const cooldowns: Record<string, { activatedAt: string; expiresAt: string; cooldownEnds: string }> = {};
      for (const c of cooldownRows) {
        cooldowns[c.talentId] = {
          activatedAt: c.activatedAt.toISOString(),
          expiresAt: c.expiresAt.toISOString(),
          cooldownEnds: c.cooldownEnds.toISOString(),
        };
      }

      return {
        branches: config.talentBranches,
        talents: config.talents,
        ranks,
        cooldowns,
      };
    },

    async invest(userId: string, talentId: string) {
      const flagship = await getFlagship(userId);
      const config = await gameConfigService.getFullConfig();
      const talentDef = config.talents[talentId];
      if (!talentDef) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent inconnu' });

      const ranks = await getTalentRanks(flagship.id);
      const currentRank = ranks[talentId] ?? 0;

      // Verifier rang max
      if (currentRank >= talentDef.maxRanks) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Rang maximum atteint' });
      }

      // Verifier seuil de tier
      const branchPoints = getPointsInBranch(talentDef.branchId, ranks, config.talents);
      const threshold = getTierThreshold(talentDef.tier, config);
      if (branchPoints < threshold) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Investissez ${threshold} points dans la branche pour débloquer le tier ${talentDef.tier}` });
      }

      // Verifier prerequis
      if (talentDef.prerequisiteId) {
        const prereqRank = ranks[talentDef.prerequisiteId] ?? 0;
        if (prereqRank < 1) {
          const prereqDef = config.talents[talentDef.prerequisiteId];
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Prérequis manquant : ${prereqDef?.name ?? talentDef.prerequisiteId}` });
        }
      }

      // Calculer le cout
      const cost = getTierCost(talentDef.tier, config);

      // Depenser l'Exilium
      await exiliumService.spend(userId, cost, 'talent_unlock', {
        talentId,
        branchId: talentDef.branchId,
        tier: talentDef.tier,
        newRank: currentRank + 1,
      });

      // Inserer ou mettre a jour le rang
      if (currentRank === 0) {
        await db.insert(flagshipTalents).values({
          flagshipId: flagship.id,
          talentId,
          currentRank: 1,
        });
      } else {
        await db.update(flagshipTalents)
          .set({ currentRank: sql`${flagshipTalents.currentRank} + 1` })
          .where(and(eq(flagshipTalents.flagshipId, flagship.id), eq(flagshipTalents.talentId, talentId)));
      }

      return { talentId, newRank: currentRank + 1, cost };
    },

    /** Retourne les bonus de stats a appliquer au flagship */
    getStatBonuses(ranks: Record<string, number>, talents: Record<string, TalentConfig>): Record<string, number> {
      const bonuses: Record<string, number> = {};
      for (const [talentId, rank] of Object.entries(ranks)) {
        if (rank <= 0) continue;
        const def = talents[talentId];
        if (!def || def.effectType !== 'modify_stat') continue;
        const params = def.effectParams as { stat: string; perRank: number };
        bonuses[params.stat] = (bonuses[params.stat] ?? 0) + params.perRank * rank;
      }
      return bonuses;
    },

    /** Retourne les bonus globaux (toujours actifs) */
    getGlobalBonuses(ranks: Record<string, number>, talents: Record<string, TalentConfig>): Record<string, number> {
      const bonuses: Record<string, number> = {};
      for (const [talentId, rank] of Object.entries(ranks)) {
        if (rank <= 0) continue;
        const def = talents[talentId];
        if (!def || def.effectType !== 'global_bonus') continue;
        const params = def.effectParams as { key: string; perRank: number };
        bonuses[params.key] = (bonuses[params.key] ?? 0) + params.perRank * rank;
      }
      return bonuses;
    },

    /** Retourne les bonus planetaires (seulement si flagship stationne et actif sur la planete) */
    async getPlanetBonuses(userId: string, planetId: string): Promise<Record<string, number>> {
      const [flagship] = await db.select({ id: flagships.id, planetId: flagships.planetId, status: flagships.status })
        .from(flagships).where(eq(flagships.userId, userId)).limit(1);
      if (!flagship || flagship.status !== 'active' || flagship.planetId !== planetId) return {};

      const config = await gameConfigService.getFullConfig();
      const ranks = await getTalentRanks(flagship.id);

      const bonuses: Record<string, number> = {};
      for (const [talentId, rank] of Object.entries(ranks)) {
        if (rank <= 0) continue;
        const def = config.talents[talentId];
        if (!def || def.effectType !== 'planet_bonus') continue;
        const params = def.effectParams as { key: string; perRank: number };
        bonuses[params.key] = (bonuses[params.key] ?? 0) + params.perRank * rank;
      }
      return bonuses;
    },
  };
}
```

- [ ] **Step 2 : Commit**

```bash
git add apps/api/src/modules/flagship/talent.service.ts
git commit -m "feat(api): add talent service core (list, invest, stat/global/planet bonuses)"
```

---

## Tache 4 — Respec & reset

### Objectif

Ajouter les methodes `respec` (individuel avec cascade) et `resetAll` au service de talents.

### Fichiers

- Modifier : `apps/api/src/modules/flagship/talent.service.ts`

- [ ] **Step 1 : Ajouter la methode respec**

Ajouter dans le return du service (apres `getPlanetBonuses`) :

```typescript
    async respec(userId: string, talentId: string) {
      const flagship = await getFlagship(userId);
      const config = await gameConfigService.getFullConfig();
      const talentDef = config.talents[talentId];
      if (!talentDef) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent inconnu' });

      const ranks = await getTalentRanks(flagship.id);
      const currentRank = ranks[talentId] ?? 0;
      if (currentRank <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent non débloqué' });

      // Trouver les talents dependants (cascade)
      const dependants: string[] = [];
      function findDependants(parentId: string) {
        for (const [id, def] of Object.entries(config.talents)) {
          if (def.prerequisiteId === parentId && (ranks[id] ?? 0) > 0) {
            dependants.push(id);
            findDependants(id);
          }
        }
      }
      findDependants(talentId);

      // Calculer le cout total du respec (talent + dependants)
      const respecRatio = Number(config.universe['talent_respec_ratio']) || 0.5;
      let totalRespecCost = 0;
      const talentsToReset = [talentId, ...dependants];
      for (const id of talentsToReset) {
        const rank = ranks[id] ?? 0;
        const def = config.talents[id];
        if (!def || rank <= 0) continue;
        const tierCost = getTierCost(def.tier, config);
        const invested = tierCost * rank;
        totalRespecCost += Math.ceil(invested * respecRatio);
      }

      // Depenser l'Exilium pour le respec
      await exiliumService.spend(userId, totalRespecCost, 'talent_respec', {
        talentId,
        cascade: dependants,
        cost: totalRespecCost,
      });

      // Supprimer les rangs (talent + cascade)
      for (const id of talentsToReset) {
        await db.delete(flagshipTalents)
          .where(and(eq(flagshipTalents.flagshipId, flagship.id), eq(flagshipTalents.talentId, id)));
      }

      return { reset: talentsToReset, cost: totalRespecCost };
    },

    async resetAll(userId: string) {
      const flagship = await getFlagship(userId);
      const config = await gameConfigService.getFullConfig();
      const fullResetCost = Number(config.universe['talent_full_reset_cost']) || 50;

      // Verifier qu'il y a des talents a reset
      const ranks = await getTalentRanks(flagship.id);
      const investedCount = Object.values(ranks).filter(r => r > 0).length;
      if (investedCount === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun talent à réinitialiser' });

      // Depenser l'Exilium
      await exiliumService.spend(userId, fullResetCost, 'talent_reset', { cost: fullResetCost });

      // Supprimer tous les rangs
      await db.delete(flagshipTalents).where(eq(flagshipTalents.flagshipId, flagship.id));

      // Supprimer tous les cooldowns
      await db.delete(flagshipCooldowns).where(eq(flagshipCooldowns.flagshipId, flagship.id));

      return { cost: fullResetCost };
    },
```

- [ ] **Step 2 : Commit**

```bash
git add apps/api/src/modules/flagship/talent.service.ts
git commit -m "feat(api): add talent respec (individual cascade) and full reset"
```

---

## Tache 5 — Actifs (timed buffs)

### Objectif

Ajouter les methodes `activate` et `getActiveBuffs` pour les talents de type `timed_buff`.

### Fichiers

- Modifier : `apps/api/src/modules/flagship/talent.service.ts`

- [ ] **Step 1 : Ajouter les methodes activate et getActiveBuffs**

Ajouter dans le return du service :

```typescript
    async activate(userId: string, talentId: string) {
      const flagship = await getFlagship(userId);

      // Le flagship doit etre stationne (actif)
      if (flagship.status !== 'active') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le vaisseau amiral doit être stationné pour activer un talent' });
      }

      const config = await gameConfigService.getFullConfig();
      const talentDef = config.talents[talentId];
      if (!talentDef || talentDef.effectType !== 'timed_buff') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ce talent n\'est pas activable' });
      }

      // Verifier que le talent est debloque
      const ranks = await getTalentRanks(flagship.id);
      if ((ranks[talentId] ?? 0) < 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent non débloqué' });
      }

      // Verifier le cooldown
      const [existingCd] = await db.select().from(flagshipCooldowns)
        .where(and(eq(flagshipCooldowns.flagshipId, flagship.id), eq(flagshipCooldowns.talentId, talentId)))
        .limit(1);

      if (existingCd && new Date() < existingCd.cooldownEnds) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Talent en cooldown' });
      }

      const params = talentDef.effectParams as { key: string; multiplier: number; durationSeconds: number; cooldownSeconds: number };
      const now = new Date();
      const expiresAt = new Date(now.getTime() + params.durationSeconds * 1000);
      const cooldownEnds = new Date(now.getTime() + params.cooldownSeconds * 1000);

      // Upsert le cooldown
      if (existingCd) {
        await db.update(flagshipCooldowns)
          .set({ activatedAt: now, expiresAt, cooldownEnds })
          .where(and(eq(flagshipCooldowns.flagshipId, flagship.id), eq(flagshipCooldowns.talentId, talentId)));
      } else {
        await db.insert(flagshipCooldowns).values({
          flagshipId: flagship.id,
          talentId,
          activatedAt: now,
          expiresAt,
          cooldownEnds,
        });
      }

      return {
        talentId,
        activatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        cooldownEnds: cooldownEnds.toISOString(),
      };
    },

    async getActiveBuffs(userId: string, planetId?: string): Promise<Array<{ talentId: string; key: string; multiplier: number; expiresAt: string }>> {
      const [flagship] = await db.select({ id: flagships.id })
        .from(flagships).where(eq(flagships.userId, userId)).limit(1);
      if (!flagship) return [];

      const config = await gameConfigService.getFullConfig();
      const cooldownRows = await db.select().from(flagshipCooldowns)
        .where(eq(flagshipCooldowns.flagshipId, flagship.id));

      const now = new Date();
      const active: Array<{ talentId: string; key: string; multiplier: number; expiresAt: string }> = [];
      for (const cd of cooldownRows) {
        if (now >= cd.expiresAt) continue; // Buff expire
        const def = config.talents[cd.talentId];
        if (!def || def.effectType !== 'timed_buff') continue;
        const params = def.effectParams as { key: string; multiplier: number };
        active.push({
          talentId: cd.talentId,
          key: params.key,
          multiplier: params.multiplier,
          expiresAt: cd.expiresAt.toISOString(),
        });
      }
      return active;
    },
```

- [ ] **Step 2 : Commit**

```bash
git add apps/api/src/modules/flagship/talent.service.ts
git commit -m "feat(api): add timed buff activation and active buff queries"
```

---

## Tache 6 — Router tRPC + wiring

### Objectif

Creer le router tRPC pour les talents et le connecter dans l'app router.

### Fichiers

- Creer : `apps/api/src/modules/flagship/talent.router.ts`
- Modifier : `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1 : Creer le router**

```typescript
// apps/api/src/modules/flagship/talent.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createTalentService } from './talent.service.js';

export function createTalentRouter(
  talentService: ReturnType<typeof createTalentService>,
) {
  return router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return talentService.list(ctx.userId!);
      }),

    invest: protectedProcedure
      .input(z.object({ talentId: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        return talentService.invest(ctx.userId!, input.talentId);
      }),

    respec: protectedProcedure
      .input(z.object({ talentId: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        return talentService.respec(ctx.userId!, input.talentId);
      }),

    resetAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        return talentService.resetAll(ctx.userId!);
      }),

    activate: protectedProcedure
      .input(z.object({ talentId: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        return talentService.activate(ctx.userId!, input.talentId);
      }),
  });
}
```

- [ ] **Step 2 : Wiring dans app-router.ts**

Dans `apps/api/src/trpc/app-router.ts` :

1. Ajouter les imports :
```typescript
import { createTalentService } from '../modules/flagship/talent.service.js';
import { createTalentRouter } from '../modules/flagship/talent.router.js';
```

2. Dans `buildAppRouter()`, apres `const flagshipService = ...` :
```typescript
const talentService = createTalentService(db, exiliumService, gameConfigService);
```

3. Apres `const flagshipRouter = ...` :
```typescript
const talentRouter = createTalentRouter(talentService);
```

4. Dans le `return router({...})`, ajouter :
```typescript
talent: talentRouter,
```

- [ ] **Step 3 : Commit**

```bash
git add apps/api/src/modules/flagship/talent.router.ts apps/api/src/trpc/app-router.ts
git commit -m "feat(api): add talent tRPC router and wire into app"
```

---

## Tache 7 — Integration flagship.get() avec talents

### Objectif

Enrichir la reponse de `flagship.get()` pour inclure les stats modifiees par les talents.

### Fichiers

- Modifier : `apps/api/src/modules/flagship/flagship.service.ts`

- [ ] **Step 1 : Injecter le talent service dans le flagship service**

Modifier la signature de `createFlagshipService` dans `flagship.service.ts` :

```typescript
import type { createTalentService } from './talent.service.js';

export function createFlagshipService(
  db: Database,
  exiliumService: ReturnType<typeof createExiliumService>,
  gameConfigService: GameConfigService,
  talentService?: ReturnType<typeof createTalentService>,
) {
```

- [ ] **Step 2 : Enrichir get() pour appliquer les bonus de stats**

Modifier la methode `get()` pour ajouter les stats enrichies apres le return du flagship :

```typescript
    async get(userId: string) {
      const [flagship] = await db
        .select()
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) return null;

      // Verification lazy de la reparation
      if (flagship.status === 'incapacitated' && flagship.repairEndsAt) {
        if (new Date() >= flagship.repairEndsAt) {
          await db
            .update(flagships)
            .set({ status: 'active', repairEndsAt: null, updatedAt: new Date() })
            .where(eq(flagships.id, flagship.id));
          Object.assign(flagship, { status: 'active', repairEndsAt: null });
        }
      }

      // Appliquer les bonus de talents si le service est disponible
      if (talentService) {
        const config = await gameConfigService.getFullConfig();
        const talentData = await talentService.list(userId);
        const statBonuses = talentService.getStatBonuses(talentData.ranks, config.talents);

        return {
          ...flagship,
          talentBonuses: statBonuses,
          effectiveStats: {
            weapons: flagship.weapons + (statBonuses.weapons ?? 0),
            shield: flagship.shield + (statBonuses.shield ?? 0),
            hull: flagship.hull + (statBonuses.hull ?? 0),
            baseArmor: flagship.baseArmor + (statBonuses.baseArmor ?? 0),
            shotCount: flagship.shotCount + (statBonuses.shotCount ?? 0),
            cargoCapacity: flagship.cargoCapacity + (statBonuses.cargoCapacity ?? 0),
            fuelConsumption: Math.max(0, flagship.fuelConsumption + (statBonuses.fuelConsumption ?? 0)),
            baseSpeed: Math.round(flagship.baseSpeed * (1 + (statBonuses.speedPercent ?? 0))),
            driveType: flagship.driveType, // Modifie par unlock, pas par modify_stat
          },
        };
      }

      return flagship;
    },
```

- [ ] **Step 3 : Gerer les unlocks de propulsion**

Ajouter dans la methode `get()`, apres le calcul des effectiveStats, la gestion des unlocks :

```typescript
      // Appliquer les unlocks
      if (talentService) {
        // ... (existant ci-dessus) ...

        // Gestion des unlocks (propulsion)
        for (const [talentId, rank] of Object.entries(talentData.ranks)) {
          if (rank <= 0) continue;
          const def = config.talents[talentId];
          if (!def || def.effectType !== 'unlock') continue;
          const params = def.effectParams as { key: string };
          if (params.key === 'drive_impulse') {
            effectiveStats.driveType = 'impulsion';
          } else if (params.key === 'drive_hyperspace') {
            effectiveStats.driveType = 'hyperespace';
          }
        }

        return { ...flagship, talentBonuses: statBonuses, effectiveStats };
      }
```

- [ ] **Step 4 : Mettre a jour le wiring dans app-router.ts**

Dans `app-router.ts`, passer le talentService au flagshipService :

```typescript
const talentService = createTalentService(db, exiliumService, gameConfigService);
const flagshipService = createFlagshipService(db, exiliumService, gameConfigService, talentService);
```

Note : il faut deplacer la creation du `talentService` AVANT celle du `flagshipService`.

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/modules/flagship/flagship.service.ts apps/api/src/trpc/app-router.ts
git commit -m "feat(api): enrich flagship.get() with talent stat bonuses and unlocks"
```

---

## Tache 8 — Page frontend arbre de talents

### Objectif

Creer la page principale de l'arbre de talents du flagship, avec les 3 branches, les noeuds, les fleches de prerequis, et les interactions (invest, respec, activer).

### Fichiers

- Creer : `apps/web/src/pages/FlagshipTalents.tsx`
- Modifier : router web (ajouter la route)

- [ ] **Step 1 : Creer la page FlagshipTalents.tsx**

```tsx
// apps/web/src/pages/FlagshipTalents.tsx
import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useExilium } from '@/hooks/useExilium';
import { cn } from '@/lib/utils';

const BREADCRUMB = [
  { label: 'Flotte', path: '/fleet' },
  { label: 'Vaisseau amiral', path: '/flagship/talents' },
];

const BRANCH_COLORS: Record<string, { border: string; text: string; bg: string }> = {
  combattant: { border: 'border-red-500/40', text: 'text-red-400', bg: 'bg-red-950/30' },
  explorateur: { border: 'border-teal-500/40', text: 'text-teal-400', bg: 'bg-teal-950/30' },
  negociant: { border: 'border-amber-500/40', text: 'text-amber-400', bg: 'bg-amber-950/30' },
};

const EFFECT_LABELS: Record<string, { label: string; color: string }> = {
  modify_stat: { label: 'Stat', color: 'text-blue-400' },
  global_bonus: { label: 'Global', color: 'text-amber-400' },
  planet_bonus: { label: 'Planète', color: 'text-emerald-400' },
  timed_buff: { label: 'Actif', color: 'text-pink-400' },
  unlock: { label: 'Déblocage', color: 'text-purple-400' },
};

export default function FlagshipTalents() {
  const utils = trpc.useUtils();
  const { data: talentTree, isLoading } = trpc.talent.list.useQuery();
  const { data: exilium } = useExilium();
  const balance = exilium?.balance ?? 0;

  const [confirmInvest, setConfirmInvest] = useState<string | null>(null);
  const [confirmRespec, setConfirmRespec] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const investMutation = trpc.talent.invest.useMutation({
    onSuccess: () => {
      utils.talent.list.invalidate();
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      setConfirmInvest(null);
    },
  });

  const respecMutation = trpc.talent.respec.useMutation({
    onSuccess: () => {
      utils.talent.list.invalidate();
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      setConfirmRespec(null);
    },
  });

  const resetMutation = trpc.talent.resetAll.useMutation({
    onSuccess: () => {
      utils.talent.list.invalidate();
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      setConfirmReset(false);
    },
  });

  const activateMutation = trpc.talent.activate.useMutation({
    onSuccess: () => {
      utils.talent.list.invalidate();
    },
  });

  // Organiser les talents par branche et tier
  const branchData = useMemo(() => {
    if (!talentTree) return [];
    return talentTree.branches.map(branch => {
      const branchTalents = Object.values(talentTree.talents)
        .filter(t => t.branchId === branch.id)
        .sort((a, b) => a.tier - b.tier || a.sortOrder - b.sortOrder);

      const tiers: Record<number, typeof branchTalents> = {};
      for (const t of branchTalents) {
        if (!tiers[t.tier]) tiers[t.tier] = [];
        tiers[t.tier].push(t);
      }

      const totalPoints = branchTalents.reduce((sum, t) => sum + (talentTree.ranks[t.id] ?? 0), 0);

      return { branch, tiers, talents: branchTalents, totalPoints };
    });
  }, [talentTree]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <Breadcrumb segments={BREADCRUMB} />
        <PageHeader title="Arbre de talents" />
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  if (!talentTree) return null;

  function getTierCost(tier: number) {
    return tier; // Simplifie — le vrai cout est cote serveur
  }

  function canInvest(talentId: string): boolean {
    if (!talentTree) return false;
    const def = talentTree.talents[talentId];
    if (!def) return false;
    const rank = talentTree.ranks[talentId] ?? 0;
    if (rank >= def.maxRanks) return false;
    // Seuil de tier
    const bp = branchData.find(b => b.branch.id === def.branchId);
    const thresholds: Record<number, number> = { 1: 0, 2: 5, 3: 10, 4: 15, 5: 20 };
    if ((bp?.totalPoints ?? 0) < (thresholds[def.tier] ?? 0)) return false;
    // Prerequis
    if (def.prerequisiteId && (talentTree.ranks[def.prerequisiteId] ?? 0) < 1) return false;
    // Cout
    if (balance < getTierCost(def.tier)) return false;
    return true;
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <Breadcrumb segments={BREADCRUMB} />
      <PageHeader
        title="Arbre de talents"
        actions={
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Réinitialiser tout
          </button>
        }
      />

      {/* Branches */}
      <div className="grid gap-4 lg:grid-cols-3">
        {branchData.map(({ branch, tiers, totalPoints }) => {
          const colors = BRANCH_COLORS[branch.id] ?? BRANCH_COLORS.combattant;
          return (
            <div key={branch.id} className={cn('rounded-lg border p-3 space-y-3', colors.border, colors.bg)}>
              <div className="text-center">
                <h3 className={cn('text-sm font-bold uppercase tracking-wider', colors.text)}>{branch.name}</h3>
                <p className="text-[10px] text-muted-foreground">{branch.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Points : {totalPoints}</p>
              </div>

              {[1, 2, 3, 4, 5].map(tier => {
                const tierTalents = tiers[tier] ?? [];
                if (tierTalents.length === 0) return null;
                const thresholds: Record<number, number> = { 1: 0, 2: 5, 3: 10, 4: 15, 5: 20 };
                const unlocked = totalPoints >= (thresholds[tier] ?? 0);

                return (
                  <div key={tier}>
                    <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wide mb-1">
                      Tier {tier} — {getTierCost(tier)} Exilium/rang
                      {!unlocked && ` (${thresholds[tier]} pts requis)`}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {tierTalents.map(talent => {
                        const rank = talentTree.ranks[talent.id] ?? 0;
                        const maxed = rank >= talent.maxRanks;
                        const available = canInvest(talent.id);
                        const effectInfo = EFFECT_LABELS[talent.effectType];
                        const cooldown = talentTree.cooldowns[talent.id];
                        const isOnCooldown = cooldown && new Date() < new Date(cooldown.cooldownEnds);
                        const isBuffActive = cooldown && new Date() < new Date(cooldown.expiresAt);

                        return (
                          <div
                            key={talent.id}
                            className={cn(
                              'rounded-md border p-2 text-center text-[10px] space-y-1 transition-all',
                              talent.position === 'center' && tierTalents.length === 1 && 'col-span-3',
                              maxed ? 'border-primary/50 bg-primary/10' : rank > 0 ? 'border-primary/30' : 'border-border/50',
                              !unlocked && 'opacity-40',
                            )}
                          >
                            <div className="font-semibold leading-tight">{talent.name}</div>
                            <div className={cn('text-[8px]', effectInfo?.color)}>{effectInfo?.label}</div>
                            <div className="text-muted-foreground text-[8px] leading-tight">{talent.description}</div>
                            <div className="font-mono text-[9px]">{rank}/{talent.maxRanks}</div>

                            <div className="flex gap-1 justify-center flex-wrap">
                              {available && (
                                <button
                                  onClick={() => setConfirmInvest(talent.id)}
                                  className="text-[8px] px-1.5 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                                >
                                  +1
                                </button>
                              )}
                              {rank > 0 && (
                                <button
                                  onClick={() => setConfirmRespec(talent.id)}
                                  className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                  Respec
                                </button>
                              )}
                              {talent.effectType === 'timed_buff' && rank > 0 && (
                                <button
                                  onClick={() => activateMutation.mutate({ talentId: talent.id })}
                                  disabled={!!isOnCooldown}
                                  className={cn(
                                    'text-[8px] px-1.5 py-0.5 rounded transition-colors',
                                    isBuffActive ? 'bg-pink-500/20 text-pink-400' :
                                    isOnCooldown ? 'bg-muted text-muted-foreground cursor-not-allowed' :
                                    'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20',
                                  )}
                                >
                                  {isBuffActive ? 'Actif' : isOnCooldown ? 'CD' : 'Activer'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!confirmInvest}
        onConfirm={() => { if (confirmInvest) investMutation.mutate({ talentId: confirmInvest }); }}
        onCancel={() => setConfirmInvest(null)}
        title="Investir dans ce talent ?"
        description={`Coût : ${confirmInvest ? getTierCost(talentTree.talents[confirmInvest]?.tier ?? 1) : 0} Exilium`}
        confirmLabel="Investir"
      />

      <ConfirmDialog
        open={!!confirmRespec}
        onConfirm={() => { if (confirmRespec) respecMutation.mutate({ talentId: confirmRespec }); }}
        onCancel={() => setConfirmRespec(null)}
        title="Réinitialiser ce talent ?"
        description="Les talents dépendants seront aussi réinitialisés. Le coût est 50% de l'Exilium investi."
        variant="destructive"
        confirmLabel="Réinitialiser"
      />

      <ConfirmDialog
        open={confirmReset}
        onConfirm={() => resetMutation.mutate()}
        onCancel={() => setConfirmReset(false)}
        title="Réinitialiser tout l'arbre ?"
        description="Coût : 50 Exilium. Tous vos talents seront réinitialisés."
        variant="destructive"
        confirmLabel="Tout réinitialiser"
      />
    </div>
  );
}
```

- [ ] **Step 2 : Ajouter la route**

Trouver le fichier de routes (probablement `apps/web/src/router.tsx` ou equivalent) et ajouter :

```typescript
{
  path: '/flagship/talents',
  lazy: () => import('./pages/FlagshipTalents'),
}
```

- [ ] **Step 3 : Ajouter un lien depuis le FleetDashboard**

Dans `apps/web/src/pages/FleetDashboard.tsx`, ajouter un lien vers l'arbre de talents dans la section flagship :

```tsx
<Link
  to="/flagship/talents"
  className="text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors"
>
  Talents →
</Link>
```

- [ ] **Step 4 : Commit**

```bash
git add apps/web/src/pages/FlagshipTalents.tsx
git commit -m "feat(web): add flagship talent tree page with invest/respec/activate UI"
```

---

## Tache 9 — Universe config params + seed

### Objectif

Ajouter les parametres univers pour les couts et seuils de talents dans le seed.

### Fichiers

- Modifier : `packages/db/src/seed-game-config.ts`

- [ ] **Step 1 : Ajouter les parametres univers**

Dans le tableau `UNIVERSE_CONFIG` de `seed-game-config.ts`, ajouter :

```typescript
// Talent tree costs
{ key: 'talent_cost_tier_1', value: '1' },
{ key: 'talent_cost_tier_2', value: '2' },
{ key: 'talent_cost_tier_3', value: '3' },
{ key: 'talent_cost_tier_4', value: '4' },
{ key: 'talent_cost_tier_5', value: '5' },
// Talent tree thresholds
{ key: 'talent_tier_2_threshold', value: '5' },
{ key: 'talent_tier_3_threshold', value: '10' },
{ key: 'talent_tier_4_threshold', value: '15' },
{ key: 'talent_tier_5_threshold', value: '20' },
// Respec costs
{ key: 'talent_respec_ratio', value: '0.5' },
{ key: 'talent_full_reset_cost', value: '50' },
```

- [ ] **Step 2 : Seed et commit**

```bash
pnpm --filter @exilium/db exec tsx src/seed-game-config.ts
git add packages/db/src/seed-game-config.ts
git commit -m "feat(db): add talent tree universe config params"
```

---

## Tache 10 — Exilium source types + migration drizzle

### Objectif

Ajouter les sources Exilium pour les talents et lancer la migration drizzle pour creer les nouvelles tables.

### Fichiers

- Modifier : `apps/api/src/modules/exilium/exilium.service.ts` (si ExiliumSource est type)

- [ ] **Step 1 : Verifier et ajouter les types de source**

Dans `exilium.service.ts`, trouver le type `ExiliumSource` ou equivalent et ajouter :

```typescript
| 'talent_unlock'
| 'talent_respec'
| 'talent_reset'
```

Si le type n'est pas valide strictement (varchar(32) sans validation), cette etape peut etre skip.

- [ ] **Step 2 : Generer et appliquer la migration Drizzle**

```bash
cd packages/db && pnpm drizzle-kit generate && pnpm drizzle-kit push
```

- [ ] **Step 3 : Commit**

```bash
git add packages/db/
git commit -m "feat(db): drizzle migration for talent tree tables"
```

---

## Resume des taches

| Tache | Description | Fichiers principaux |
|-------|-------------|---------------------|
| T1 | Schema DB (4 tables) | `packages/db/src/schema/` |
| T2 | Seed game config (3 branches, 33 talents) | `seed-game-config.ts`, `game-config.service.ts` |
| T3 | Service talents core (list, invest, bonuses) | `talent.service.ts` |
| T4 | Respec & reset | `talent.service.ts` |
| T5 | Actifs (timed buffs) | `talent.service.ts` |
| T6 | Router tRPC + wiring | `talent.router.ts`, `app-router.ts` |
| T7 | Integration flagship.get() | `flagship.service.ts` |
| T8 | Frontend page talent tree | `FlagshipTalents.tsx` |
| T9 | Universe config params | `seed-game-config.ts` |
| T10 | Source types + migration | `exilium.service.ts` |
