# Phase 1 — Exilium + Flagship + Quetes journalieres

> 📦 **Archivé** (2026-04-26) — toutes les tâches T1-T12 sont implémentées en prod (tables `flagships`/`user_exilium`/`exilium_log`, modules `flagship`/`exilium`/`daily-quest`, page `FlagshipProfile.tsx`, talents, hulls). Archivé pour contexte historique.

**Date :** 2026-03-27
**Statut :** ~~Plan d'implementation~~ Implémenté
**Prerequis :** Game designs valides dans exilium-economie, exilium-flotte, exilium-social, exilium-construction

---

## Vue d'ensemble

Cette phase ajoute 3 systemes interconnectes :

1. **Exilium** — meta-ressource de progression liee au compte joueur
2. **Flagship** — vaisseau amiral unique par joueur, cree pendant l'onboarding
3. **Quetes journalieres** — 3 quetes/jour, 1 a completer pour +1 Exilium

Ordre des taches (12 taches, chacune commitable independamment) :

```
T1  Schema DB
T2  Seed game config
T3  Backend Exilium
T4  Backend Flagship
T5  Backend Daily Quests
T6  Hooks evenements
T7  Modification onboarding
T8  Integration flagship dans les flottes
T9  Frontend Exilium
T10 Frontend Flagship
T11 Frontend Daily Quests
T12 Migration joueurs existants
```

---

## Tache 1 — Schema DB

### Objectif

Creer les tables `user_exilium`, `exilium_log`, `flagships` avec migration Drizzle.

### Fichiers a creer

**`packages/db/src/schema/user-exilium.ts`**

```typescript
import { pgTable, uuid, integer, timestamp, jsonb, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const userExilium = pgTable('user_exilium', {
  userId: uuid('user_id')
    .primaryKey()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  totalEarned: integer('total_earned').notNull().default(0),
  totalSpent: integer('total_spent').notNull().default(0),
  lastDailyAt: timestamp('last_daily_at', { withTimezone: true }),
  dailyQuests: jsonb('daily_quests'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('check_balance_positive', sql`${table.balance} >= 0`),
]);
```

**`packages/db/src/schema/exilium-log.ts`**

```typescript
import { pgTable, uuid, integer, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const exiliumLog = pgTable('exilium_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  source: varchar('source', { length: 32 }).notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('exilium_log_user_created_idx').on(table.userId, table.createdAt),
]);
```

**`packages/db/src/schema/flagships.ts`**

```typescript
import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets } from './planets.js';

export const flagships = pgTable('flagships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  planetId: uuid('planet_id')
    .notNull()
    .references(() => planets.id, { onDelete: 'set null' }),

  // Personnalisation
  name: varchar('name', { length: 32 }).notNull().default('Vaisseau amiral'),
  description: varchar('description', { length: 256 }).notNull().default(''),

  // Stats de base (modifiables par les talents Phase 2)
  baseSpeed: integer('base_speed').notNull().default(80000),
  fuelConsumption: integer('fuel_consumption').notNull().default(1),
  cargoCapacity: integer('cargo_capacity').notNull().default(150),
  driveType: varchar('drive_type', { length: 32 }).notNull().default('combustion'),
  weapons: integer('weapons').notNull().default(2),
  shield: integer('shield').notNull().default(4),
  hull: integer('hull').notNull().default(8),
  baseArmor: integer('base_armor').notNull().default(0),
  shotCount: integer('shot_count').notNull().default(1),
  combatCategoryId: varchar('combat_category_id', { length: 32 }).notNull().default('support'),

  // Etat
  status: varchar('status', { length: 16 }).notNull().default('active'),
  repairEndsAt: timestamp('repair_ends_at', { withTimezone: true }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('flagships_user_id_idx').on(table.userId),
]);
```

### Fichiers a modifier

**`packages/db/src/schema/index.ts`** — ajouter les 3 nouveaux exports :

```typescript
// Ajouter a la fin du fichier
export * from './user-exilium.js';
export * from './exilium-log.js';
export * from './flagships.js';
```

### Migration

```bash
cd packages/db
npx drizzle-kit generate
npx drizzle-kit migrate
```

### Tests

```bash
# Verifier que le schema compile
cd packages/db && npx tsc --noEmit

# Verifier que la migration s'applique
npx drizzle-kit migrate

# Test fonctionnel : inserer un record et verifier la contrainte CHECK
psql $DATABASE_URL -c "
  INSERT INTO user_exilium (user_id, balance)
  SELECT id, 0 FROM users LIMIT 1;
"
# Doit reussir

psql $DATABASE_URL -c "
  UPDATE user_exilium SET balance = -1 WHERE TRUE;
"
# Doit echouer avec violation de contrainte CHECK
```

### Verification

```bash
npx tsc --noEmit -p packages/db/tsconfig.json
```

---

## Tache 2 — Seed game config

### Objectif

Ajouter les parametres Exilium, Flagship et Daily Quests dans `universe_config`.

### Fichier a modifier

**`packages/db/src/seed-game-config.ts`** — ajouter dans le tableau `UNIVERSE_CONFIG` (apres la section `// -- Market --`) :

```typescript
  // ── Exilium ──
  { key: 'exilium_daily_quest_reward', value: 1 },
  { key: 'exilium_drop_amount', value: 1 },
  { key: 'exilium_drop_rate_expedition', value: 0.05 },
  { key: 'exilium_drop_rate_pvp', value: 0.03 },
  { key: 'exilium_drop_rate_pve', value: 0.04 },
  { key: 'exilium_drop_rate_market', value: 0.02 },
  { key: 'exilium_drop_rate_recycling', value: 0.02 },

  // ── Flagship ──
  { key: 'flagship_repair_duration_seconds', value: 7200 },
  { key: 'flagship_instant_repair_exilium_cost', value: 2 },

  // ── Daily Quests ──
  { key: 'daily_quest_count', value: 3 },
  { key: 'daily_quest_miner_threshold', value: 5000 },
```

### Tests

```bash
# Re-run le seed
cd packages/db && npx tsx src/seed-game-config.ts

# Verifier les cles
psql $DATABASE_URL -c "
  SELECT key, value FROM universe_config
  WHERE key LIKE 'exilium_%' OR key LIKE 'flagship_%' OR key LIKE 'daily_quest_%';
"
```

### Verification

```bash
npx tsx packages/db/src/seed-game-config.ts
```

---

## Tache 3 — Backend Exilium

### Objectif

Creer le service Exilium (gain, depense, lecture solde) et son router tRPC.

### Fichiers a creer

**`apps/api/src/modules/exilium/exilium.service.ts`**

```typescript
import { eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { userExilium, exiliumLog } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { GameConfigService } from '../admin/game-config.service.js';

export type ExiliumSource =
  | 'daily_quest'
  | 'expedition'
  | 'pvp'
  | 'pve'
  | 'market'
  | 'recycling'
  | 'flagship_repair'
  | 'talent_unlock'
  | 'respec'
  | 'admin';

export function createExiliumService(db: Database, gameConfigService: GameConfigService) {

  async function getOrCreate(userId: string) {
    const [existing] = await db
      .select()
      .from(userExilium)
      .where(eq(userExilium.userId, userId))
      .limit(1);
    if (existing) return existing;

    const [created] = await db
      .insert(userExilium)
      .values({ userId })
      .returning();
    return created;
  }

  return {
    getOrCreate,

    async getBalance(userId: string) {
      const record = await getOrCreate(userId);
      return {
        balance: record.balance,
        totalEarned: record.totalEarned,
        totalSpent: record.totalSpent,
        lastDailyAt: record.lastDailyAt,
      };
    },

    async earn(userId: string, amount: number, source: ExiliumSource, details?: unknown) {
      if (amount <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le montant doit etre positif' });

      await getOrCreate(userId);

      // Atomic update + log dans la meme transaction
      await db.transaction(async (tx) => {
        await tx
          .update(userExilium)
          .set({
            balance: sql`${userExilium.balance} + ${amount}`,
            totalEarned: sql`${userExilium.totalEarned} + ${amount}`,
            updatedAt: new Date(),
          })
          .where(eq(userExilium.userId, userId));

        await tx
          .insert(exiliumLog)
          .values({ userId, amount, source, details: details ?? null });
      });
    },

    async spend(userId: string, amount: number, source: ExiliumSource, details?: unknown) {
      if (amount <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le montant doit etre positif' });

      await getOrCreate(userId);

      await db.transaction(async (tx) => {
        // FOR UPDATE pour eviter les race conditions
        const [record] = await tx
          .select({ balance: userExilium.balance })
          .from(userExilium)
          .where(eq(userExilium.userId, userId))
          .for('update');

        if (!record || record.balance < amount) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Solde Exilium insuffisant (${record?.balance ?? 0} disponible, ${amount} requis)`,
          });
        }

        await tx
          .update(userExilium)
          .set({
            balance: sql`${userExilium.balance} - ${amount}`,
            totalSpent: sql`${userExilium.totalSpent} + ${amount}`,
            updatedAt: new Date(),
          })
          .where(eq(userExilium.userId, userId));

        await tx
          .insert(exiliumLog)
          .values({ userId, amount: -amount, source, details: details ?? null });
      });
    },

    async tryDrop(userId: string, source: ExiliumSource, details?: unknown) {
      const config = await gameConfigService.getFullConfig();
      const rateKey = `exilium_drop_rate_${source}` as string;
      const rate = Number(config.universe[rateKey]) || 0;
      const dropAmount = Number(config.universe['exilium_drop_amount']) || 1;

      if (Math.random() < rate) {
        await this.earn(userId, dropAmount, source, details);
        return { dropped: true, amount: dropAmount };
      }
      return { dropped: false, amount: 0 };
    },

    async getLog(userId: string, limit = 50) {
      return db
        .select()
        .from(exiliumLog)
        .where(eq(exiliumLog.userId, userId))
        .orderBy(sql`${exiliumLog.createdAt} DESC`)
        .limit(limit);
    },
  };
}
```

**`apps/api/src/modules/exilium/exilium.router.ts`**

```typescript
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createExiliumService } from './exilium.service.js';

export function createExiliumRouter(exiliumService: ReturnType<typeof createExiliumService>) {
  return router({
    getBalance: protectedProcedure
      .query(async ({ ctx }) => {
        return exiliumService.getBalance(ctx.userId!);
      }),

    getLog: protectedProcedure
      .query(async ({ ctx }) => {
        return exiliumService.getLog(ctx.userId!);
      }),
  });
}
```

### Fichiers a modifier

**`apps/api/src/trpc/app-router.ts`** — ajouter :

```typescript
// Imports
import { createExiliumService } from '../modules/exilium/exilium.service.js';
import { createExiliumRouter } from '../modules/exilium/exilium.router.js';

// Dans buildAppRouter(), apres la creation des autres services :
const exiliumService = createExiliumService(db, gameConfigService);
const exiliumRouter = createExiliumRouter(exiliumService);

// Dans le return router({...}) :
exilium: exiliumRouter,
```

### Tests

Creer **`apps/api/src/modules/exilium/__tests__/exilium.service.test.ts`** :

```typescript
import { describe, it, expect } from 'vitest';
// Tester :
// - getBalance retourne 0 pour un nouveau joueur
// - earn() incremente le solde et total_earned
// - spend() decremente le solde et incremente total_spent
// - spend() avec solde insuffisant throw une erreur
// - tryDrop() avec rate=1 donne toujours un drop
// - tryDrop() avec rate=0 ne donne jamais un drop
// - getLog() retourne l'historique dans l'ordre anti-chronologique
```

### Verification

```bash
cd apps/api && npx tsc --noEmit
npx vitest run src/modules/exilium/
```

---

## Tache 4 — Backend Flagship

### Objectif

Creer le service flagship (create, get, rename, repair, incapacitate) et son router tRPC.

### Fichiers a creer

**`apps/api/src/modules/flagship/flagship.service.ts`**

```typescript
import { eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { flagships, planets } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';

// Regex de validation du nom : lettres (toutes langues), chiffres, espaces, tirets, apostrophes
const NAME_REGEX = /^[\p{L}\p{N}\s\-']{2,32}$/u;

export function createFlagshipService(
  db: Database,
  exiliumService: ReturnType<typeof createExiliumService>,
  gameConfigService: GameConfigService,
) {
  function validateName(name: string) {
    if (!NAME_REGEX.test(name)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Le nom doit contenir 2 a 32 caracteres (lettres, chiffres, espaces, tirets, apostrophes)',
      });
    }
  }

  function sanitizeText(text: string): string {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim();
  }

  return {
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
          return { ...flagship, status: 'active' as const, repairEndsAt: null };
        }
      }

      return flagship;
    },

    async create(userId: string, name: string, description?: string) {
      validateName(name);

      // Verifier qu'il n'y a pas deja un flagship
      const [existing] = await db
        .select({ id: flagships.id })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Vous avez deja un vaisseau amiral' });
      }

      // Recuperer la planete mere (premiere planete du joueur)
      const [homePlanet] = await db
        .select({ id: planets.id })
        .from(planets)
        .where(eq(planets.userId, userId))
        .limit(1);

      if (!homePlanet) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune planete trouvee' });
      }

      const sanitizedDesc = description ? sanitizeText(description).slice(0, 256) : '';

      const [created] = await db
        .insert(flagships)
        .values({
          userId,
          planetId: homePlanet.id,
          name: sanitizeText(name),
          description: sanitizedDesc,
        })
        .returning();

      return created;
    },

    async rename(userId: string, name: string, description?: string) {
      validateName(name);

      const [flagship] = await db
        .select({ id: flagships.id })
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun vaisseau amiral' });
      }

      const sanitizedDesc = description !== undefined
        ? sanitizeText(description).slice(0, 256)
        : undefined;

      const updateData: Record<string, unknown> = {
        name: sanitizeText(name),
        updatedAt: new Date(),
      };
      if (sanitizedDesc !== undefined) {
        updateData.description = sanitizedDesc;
      }

      const [updated] = await db
        .update(flagships)
        .set(updateData)
        .where(eq(flagships.id, flagship.id))
        .returning();

      return updated;
    },

    async repair(userId: string) {
      const [flagship] = await db
        .select()
        .from(flagships)
        .where(eq(flagships.userId, userId))
        .limit(1);

      if (!flagship) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucun vaisseau amiral' });
      }

      if (flagship.status !== 'incapacitated') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le vaisseau amiral n\'est pas incapacite' });
      }

      const config = await gameConfigService.getFullConfig();
      const cost = Number(config.universe['flagship_instant_repair_exilium_cost']) || 2;

      // Depenser l'Exilium (throw si solde insuffisant)
      await exiliumService.spend(userId, cost, 'flagship_repair', { flagshipId: flagship.id });

      const [updated] = await db
        .update(flagships)
        .set({ status: 'active', repairEndsAt: null, updatedAt: new Date() })
        .where(eq(flagships.id, flagship.id))
        .returning();

      return updated;
    },

    async incapacitate(userId: string) {
      const config = await gameConfigService.getFullConfig();
      const repairSeconds = Number(config.universe['flagship_repair_duration_seconds']) || 7200;

      // Recuperer la planete mere
      const [homePlanet] = await db
        .select({ id: planets.id })
        .from(planets)
        .where(eq(planets.userId, userId))
        .limit(1);

      if (!homePlanet) return;

      const repairEndsAt = new Date(Date.now() + repairSeconds * 1000);

      await db
        .update(flagships)
        .set({
          status: 'incapacitated',
          repairEndsAt,
          planetId: homePlanet.id,
          updatedAt: new Date(),
        })
        .where(eq(flagships.userId, userId));
    },

    // Helpers pour fleet integration
    async setInMission(userId: string) {
      await db
        .update(flagships)
        .set({ status: 'in_mission', updatedAt: new Date() })
        .where(eq(flagships.userId, userId));
    },

    async returnFromMission(userId: string, planetId: string) {
      await db
        .update(flagships)
        .set({ status: 'active', planetId, updatedAt: new Date() })
        .where(eq(flagships.userId, userId));
    },
  };
}
```

**`apps/api/src/modules/flagship/flagship.router.ts`**

```typescript
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFlagshipService } from './flagship.service.js';
import type { createTutorialService } from '../tutorial/tutorial.service.js';

export function createFlagshipRouter(
  flagshipService: ReturnType<typeof createFlagshipService>,
  tutorialService: ReturnType<typeof createTutorialService>,
) {
  return router({
    get: protectedProcedure
      .query(async ({ ctx }) => {
        return flagshipService.get(ctx.userId!);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(2).max(32),
        description: z.string().max(256).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const flagship = await flagshipService.create(ctx.userId!, input.name, input.description);

        // Declencher la completion du tutoriel
        const tutorialResult = await tutorialService.checkAndComplete(ctx.userId!, {
          type: 'flagship_named',
          targetId: 'any',
          targetValue: 1,
        });

        return { flagship, tutorialResult };
      }),

    rename: protectedProcedure
      .input(z.object({
        name: z.string().min(2).max(32),
        description: z.string().max(256).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return flagshipService.rename(ctx.userId!, input.name, input.description);
      }),

    repair: protectedProcedure
      .mutation(async ({ ctx }) => {
        return flagshipService.repair(ctx.userId!);
      }),
  });
}
```

### Fichiers a modifier

**`apps/api/src/trpc/app-router.ts`** — ajouter :

```typescript
// Imports
import { createFlagshipService } from '../modules/flagship/flagship.service.js';
import { createFlagshipRouter } from '../modules/flagship/flagship.router.js';

// Dans buildAppRouter() :
const flagshipService = createFlagshipService(db, exiliumService, gameConfigService);
const flagshipRouter = createFlagshipRouter(flagshipService, tutorialService);

// Dans le return router({...}) :
flagship: flagshipRouter,
```

### Tests

Creer **`apps/api/src/modules/flagship/__tests__/flagship.service.test.ts`** :

```typescript
// Tester :
// - create() cree un flagship avec les bonnes stats par defaut
// - create() avec un flagship existant throw CONFLICT
// - create() avec un nom invalide throw BAD_REQUEST
// - rename() modifie le nom et la description
// - get() retourne null si pas de flagship
// - get() auto-repare si repairEndsAt est depasse
// - incapacitate() met le status a 'incapacitated' et calcule repairEndsAt
// - repair() depense l'Exilium et remet le status a 'active'
// - repair() throw si le solde Exilium est insuffisant
```

### Verification

```bash
cd apps/api && npx tsc --noEmit
npx vitest run src/modules/flagship/
```

---

## Tache 5 — Backend Daily Quests

### Objectif

Creer le registre de quetes, la generation lazy, la detection de completion et l'integration avec le service Exilium.

### Fichiers a creer

**`apps/api/src/modules/daily-quest/quest-registry.ts`**

```typescript
export interface DailyQuestDefinition {
  id: string;
  name: string;
  description: string;
  /** Liste d'evenements qui peuvent declencher la completion */
  events: string[];
  /**
   * Condition de completion.
   * Recoit le payload de l'evenement + la config univers.
   * Retourne true si la quete est completee.
   */
  check: (event: QuestEvent, config: Record<string, unknown>) => boolean;
}

export interface QuestEvent {
  type: string;
  userId: string;
  payload: Record<string, unknown>;
}

export const DAILY_QUEST_REGISTRY: Record<string, DailyQuestDefinition> = {
  miner: {
    id: 'miner',
    name: 'Mineur assidu',
    description: 'Collecter {daily_quest_miner_threshold} ressources',
    events: ['resources:collected'],
    check: (event, config) => {
      const threshold = Number(config['daily_quest_miner_threshold']) || 5000;
      return (Number(event.payload.totalCollected) || 0) >= threshold;
    },
  },
  builder: {
    id: 'builder',
    name: 'Constructeur',
    description: 'Lancer ou terminer 1 construction',
    events: ['construction:started', 'construction:completed'],
    check: () => true,
  },
  navigator: {
    id: 'navigator',
    name: 'Navigateur',
    description: 'Envoyer 1 flotte',
    events: ['fleet:dispatched'],
    check: () => true,
  },
  bounty_hunter: {
    id: 'bounty_hunter',
    name: 'Chasseur de primes',
    description: 'Gagner 1 combat PvE',
    events: ['pve:victory'],
    check: () => true,
  },
  warrior: {
    id: 'warrior',
    name: 'Guerrier',
    description: 'Engager 1 combat PvP (en tant qu\'attaquant)',
    events: ['pvp:battle_resolved'],
    check: (event) => event.payload.role === 'attacker',
  },
  merchant: {
    id: 'merchant',
    name: 'Marchand',
    description: 'Completer 1 transaction sur le marche',
    events: ['market:transaction_completed'],
    check: () => true,
  },
  explorer: {
    id: 'explorer',
    name: 'Explorateur',
    description: 'Lancer 1 mission d\'expedition',
    events: ['fleet:dispatched'],
    check: (event) => event.payload.missionType === 'expedition',
  },
  recycler: {
    id: 'recycler',
    name: 'Recycleur',
    description: 'Envoyer 1 mission de recyclage',
    events: ['fleet:dispatched'],
    check: (event) => event.payload.missionType === 'recycle',
  },
};

export const QUEST_IDS = Object.keys(DAILY_QUEST_REGISTRY);
```

**`apps/api/src/modules/daily-quest/daily-quest.service.ts`**

```typescript
import { eq, sql } from 'drizzle-orm';
import { userExilium } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import { DAILY_QUEST_REGISTRY, QUEST_IDS } from './quest-registry.js';
import type { QuestEvent } from './quest-registry.js';
import type Redis from 'ioredis';
import { publishNotification } from '../notification/notification.publisher.js';

interface DailyQuestState {
  generated_at: string;
  quests: Array<{
    id: string;
    status: 'pending' | 'completed' | 'expired';
    completed_at?: string;
  }>;
}

function getUtcDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Tirer `count` quetes au hasard, en excluant `exclude` */
function drawQuests(count: number, exclude: string[]): string[] {
  const pool = QUEST_IDS.filter(id => !exclude.includes(id));
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function createDailyQuestService(
  db: Database,
  exiliumService: ReturnType<typeof createExiliumService>,
  gameConfigService: GameConfigService,
  redis: Redis,
) {
  return {
    /**
     * Retourne les quetes du jour pour le joueur.
     * Genere les quetes si elles n'existent pas encore.
     */
    async getQuests(userId: string): Promise<DailyQuestState> {
      const record = await exiliumService.getOrCreate(userId);
      const dayStart = getUtcDayStart();

      const existingState = record.dailyQuests as DailyQuestState | null;

      // Si on a deja des quetes pour aujourd'hui, les retourner
      if (existingState && new Date(existingState.generated_at) >= dayStart) {
        return existingState;
      }

      // Generation lazy : tirer 3 quetes en excluant celles de la veille
      const config = await gameConfigService.getFullConfig();
      const questCount = Number(config.universe['daily_quest_count']) || 3;
      const previousIds = existingState?.quests.map(q => q.id) ?? [];
      const drawn = drawQuests(questCount, previousIds);

      const newState: DailyQuestState = {
        generated_at: dayStart.toISOString(),
        quests: drawn.map(id => ({ id, status: 'pending' as const })),
      };

      await db
        .update(userExilium)
        .set({ dailyQuests: newState, updatedAt: new Date() })
        .where(eq(userExilium.userId, userId));

      return newState;
    },

    /**
     * Traiter un evenement et verifier si une quete journaliere est completee.
     */
    async processEvent(event: QuestEvent) {
      const record = await exiliumService.getOrCreate(event.userId);
      const dayStart = getUtcDayStart();

      // Verifier si deja complete aujourd'hui
      if (record.lastDailyAt && record.lastDailyAt >= dayStart) {
        return null; // Deja complete pour aujourd'hui
      }

      const state = record.dailyQuests as DailyQuestState | null;
      if (!state || new Date(state.generated_at) < dayStart) {
        return null; // Pas de quetes generees pour aujourd'hui
      }

      // Chercher une quete pending qui matche l'evenement
      const config = await gameConfigService.getFullConfig();

      for (const quest of state.quests) {
        if (quest.status !== 'pending') continue;

        const def = DAILY_QUEST_REGISTRY[quest.id];
        if (!def) continue;

        // L'evenement correspond-il a cette quete ?
        if (!def.events.includes(event.type)) continue;

        // La condition est-elle remplie ?
        if (!def.check(event, config.universe)) continue;

        // Completion ! Transaction atomique
        const reward = Number(config.universe['exilium_daily_quest_reward']) || 1;

        await db.transaction(async (tx) => {
          // Verrouiller pour eviter les race conditions
          const [locked] = await tx
            .select({ lastDailyAt: userExilium.lastDailyAt })
            .from(userExilium)
            .where(eq(userExilium.userId, event.userId))
            .for('update');

          if (locked?.lastDailyAt && locked.lastDailyAt >= dayStart) {
            return; // Race condition : deja complete entre-temps
          }

          // Marquer la quete completee, les autres expirees
          const updatedQuests = state.quests.map(q => {
            if (q.id === quest.id) {
              return { ...q, status: 'completed' as const, completed_at: new Date().toISOString() };
            }
            if (q.status === 'pending') {
              return { ...q, status: 'expired' as const };
            }
            return q;
          });

          const updatedState: DailyQuestState = {
            ...state,
            quests: updatedQuests,
          };

          await tx
            .update(userExilium)
            .set({
              dailyQuests: updatedState,
              lastDailyAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(userExilium.userId, event.userId));
        });

        // Crediter l'Exilium (hors transaction pour ne pas bloquer si ca echoue)
        await exiliumService.earn(event.userId, reward, 'daily_quest', { questId: quest.id });

        // Notification
        publishNotification(redis, event.userId, {
          type: 'daily-quest-completed',
          payload: {
            questId: quest.id,
            questName: def.name,
            reward,
          },
        });

        return { questId: quest.id, questName: def.name, reward };
      }

      return null;
    },
  };
}
```

**`apps/api/src/modules/daily-quest/daily-quest.router.ts`**

```typescript
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createDailyQuestService } from './daily-quest.service.js';
import { DAILY_QUEST_REGISTRY } from './quest-registry.js';

export function createDailyQuestRouter(dailyQuestService: ReturnType<typeof createDailyQuestService>) {
  return router({
    getQuests: protectedProcedure
      .query(async ({ ctx }) => {
        const state = await dailyQuestService.getQuests(ctx.userId!);
        // Enrichir avec les noms/descriptions du registre
        return {
          ...state,
          quests: state.quests.map(q => {
            const def = DAILY_QUEST_REGISTRY[q.id];
            return {
              ...q,
              name: def?.name ?? q.id,
              description: def?.description ?? '',
            };
          }),
        };
      }),
  });
}
```

### Fichiers a modifier

**`apps/api/src/trpc/app-router.ts`** — ajouter :

```typescript
// Imports
import { createDailyQuestService } from '../modules/daily-quest/daily-quest.service.js';
import { createDailyQuestRouter } from '../modules/daily-quest/daily-quest.router.js';

// Dans buildAppRouter() :
const dailyQuestService = createDailyQuestService(db, exiliumService, gameConfigService, redis);
const dailyQuestRouter = createDailyQuestRouter(dailyQuestService);

// Dans le return router({...}) :
dailyQuest: dailyQuestRouter,
```

### Tests

Creer **`apps/api/src/modules/daily-quest/__tests__/daily-quest.service.test.ts`** :

```typescript
// Tester :
// - getQuests() genere 3 quetes si aucune n'existe
// - getQuests() retourne les memes quetes pour le meme jour
// - getQuests() regenere le lendemain en excluant les quetes de la veille
// - processEvent() complete une quete et credite 1 Exilium
// - processEvent() ne credite pas si deja complete aujourd'hui (idempotent)
// - processEvent() ne matche pas un evenement non pertinent
// - processEvent() verifie la condition de la quete (ex: miner threshold)
```

Creer **`apps/api/src/modules/daily-quest/__tests__/quest-registry.test.ts`** :

```typescript
// Tester :
// - Le registre contient exactement 8 quetes
// - Chaque quete a un id, name, description, events, check
// - warrior.check() retourne true seulement si role === 'attacker'
// - explorer.check() retourne true seulement si missionType === 'expedition'
// - miner.check() retourne true si totalCollected >= threshold
```

### Verification

```bash
cd apps/api && npx tsc --noEmit
npx vitest run src/modules/daily-quest/
```

---

## Tache 6 — Hooks evenements

### Objectif

Ajouter des hooks dans les systemes existants pour :
1. La detection des quetes journalieres
2. Les drops aleatoires d'Exilium

### Fichiers a modifier

Chaque hook suit le meme pattern : apres l'action, appeler `dailyQuestService.processEvent()` et/ou `exiliumService.tryDrop()`. Le `dailyQuestService` et l'`exiliumService` doivent etre injectes dans les services ou workers concernes.

**1. Fleet dispatch — `apps/api/src/modules/fleet/fleet.service.ts`**

Apres l'insertion du fleet event (fin de `sendFleet()`), ajouter :

```typescript
// Ajouter dailyQuestService et exiliumService aux parametres de createFleetService
// A la fin de sendFleet(), apres l'insertion du fleet event :
if (dailyQuestService) {
  await dailyQuestService.processEvent({
    type: 'fleet:dispatched',
    userId,
    payload: { missionType: input.mission },
  }).catch(() => {}); // Ne pas bloquer l'envoi de flotte
}
```

**2. Combat PvP (victoire attaquant) — `apps/api/src/modules/fleet/handlers/attack.handler.ts`**

A la fin de `processArrival()`, apres la resolution du combat, si l'attaquant gagne :

```typescript
// Dans le contexte du handler, ajouter dailyQuestService et exiliumService via MissionHandlerContext
// Apres la resolution du combat :
if (ctx.dailyQuestService) {
  await ctx.dailyQuestService.processEvent({
    type: 'pvp:battle_resolved',
    userId: fleetEvent.userId,
    payload: { role: 'attacker', result: combatResult.outcome },
  }).catch(() => {});
}

// Drop d'Exilium si victoire PvP
if (combatResult.outcome === 'attacker' && ctx.exiliumService) {
  await ctx.exiliumService.tryDrop(fleetEvent.userId, 'pvp', {
    coords: `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`,
  }).catch(() => {});
}
```

**3. Recyclage retour — `apps/api/src/modules/fleet/handlers/recycle.handler.ts`**

Au retour de la flotte de recyclage :

```typescript
if (ctx.exiliumService) {
  await ctx.exiliumService.tryDrop(fleetEvent.userId, 'recycling', {
    fleetEventId: fleetEvent.id,
  }).catch(() => {});
}
```

**4. PvE victoire — `apps/api/src/modules/fleet/handlers/pirate.handler.ts`**

Apres une victoire PvE :

```typescript
if (ctx.dailyQuestService) {
  await ctx.dailyQuestService.processEvent({
    type: 'pve:victory',
    userId: fleetEvent.userId,
    payload: { missionId: fleetEvent.pveMissionId },
  }).catch(() => {});
}

if (ctx.exiliumService) {
  await ctx.exiliumService.tryDrop(fleetEvent.userId, 'pve', {
    missionId: fleetEvent.pveMissionId,
  }).catch(() => {});
}
```

**5. Market — `apps/api/src/modules/market/market.service.ts`**

Quand une transaction est finalisee (offre passe a `sold`) :

```typescript
// Apres la mise a jour du statut de l'offre :
if (this.dailyQuestService) {
  // Pour le vendeur
  await this.dailyQuestService.processEvent({
    type: 'market:transaction_completed',
    userId: sellerId,
    payload: {},
  }).catch(() => {});
  // Pour l'acheteur
  await this.dailyQuestService.processEvent({
    type: 'market:transaction_completed',
    userId: buyerId,
    payload: {},
  }).catch(() => {});
}

if (this.exiliumService) {
  await this.exiliumService.tryDrop(sellerId, 'market', { offerId }).catch(() => {});
}
```

**6. Construction — `apps/api/src/workers/build-completion.worker.ts`**

Apres la completion d'une construction/recherche :

```typescript
if (dailyQuestService) {
  await dailyQuestService.processEvent({
    type: 'construction:completed',
    userId,
    payload: { buildingId },
  }).catch(() => {});
}
```

**7. Resource collect — `apps/api/src/modules/resource/resource.service.ts`**

Apres une collecte manuelle de ressources :

```typescript
if (dailyQuestService) {
  await dailyQuestService.processEvent({
    type: 'resources:collected',
    userId,
    payload: { totalCollected },
  }).catch(() => {});
}
```

### Modification de MissionHandlerContext

**`apps/api/src/modules/fleet/fleet.types.ts`** — etendre l'interface :

```typescript
// Ajouter dans MissionHandlerContext :
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { createDailyQuestService } from '../daily-quest/daily-quest.service.js';

export interface MissionHandlerContext {
  // ... existants ...
  exiliumService?: ReturnType<typeof createExiliumService>;
  dailyQuestService?: ReturnType<typeof createDailyQuestService>;
}
```

**`apps/api/src/modules/fleet/fleet.service.ts`** — passer les nouveaux services dans `handlerCtx` dans `createFleetService()` :

```typescript
// Ajouter exiliumService et dailyQuestService aux parametres de createFleetService
export function createFleetService(
  db: Database,
  // ... existants ...
  exiliumService?: ReturnType<typeof createExiliumService>,
  dailyQuestService?: ReturnType<typeof createDailyQuestService>,
) {
  // Dans handlerCtx :
  const handlerCtx: MissionHandlerContext = {
    // ... existants ...
    exiliumService,
    dailyQuestService,
  };
}
```

**`apps/api/src/trpc/app-router.ts`** — passer les services au fleet service :

```typescript
const fleetService = createFleetService(
  db, resourceService, fleetQueue, messageService, gameConfigService, redis,
  pveService, asteroidBeltService, pirateService, reportService,
  exiliumService, dailyQuestService, // Nouveaux
);
```

### Tests

```typescript
// Pour chaque hook, tester :
// - L'action de base fonctionne toujours (regression)
// - Le hook est appele apres l'action
// - Le hook ne bloque pas l'action si il echoue (catch)
```

### Verification

```bash
cd apps/api && npx tsc --noEmit
npx vitest run
```

---

## Tache 7 — Modification onboarding

### Objectif

Modifier les quetes 11-12 dans le seed, ajouter la condition `flagship_named` dans le tutorial service, et lier le endpoint `flagship.create` au tutoriel.

### Fichiers a modifier

**1. `packages/db/src/seed-game-config.ts`** — modifier les quetes 11 et 12 dans le tableau `TUTORIAL_QUESTS` :

Remplacer la ligne de quest_11 :

```typescript
// Avant :
{ id: 'quest_11', order: 11, title: 'Premier vol', narrativeText: "Le moment est historique. Construisez votre premier Explorateur et ouvrez la voie vers les systemes voisins.", conditionType: 'ship_count', conditionLabel: 'Nombre vaisseaux', conditionTargetId: 'explorer', conditionTargetValue: 1, rewardMinerai: 600, rewardSilicium: 350, rewardHydrogene: 150 },

// Apres :
{ id: 'quest_11', order: 11, title: 'Vaisseau amiral', narrativeText: "Commandant, votre chantier spatial a detecte un signal faible en provenance du secteur voisin. C'est un ancien vaisseau eclaireur, a la derive depuis des decennies. Nos ingenieurs l'ont remorque et remis en etat. Ce sera votre vaisseau personnel -- votre amiral. Donnez-lui un nom.", conditionType: 'flagship_named', conditionLabel: 'Nommer le vaisseau', conditionTargetId: 'any', conditionTargetValue: 1, rewardMinerai: 600, rewardSilicium: 350, rewardHydrogene: 150 },
```

Remplacer le narrativeText de quest_12 :

```typescript
// Avant :
narrativeText: "Nos scanners ont detecte un vaisseau de transport abandonne dans la ceinture d'asteroides en [{galaxy}:{system}:8]. Envoyez votre explorateur recuperer la cargaison !"

// Apres :
narrativeText: "Nos scanners ont detecte un vaisseau de transport abandonne dans la ceinture d'asteroides en [{galaxy}:{system}:8]. Envoyez votre vaisseau amiral recuperer la cargaison !"
```

**2. `apps/api/src/modules/tutorial/tutorial.service.ts`** — ajouter `flagship_named` :

Modifier le type union :

```typescript
// Avant :
type: 'building_level' | 'ship_count' | 'mission_complete' | 'research_level' | 'fleet_return';

// Apres :
type: 'building_level' | 'ship_count' | 'mission_complete' | 'research_level' | 'fleet_return' | 'flagship_named';
```

Ajouter l'import de flagships en haut du fichier :

```typescript
import { tutorialProgress, planets, planetBuildings, planetShips, tutorialQuestDefinitions, userResearch, fleetEvents, pveMissions, flagships } from '@exilium/db';
```

Ajouter la branche dans `checkCompletion()`, apres le bloc `mission_complete` :

```typescript
} else if (quest.condition.type === 'flagship_named') {
  const [flagship] = await db
    .select({ id: flagships.id })
    .from(flagships)
    .where(eq(flagships.userId, userId))
    .limit(1);
  conditionMet = !!flagship;
}
```

**3. L'endpoint `flagship.create` dans le router** (deja fait dans T4) appelle deja `tutorialService.checkAndComplete()` avec le type `flagship_named`. Rien a ajouter ici.

### Tests

```bash
# Re-run le seed
npx tsx packages/db/src/seed-game-config.ts

# Verifier la quete 11
psql $DATABASE_URL -c "
  SELECT id, title, condition_type, condition_target_id
  FROM tutorial_quest_definitions
  WHERE id IN ('quest_11', 'quest_12');
"
# quest_11 : 'Vaisseau amiral', 'flagship_named', 'any'
# quest_12 : texte contient 'vaisseau amiral'
```

### Verification

```bash
cd apps/api && npx tsc --noEmit
npx tsx packages/db/src/seed-game-config.ts
```

---

## Tache 8 — Integration flagship dans les flottes

### Objectif

Permettre au flagship de participer aux missions de flotte : composition, fleet events, combat handler (incapacitation au lieu de destruction).

### Fichiers a modifier

**1. `apps/api/src/modules/fleet/fleet.service.ts`** — modifier `sendFleet()` :

Apres la validation des vaisseaux dans `planetShipRow`, ajouter la gestion du flagship :

```typescript
// Apres la boucle de validation des ships classiques, ajouter :
let hasFlagship = false;
if (input.ships['flagship'] && input.ships['flagship'] > 0) {
  hasFlagship = true;
  // Verifier que le flagship est disponible sur cette planete
  if (!flagshipService) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Service flagship non disponible' });
  }
  const flagship = await flagshipService.get(userId);
  if (!flagship) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous n\'avez pas de vaisseau amiral' });
  }
  if (flagship.status !== 'active') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Votre vaisseau amiral n\'est pas disponible (statut: ' + flagship.status + ')' });
  }
  if (flagship.planetId !== input.originPlanetId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Votre vaisseau amiral n\'est pas sur cette planete' });
  }
}
```

Modifier le calcul de vitesse pour inclure le flagship :

```typescript
// Construire un shipStatsMap etendu qui inclut le flagship
// Le flagship doit avoir ses stats injectees dans le calcul de vitesse et cargo
if (hasFlagship && flagshipService) {
  const flagship = await flagshipService.get(userId);
  if (flagship) {
    shipStatsMap['flagship'] = {
      baseSpeed: flagship.baseSpeed,
      fuelConsumption: flagship.fuelConsumption,
      cargoCapacity: flagship.cargoCapacity,
      driveType: flagship.driveType,
    };
  }
}
```

Apres l'insertion du fleet event, mettre le flagship en mission :

```typescript
if (hasFlagship && flagshipService) {
  await flagshipService.setInMission(userId);
}
```

**2. `apps/api/src/modules/fleet/fleet.service.ts`** — modifier `processReturn()` :

Au retour de la flotte, remettre le flagship disponible :

```typescript
// A la fin de processReturn(), avant de retourner le resultat :
const ships = fleetEvent.ships as Record<string, number>;
if (ships['flagship'] && ships['flagship'] > 0 && flagshipService) {
  await flagshipService.returnFromMission(fleetEvent.userId, fleetEvent.originPlanetId);
}
```

**3. `apps/api/src/modules/fleet/handlers/attack.handler.ts`** — gerer l'incapacitation :

Apres la resolution du combat, dans la boucle de destruction des vaisseaux :

```typescript
// Dans la boucle des pertes de l'attaquant :
if (unitId === 'flagship' && destroyedCount > 0) {
  // Le flagship est incapacite, pas detruit
  if (ctx.flagshipService) {
    await ctx.flagshipService.incapacitate(fleetEvent.userId);
  }
  // Ne pas le retirer du ships JSONB (pour le rapport)
  // Mais ne pas le restituer au retour
  flagshipDestroyed = true;
  continue; // Skip la logique de destruction standard
}
```

A la fin, quand on schedule le retour, si le flagship a ete detruit, le retirer du JSONB `ships` de retour (il est deja teleporte sur la planete mere) :

```typescript
const returnShips = { ...survivingShips };
if (flagshipDestroyed) {
  delete returnShips['flagship'];
}
```

**4. Ajouter `flagshipService` dans `createFleetService()`** et dans `MissionHandlerContext` :

```typescript
// fleet.types.ts - ajouter :
import type { createFlagshipService } from '../flagship/flagship.service.js';

export interface MissionHandlerContext {
  // ... existants ...
  flagshipService?: ReturnType<typeof createFlagshipService>;
}

// fleet.service.ts - ajouter le parametre :
export function createFleetService(
  // ... existants ...
  flagshipService?: ReturnType<typeof createFlagshipService>,
) {
  // handlerCtx :
  const handlerCtx: MissionHandlerContext = {
    // ... existants ...
    flagshipService,
  };
}
```

**5. `apps/api/src/trpc/app-router.ts`** — passer flagshipService a fleetService :

```typescript
const fleetService = createFleetService(
  db, resourceService, fleetQueue, messageService, gameConfigService, redis,
  pveService, asteroidBeltService, pirateService, reportService,
  exiliumService, dailyQuestService, flagshipService,
);
```

### Tests

```typescript
// Tester :
// - sendFleet() avec flagship:1 verifie la disponibilite du flagship
// - sendFleet() refuse si le flagship est incapacite
// - sendFleet() refuse si le flagship n'est pas sur la bonne planete
// - processReturn() remet le flagship en active
// - En combat, le flagship est incapacite au lieu d'etre detruit
// - Le flagship incapacite est teleporte sur la planete mere
// - Le flagship n'est pas dans le returnShips apres incapacitation
// - La vitesse de la flotte prend en compte les stats du flagship
```

### Verification

```bash
cd apps/api && npx tsc --noEmit
npx vitest run src/modules/fleet/
```

---

## Tache 9 — Frontend Exilium

### Objectif

Afficher le solde d'Exilium dans le header/profil.

### Fichiers a creer

**`apps/web/src/components/common/ExiliumIcon.tsx`**

```tsx
export function ExiliumIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Icone cristal/gemme stylise */}
      <path d="M12 2L3 9l9 13 9-13-9-7z" fill="currentColor" opacity={0.3} />
      <path d="M12 2L3 9l9 13 9-13-9-7z" stroke="currentColor" strokeWidth={1.5} fill="none" />
      <path d="M3 9h18M12 2v20" stroke="currentColor" strokeWidth={1} opacity={0.5} />
    </svg>
  );
}
```

**`apps/web/src/hooks/useExilium.ts`**

```typescript
import { trpc } from '@/trpc';

export function useExilium() {
  return trpc.exilium.getBalance.useQuery(undefined, {
    refetchInterval: 30_000, // Refresh toutes les 30s
  });
}
```

### Fichiers a modifier

**`apps/web/src/components/layout/TopBar.tsx`** (ou `Sidebar.tsx` selon la layout) — ajouter l'affichage du solde Exilium :

```tsx
import { useExilium } from '@/hooks/useExilium';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';

// Dans le composant, ajouter :
const { data: exiliumData } = useExilium();

// Dans le JSX, a cote des autres infos du header :
{exiliumData && (
  <div className="flex items-center gap-1">
    <ExiliumIcon size={14} className="text-purple-400" />
    <span className="text-sm font-medium tabular-nums text-purple-400">
      {exiliumData.balance}
    </span>
  </div>
)}
```

### Tests

```
- Verifier visuellement que l'icone Exilium s'affiche dans le header
- Verifier que le solde se met a jour apres un gain
- Verifier que le composant ne crash pas si le joueur n'a pas de record user_exilium
```

### Verification

```bash
cd apps/web && npx tsc --noEmit
```

---

## Tache 10 — Frontend Flagship

### Objectif

Creer la modale de nommage (onboarding), afficher le flagship dans la fleet UI, creer une page flagship basique.

### Fichiers a creer

**`apps/web/src/components/flagship/FlagshipNamingModal.tsx`**

```tsx
import { useState } from 'react';
import { trpc } from '@/trpc';

interface FlagshipNamingModalProps {
  open: boolean;
  onClose: () => void;
}

const NAME_REGEX = /^[\p{L}\p{N}\s\-']{2,32}$/u;

export function FlagshipNamingModal({ open, onClose }: FlagshipNamingModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const utils = trpc.useUtils();
  const createMutation = trpc.flagship.create.useMutation({
    onSuccess: () => {
      utils.tutorial.getCurrent.invalidate();
      utils.flagship.get.invalidate();
      onClose();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  if (!open) return null;

  const isValid = name.length >= 2 && name.length <= 32 && NAME_REGEX.test(name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-amber-500/30 bg-card p-6 shadow-xl">
        <h2 className="text-lg font-bold text-amber-400">Votre vaisseau amiral</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nos ingenieurs ont remis ce vaisseau en etat. Donnez-lui un nom, Commandant.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground">
              Nom <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Ex : Odyssee, Nemesis, Aurore..."
              maxLength={32}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <span className="text-[10px] text-muted-foreground">{name.length}/32 caracteres</span>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Description (optionnelle)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={256}
              rows={2}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <span className="text-[10px] text-muted-foreground">{description.length}/256 caracteres</span>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <button
          onClick={() => createMutation.mutate({ name, description: description || undefined })}
          disabled={!isValid || createMutation.isPending}
          className="mt-4 w-full rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creation...' : 'Baptiser le vaisseau'}
        </button>
      </div>
    </div>
  );
}
```

### Fichiers a modifier

**`apps/web/src/components/tutorial/TutorialPanel.tsx`** — ajouter le bouton et la modale pour la quete 11 :

Ajouter l'import :

```typescript
import { FlagshipNamingModal } from '@/components/flagship/FlagshipNamingModal';
```

Ajouter l'etat de la modale :

```typescript
const [showNamingModal, setShowNamingModal] = useState(false);
```

Dans le JSX, apres le `{fleetLink && ...}` block :

```tsx
{quest.id === 'quest_11' && (
  <>
    <button
      onClick={() => setShowNamingModal(true)}
      className="mt-1.5 text-[11px] font-medium text-amber-400 underline underline-offset-2 transition-colors hover:text-amber-300"
    >
      Nommer votre vaisseau &rarr;
    </button>
    <FlagshipNamingModal
      open={showNamingModal}
      onClose={() => setShowNamingModal(false)}
    />
  </>
)}
```

**`apps/web/src/components/fleet/FleetComposition.tsx`** — afficher le flagship dans la composition :

Ajouter un hook pour recuperer le flagship :

```typescript
import { trpc } from '@/trpc';

// Dans le composant parent qui rend FleetComposition :
const { data: flagship } = trpc.flagship.get.useQuery();

// Ajouter le flagship comme un "vaisseau" dans la liste, en premier :
if (flagship && flagship.status === 'active' && flagship.planetId === originPlanetId) {
  ships.unshift({
    id: 'flagship',
    name: flagship.name,
    count: 1,
    isStationary: false,
  });
}
```

**`apps/web/src/pages/Fleet.tsx`** (ou page equivalente) — creer une section flagship basique avec lien vers une future page dediee.

### Tests

```
- La modale s'ouvre au clic sur "Nommer votre vaisseau" pendant la quete 11
- La validation du nom fonctionne (min 2 car, max 32, regex)
- Le bouton est desactive si le nom est invalide
- Apres validation, la modale se ferme et le TutorialPanel se rafraichit
- Le flagship apparait dans la FleetComposition s'il est sur la bonne planete
- Le flagship n'apparait pas s'il est en mission ou incapacite
```

### Verification

```bash
cd apps/web && npx tsc --noEmit
```

---

## Tache 11 — Frontend Daily Quests

### Objectif

Creer le widget de quetes journalieres et les notifications de completion.

### Fichiers a creer

**`apps/web/src/components/daily-quests/DailyQuestWidget.tsx`**

```tsx
import { trpc } from '@/trpc';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
import { useState, useEffect } from 'react';

export function DailyQuestWidget() {
  const { data, isLoading } = trpc.dailyQuest.getQuests.useQuery(undefined, {
    refetchInterval: 60_000, // Refresh chaque minute
  });
  const [collapsed, setCollapsed] = useState(false);

  if (isLoading || !data) return null;

  const hasCompleted = data.quests.some(q => q.status === 'completed');
  const pendingCount = data.quests.filter(q => q.status === 'pending').length;

  // Calculer le temps restant avant 23:59:59 UTC
  const now = new Date();
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
  const msRemaining = Math.max(0, endOfDay.getTime() - now.getTime());
  const hoursRemaining = Math.floor(msRemaining / 3600000);
  const minutesRemaining = Math.floor((msRemaining % 3600000) / 60000);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-card/95 px-3 py-2 text-xs backdrop-blur-sm"
      >
        <ExiliumIcon size={12} className="text-purple-400" />
        <span className="text-purple-400">
          {hasCompleted ? 'Completee' : `${pendingCount}/3`}
        </span>
      </button>
    );
  }

  return (
    <div className="w-72 rounded-lg border border-purple-500/30 bg-card/95 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <ExiliumIcon size={14} className="text-purple-400" />
          <span className="text-xs font-semibold text-purple-400">Quetes du jour</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">1 Exilium</span>
          <button
            onClick={() => setCollapsed(true)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {data.quests.map(quest => (
          <div key={quest.id} className="flex items-start gap-2">
            <div className="mt-0.5">
              {quest.status === 'completed' ? (
                <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : quest.status === 'expired' ? (
                <svg className="h-4 w-4 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <div className="h-4 w-4 rounded border border-border" />
              )}
            </div>
            <div>
              <span className={`text-xs font-medium ${
                quest.status === 'completed' ? 'text-emerald-400' :
                quest.status === 'expired' ? 'text-muted-foreground/40 line-through' :
                'text-foreground'
              }`}>
                {quest.name}
              </span>
              <p className={`text-[10px] ${
                quest.status === 'expired' ? 'text-muted-foreground/30' : 'text-muted-foreground'
              }`}>
                {quest.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border/50 px-3 py-1.5">
        <span className={`text-[10px] ${hoursRemaining < 1 ? 'text-destructive' : 'text-muted-foreground'}`}>
          Expire dans {hoursRemaining}h {minutesRemaining.toString().padStart(2, '0')}m
        </span>
      </div>
    </div>
  );
}
```

### Fichiers a modifier

**`apps/web/src/components/layout/Layout.tsx`** (ou `Sidebar.tsx`) — integrer le widget :

```tsx
import { DailyQuestWidget } from '@/components/daily-quests/DailyQuestWidget';

// Dans le layout, sous le ResourceBar ou dans la sidebar :
<DailyQuestWidget />
```

**Notification SSE** — ajouter le handler pour le type `daily-quest-completed` dans le systeme de notifications existant, pour afficher un toast :

```typescript
// Dans le hook/composant qui ecoute les SSE :
case 'daily-quest-completed':
  toast({
    title: `Quete completee : ${payload.questName}`,
    description: `+${payload.reward} Exilium`,
    variant: 'success',
  });
  // Invalider les queries
  utils.exilium.getBalance.invalidate();
  utils.dailyQuest.getQuests.invalidate();
  break;
```

### Tests

```
- Le widget s'affiche avec 3 quetes si le joueur a des quetes actives
- Le widget se replie/deplie correctement
- Le timer d'expiration se met a jour
- Une quete completee s'affiche en vert avec une coche
- Les quetes restantes sont grisees apres une completion
- Le toast de notification s'affiche a la completion
- Le solde Exilium se met a jour apres la completion
```

### Verification

```bash
cd apps/web && npx tsc --noEmit
```

---

## Tache 12 — Migration joueurs existants

### Objectif

Creer retroactivement les flagships pour les joueurs qui ont deja passe la quete 11, et initialiser les records `user_exilium` pour tous les joueurs.

### Fichier a creer

**`packages/db/src/scripts/migrate-flagships.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql, and } from 'drizzle-orm';
import { users } from '../schema/users.js';
import { planets } from '../schema/planets.js';
import { userExilium } from '../schema/user-exilium.js';
import { flagships } from '../schema/flagships.js';
import { tutorialProgress } from '../schema/tutorial-progress.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://exilium:exilium@localhost:5432/exilium';
const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function migrate() {
  console.log('Migration Phase 1 : Exilium + Flagship...');

  // 1. Creer un record user_exilium pour chaque joueur qui n'en a pas
  const allUsers = await db.select({ id: users.id }).from(users);

  let exiliumCreated = 0;
  for (const user of allUsers) {
    const [existing] = await db
      .select({ userId: userExilium.userId })
      .from(userExilium)
      .where(eq(userExilium.userId, user.id))
      .limit(1);

    if (!existing) {
      await db.insert(userExilium).values({ userId: user.id });
      exiliumCreated++;
    }
  }
  console.log(`  -> ${exiliumCreated} records user_exilium crees`);

  // 2. Creer un flagship pour chaque joueur ayant deja passe la quete 11
  const allProgress = await db
    .select()
    .from(tutorialProgress);

  let flagshipsCreated = 0;
  for (const progress of allProgress) {
    const completedQuests = (progress.completedQuests as Array<{ questId: string }>) || [];
    const hasCompletedQuest11 = completedQuests.some(q => q.questId === 'quest_11');

    // Le joueur est au-dela de la quete 11 OU l'a completee
    const currentOrder = parseInt(progress.currentQuestId.replace('quest_', ''), 10);
    const isPassedQuest11 = hasCompletedQuest11 || currentOrder > 11 || progress.isComplete;

    if (!isPassedQuest11) continue;

    // Verifier qu'il n'a pas deja un flagship
    const [existingFlagship] = await db
      .select({ id: flagships.id })
      .from(flagships)
      .where(eq(flagships.userId, progress.userId))
      .limit(1);

    if (existingFlagship) continue;

    // Recuperer la planete mere
    const [homePlanet] = await db
      .select({ id: planets.id })
      .from(planets)
      .where(eq(planets.userId, progress.userId))
      .limit(1);

    if (!homePlanet) continue;

    await db.insert(flagships).values({
      userId: progress.userId,
      planetId: homePlanet.id,
      name: 'Vaisseau amiral',
      description: '',
    });
    flagshipsCreated++;
  }
  console.log(`  -> ${flagshipsCreated} flagships crees retroactivement`);

  console.log('Migration terminee.');
  await client.end();
}

migrate().catch(console.error);
```

### Execution

```bash
npx tsx packages/db/src/scripts/migrate-flagships.ts
```

### Tests

```bash
# Verifier que tous les joueurs ont un record user_exilium
psql $DATABASE_URL -c "
  SELECT count(*) as users_without_exilium
  FROM users u
  LEFT JOIN user_exilium ue ON u.id = ue.user_id
  WHERE ue.user_id IS NULL;
"
# Doit retourner 0

# Verifier que tous les joueurs qui ont passe la quete 11 ont un flagship
psql $DATABASE_URL -c "
  SELECT count(*) as users_without_flagship
  FROM tutorial_progress tp
  LEFT JOIN flagships f ON tp.user_id = f.user_id
  WHERE (tp.is_complete = true OR tp.current_quest_id > 'quest_11')
  AND f.user_id IS NULL;
"
# Doit retourner 0
```

### Verification

```bash
npx tsx packages/db/src/scripts/migrate-flagships.ts
```

---

## Resume des fichiers par tache

| Tache | Fichiers crees | Fichiers modifies |
|-------|---------------|-------------------|
| T1 Schema DB | `packages/db/src/schema/user-exilium.ts`, `exilium-log.ts`, `flagships.ts` | `packages/db/src/schema/index.ts` |
| T2 Seed config | — | `packages/db/src/seed-game-config.ts` |
| T3 Backend Exilium | `apps/api/src/modules/exilium/exilium.service.ts`, `exilium.router.ts` | `apps/api/src/trpc/app-router.ts` |
| T4 Backend Flagship | `apps/api/src/modules/flagship/flagship.service.ts`, `flagship.router.ts` | `apps/api/src/trpc/app-router.ts` |
| T5 Backend Daily Quests | `apps/api/src/modules/daily-quest/quest-registry.ts`, `daily-quest.service.ts`, `daily-quest.router.ts` | `apps/api/src/trpc/app-router.ts` |
| T6 Hooks evenements | — | `fleet.service.ts`, `fleet.types.ts`, `attack.handler.ts`, `recycle.handler.ts`, `pirate.handler.ts`, `market.service.ts`, `build-completion.worker.ts`, `resource.service.ts`, `app-router.ts` |
| T7 Onboarding | — | `seed-game-config.ts`, `tutorial.service.ts` |
| T8 Fleet integration | — | `fleet.service.ts`, `fleet.types.ts`, `attack.handler.ts`, `app-router.ts` |
| T9 Frontend Exilium | `apps/web/src/components/common/ExiliumIcon.tsx`, `apps/web/src/hooks/useExilium.ts` | `TopBar.tsx` ou `Sidebar.tsx` |
| T10 Frontend Flagship | `apps/web/src/components/flagship/FlagshipNamingModal.tsx` | `TutorialPanel.tsx`, `FleetComposition.tsx` |
| T11 Frontend Daily Quests | `apps/web/src/components/daily-quests/DailyQuestWidget.tsx` | `Layout.tsx` ou `Sidebar.tsx`, systeme SSE |
| T12 Migration | `packages/db/src/scripts/migrate-flagships.ts` | — |

---

## Ordre d'execution recommande

```
T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9 -> T10 -> T11 -> T12
```

Les taches 9-11 (frontend) sont independantes entre elles et peuvent etre parallelisees. La tache 12 doit etre executee en dernier, apres le deploiement du code.

---

## Parametres configurables (universe_config)

| Cle | Valeur par defaut | Utilise par |
|-----|-------------------|-------------|
| `exilium_daily_quest_reward` | 1 | Daily quest completion |
| `exilium_drop_amount` | 1 | Drops aleatoires |
| `exilium_drop_rate_expedition` | 0.05 | Hook expedition |
| `exilium_drop_rate_pvp` | 0.03 | Hook combat PvP |
| `exilium_drop_rate_pve` | 0.04 | Hook combat PvE |
| `exilium_drop_rate_market` | 0.02 | Hook marche |
| `exilium_drop_rate_recycling` | 0.02 | Hook recyclage |
| `flagship_repair_duration_seconds` | 7200 | Incapacitation |
| `flagship_instant_repair_exilium_cost` | 2 | Reparation instantanee |
| `daily_quest_count` | 3 | Generation lazy |
| `daily_quest_miner_threshold` | 5000 | Quete "Mineur assidu" |
