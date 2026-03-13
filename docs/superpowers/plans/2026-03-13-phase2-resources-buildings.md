# Phase 2 : Ressources + Batiments — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter la production de ressources (calcul lazy + materialisation), la construction de batiments (avec file d'attente BullMQ), et les pages frontend Ressources/Batiments avec compteurs temps reel.

**Architecture:** Les ressources sont calculees a la demande (lazy) depuis `resourcesUpdatedAt` + taux de production. Les depenses sont atomiques (UPDATE WHERE >= cost). La construction de batiments passe par `build_queue` + un delayed job BullMQ qui complete la construction. Un cron 30s rattrape les events rates, un cron 15min materialise les ressources.

**Tech Stack:** game-engine (formules pures), Drizzle ORM (schema build_queue), BullMQ + Redis (delayed jobs), Fastify + tRPC (API), React + TanStack Query (frontend)

---

## File Structure

### game-engine (nouvelles formules pures)

| File | Responsabilite |
|------|---------------|
| `packages/game-engine/src/constants/buildings.ts` | Definitions des 10 batiments : id, nom, couts base, temps base, prerequis |
| `packages/game-engine/src/formulas/building-cost.ts` | `buildingCost(buildingId, level)` + `buildingTime(buildingId, level, roboticsLevel)` |
| `packages/game-engine/src/formulas/building-cost.test.ts` | Tests avec valeurs wiki OGame |
| `packages/game-engine/src/formulas/resources.ts` | `calculateResources(planet, now)` — lazy calc complet (production + factor + storage cap) |
| `packages/game-engine/src/formulas/resources.test.ts` | Tests lazy calc |

### db (nouveau schema)

| File | Responsabilite |
|------|---------------|
| `packages/db/src/schema/build-queue.ts` | Table `build_queue` (id, planet_id, user_id, type, item_id, start_time, end_time, status) |
| `packages/db/src/schema/planets.ts` | Ajouter colonne `production_factor` NUMERIC DEFAULT 1 |

### api (modules resource + building + workers)

| File | Responsabilite |
|------|---------------|
| `apps/api/src/modules/resource/resource.service.ts` | `materializeResources(planet)`, `spendResources(tx, planetId, userId, cost)` |
| `apps/api/src/modules/resource/resource.router.ts` | `resource.production` — taux de prod horaire pour la planete |
| `apps/api/src/modules/building/building.service.ts` | `listBuildings`, `startUpgrade`, `cancelUpgrade` |
| `apps/api/src/modules/building/building.router.ts` | tRPC router building (list, upgrade, cancel) |
| `apps/api/src/queues/queue.ts` | Setup BullMQ : connexion Redis, export des queues |
| `apps/api/src/workers/building-completion.worker.ts` | Worker qui complete la construction |
| `apps/api/src/workers/worker.ts` | Entrypoint worker process (lance tous les workers + crons) |
| `apps/api/src/cron/event-catchup.ts` | Cron 30s : rattrapage events build_queue expires |
| `apps/api/src/cron/resource-tick.ts` | Cron 15min : materialise ressources planetes actives |

### web (pages + hooks)

| File | Responsabilite |
|------|---------------|
| `apps/web/src/hooks/useResourceCounter.ts` | Hook interpole ressources a 1Hz cote client |
| `apps/web/src/pages/Resources.tsx` | Page Ressources (production horaire, stockage, compteurs) |
| `apps/web/src/pages/Buildings.tsx` | Page Batiments (niveaux, couts, bouton upgrade, timer) |
| `apps/web/src/components/common/ResourceCost.tsx` | Composant affichage cout (metal/cristal/deut) |
| `apps/web/src/components/layout/TopBar.tsx` | Mise a jour : compteurs temps reel via useResourceCounter |

---

## Chunk 1: Game Engine — Constantes et Formules Batiments

### Task 1: Constantes des batiments

**Files:**
- Create: `packages/game-engine/src/constants/buildings.ts`

- [ ] **Step 1: Creer le fichier de constantes**

```typescript
// packages/game-engine/src/constants/buildings.ts

export type BuildingId =
  | 'metalMine'
  | 'crystalMine'
  | 'deutSynth'
  | 'solarPlant'
  | 'robotics'
  | 'shipyard'
  | 'researchLab'
  | 'storageMetal'
  | 'storageCrystal'
  | 'storageDeut';

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  description: string;
  baseCost: { metal: number; crystal: number; deuterium: number };
  costFactor: number; // multiplicateur par niveau (generalement 1.5 pour mines, 2 pour autres)
  baseTime: number; // temps base en secondes pour niveau 1
  /** Colonne correspondante dans la table planets */
  levelColumn: string;
  prerequisites: { buildingId: BuildingId; level: number }[];
}

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  metalMine: {
    id: 'metalMine',
    name: 'Mine de métal',
    description: 'Produit du métal, ressource de base.',
    baseCost: { metal: 60, crystal: 15, deuterium: 0 },
    costFactor: 1.5,
    baseTime: 60, // 1 min pour lvl 1 avec robotics 0
    levelColumn: 'metalMineLevel',
    prerequisites: [],
  },
  crystalMine: {
    id: 'crystalMine',
    name: 'Mine de cristal',
    description: 'Produit du cristal.',
    baseCost: { metal: 48, crystal: 24, deuterium: 0 },
    costFactor: 1.6,
    baseTime: 60,
    levelColumn: 'crystalMineLevel',
    prerequisites: [],
  },
  deutSynth: {
    id: 'deutSynth',
    name: 'Synthétiseur de deutérium',
    description: 'Produit du deutérium.',
    baseCost: { metal: 225, crystal: 75, deuterium: 0 },
    costFactor: 1.5,
    baseTime: 60,
    levelColumn: 'deutSynthLevel',
    prerequisites: [],
  },
  solarPlant: {
    id: 'solarPlant',
    name: 'Centrale solaire',
    description: 'Produit de l\'énergie.',
    baseCost: { metal: 75, crystal: 30, deuterium: 0 },
    costFactor: 1.5,
    baseTime: 60,
    levelColumn: 'solarPlantLevel',
    prerequisites: [],
  },
  robotics: {
    id: 'robotics',
    name: 'Usine de robots',
    description: 'Réduit le temps de construction.',
    baseCost: { metal: 400, crystal: 120, deuterium: 200 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'roboticsLevel',
    prerequisites: [],
  },
  shipyard: {
    id: 'shipyard',
    name: 'Chantier spatial',
    description: 'Construit vaisseaux et défenses.',
    baseCost: { metal: 400, crystal: 200, deuterium: 100 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'shipyardLevel',
    prerequisites: [{ buildingId: 'robotics', level: 2 }],
  },
  researchLab: {
    id: 'researchLab',
    name: 'Laboratoire de recherche',
    description: 'Permet les recherches.',
    baseCost: { metal: 200, crystal: 400, deuterium: 200 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'researchLabLevel',
    prerequisites: [],
  },
  storageMetal: {
    id: 'storageMetal',
    name: 'Hangar de métal',
    description: 'Augmente le stockage de métal.',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'storageMetalLevel',
    prerequisites: [],
  },
  storageCrystal: {
    id: 'storageCrystal',
    name: 'Hangar de cristal',
    description: 'Augmente le stockage de cristal.',
    baseCost: { metal: 1000, crystal: 500, deuterium: 0 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'storageCrystalLevel',
    prerequisites: [],
  },
  storageDeut: {
    id: 'storageDeut',
    name: 'Réservoir de deutérium',
    description: 'Augmente le stockage de deutérium.',
    baseCost: { metal: 1000, crystal: 1000, deuterium: 0 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'storageDeutLevel',
    prerequisites: [],
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/game-engine/src/constants/buildings.ts
git commit -m "feat(game-engine): add building definitions constants"
```

---

### Task 2: Formules de cout et temps de construction

**Files:**
- Create: `packages/game-engine/src/formulas/building-cost.ts`
- Create: `packages/game-engine/src/formulas/building-cost.test.ts`

- [ ] **Step 1: Ecrire les tests**

```typescript
// packages/game-engine/src/formulas/building-cost.test.ts
import { describe, it, expect } from 'vitest';
import { buildingCost, buildingTime } from './building-cost.js';

describe('buildingCost', () => {
  it('metal mine level 1 costs 60/15/0', () => {
    const cost = buildingCost('metalMine', 1);
    expect(cost).toEqual({ metal: 60, crystal: 15, deuterium: 0 });
  });

  it('metal mine level 5 costs 60*1.5^4 / 15*1.5^4', () => {
    const cost = buildingCost('metalMine', 5);
    // 60 * 1.5^4 = 60 * 5.0625 = 303.75 -> 303
    // 15 * 1.5^4 = 15 * 5.0625 = 75.9375 -> 75
    expect(cost).toEqual({ metal: 303, crystal: 75, deuterium: 0 });
  });

  it('metal mine level 10', () => {
    const cost = buildingCost('metalMine', 10);
    // 60 * 1.5^9 = 60 * 38.443... = 2306
    // 15 * 1.5^9 = 15 * 38.443... = 576
    expect(cost).toEqual({ metal: 2306, crystal: 576, deuterium: 0 });
  });

  it('crystal mine level 1 costs 48/24/0', () => {
    const cost = buildingCost('crystalMine', 1);
    expect(cost).toEqual({ metal: 48, crystal: 24, deuterium: 0 });
  });

  it('crystal mine level 5', () => {
    const cost = buildingCost('crystalMine', 5);
    // 48 * 1.6^4 = 48 * 6.5536 = 314
    // 24 * 1.6^4 = 24 * 6.5536 = 157
    expect(cost).toEqual({ metal: 314, crystal: 157, deuterium: 0 });
  });

  it('robotics level 3 costs with factor 2', () => {
    const cost = buildingCost('robotics', 3);
    // 400 * 2^2 = 1600, 120 * 2^2 = 480, 200 * 2^2 = 800
    expect(cost).toEqual({ metal: 1600, crystal: 480, deuterium: 800 });
  });

  it('deut synth level 1', () => {
    const cost = buildingCost('deutSynth', 1);
    expect(cost).toEqual({ metal: 225, crystal: 75, deuterium: 0 });
  });
});

describe('buildingTime', () => {
  it('metal mine level 1, robotics 0 = baseTime', () => {
    // time = (metal + crystal) / (2500 * (1 + robotics)) * 3600
    // (60+15) / (2500 * 1) * 3600 = 75/2500*3600 = 108s
    const time = buildingTime('metalMine', 1, 0);
    expect(time).toBe(108);
  });

  it('metal mine level 1, robotics 5', () => {
    // (60+15) / (2500 * 6) * 3600 = 75/15000*3600 = 18s
    const time = buildingTime('metalMine', 1, 5);
    expect(time).toBe(18);
  });

  it('metal mine level 10, robotics 0', () => {
    // cost: metal=2306, crystal=576
    // (2306+576) / (2500 * 1) * 3600 = 2882/2500*3600 = 4149s
    const time = buildingTime('metalMine', 10, 0);
    expect(time).toBe(4149);
  });

  it('robotics level 3, robotics 2', () => {
    // cost: 1600 + 480 = 2080
    // 2080 / (2500 * 3) * 3600 = 2080/7500*3600 = 998s
    const time = buildingTime('robotics', 3, 2);
    expect(time).toBe(998);
  });

  it('minimum time is 1 second', () => {
    // Very high robotics should still return at least 1s
    const time = buildingTime('metalMine', 1, 1000);
    expect(time).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Lancer les tests pour verifier qu'ils echouent**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```
Expected: FAIL — `buildingCost` and `buildingTime` not found

- [ ] **Step 3: Implementer les formules**

```typescript
// packages/game-engine/src/formulas/building-cost.ts
import { BUILDINGS } from '../constants/buildings.js';
import type { BuildingId } from '../constants/buildings.js';

export interface ResourceCost {
  metal: number;
  crystal: number;
  deuterium: number;
}

/**
 * Cost to build a building at a given level.
 * Formula: baseCost * costFactor^(level-1)
 */
export function buildingCost(buildingId: BuildingId, level: number): ResourceCost {
  const def = BUILDINGS[buildingId];
  const factor = Math.pow(def.costFactor, level - 1);
  return {
    metal: Math.floor(def.baseCost.metal * factor),
    crystal: Math.floor(def.baseCost.crystal * factor),
    deuterium: Math.floor(def.baseCost.deuterium * factor),
  };
}

/**
 * Construction time in seconds.
 * Formula: (metalCost + crystalCost) / (2500 * (1 + roboticsLevel)) * 3600
 * Minimum 1 second.
 */
export function buildingTime(buildingId: BuildingId, level: number, roboticsLevel: number): number {
  const cost = buildingCost(buildingId, level);
  const seconds = Math.floor(((cost.metal + cost.crystal) / (2500 * (1 + roboticsLevel))) * 3600);
  return Math.max(1, seconds);
}
```

- [ ] **Step 4: Lancer les tests**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```
Expected: ALL PASS

- [ ] **Step 5: Mettre a jour l'index du game-engine**

```typescript
// packages/game-engine/src/index.ts — ajouter les exports
export * from './formulas/production.js';
export * from './formulas/planet.js';
export * from './formulas/building-cost.js';
export * from './constants/buildings.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/formulas/building-cost.ts packages/game-engine/src/formulas/building-cost.test.ts packages/game-engine/src/index.ts
git commit -m "feat(game-engine): add building cost and construction time formulas with tests"
```

---

### Task 3: Formules de calcul lazy des ressources

**Files:**
- Create: `packages/game-engine/src/formulas/resources.ts`
- Create: `packages/game-engine/src/formulas/resources.test.ts`

- [ ] **Step 1: Ecrire les tests**

```typescript
// packages/game-engine/src/formulas/resources.test.ts
import { describe, it, expect } from 'vitest';
import { calculateResources, calculateProductionRates } from './resources.js';

describe('calculateProductionRates', () => {
  it('returns hourly rates for level 1 mines, solar 1, no energy deficit', () => {
    const rates = calculateProductionRates({
      metalMineLevel: 1,
      crystalMineLevel: 1,
      deutSynthLevel: 0,
      solarPlantLevel: 1,
      storageMetalLevel: 0,
      storageCrystalLevel: 0,
      storageDeutLevel: 0,
      maxTemp: 80,
    });
    // solar plant 1 = 22 energy, metal mine 1 = 11 energy, crystal mine 1 = 11 energy
    // total consumed = 22, produced = 22 -> factor = 1
    expect(rates.metalPerHour).toBe(33); // 30 * 1 * 1.1^1 = 33
    expect(rates.crystalPerHour).toBe(22); // 20 * 1 * 1.1^1 = 22
    expect(rates.deutPerHour).toBe(0); // level 0
    expect(rates.productionFactor).toBe(1);
  });

  it('returns reduced production when energy deficit', () => {
    const rates = calculateProductionRates({
      metalMineLevel: 5,
      crystalMineLevel: 5,
      deutSynthLevel: 0,
      solarPlantLevel: 1, // only 22 energy
      storageMetalLevel: 0,
      storageCrystalLevel: 0,
      storageDeutLevel: 0,
      maxTemp: 80,
    });
    // metal mine 5 consumes floor(10*5*1.1^5) = 80, crystal mine 5 = 80
    // total consumed = 160, produced = 22 -> factor = 22/160 = 0.1375
    expect(rates.productionFactor).toBeCloseTo(0.1375, 4);
    expect(rates.energyProduced).toBe(22);
    expect(rates.energyConsumed).toBe(160);
  });
});

describe('calculateResources', () => {
  const basePlanet = {
    metal: 500,
    crystal: 500,
    deuterium: 0,
    metalMineLevel: 1,
    crystalMineLevel: 1,
    deutSynthLevel: 0,
    solarPlantLevel: 1,
    storageMetalLevel: 0,
    storageCrystalLevel: 0,
    storageDeutLevel: 0,
    maxTemp: 80,
  };

  it('adds production over 1 hour', () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const result = calculateResources(basePlanet, oneHourAgo, new Date());
    // metal: 500 + 33 = 533, crystal: 500 + 22 = 522
    expect(result.metal).toBe(533);
    expect(result.crystal).toBe(522);
    expect(result.deuterium).toBe(0);
  });

  it('caps at storage capacity', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const result = calculateResources(basePlanet, tenDaysAgo, new Date());
    // storage lvl 0 = 5000 * floor(2.5 * e^0) = 5000 * 2 = 10000
    expect(result.metal).toBeLessThanOrEqual(10000);
    expect(result.crystal).toBeLessThanOrEqual(10000);
  });

  it('does not go below current resources', () => {
    const now = new Date();
    const result = calculateResources(basePlanet, now, now);
    expect(result.metal).toBe(500);
    expect(result.crystal).toBe(500);
  });
});
```

- [ ] **Step 2: Lancer les tests pour verifier qu'ils echouent**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```

- [ ] **Step 3: Implementer**

```typescript
// packages/game-engine/src/formulas/resources.ts
import {
  metalProduction,
  crystalProduction,
  deuteriumProduction,
  solarPlantEnergy,
  metalMineEnergy,
  crystalMineEnergy,
  deutSynthEnergy,
  storageCapacity,
  calculateProductionFactor,
} from './production.js';

export interface PlanetLevels {
  metalMineLevel: number;
  crystalMineLevel: number;
  deutSynthLevel: number;
  solarPlantLevel: number;
  storageMetalLevel: number;
  storageCrystalLevel: number;
  storageDeutLevel: number;
  maxTemp: number;
}

export interface ProductionRates {
  metalPerHour: number;
  crystalPerHour: number;
  deutPerHour: number;
  productionFactor: number;
  energyProduced: number;
  energyConsumed: number;
  storageMetalCapacity: number;
  storageCrystalCapacity: number;
  storageDeutCapacity: number;
}

export function calculateProductionRates(planet: PlanetLevels): ProductionRates {
  const energyProduced = solarPlantEnergy(planet.solarPlantLevel);
  const energyConsumed =
    metalMineEnergy(planet.metalMineLevel) +
    crystalMineEnergy(planet.crystalMineLevel) +
    deutSynthEnergy(planet.deutSynthLevel);

  const factor = calculateProductionFactor(energyProduced, energyConsumed);

  return {
    metalPerHour: metalProduction(planet.metalMineLevel, factor),
    crystalPerHour: crystalProduction(planet.crystalMineLevel, factor),
    deutPerHour: deuteriumProduction(planet.deutSynthLevel, planet.maxTemp, factor),
    productionFactor: factor,
    energyProduced,
    energyConsumed,
    storageMetalCapacity: storageCapacity(planet.storageMetalLevel),
    storageCrystalCapacity: storageCapacity(planet.storageCrystalLevel),
    storageDeutCapacity: storageCapacity(planet.storageDeutLevel),
  };
}

export interface PlanetResources extends PlanetLevels {
  metal: number;
  crystal: number;
  deuterium: number;
}

/**
 * Calculate current resources with lazy production since last update.
 * Caps resources at storage capacity.
 */
export function calculateResources(
  planet: PlanetResources,
  resourcesUpdatedAt: Date,
  now: Date,
): { metal: number; crystal: number; deuterium: number } {
  const rates = calculateProductionRates(planet);
  const elapsedHours = Math.max(0, (now.getTime() - resourcesUpdatedAt.getTime()) / (3600 * 1000));

  const metal = Math.min(
    planet.metal + Math.floor(rates.metalPerHour * elapsedHours),
    rates.storageMetalCapacity,
  );
  const crystal = Math.min(
    planet.crystal + Math.floor(rates.crystalPerHour * elapsedHours),
    rates.storageCrystalCapacity,
  );
  const deuterium = Math.min(
    planet.deuterium + Math.floor(rates.deutPerHour * elapsedHours),
    rates.storageDeutCapacity,
  );

  return { metal, crystal, deuterium };
}
```

- [ ] **Step 4: Mettre a jour l'index**

Ajouter a `packages/game-engine/src/index.ts` :
```typescript
export * from './formulas/resources.js';
```

- [ ] **Step 5: Lancer les tests**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/formulas/resources.ts packages/game-engine/src/formulas/resources.test.ts packages/game-engine/src/index.ts
git commit -m "feat(game-engine): add lazy resource calculation and production rate formulas"
```

---

## Chunk 2: Schema DB + Module Resource API

### Task 4: Schema build_queue

**Files:**
- Create: `packages/db/src/schema/build-queue.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Creer le schema build_queue**

```typescript
// packages/db/src/schema/build-queue.ts
import { pgTable, uuid, varchar, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';
import { users } from './users.js';

export const buildQueueTypeEnum = pgEnum('build_queue_type', ['building', 'research', 'ship', 'defense']);
export const buildQueueStatusEnum = pgEnum('build_queue_status', ['active', 'queued', 'completed']);

export const buildQueue = pgTable('build_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: buildQueueTypeEnum('type').notNull(),
  itemId: varchar('item_id', { length: 64 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  completedCount: integer('completed_count').notNull().default(0),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  status: buildQueueStatusEnum('status').notNull().default('active'),
});
```

- [ ] **Step 2: Mettre a jour l'index DB**

Ajouter dans `packages/db/src/schema/index.ts` :
```typescript
export * from './build-queue.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/build-queue.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add build_queue schema"
```

---

### Task 5: Module resource service

**Files:**
- Create: `apps/api/src/modules/resource/resource.service.ts`

- [ ] **Step 1: Implementer le service resource**

```typescript
// apps/api/src/modules/resource/resource.service.ts
import { eq, and, gte, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  calculateResources,
  calculateProductionRates,
  type ResourceCost,
} from '@ogame-clone/game-engine';

export function createResourceService(db: Database) {
  return {
    /**
     * Materialize resources for a planet (write to DB).
     * Returns the updated planet row.
     */
    async materializeResources(planetId: string, userId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const now = new Date();
      const resources = calculateResources(
        {
          metal: Number(planet.metal),
          crystal: Number(planet.crystal),
          deuterium: Number(planet.deuterium),
          metalMineLevel: planet.metalMineLevel,
          crystalMineLevel: planet.crystalMineLevel,
          deutSynthLevel: planet.deutSynthLevel,
          solarPlantLevel: planet.solarPlantLevel,
          storageMetalLevel: planet.storageMetalLevel,
          storageCrystalLevel: planet.storageCrystalLevel,
          storageDeutLevel: planet.storageDeutLevel,
          maxTemp: planet.maxTemp,
        },
        planet.resourcesUpdatedAt,
        now,
      );

      const [updated] = await db
        .update(planets)
        .set({
          metal: String(resources.metal),
          crystal: String(resources.crystal),
          deuterium: String(resources.deuterium),
          resourcesUpdatedAt: now,
        })
        .where(eq(planets.id, planetId))
        .returning();

      return updated;
    },

    /**
     * Atomic resource spending: materialize + spend in a single UPDATE WHERE.
     * Throws if insufficient resources.
     */
    async spendResources(planetId: string, userId: string, cost: ResourceCost) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const now = new Date();
      const produced = calculateResources(
        {
          metal: Number(planet.metal),
          crystal: Number(planet.crystal),
          deuterium: Number(planet.deuterium),
          metalMineLevel: planet.metalMineLevel,
          crystalMineLevel: planet.crystalMineLevel,
          deutSynthLevel: planet.deutSynthLevel,
          solarPlantLevel: planet.solarPlantLevel,
          storageMetalLevel: planet.storageMetalLevel,
          storageCrystalLevel: planet.storageCrystalLevel,
          storageDeutLevel: planet.storageDeutLevel,
          maxTemp: planet.maxTemp,
        },
        planet.resourcesUpdatedAt,
        now,
      );

      // Atomic: set materialized - cost, WHERE materialized >= cost
      const [result] = await db
        .update(planets)
        .set({
          metal: String(produced.metal - cost.metal),
          crystal: String(produced.crystal - cost.crystal),
          deuterium: String(produced.deuterium - cost.deuterium),
          resourcesUpdatedAt: now,
        })
        .where(
          and(
            eq(planets.id, planetId),
            eq(planets.userId, userId),
            gte(sql`${produced.metal}::numeric`, sql`${cost.metal}::numeric`),
            gte(sql`${produced.crystal}::numeric`, sql`${cost.crystal}::numeric`),
            gte(sql`${produced.deuterium}::numeric`, sql`${cost.deuterium}::numeric`),
          ),
        )
        .returning();

      if (!result) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ressources insuffisantes' });
      }

      return result;
    },

    /**
     * Get production rates for a planet (for frontend display).
     */
    getProductionRates(planet: {
      metalMineLevel: number;
      crystalMineLevel: number;
      deutSynthLevel: number;
      solarPlantLevel: number;
      storageMetalLevel: number;
      storageCrystalLevel: number;
      storageDeutLevel: number;
      maxTemp: number;
    }) {
      return calculateProductionRates(planet);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/resource/resource.service.ts
git commit -m "feat(api): add resource service with lazy calc and atomic spending"
```

---

### Task 6: Module resource router

**Files:**
- Create: `apps/api/src/modules/resource/resource.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Creer le router**

```typescript
// apps/api/src/modules/resource/resource.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createResourceService } from './resource.service.js';
import type { createPlanetService } from '../planet/planet.service.js';

export function createResourceRouter(
  resourceService: ReturnType<typeof createResourceService>,
  planetService: ReturnType<typeof createPlanetService>,
) {
  return router({
    /** Get production rates + current (lazy-calculated) resources */
    production: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const planet = await planetService.getPlanet(ctx.userId!, input.planetId);
        const rates = resourceService.getProductionRates(planet);
        return {
          rates,
          resourcesUpdatedAt: planet.resourcesUpdatedAt.toISOString(),
          metal: Number(planet.metal),
          crystal: Number(planet.crystal),
          deuterium: Number(planet.deuterium),
        };
      }),
  });
}
```

- [ ] **Step 2: Ajouter le router dans app-router.ts**

Modifier `apps/api/src/trpc/app-router.ts` pour ajouter :
- Import `createResourceService` et `createResourceRouter`
- Instancier `resourceService` et `resourceRouter`
- Ajouter `resource: resourceRouter` dans le router

```typescript
import { router, publicProcedure } from './router.js';
import { createAuthRouter } from '../modules/auth/auth.router.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createPlanetService } from '../modules/planet/planet.service.js';
import { createPlanetRouter } from '../modules/planet/planet.router.js';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createResourceRouter } from '../modules/resource/resource.router.js';
import type { Database } from '@ogame-clone/db';

export function buildAppRouter(db: Database) {
  const authService = createAuthService(db);
  const planetService = createPlanetService(db);
  const resourceService = createResourceService(db);

  const authRouter = createAuthRouter(authService, planetService);
  const planetRouter = createPlanetRouter(planetService);
  const resourceRouter = createResourceRouter(resourceService, planetService);

  return router({
    health: publicProcedure.query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),
    auth: authRouter,
    planet: planetRouter,
    resource: resourceRouter,
  });
}

export type AppRouter = ReturnType<typeof buildAppRouter>;
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/resource/resource.router.ts apps/api/src/trpc/app-router.ts
git commit -m "feat(api): add resource router with production rates endpoint"
```

---

## Chunk 3: Module Building API

### Task 7: Building service

**Files:**
- Create: `apps/api/src/modules/building/building.service.ts`

- [ ] **Step 1: Implementer le service building**

```typescript
// apps/api/src/modules/building/building.service.ts
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, buildQueue } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  BUILDINGS,
  buildingCost,
  buildingTime,
  calculateProductionRates,
  type BuildingId,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';

const BUILDING_LEVEL_COLUMNS: Record<BuildingId, keyof typeof planets.$inferSelect> = {
  metalMine: 'metalMineLevel',
  crystalMine: 'crystalMineLevel',
  deutSynth: 'deutSynthLevel',
  solarPlant: 'solarPlantLevel',
  robotics: 'roboticsLevel',
  shipyard: 'shipyardLevel',
  researchLab: 'researchLabLevel',
  storageMetal: 'storageMetalLevel',
  storageCrystal: 'storageCrystalLevel',
  storageDeut: 'storageDeutLevel',
};

export function createBuildingService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
) {
  return {
    /**
     * List all buildings with current level, next level cost, and time.
     */
    async listBuildings(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);

      // Check if there's an active build
      const [activeBuild] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.type, 'building'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      const buildingList = Object.values(BUILDINGS).map((def) => {
        const currentLevel = planet[BUILDING_LEVEL_COLUMNS[def.id]] as number;
        const nextLevel = currentLevel + 1;
        const cost = buildingCost(def.id, nextLevel);
        const time = buildingTime(def.id, nextLevel, planet.roboticsLevel);

        return {
          id: def.id,
          name: def.name,
          description: def.description,
          currentLevel,
          nextLevelCost: cost,
          nextLevelTime: time,
          prerequisites: def.prerequisites,
          isUpgrading: activeBuild?.itemId === def.id,
          upgradeEndTime: activeBuild?.itemId === def.id ? activeBuild.endTime.toISOString() : null,
        };
      });

      return buildingList;
    },

    /**
     * Start upgrading a building. Spends resources, creates build_queue entry.
     * Returns the queue entry.
     */
    async startUpgrade(userId: string, planetId: string, buildingId: BuildingId) {
      const planet = await this.getOwnedPlanet(userId, planetId);

      // Check no active building construction on this planet
      const [activeBuild] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.type, 'building'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      if (activeBuild) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Construction déjà en cours' });
      }

      // Check prerequisites
      const def = BUILDINGS[buildingId];
      for (const prereq of def.prerequisites) {
        const prereqLevel = planet[BUILDING_LEVEL_COLUMNS[prereq.buildingId]] as number;
        if (prereqLevel < prereq.level) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Prérequis non rempli : ${BUILDINGS[prereq.buildingId].name} niveau ${prereq.level}`,
          });
        }
      }

      // Check building slots
      const totalLevels =
        planet.metalMineLevel +
        planet.crystalMineLevel +
        planet.deutSynthLevel +
        planet.solarPlantLevel +
        planet.roboticsLevel +
        planet.shipyardLevel +
        planet.researchLabLevel +
        planet.storageMetalLevel +
        planet.storageCrystalLevel +
        planet.storageDeutLevel;

      if (totalLevels >= planet.maxFields) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Plus de champs disponibles' });
      }

      const currentLevel = planet[BUILDING_LEVEL_COLUMNS[buildingId]] as number;
      const nextLevel = currentLevel + 1;
      const cost = buildingCost(buildingId, nextLevel);
      const time = buildingTime(buildingId, nextLevel, planet.roboticsLevel);

      // Spend resources (atomic)
      await resourceService.spendResources(planetId, userId, cost);

      // Create build queue entry
      const now = new Date();
      const endTime = new Date(now.getTime() + time * 1000);

      const [entry] = await db
        .insert(buildQueue)
        .values({
          planetId,
          userId,
          type: 'building',
          itemId: buildingId,
          startTime: now,
          endTime,
          status: 'active',
        })
        .returning();

      return { entry, endTime: endTime.toISOString(), buildingTime: time };
    },

    /**
     * Cancel an active building construction. Refund resources.
     */
    async cancelUpgrade(userId: string, planetId: string) {
      const [activeBuild] = await db
        .select()
        .from(buildQueue)
        .where(
          and(
            eq(buildQueue.planetId, planetId),
            eq(buildQueue.userId, userId),
            eq(buildQueue.type, 'building'),
            eq(buildQueue.status, 'active'),
          ),
        )
        .limit(1);

      if (!activeBuild) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune construction en cours' });
      }

      const planet = await this.getOwnedPlanet(userId, planetId);
      const currentLevel = planet[BUILDING_LEVEL_COLUMNS[activeBuild.itemId as BuildingId]] as number;
      const cost = buildingCost(activeBuild.itemId as BuildingId, currentLevel + 1);

      // Refund resources
      await db
        .update(planets)
        .set({
          metal: String(Number(planet.metal) + cost.metal),
          crystal: String(Number(planet.crystal) + cost.crystal),
          deuterium: String(Number(planet.deuterium) + cost.deuterium),
        })
        .where(eq(planets.id, planetId));

      // Delete queue entry
      await db.delete(buildQueue).where(eq(buildQueue.id, activeBuild.id));

      return { cancelled: true };
    },

    /**
     * Complete a building construction (called by worker).
     * Increments the building level, updates production factor, marks queue completed.
     */
    async completeUpgrade(buildQueueId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const [planet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, entry.planetId))
        .limit(1);

      if (!planet) return null;

      const buildingId = entry.itemId as BuildingId;
      const columnKey = BUILDING_LEVEL_COLUMNS[buildingId];
      const currentLevel = planet[columnKey] as number;
      const newLevel = currentLevel + 1;

      // Calculate new production factor with updated levels
      const newLevels = {
        metalMineLevel: planet.metalMineLevel,
        crystalMineLevel: planet.crystalMineLevel,
        deutSynthLevel: planet.deutSynthLevel,
        solarPlantLevel: planet.solarPlantLevel,
        storageMetalLevel: planet.storageMetalLevel,
        storageCrystalLevel: planet.storageCrystalLevel,
        storageDeutLevel: planet.storageDeutLevel,
        maxTemp: planet.maxTemp,
      };
      (newLevels as Record<string, number>)[columnKey as string] = newLevel;

      const rates = calculateProductionRates(newLevels);

      // Update planet level
      await db
        .update(planets)
        .set({
          [columnKey]: newLevel,
        })
        .where(eq(planets.id, entry.planetId));

      // Mark queue entry as completed
      await db
        .update(buildQueue)
        .set({ status: 'completed' })
        .where(eq(buildQueue.id, buildQueueId));

      return { buildingId, newLevel, productionFactor: rates.productionFactor };
    },

    async getOwnedPlanet(userId: string, planetId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return planet;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/building/building.service.ts
git commit -m "feat(api): add building service with upgrade, cancel, and complete"
```

---

### Task 8: Building router + wire into app-router

**Files:**
- Create: `apps/api/src/modules/building/building.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Creer le router**

```typescript
// apps/api/src/modules/building/building.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createBuildingService } from './building.service.js';
import type { BuildingId } from '@ogame-clone/game-engine';

const buildingIds = [
  'metalMine', 'crystalMine', 'deutSynth', 'solarPlant',
  'robotics', 'shipyard', 'researchLab',
  'storageMetal', 'storageCrystal', 'storageDeut',
] as const;

export function createBuildingRouter(buildingService: ReturnType<typeof createBuildingService>) {
  return router({
    list: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return buildingService.listBuildings(ctx.userId!, input.planetId);
      }),

    upgrade: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        buildingId: z.enum(buildingIds),
      }))
      .mutation(async ({ ctx, input }) => {
        return buildingService.startUpgrade(ctx.userId!, input.planetId, input.buildingId as BuildingId);
      }),

    cancel: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return buildingService.cancelUpgrade(ctx.userId!, input.planetId);
      }),
  });
}
```

- [ ] **Step 2: Mettre a jour app-router.ts**

Ajouter imports `createBuildingService` et `createBuildingRouter`, instancier, ajouter `building: buildingRouter`.

```typescript
// apps/api/src/trpc/app-router.ts — version complete
import { router, publicProcedure } from './router.js';
import { createAuthRouter } from '../modules/auth/auth.router.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createPlanetService } from '../modules/planet/planet.service.js';
import { createPlanetRouter } from '../modules/planet/planet.router.js';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createResourceRouter } from '../modules/resource/resource.router.js';
import { createBuildingService } from '../modules/building/building.service.js';
import { createBuildingRouter } from '../modules/building/building.router.js';
import type { Database } from '@ogame-clone/db';

export function buildAppRouter(db: Database) {
  const authService = createAuthService(db);
  const planetService = createPlanetService(db);
  const resourceService = createResourceService(db);
  const buildingService = createBuildingService(db, resourceService);

  const authRouter = createAuthRouter(authService, planetService);
  const planetRouter = createPlanetRouter(planetService);
  const resourceRouter = createResourceRouter(resourceService, planetService);
  const buildingRouter = createBuildingRouter(buildingService);

  return router({
    health: publicProcedure.query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),
    auth: authRouter,
    planet: planetRouter,
    resource: resourceRouter,
    building: buildingRouter,
  });
}

export type AppRouter = ReturnType<typeof buildAppRouter>;
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/building/building.router.ts apps/api/src/trpc/app-router.ts
git commit -m "feat(api): add building router and wire into app router"
```

---

## Chunk 4: BullMQ Workers + Crons

### Task 9: Setup BullMQ queues

**Files:**
- Create: `apps/api/src/queues/queue.ts`

- [ ] **Step 1: Installer bullmq**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/api add bullmq
```

- [ ] **Step 2: Creer le fichier de setup des queues**

```typescript
// apps/api/src/queues/queue.ts
import { Queue } from 'bullmq';
import { env } from '../config/env.js';

const connection = { url: env.REDIS_URL };

export const buildingCompletionQueue = new Queue('building-completion', { connection });
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/queues/queue.ts apps/api/package.json
git commit -m "feat(api): setup BullMQ building-completion queue"
```

---

### Task 10: Schedule BullMQ job on upgrade

**Files:**
- Modify: `apps/api/src/modules/building/building.service.ts`
- Modify: `apps/api/src/modules/building/building.router.ts`

- [ ] **Step 1: Modifier le service pour accepter la queue et scheduler un job**

Dans `building.service.ts`, ajouter un parametre `buildingQueue` au factory et scheduler un delayed job apres creation du build_queue entry :

```typescript
// Apres la creation de l'entree build_queue dans startUpgrade, ajouter :
import type { Queue } from 'bullmq';

// Modifier la signature du factory:
export function createBuildingService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  buildingQueue: Queue,
) {
  // ... dans startUpgrade, apres insert:
  // Schedule BullMQ delayed job
  await buildingQueue.add(
    'complete',
    { buildQueueId: entry.id },
    { delay: time * 1000, jobId: `building-${entry.id}` },
  );
```

Dans `cancelUpgrade`, ajouter la suppression du job :
```typescript
// Avant le delete du buildQueue entry:
await buildingQueue.remove(`building-${activeBuild.id}`);
```

- [ ] **Step 2: Mettre a jour app-router pour passer la queue**

Dans `app-router.ts`, importer et passer la queue :
```typescript
import { buildingCompletionQueue } from '../queues/queue.js';
// ...
const buildingService = createBuildingService(db, resourceService, buildingCompletionQueue);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/building/building.service.ts apps/api/src/trpc/app-router.ts
git commit -m "feat(api): schedule BullMQ delayed job on building upgrade"
```

---

### Task 11: Building completion worker

**Files:**
- Create: `apps/api/src/workers/building-completion.worker.ts`
- Create: `apps/api/src/workers/worker.ts`

- [ ] **Step 1: Creer le worker**

```typescript
// apps/api/src/workers/building-completion.worker.ts
import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createBuildingService } from '../modules/building/building.service.js';
import { buildingCompletionQueue } from '../queues/queue.js';
import { env } from '../config/env.js';

export function startBuildingCompletionWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const buildingService = createBuildingService(db, resourceService, buildingCompletionQueue);

  const worker = new Worker(
    'building-completion',
    async (job) => {
      const { buildQueueId } = job.data as { buildQueueId: string };
      console.log(`[building-completion] Processing job ${job.id}, buildQueueId: ${buildQueueId}`);

      const result = await buildingService.completeUpgrade(buildQueueId);
      if (result) {
        console.log(`[building-completion] ${result.buildingId} upgraded to level ${result.newLevel}`);
      } else {
        console.log(`[building-completion] Build queue entry ${buildQueueId} not found or already completed`);
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[building-completion] Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

- [ ] **Step 2: Creer l'entrypoint worker**

```typescript
// apps/api/src/workers/worker.ts
import { createDb } from '@ogame-clone/db';
import { env } from '../config/env.js';
import { startBuildingCompletionWorker } from './building-completion.worker.js';

const db = createDb(env.DATABASE_URL);

console.log('[worker] Starting workers...');
startBuildingCompletionWorker(db);
console.log('[worker] Building completion worker started');

// Keep process alive
process.on('SIGTERM', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});
```

- [ ] **Step 3: Ajouter le script worker dans package.json de l'API**

Dans `apps/api/package.json`, ajouter dans scripts :
```json
"worker": "tsx watch src/workers/worker.ts",
"worker:start": "node dist/workers/worker.js"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/building-completion.worker.ts apps/api/src/workers/worker.ts apps/api/package.json
git commit -m "feat(api): add building completion worker and worker entrypoint"
```

---

### Task 12: Cron event-catchup + resource-tick

**Files:**
- Create: `apps/api/src/cron/event-catchup.ts`
- Create: `apps/api/src/cron/resource-tick.ts`
- Modify: `apps/api/src/workers/worker.ts`

- [ ] **Step 1: Creer le cron event-catchup**

```typescript
// apps/api/src/cron/event-catchup.ts
import { lte, eq, and } from 'drizzle-orm';
import { buildQueue } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { buildingCompletionQueue } from '../queues/queue.js';

/**
 * Scans for expired build_queue entries that haven't been processed.
 * Re-queues them for immediate processing.
 */
export async function eventCatchup(db: Database) {
  const now = new Date();

  const expiredEntries = await db
    .select()
    .from(buildQueue)
    .where(
      and(
        eq(buildQueue.status, 'active'),
        eq(buildQueue.type, 'building'),
        lte(buildQueue.endTime, now),
      ),
    );

  for (const entry of expiredEntries) {
    const jobId = `building-${entry.id}`;
    // Check if job already exists
    const existingJob = await buildingCompletionQueue.getJob(jobId);
    if (!existingJob) {
      console.log(`[event-catchup] Re-queuing expired building ${entry.id}`);
      await buildingCompletionQueue.add('complete', { buildQueueId: entry.id }, { jobId });
    }
  }

  if (expiredEntries.length > 0) {
    console.log(`[event-catchup] Found ${expiredEntries.length} expired building entries`);
  }
}
```

- [ ] **Step 2: Creer le cron resource-tick**

```typescript
// apps/api/src/cron/resource-tick.ts
import { sql } from 'drizzle-orm';
import { planets } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { calculateResources } from '@ogame-clone/game-engine';

/**
 * Materializes resources for all planets.
 * Runs every 15 minutes to prevent drift and ensure pillage is accurate on inactive planets.
 */
export async function resourceTick(db: Database) {
  const now = new Date();
  const allPlanets = await db.select().from(planets);

  let updated = 0;
  for (const planet of allPlanets) {
    const resources = calculateResources(
      {
        metal: Number(planet.metal),
        crystal: Number(planet.crystal),
        deuterium: Number(planet.deuterium),
        metalMineLevel: planet.metalMineLevel,
        crystalMineLevel: planet.crystalMineLevel,
        deutSynthLevel: planet.deutSynthLevel,
        solarPlantLevel: planet.solarPlantLevel,
        storageMetalLevel: planet.storageMetalLevel,
        storageCrystalLevel: planet.storageCrystalLevel,
        storageDeutLevel: planet.storageDeutLevel,
        maxTemp: planet.maxTemp,
      },
      planet.resourcesUpdatedAt,
      now,
    );

    await db
      .update(planets)
      .set({
        metal: String(resources.metal),
        crystal: String(resources.crystal),
        deuterium: String(resources.deuterium),
        resourcesUpdatedAt: now,
      })
      .where(sql`${planets.id} = ${planet.id}`);

    updated++;
  }

  console.log(`[resource-tick] Materialized resources for ${updated} planets`);
}
```

- [ ] **Step 3: Integrer les crons dans worker.ts**

```typescript
// apps/api/src/workers/worker.ts — version complete
import { createDb } from '@ogame-clone/db';
import { env } from '../config/env.js';
import { startBuildingCompletionWorker } from './building-completion.worker.js';
import { eventCatchup } from '../cron/event-catchup.js';
import { resourceTick } from '../cron/resource-tick.js';

const db = createDb(env.DATABASE_URL);

console.log('[worker] Starting workers...');
startBuildingCompletionWorker(db);
console.log('[worker] Building completion worker started');

// Cron: event catchup every 30s
setInterval(async () => {
  try {
    await eventCatchup(db);
  } catch (err) {
    console.error('[event-catchup] Error:', err);
  }
}, 30_000);
console.log('[worker] Event catchup cron started (30s)');

// Cron: resource tick every 15min
setInterval(async () => {
  try {
    await resourceTick(db);
  } catch (err) {
    console.error('[resource-tick] Error:', err);
  }
}, 15 * 60_000);
console.log('[worker] Resource tick cron started (15min)');

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/cron/event-catchup.ts apps/api/src/cron/resource-tick.ts apps/api/src/workers/worker.ts
git commit -m "feat(api): add event-catchup (30s) and resource-tick (15min) crons"
```

---

## Chunk 5: Frontend — Resources + Buildings Pages

### Task 13: Hook useResourceCounter

**Files:**
- Create: `apps/web/src/hooks/useResourceCounter.ts`

- [ ] **Step 1: Creer le hook**

```typescript
// apps/web/src/hooks/useResourceCounter.ts
import { useState, useEffect, useRef } from 'react';

interface ResourceCounterInput {
  /** Metal amount at resourcesUpdatedAt */
  metal: number;
  /** Crystal amount at resourcesUpdatedAt */
  crystal: number;
  /** Deuterium amount at resourcesUpdatedAt */
  deuterium: number;
  /** ISO string of last DB update */
  resourcesUpdatedAt: string;
  /** Hourly production rates */
  metalPerHour: number;
  crystalPerHour: number;
  deutPerHour: number;
  /** Storage caps */
  storageMetalCapacity: number;
  storageCrystalCapacity: number;
  storageDeutCapacity: number;
}

interface ResourceCounterOutput {
  metal: number;
  crystal: number;
  deuterium: number;
}

/**
 * Interpolates resource values at 1Hz on the client side.
 * Uses server production rates and last update time.
 */
export function useResourceCounter(input: ResourceCounterInput | undefined): ResourceCounterOutput {
  const [resources, setResources] = useState<ResourceCounterOutput>({
    metal: 0,
    crystal: 0,
    deuterium: 0,
  });

  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!input) return;

    function tick() {
      const data = inputRef.current;
      if (!data) return;

      const now = Date.now();
      const updatedAt = new Date(data.resourcesUpdatedAt).getTime();
      const elapsedHours = (now - updatedAt) / (3600 * 1000);

      setResources({
        metal: Math.min(
          Math.floor(data.metal + data.metalPerHour * elapsedHours),
          data.storageMetalCapacity,
        ),
        crystal: Math.min(
          Math.floor(data.crystal + data.crystalPerHour * elapsedHours),
          data.storageCrystalCapacity,
        ),
        deuterium: Math.min(
          Math.floor(data.deuterium + data.deutPerHour * elapsedHours),
          data.storageDeutCapacity,
        ),
      });
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [input?.resourcesUpdatedAt, input?.metalPerHour, input?.crystalPerHour, input?.deutPerHour]);

  return resources;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/useResourceCounter.ts
git commit -m "feat(web): add useResourceCounter hook for 1Hz client-side interpolation"
```

---

### Task 14: ResourceCost component

**Files:**
- Create: `apps/web/src/components/common/ResourceCost.tsx`

- [ ] **Step 1: Creer le composant**

```tsx
// apps/web/src/components/common/ResourceCost.tsx
interface ResourceCostProps {
  metal: number;
  crystal: number;
  deuterium: number;
  /** Current resource amounts to highlight unaffordable costs */
  currentMetal?: number;
  currentCrystal?: number;
  currentDeuterium?: number;
}

export function ResourceCost({
  metal,
  crystal,
  deuterium,
  currentMetal,
  currentCrystal,
  currentDeuterium,
}: ResourceCostProps) {
  const canAfford = (cost: number, current?: number) =>
    current === undefined || current >= cost;

  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {metal > 0 && (
        <span className={canAfford(metal, currentMetal) ? 'text-metal' : 'text-destructive'}>
          Métal: {metal.toLocaleString('fr-FR')}
        </span>
      )}
      {crystal > 0 && (
        <span className={canAfford(crystal, currentCrystal) ? 'text-crystal' : 'text-destructive'}>
          Cristal: {crystal.toLocaleString('fr-FR')}
        </span>
      )}
      {deuterium > 0 && (
        <span className={canAfford(deuterium, currentDeuterium) ? 'text-deuterium' : 'text-destructive'}>
          Deutérium: {deuterium.toLocaleString('fr-FR')}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/common/ResourceCost.tsx
git commit -m "feat(web): add ResourceCost component"
```

---

### Task 15: Update TopBar with live resource counters

**Files:**
- Modify: `apps/web/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Mettre a jour TopBar**

```tsx
// apps/web/src/components/layout/TopBar.tsx
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';

interface ResourceDisplayProps {
  label: string;
  value: number;
  color: string;
}

function ResourceDisplay({ label, value, color }: ResourceDisplayProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>
        {value.toLocaleString('fr-FR')}
      </span>
    </div>
  );
}

export function TopBar({ planetId }: { planetId?: string }) {
  const { data } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId, refetchInterval: 60_000 },
  );

  const resources = useResourceCounter(
    data
      ? {
          metal: data.metal,
          crystal: data.crystal,
          deuterium: data.deuterium,
          resourcesUpdatedAt: data.resourcesUpdatedAt,
          metalPerHour: data.rates.metalPerHour,
          crystalPerHour: data.rates.crystalPerHour,
          deutPerHour: data.rates.deutPerHour,
          storageMetalCapacity: data.rates.storageMetalCapacity,
          storageCrystalCapacity: data.rates.storageCrystalCapacity,
          storageDeutCapacity: data.rates.storageDeutCapacity,
        }
      : undefined,
  );

  const energyBalance = data
    ? data.rates.energyProduced - data.rates.energyConsumed
    : 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-6">
        <ResourceDisplay label="Métal" value={resources.metal} color="text-metal" />
        <ResourceDisplay label="Cristal" value={resources.crystal} color="text-crystal" />
        <ResourceDisplay label="Deutérium" value={resources.deuterium} color="text-deuterium" />
        <ResourceDisplay
          label="Énergie"
          value={energyBalance}
          color={energyBalance >= 0 ? 'text-energy' : 'text-destructive'}
        />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Planète: Homeworld</span>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Mettre a jour Layout pour passer planetId**

Modifier `apps/web/src/components/layout/Layout.tsx` pour recup le premier planetId et le passer au TopBar :

```tsx
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { trpc } from '@/trpc';

export function Layout() {
  const { data: planets } = trpc.planet.list.useQuery();
  const planetId = planets?.[0]?.id;

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar planetId={planetId} />
        <main className="flex-1 overflow-y-auto">
          <Outlet context={{ planetId }} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/TopBar.tsx apps/web/src/components/layout/Layout.tsx
git commit -m "feat(web): wire TopBar to live resource counters via useResourceCounter"
```

---

### Task 16: Page Resources

**Files:**
- Create: `apps/web/src/pages/Resources.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Creer la page Resources**

```tsx
// apps/web/src/pages/Resources.tsx
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function Resources() {
  const { planetId } = useOutletContext<{ planetId?: string }>();

  const { data, isLoading } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
    data
      ? {
          metal: data.metal,
          crystal: data.crystal,
          deuterium: data.deuterium,
          resourcesUpdatedAt: data.resourcesUpdatedAt,
          metalPerHour: data.rates.metalPerHour,
          crystalPerHour: data.rates.crystalPerHour,
          deutPerHour: data.rates.deutPerHour,
          storageMetalCapacity: data.rates.storageMetalCapacity,
          storageCrystalCapacity: data.rates.storageCrystalCapacity,
          storageDeutCapacity: data.rates.storageDeutCapacity,
        }
      : undefined,
  );

  if (isLoading || !data) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const resourceRows = [
    {
      name: 'Métal',
      color: 'text-metal',
      current: resources.metal,
      perHour: data.rates.metalPerHour,
      capacity: data.rates.storageMetalCapacity,
    },
    {
      name: 'Cristal',
      color: 'text-crystal',
      current: resources.crystal,
      perHour: data.rates.crystalPerHour,
      capacity: data.rates.storageCrystalCapacity,
    },
    {
      name: 'Deutérium',
      color: 'text-deuterium',
      current: resources.deuterium,
      perHour: data.rates.deutPerHour,
      capacity: data.rates.storageDeutCapacity,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Ressources</h1>

      <Card>
        <CardHeader>
          <CardTitle>Production</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {resourceRows.map((r) => (
              <div key={r.name} className="flex items-center justify-between">
                <span className={`font-medium ${r.color}`}>{r.name}</span>
                <div className="flex gap-6 text-sm">
                  <span>{r.current.toLocaleString('fr-FR')}</span>
                  <span className="text-muted-foreground">
                    +{r.perHour.toLocaleString('fr-FR')}/h
                  </span>
                  <span className="text-muted-foreground">
                    Cap: {r.capacity.toLocaleString('fr-FR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Énergie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-energy font-medium">Balance</span>
            <span
              className={`text-sm font-semibold ${
                data.rates.energyProduced >= data.rates.energyConsumed
                  ? 'text-energy'
                  : 'text-destructive'
              }`}
            >
              {data.rates.energyProduced - data.rates.energyConsumed}
              {' '}({data.rates.energyProduced} / {data.rates.energyConsumed})
            </span>
          </div>
          {data.rates.productionFactor < 1 && (
            <p className="mt-2 text-xs text-destructive">
              Facteur de production : {(data.rates.productionFactor * 100).toFixed(1)}%
              — Construisez une centrale solaire !
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter la route**

Modifier `apps/web/src/router.tsx`, ajouter dans les children de `/` :

```tsx
{
  path: 'resources',
  lazy: () => import('./pages/Resources').then((m) => ({ Component: m.default })),
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Resources.tsx apps/web/src/router.tsx
git commit -m "feat(web): add Resources page with live counters and production rates"
```

---

### Task 17: Page Buildings

**Files:**
- Create: `apps/web/src/pages/Buildings.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Creer la page Buildings**

```tsx
// apps/web/src/pages/Buildings.tsx
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export default function Buildings() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();

  const { data: buildings, isLoading } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
    resourceData
      ? {
          metal: resourceData.metal,
          crystal: resourceData.crystal,
          deuterium: resourceData.deuterium,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          metalPerHour: resourceData.rates.metalPerHour,
          crystalPerHour: resourceData.rates.crystalPerHour,
          deutPerHour: resourceData.rates.deutPerHour,
          storageMetalCapacity: resourceData.rates.storageMetalCapacity,
          storageCrystalCapacity: resourceData.rates.storageCrystalCapacity,
          storageDeutCapacity: resourceData.rates.storageDeutCapacity,
        }
      : undefined,
  );

  const upgradeMutation = trpc.building.upgrade.useMutation({
    onSuccess: () => {
      utils.building.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  const cancelMutation = trpc.building.cancel.useMutation({
    onSuccess: () => {
      utils.building.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  if (isLoading || !buildings) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const isAnyUpgrading = buildings.some((b) => b.isUpgrading);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Bâtiments</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {buildings.map((building) => {
          const canAfford =
            resources.metal >= building.nextLevelCost.metal &&
            resources.crystal >= building.nextLevelCost.crystal &&
            resources.deuterium >= building.nextLevelCost.deuterium;

          return (
            <Card key={building.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{building.name}</CardTitle>
                  <Badge variant="secondary">Niv. {building.currentLevel}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{building.description}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Coût niveau {building.currentLevel + 1} :
                  </div>
                  <ResourceCost
                    metal={building.nextLevelCost.metal}
                    crystal={building.nextLevelCost.crystal}
                    deuterium={building.nextLevelCost.deuterium}
                    currentMetal={resources.metal}
                    currentCrystal={resources.crystal}
                    currentDeuterium={resources.deuterium}
                  />
                  <div className="text-xs text-muted-foreground">
                    Durée : {formatDuration(building.nextLevelTime)}
                  </div>
                </div>

                {building.isUpgrading && building.upgradeEndTime ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary">En construction...</span>
                      <Timer
                        targetDate={new Date(building.upgradeEndTime)}
                        onComplete={() => {
                          utils.building.list.invalidate({ planetId: planetId! });
                          utils.resource.production.invalidate({ planetId: planetId! });
                        }}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelMutation.mutate({ planetId: planetId! })}
                      disabled={cancelMutation.isPending}
                    >
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      upgradeMutation.mutate({
                        planetId: planetId!,
                        buildingId: building.id,
                      })
                    }
                    disabled={!canAfford || isAnyUpgrading || upgradeMutation.isPending}
                  >
                    Améliorer au niv. {building.currentLevel + 1}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter la route**

Modifier `apps/web/src/router.tsx`, ajouter dans les children de `/` :

```tsx
{
  path: 'buildings',
  lazy: () => import('./pages/Buildings').then((m) => ({ Component: m.default })),
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Buildings.tsx apps/web/src/router.tsx
git commit -m "feat(web): add Buildings page with upgrade/cancel and live timer"
```

---

## Chunk 6: Drizzle Migration + Typecheck + Test

### Task 18: Generation de la migration

**Files:**
- Modify: `packages/db/drizzle.config.ts` (si necessaire)

- [ ] **Step 1: Generer la migration**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/db drizzle-kit generate
```

- [ ] **Step 2: Appliquer la migration (si DB disponible)**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/db drizzle-kit migrate
```

- [ ] **Step 3: Commit la migration**

```bash
git add packages/db/src/migrations/
git commit -m "chore(db): add migration for build_queue table"
```

---

### Task 19: Typecheck + lint + test

- [ ] **Step 1: Turbo typecheck**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo typecheck
```
Expected: PASS

- [ ] **Step 2: Turbo lint**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo lint
```
Expected: PASS (fix any issues)

- [ ] **Step 3: Turbo test**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo test
```
Expected: ALL PASS — production tests (21) + building-cost tests + resources tests

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve typecheck and lint issues from Phase 2"
```

---

## Verification Checklist

1. `pnpm turbo typecheck` — pas d'erreur TS
2. `pnpm turbo test` — tous les tests passent (production + building-cost + resources)
3. `pnpm turbo lint` — pas d'erreur lint
4. API repond a `trpc.resource.production` et `trpc.building.list/upgrade/cancel`
5. Worker process demarre sans erreur (`pnpm --filter @ogame-clone/api worker`)
6. Page Ressources affiche compteurs temps reel (interpoles 1Hz)
7. Page Batiments affiche niveaux, couts, bouton upgrade, timer construction
8. TopBar affiche compteurs live metal/cristal/deut/energie
9. Construction : upgrade demarre, job BullMQ schedule, worker complete, niveau incremente
10. Annulation : ressources remboursees, job supprime
