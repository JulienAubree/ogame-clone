# Solar Satellite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the solar satellite — a stationary ship that produces energy based on planet temperature, built at the shipyard, excluded from fleet missions, and vulnerable in combat.

**Architecture:** The satellite is a regular ship entry (`SHIPS`, `ShipId`, `SHIP_STATS`, `COMBAT_STATS`) with an `isStationary` flag. Energy production is computed in the game-engine formulas layer and integrated into the existing production/resource pipeline. The DB gets a new column in `planet_ships` and seed data in game config tables.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, Fastify/tRPC, React

**Spec:** `docs/superpowers/specs/2026-03-20-solar-satellite-design.md`

---

## Chunk 1: Game Engine — Constants & Energy Formula

### Task 1: Add `solarSatelliteEnergy` function with tests

**Files:**
- Modify: `packages/game-engine/src/formulas/production.ts:75` (append after last function)
- Modify: `packages/game-engine/src/formulas/production.test.ts:113` (append new describe block)

- [ ] **Step 1: Write the failing tests**

Add at end of `packages/game-engine/src/formulas/production.test.ts`:

```ts
describe('Solar satellite energy', () => {
  it('returns floor(maxTemp / 4) + 20 for temperate planet', () => {
    // floor(80 / 4) + 20 = 40
    expect(solarSatelliteEnergy(80)).toBe(40);
  });
  it('returns 80 for hot planet (240C)', () => {
    // floor(240 / 4) + 20 = 80
    expect(solarSatelliteEnergy(240)).toBe(80);
  });
  it('returns 10 for cold planet (-40C)', () => {
    // floor(-40 / 4) + 20 = -10 + 20 = 10
    expect(solarSatelliteEnergy(-40)).toBe(10);
  });
  it('floors to minimum 10 for very cold planet (-100C)', () => {
    // floor(-100 / 4) + 20 = -25 + 20 = -5 → clamped to 10
    expect(solarSatelliteEnergy(-100)).toBe(10);
  });
  it('floors to minimum 10 for extreme cold (-200C)', () => {
    expect(solarSatelliteEnergy(-200)).toBe(10);
  });
  it('returns 20 for 0C planet', () => {
    // floor(0 / 4) + 20 = 20
    expect(solarSatelliteEnergy(0)).toBe(20);
  });
});
```

Also add `solarSatelliteEnergy` to the import at top of the test file:

```ts
import {
  mineraiProduction,
  siliciumProduction,
  hydrogeneProduction,
  solarPlantEnergy,
  mineraiMineEnergy,
  siliciumMineEnergy,
  hydrogeneSynthEnergy,
  storageCapacity,
  calculateProductionFactor,
  solarSatelliteEnergy,
} from './production.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --reporter verbose 2>&1 | tail -20`
Expected: FAIL — `solarSatelliteEnergy` is not exported

- [ ] **Step 3: Implement `solarSatelliteEnergy`**

Append at end of `packages/game-engine/src/formulas/production.ts`:

```ts
/**
 * Solar satellite energy production per unit.
 * Formula: max(10, floor(maxTemp / 4) + 20)
 */
export function solarSatelliteEnergy(maxTemp: number): number {
  return Math.max(10, Math.floor(maxTemp / 4) + 20);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --reporter verbose 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/production.ts packages/game-engine/src/formulas/production.test.ts
git commit -m "feat: add solarSatelliteEnergy formula with tests"
```

---

### Task 2: Add `solarSatellite` to ship constants

**Files:**
- Modify: `packages/game-engine/src/constants/ships.ts:1-158`
- Modify: `packages/game-engine/src/constants/ship-stats.ts:1-22`
- Modify: `packages/game-engine/src/constants/combat-stats.ts:1-39`

- [ ] **Step 1: Add `solarSatellite` to `ShipId` type**

In `packages/game-engine/src/constants/ships.ts`, add `| 'solarSatellite'` after `| 'explorer'` (line 12):

```ts
export type ShipId =
  | 'smallCargo'
  | 'largeCargo'
  | 'lightFighter'
  | 'heavyFighter'
  | 'cruiser'
  | 'battleship'
  | 'espionageProbe'
  | 'colonyShip'
  | 'recycler'
  | 'prospector'
  | 'explorer'
  | 'solarSatellite';
```

- [ ] **Step 2: Add `isStationary` to `ShipDefinition` interface**

In `packages/game-engine/src/constants/ships.ts`, add `isStationary?: boolean;` after `countColumn: string;` (line 19):

```ts
export interface ShipDefinition {
  id: ShipId;
  name: string;
  description: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  countColumn: string;
  isStationary?: boolean;
  prerequisites: {
    buildings?: { buildingId: string; level: number }[];
    research?: { researchId: string; level: number }[];
  };
}
```

- [ ] **Step 3: Add `solarSatellite` entry to `SHIPS`**

In `packages/game-engine/src/constants/ships.ts`, add before the closing `};` of `SHIPS` (after the `explorer` entry):

```ts
  solarSatellite: {
    id: 'solarSatellite',
    name: 'Satellite solaire',
    description: "Produit de l'énergie en orbite. Ne peut pas être envoyé en mission.",
    cost: { minerai: 0, silicium: 2000, hydrogene: 500 },
    countColumn: 'solarSatellite',
    isStationary: true,
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
    },
  },
```

- [ ] **Step 4: Add `solarSatellite` to `SHIP_STATS`**

In `packages/game-engine/src/constants/ship-stats.ts`, add after the `explorer` line:

```ts
  solarSatellite: { baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion' },
```

- [ ] **Step 5: Add `solarSatellite` combat stats and rapid fire**

In `packages/game-engine/src/constants/combat-stats.ts`:

Add after `explorer` line (line 19), before the `// Defenses` comment:

```ts
  solarSatellite: { weapons: 1, shield: 1, armor: 2000 },
```

Add `solarSatellite: 5` to all 7 rapid fire entries (consistent with seed data):

```ts
  smallCargo:   { espionageProbe: 5, solarSatellite: 5 },
  largeCargo:   { espionageProbe: 5, solarSatellite: 5 },
  lightFighter: { espionageProbe: 5, solarSatellite: 5 },
  heavyFighter: { espionageProbe: 5, smallCargo: 3, solarSatellite: 5 },
  cruiser:      { espionageProbe: 5, lightFighter: 6, smallCargo: 3, rocketLauncher: 10, solarSatellite: 5 },
  battleship:   { espionageProbe: 5, lightFighter: 4, smallCargo: 4, largeCargo: 4, solarSatellite: 5 },
  colonyShip:   { espionageProbe: 5, solarSatellite: 5 },
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --reporter verbose 2>&1 | tail -20`
Expected: ALL PASS (existing tests still work, TS type-checks that all ShipId entries are present in records)

- [ ] **Step 7: Commit**

```bash
git add packages/game-engine/src/constants/ships.ts packages/game-engine/src/constants/ship-stats.ts packages/game-engine/src/constants/combat-stats.ts
git commit -m "feat: add solarSatellite to ship constants, combat stats, and rapid fire"
```

---

### Task 3: Integrate satellite energy into resource calculations

**Files:**
- Modify: `packages/game-engine/src/formulas/resources.ts:1-121`
- Modify: `packages/game-engine/src/formulas/resources.test.ts:1-75`

- [ ] **Step 1: Write failing tests**

In `packages/game-engine/src/formulas/resources.test.ts`:

First, add `solarSatelliteCount: 0` to both existing `calculateProductionRates` test objects to avoid type errors:

```ts
  it('returns hourly rates for level 1 mines, solar 1, no energy deficit', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 1,
      siliciumMineLevel: 1,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: 80,
      solarSatelliteCount: 0,
    });
    // ... existing assertions unchanged
```

```ts
  it('returns reduced production when energy deficit', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 5,
      siliciumMineLevel: 5,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: 80,
      solarSatelliteCount: 0,
    });
    // ... existing assertions unchanged
```

Then add new tests to the same describe block:

```ts
  it('includes solar satellite energy in production', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 5,
      siliciumMineLevel: 5,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: 80,
      solarSatelliteCount: 10,
    });
    // Solar plant L1 = 22, 10 satellites * 40 each = 400, total = 422
    expect(rates.energyProduced).toBe(422);
    expect(rates.productionFactor).toBe(1);
  });

  it('works with zero satellites (backward compat)', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 1,
      siliciumMineLevel: 1,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: 80,
      solarSatelliteCount: 0,
    });
    expect(rates.energyProduced).toBe(22);
  });
```

Also update `basePlanet` in the `calculateResources` describe block to include `solarSatelliteCount: 0`:

```ts
  const basePlanet = {
    minerai: 500,
    silicium: 500,
    hydrogene: 0,
    mineraiMineLevel: 1,
    siliciumMineLevel: 1,
    hydrogeneSynthLevel: 0,
    solarPlantLevel: 1,
    storageMineraiLevel: 0,
    storageSiliciumLevel: 0,
    storageHydrogeneLevel: 0,
    maxTemp: 80,
    solarSatelliteCount: 0,
  };
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --reporter verbose 2>&1 | tail -30`
Expected: FAIL — `solarSatelliteCount` is not a known property of `PlanetLevels`

- [ ] **Step 3: Update `PlanetLevels` and `calculateProductionRates`**

In `packages/game-engine/src/formulas/resources.ts`:

1. Add import of `solarSatelliteEnergy`:

```ts
import {
  mineraiProduction,
  siliciumProduction,
  hydrogeneProduction,
  solarPlantEnergy,
  solarSatelliteEnergy,
  mineraiMineEnergy,
  siliciumMineEnergy,
  hydrogeneSynthEnergy,
  storageCapacity,
  calculateProductionFactor,
} from './production.js';
```

2. Add `solarSatelliteCount: number;` to `PlanetLevels` interface (after `hydrogeneSynthPercent`):

```ts
export interface PlanetLevels {
  mineraiMineLevel: number;
  siliciumMineLevel: number;
  hydrogeneSynthLevel: number;
  solarPlantLevel: number;
  storageMineraiLevel: number;
  storageSiliciumLevel: number;
  storageHydrogeneLevel: number;
  maxTemp: number;
  solarSatelliteCount: number;
  mineraiMinePercent?: number;
  siliciumMinePercent?: number;
  hydrogeneSynthPercent?: number;
}
```

3. Update `energyProduced` calculation in `calculateProductionRates` (line 60):

Replace:
```ts
  const energyProduced = solarPlantEnergy(planet.solarPlantLevel);
```

With:
```ts
  const solarSatEnergy = solarSatelliteEnergy(planet.maxTemp) * planet.solarSatelliteCount;
  const energyProduced = solarPlantEnergy(planet.solarPlantLevel) + solarSatEnergy;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --reporter verbose 2>&1 | tail -30`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/resources.ts packages/game-engine/src/formulas/resources.test.ts
git commit -m "feat: integrate solar satellite energy into production rates"
```

---

### Task 3b: Add solar satellite to combat test fixtures

**Files:**
- Modify: `packages/game-engine/src/formulas/combat.test.ts:1-56`

- [ ] **Step 1: Add `solarSatellite` to test fixtures**

In `packages/game-engine/src/formulas/combat.test.ts`:

Add to the local `COMBAT_STATS` (after `recycler`):
```ts
  solarSatellite: { weapons: 1, shield: 1, armor: 2000 },
```

Add `solarSatellite: 5` to the rapid fire entries in the local `RAPID_FIRE`:
```ts
  smallCargo:   { espionageProbe: 5, solarSatellite: 5 },
  largeCargo:   { espionageProbe: 5, solarSatellite: 5 },
  lightFighter: { espionageProbe: 5, solarSatellite: 5 },
  heavyFighter: { espionageProbe: 5, smallCargo: 3, solarSatellite: 5 },
  cruiser:      { espionageProbe: 5, lightFighter: 6, smallCargo: 3, rocketLauncher: 10, solarSatellite: 5 },
  battleship:   { espionageProbe: 5, lightFighter: 4, smallCargo: 4, largeCargo: 4, solarSatellite: 5 },
  colonyShip:   { espionageProbe: 5, solarSatellite: 5 },
```

Add `'solarSatellite'` to the local `SHIP_IDS` set:
```ts
const SHIP_IDS = new Set([
  'smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter',
  'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler',
  'solarSatellite',
]);
```

Add to `SHIP_COSTS`:
```ts
  solarSatellite: { minerai: 0, silicium: 2000 },
```

- [ ] **Step 2: Add a test for satellite in defensive combat**

Add a new test in the `simulateCombat` describe block:

```ts
  it('solar satellites participate in defense and get destroyed easily', () => {
    const result = simulateCombat(
      { cruiser: 1 },
      { solarSatellite: 5 },
      COMBAT_STATS,
      RAPID_FIRE,
      { weapons: 1, shielding: 1, armor: 1 },
      { weapons: 1, shielding: 1, armor: 1 },
    );
    // Cruiser (400 weapons) vs satellites (1 shield, 2000 armor) with rapid fire 5
    // Satellites should be largely or fully destroyed
    expect(result.defenderLosses.solarSatellite).toBeGreaterThan(0);
  });
```

- [ ] **Step 3: Run tests**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --reporter verbose 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add packages/game-engine/src/formulas/combat.test.ts
git commit -m "test: add solar satellite to combat test fixtures"
```

---

## Chunk 2: Database & Seed Data

### Task 4: Add `solarSatellite` column to `planet_ships` schema

**Files:**
- Modify: `packages/db/src/schema/planet-ships.ts:18` (add column before closing)

- [ ] **Step 1: Add column to schema**

In `packages/db/src/schema/planet-ships.ts`, add after the `explorer` line (line 18):

```ts
  solarSatellite: integer('solar_satellite').notNull().default(0),
```

- [ ] **Step 2: Add `isStationary` column to `ship_definitions` schema**

In `packages/db/src/schema/game-config.ts`, first add `boolean` to the drizzle import:

```ts
import { pgTable, varchar, text, integer, real, jsonb, primaryKey, smallint, boolean } from 'drizzle-orm/pg-core';
```

Then add after the `armor` line in `shipDefinitions` table:

```ts
  isStationary: boolean('is_stationary').notNull().default(false),
```

- [ ] **Step 3: Generate Drizzle migration**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/db drizzle-kit generate 2>&1 | tail -10`
Expected: Migration file generated

- [ ] **Step 4: Apply migration**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/db drizzle-kit push 2>&1 | tail -10`
Expected: Migration applied successfully

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/planet-ships.ts packages/db/src/schema/game-config.ts packages/db/drizzle/
git commit -m "feat: add solarSatellite column to planet_ships and isStationary to ship_definitions"
```

---

### Task 5: Add solar satellite to seed data

**Files:**
- Modify: `packages/db/src/seed-game-config.ts`

- [ ] **Step 1: Add solar satellite to SHIPS array**

In `packages/db/src/seed-game-config.ts`, add to the `SHIPS` array after the `recycler` entry (within the industrial ships section, before the `// Military ships` comment):

```ts
  { id: 'solarSatellite', name: 'Satellite solaire', description: "Produit de l'énergie en orbite. Ne peut pas être envoyé en mission.", costMinerai: 0, costSilicium: 2000, costHydrogene: 500, countColumn: 'solarSatellite', baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion', weapons: 1, shield: 1, armor: 2000, categoryId: 'ship_utilitaire', sortOrder: 7, flavorText: "En orbite stationnaire, les satellites solaires captent l'énergie stellaire et la transmettent aux installations planétaires. Plus la planète est proche de son étoile, plus ils sont efficaces.", isStationary: true, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [] } },
```

Note: The `isStationary` field needs to be added to the insert logic. Since the seed uses `shipDefinitions` which we added the `isStationary` column to, we need to ensure the seed `SHIPS` entries include this field. Add `isStationary: false` to all existing ship entries (or handle it in the insert by defaulting). The simplest approach: add `isStationary` only on the solarSatellite entry, and in the seed insert loop, spread a default:

Update the ship insert loop (around line 408-411) to include `isStationary`:

Replace:
```ts
  for (const s of SHIPS) {
    const { prerequisites: _sp, ...row } = s;
    await db.insert(shipDefinitions).values(row)
      .onConflictDoUpdate({ target: shipDefinitions.id, set: { ...row } });
  }
```

With:
```ts
  for (const s of SHIPS) {
    const { prerequisites: _sp, ...row } = s;
    const values = { isStationary: false, ...row };
    await db.insert(shipDefinitions).values(values)
      .onConflictDoUpdate({ target: shipDefinitions.id, set: values });
  }
```

- [ ] **Step 2: Add rapid fire entries for solarSatellite**

In `packages/db/src/seed-game-config.ts`, add to the `RAPID_FIRE_DATA` array:

```ts
  { attackerId: 'smallCargo', targetId: 'solarSatellite', value: 5 },
  { attackerId: 'largeCargo', targetId: 'solarSatellite', value: 5 },
  { attackerId: 'lightFighter', targetId: 'solarSatellite', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'solarSatellite', value: 5 },
  { attackerId: 'cruiser', targetId: 'solarSatellite', value: 5 },
  { attackerId: 'battleship', targetId: 'solarSatellite', value: 5 },
  { attackerId: 'colonyShip', targetId: 'solarSatellite', value: 5 },
```

- [ ] **Step 3: Run seed**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/db seed 2>&1 | tail -15`
Expected: Seed complete with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/seed-game-config.ts
git commit -m "feat: add solar satellite to seed data with rapid fire entries"
```

---

## Chunk 3: Backend — Resource Service & Routers

### Task 6: Update `resource.service.ts` to include satellite count

**Files:**
- Modify: `apps/api/src/modules/resource/resource.service.ts:1-193`

- [ ] **Step 1: Add `planetShips` import**

In `apps/api/src/modules/resource/resource.service.ts`, update the import from `@ogame-clone/db`:

```ts
import { planets, planetTypes, planetBuildings, planetShips } from '@ogame-clone/db';
```

- [ ] **Step 2: Create `buildPlanetLevels` helper**

Add after the `getBuildingLevels` function (after line 32):

```ts
async function getSolarSatelliteCount(db: Database, planetId: string): Promise<number> {
  const [row] = await db
    .select({ solarSatellite: planetShips.solarSatellite })
    .from(planetShips)
    .where(eq(planetShips.planetId, planetId))
    .limit(1);
  return row?.solarSatellite ?? 0;
}

async function buildPlanetLevels(db: Database, planetId: string, planet: {
  maxTemp: number;
  mineraiMinePercent: number;
  siliciumMinePercent: number;
  hydrogeneSynthPercent: number;
}) {
  const [buildingLevels, solarSatelliteCount] = await Promise.all([
    getBuildingLevels(db, planetId),
    getSolarSatelliteCount(db, planetId),
  ]);
  return {
    mineraiMineLevel: buildingLevels['mineraiMine'] ?? 0,
    siliciumMineLevel: buildingLevels['siliciumMine'] ?? 0,
    hydrogeneSynthLevel: buildingLevels['hydrogeneSynth'] ?? 0,
    solarPlantLevel: buildingLevels['solarPlant'] ?? 0,
    storageMineraiLevel: buildingLevels['storageMinerai'] ?? 0,
    storageSiliciumLevel: buildingLevels['storageSilicium'] ?? 0,
    storageHydrogeneLevel: buildingLevels['storageHydrogene'] ?? 0,
    maxTemp: planet.maxTemp,
    solarSatelliteCount,
    mineraiMinePercent: planet.mineraiMinePercent,
    siliciumMinePercent: planet.siliciumMinePercent,
    hydrogeneSynthPercent: planet.hydrogeneSynthPercent,
  };
}
```

- [ ] **Step 3: Refactor `materializeResources` to use helper**

Replace the body of `materializeResources` (lines 40-89) to use `buildPlanetLevels`:

```ts
    async materializeResources(planetId: string, userId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const bonus = await loadPlanetTypeBonus(db, planet.planetClassId);
      const levels = await buildPlanetLevels(db, planetId, planet);

      const now = new Date();
      const resources = calculateResources(
        {
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
          ...levels,
        },
        planet.resourcesUpdatedAt,
        now,
        bonus,
      );

      const [updated] = await db
        .update(planets)
        .set({
          minerai: String(resources.minerai),
          silicium: String(resources.silicium),
          hydrogene: String(resources.hydrogene),
          resourcesUpdatedAt: now,
        })
        .where(eq(planets.id, planetId))
        .returning();

      return updated;
    },
```

- [ ] **Step 4: Refactor `spendResources` to use helper**

Same pattern — replace the `PlanetLevels` construction block with:

```ts
      const levels = await buildPlanetLevels(db, planetId, planet);

      const now = new Date();
      const produced = calculateResources(
        {
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
          ...levels,
        },
        planet.resourcesUpdatedAt,
        now,
        bonus,
      );
```

(Remove the manual `buildingLevels` call and the inline object construction.)

- [ ] **Step 5: Refactor `getProductionRates` to use helper**

Replace:
```ts
    async getProductionRates(planetId: string, planet: {
      maxTemp: number;
      mineraiMinePercent: number;
      siliciumMinePercent: number;
      hydrogeneSynthPercent: number;
    }, bonus?: PlanetTypeBonus) {
      const buildingLevels = await getBuildingLevels(db, planetId);
      return calculateProductionRates({
        mineraiMineLevel: buildingLevels['mineraiMine'] ?? 0,
        ...
      }, bonus);
    },
```

With:
```ts
    async getProductionRates(planetId: string, planet: {
      maxTemp: number;
      mineraiMinePercent: number;
      siliciumMinePercent: number;
      hydrogeneSynthPercent: number;
    }, bonus?: PlanetTypeBonus) {
      const levels = await buildPlanetLevels(db, planetId, planet);
      return calculateProductionRates(levels, bonus);
    },
```

- [ ] **Step 6: Verify build**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/api build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/resource/resource.service.ts
git commit -m "feat: include solar satellite count in resource production calculations"
```

---

### Task 7: Update resource router to return satellite count

**Files:**
- Modify: `apps/api/src/modules/resource/resource.router.ts:34-50`

- [ ] **Step 1: Add satellite count to production response**

In `apps/api/src/modules/resource/resource.router.ts`, import `planetShips`:

```ts
import { planetTypes, planetShips } from '@ogame-clone/db';
```

Add a query for satellite count and include it in the response. After `const buildingLevels = ...` (line 34), add:

```ts
        const [ships] = await db.select({ solarSatellite: planetShips.solarSatellite })
          .from(planetShips).where(eq(planetShips.planetId, input.planetId)).limit(1);
```

And in the return object, add to `levels`:

```ts
          levels: {
            mineraiMine: buildingLevels['mineraiMine'] ?? 0,
            siliciumMine: buildingLevels['siliciumMine'] ?? 0,
            hydrogeneSynth: buildingLevels['hydrogeneSynth'] ?? 0,
            solarPlant: buildingLevels['solarPlant'] ?? 0,
            solarSatelliteCount: ships?.solarSatellite ?? 0,
          },
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/resource/resource.router.ts
git commit -m "feat: return solar satellite count in production endpoint"
```

---

### Task 8: Update shipyard router and fleet router

**Files:**
- Modify: `apps/api/src/modules/shipyard/shipyard.router.ts:5-9`
- No change to: `apps/api/src/modules/fleet/fleet.router.ts` (solarSatellite intentionally excluded)

- [ ] **Step 1: Add `solarSatellite` to shipyard router `shipIds`**

In `apps/api/src/modules/shipyard/shipyard.router.ts`, update the `shipIds` array:

```ts
const shipIds = [
  'smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter',
  'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler',
  'prospector', 'explorer', 'solarSatellite',
] as const;
```

Note: `fleet.router.ts` is NOT modified — `solarSatellite` stays excluded from the fleet Zod schema.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/shipyard/shipyard.router.ts
git commit -m "feat: add solarSatellite to shipyard router, keep excluded from fleet router"
```

---

### Task 9: Fix attack handler ship types

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/attack.handler.ts:80`

- [ ] **Step 1: Update hardcoded `shipTypes` array**

In `apps/api/src/modules/fleet/handlers/attack.handler.ts`, replace the `shipTypes` array (line 80):

Replace:
```ts
    const shipTypes = ['smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler'] as const;
```

With:
```ts
    const shipTypes = ['smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler', 'prospector', 'explorer', 'solarSatellite'] as const;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/attack.handler.ts
git commit -m "fix: include all ship types in attack handler defender fleet (adds prospector, explorer, solarSatellite)"
```

---

## Chunk 4: Frontend

### Task 10: Update mission config for fleet exclusion

**Files:**
- Modify: `apps/web/src/config/mission-config.ts:103-115` (SHIP_NAMES) and `139-160` (categorizeShip)

- [ ] **Step 1: Add `solarSatellite` to `SHIP_NAMES`**

In `apps/web/src/config/mission-config.ts`, add to `SHIP_NAMES`:

```ts
  solarSatellite: 'Satellite solaire',
```

- [ ] **Step 2: Update `categorizeShip` signature and add `isStationary` check**

Update the function to accept ship config:

```ts
export function categorizeShip(
  shipId: string,
  shipCount: number,
  mission: Mission,
  shipConfig?: { isStationary?: boolean },
): ShipCategory {
  if (shipConfig?.isStationary) return 'disabled';

  const config = MISSION_CONFIG[mission];

  if (shipCount === 0) return 'disabled';

  if (config.exclusive && config.requiredShips) {
    return config.requiredShips.includes(shipId) ? 'required' : 'disabled';
  }

  if (config.requiredShips?.includes(shipId)) return 'required';

  if (config.recommendedShips?.includes(shipId)) return 'required';

  return 'optional';
}
```

- [ ] **Step 3: Update `FleetComposition` to pass ship config**

In `apps/web/src/components/fleet/FleetComposition.tsx`, update the call to `categorizeShip` (line 109) to pass the ship config. This requires the `Ship` interface or the fleet page to provide `isStationary`. The simplest approach: add `isStationary?: boolean` to the local `Ship` interface and pass it through:

```ts
interface Ship {
  id: string;
  name: string;
  count: number;
  isStationary?: boolean;
}
```

Then update the categorization call:

```ts
    const category = categorizeShip(ship.id, ship.count, mission, { isStationary: ship.isStationary });
```

The parent component that builds the ships list from the API response must include `isStationary` from the ship definitions response.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/config/mission-config.ts apps/web/src/components/fleet/FleetComposition.tsx
git commit -m "feat: exclude stationary ships from fleet selection via isStationary flag"
```

---

### Task 11: Update Resources page to show satellite energy

**Files:**
- Modify: `apps/web/src/pages/Resources.tsx:196-235`

- [ ] **Step 1: Add satellite energy line to the energy balance section**

In `apps/web/src/pages/Resources.tsx`, within the "Balance energetique" section (after the solar plant line around line 204), add a conditional satellite line:

After:
```tsx
              <div className="flex items-center justify-between text-sm">
                <span className="text-energy font-medium glow-energy">Centrale solaire</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Niv. {data.levels.solarPlant}</Badge>
                  <span className="text-energy font-mono">+{data.rates.energyProduced}</span>
                </div>
              </div>
```

Replace the `+{data.rates.energyProduced}` with the solar plant energy only, then add a separate satellite line. Since the API returns `energyProduced` as the total (plant + satellites), we need to compute the split. We can compute the satellite energy on the client:

```tsx
              {(() => {
                const satCount = data.levels.solarSatelliteCount ?? 0;
                const satEnergyPerUnit = Math.max(10, Math.floor(data.maxTemp / 4) + 20);
                const satEnergyTotal = satEnergyPerUnit * satCount;
                const plantEnergy = data.rates.energyProduced - satEnergyTotal;
                return (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-energy font-medium glow-energy">Centrale solaire</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">Niv. {data.levels.solarPlant}</Badge>
                        <span className="text-energy font-mono">+{plantEnergy}</span>
                      </div>
                    </div>
                    {satCount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-energy font-medium glow-energy">Satellites solaires</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">x{satCount}</Badge>
                          <span className="text-energy font-mono">+{satEnergyTotal}</span>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
```

Remove the existing solar plant `<div>` and replace with this block.

Also update the energy deficit message to suggest building satellites:

```tsx
                  Facteur de production : {(data.rates.productionFactor * 100).toFixed(1)}% — Construisez
                  une centrale solaire ou des satellites solaires !
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/Resources.tsx
git commit -m "feat: display solar satellite energy breakdown on resources page"
```

---

### Task 12: Add energy info to satellite detail page

**Files:**
- Modify: `apps/web/src/components/entity-details/ShipDetailContent.tsx`

- [ ] **Step 1: Add energy production section for stationary ships**

In `apps/web/src/components/entity-details/ShipDetailContent.tsx`, the component receives `shipId` and shows combat stats, movement, etc. For the solar satellite, the "Movement" section showing speed/fuel/cargo is meaningless. We need to:

1. Import `useOutletContext` to get the current planet's `maxTemp` (or accept it as prop from the parent). Check how the parent passes data — if `maxTemp` is not available, the simplest approach is to conditionally show the energy section only when the ship is stationary, using the game config's `isStationary` field.

2. Add a conditional energy production section. After the combat stats section and before the movement section, add:

```tsx
      {/* Energy production (stationary ships only) */}
      {details.isStationary && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
            Production d'énergie
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Formule</span>
            <span className="text-slate-200 font-mono text-[10px]">max(10, ⌊tempMax / 4⌋ + 20)</span>
          </div>
          <p className="text-[10px] text-slate-500">
            Ce vaisseau est stationnaire : il ne peut pas être envoyé en mission et est vulnérable aux attaques.
          </p>
        </div>
      )}
```

3. Conditionally hide the "Movement" section when the ship is stationary (speed/fuel/cargo are all 0):

```tsx
      {/* Movement — hide for stationary ships */}
      {!details.isStationary && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
          {/* ... existing movement content ... */}
        </div>
      )}
```

Note: `details.isStationary` needs to be exposed by `getShipDetails`. Check `apps/web/src/lib/entity-details.ts` and add `isStationary: shipDef.isStationary ?? false` to the returned object.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/entity-details/ShipDetailContent.tsx apps/web/src/lib/entity-details.ts
git commit -m "feat: show energy formula on satellite detail page, hide movement section for stationary ships"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run all game-engine tests**

Run: `cd ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --reporter verbose 2>&1 | tail -30`
Expected: ALL PASS

- [ ] **Step 2: Build all packages**

Run: `cd ogame-clone && pnpm build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Final commit (if any remaining changes)**

```bash
git status
```
