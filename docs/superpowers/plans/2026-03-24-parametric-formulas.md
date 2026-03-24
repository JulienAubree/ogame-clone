# Parametric Formulas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every game formula read its constants from DB config parameters instead of hardcoded values.

**Architecture:** Each formula function gains a config parameter (with default = current hardcoded value for backward compatibility). Callers in API services pass values from `gameConfigService.getFullConfig()`. Frontend callers pass values from `useGameConfig()`. The `productionConfig` DB table gains two columns (`tempCoeffA`, `tempCoeffB`) for hydrogen. All other constants already exist in `universeConfig`.

**Tech Stack:** TypeScript, Drizzle ORM (PostgreSQL), vitest, tRPC, React

**Key files overview:**
- `packages/game-engine/src/formulas/` — 10 formula files to parametrize
- `packages/game-engine/src/constants/progression.ts` — PHASE_MULTIPLIER to parametrize
- `packages/db/src/schema/game-config.ts` — productionConfig table schema
- `packages/db/src/seed-game-config.ts` — seed data
- `apps/api/src/modules/admin/game-config.service.ts` — GameConfig interfaces
- `apps/api/src/modules/` — API service callers
- `apps/api/src/cron/resource-tick.ts` — cron caller
- `apps/web/src/` — frontend callers

**Strategy:** Add config params with defaults matching current hardcoded values (backward compat). This lets each task be committed independently without breaking the build. Callers then explicitly pass config values from DB.

---

### Task 1: Add tempCoeffA/tempCoeffB to productionConfig schema + seed

**Files:**
- Modify: `packages/db/src/schema/game-config.ts` (productionConfig table, ~line 147-153)
- Modify: `packages/db/src/seed-game-config.ts` (PRODUCTION_CONFIG array, ~line 163-169)
- Modify: `apps/api/src/modules/admin/game-config.service.ts` (ProductionConfigEntry interface, ~line 165-171; getFullConfig production mapping, ~line 362-371)
- Create: `packages/db/drizzle/XXXX_*.sql` (migration)

**Context:** The hydrogen production formula uses constants `1.36` and `0.004` for temperature coefficients. These need to live in the `productionConfig` DB table. The table already has `baseProduction`, `exponentBase`, `energyConsumption`, `storageBase`. We add two nullable real columns.

- [ ] **Step 1: Add columns to schema**

In `packages/db/src/schema/game-config.ts`, add two columns to `productionConfig` table after `storageBase`:

```typescript
export const productionConfig = pgTable('production_config', {
  id: varchar('id', { length: 64 }).primaryKey(),
  baseProduction: real('base_production').notNull(),
  exponentBase: real('exponent_base').notNull().default(1.1),
  energyConsumption: real('energy_consumption'),
  storageBase: real('storage_base'),
  tempCoeffA: real('temp_coeff_a'),
  tempCoeffB: real('temp_coeff_b'),
});
```

- [ ] **Step 2: Update seed data**

In `packages/db/src/seed-game-config.ts`, add `tempCoeffA` and `tempCoeffB` to PRODUCTION_CONFIG entries:

```typescript
const PRODUCTION_CONFIG = [
  { id: 'mineraiMine', baseProduction: 30, exponentBase: 1.1, energyConsumption: 10, storageBase: null, tempCoeffA: null, tempCoeffB: null },
  { id: 'siliciumMine', baseProduction: 20, exponentBase: 1.1, energyConsumption: 10, storageBase: null, tempCoeffA: null, tempCoeffB: null },
  { id: 'hydrogeneSynth', baseProduction: 10, exponentBase: 1.1, energyConsumption: 20, storageBase: null, tempCoeffA: 1.36, tempCoeffB: 0.004 },
  { id: 'solarPlant', baseProduction: 20, exponentBase: 1.1, energyConsumption: null, storageBase: null, tempCoeffA: null, tempCoeffB: null },
  { id: 'storage', baseProduction: 5000, exponentBase: 1.1, energyConsumption: null, storageBase: 5000, tempCoeffA: null, tempCoeffB: null },
];
```

- [ ] **Step 3: Update ProductionConfigEntry interface**

In `apps/api/src/modules/admin/game-config.service.ts`, update:

```typescript
export interface ProductionConfigEntry {
  id: string;
  baseProduction: number;
  exponentBase: number;
  energyConsumption: number | null;
  storageBase: number | null;
  tempCoeffA: number | null;
  tempCoeffB: number | null;
}
```

And in the `getFullConfig()` production mapping (~line 362-371), add the new fields:

```typescript
production[p.id] = {
  id: p.id,
  baseProduction: p.baseProduction,
  exponentBase: p.exponentBase,
  energyConsumption: p.energyConsumption,
  storageBase: p.storageBase,
  tempCoeffA: p.tempCoeffA ?? null,
  tempCoeffB: p.tempCoeffB ?? null,
};
```

- [ ] **Step 4: Generate migration**

Run: `cd packages/db && npx drizzle-kit generate`

This creates a SQL migration file. Verify it contains `ALTER TABLE production_config ADD COLUMN temp_coeff_a real` and `temp_coeff_b real`.

- [ ] **Step 5: Rebuild db package**

Run: `cd packages/db && npm run build`

- [ ] **Step 6: Update updateProductionConfig service method**

In `apps/api/src/modules/admin/game-config.service.ts` (~line 867-872), add the new fields to the `Partial` type:

```typescript
async updateProductionConfig(id: string, data: Partial<{
  baseProduction: number;
  exponentBase: number;
  energyConsumption: number | null;
  storageBase: number | null;
  tempCoeffA: number | null;
  tempCoeffB: number | null;
}>) {
```

- [ ] **Step 7: Update tRPC router Zod schema**

In `apps/api/src/modules/admin/game-config.router.ts` (~line 320-324), add to the `data` object:

```typescript
data: z.object({
  baseProduction: z.number().optional(),
  exponentBase: z.number().optional(),
  energyConsumption: z.number().nullable().optional(),
  storageBase: z.number().nullable().optional(),
  tempCoeffA: z.number().nullable().optional(),
  tempCoeffB: z.number().nullable().optional(),
}),
```

- [ ] **Step 8: Update admin Production.tsx page**

In `apps/admin/src/pages/Production.tsx`:

1. Add fields to `EditState` interface (~line 7-13):
```typescript
interface EditState {
  id: string;
  baseProduction: number;
  exponentBase: number;
  energyConsumption: number | null;
  storageBase: number | null;
  tempCoeffA: number | null;
  tempCoeffB: number | null;
}
```

2. Add `<th>Coeff Temp A</th>` and `<th>Coeff Temp B</th>` columns in the table header.

3. Add corresponding `<td>` cells showing `p.tempCoeffA ?? '-'` and `p.tempCoeffB ?? '-'`.

4. Add `tempCoeffA` and `tempCoeffB` to the edit state initialization and the save mutation payload.

5. Add input fields for these values in the editing row (same pattern as existing fields, type="number", step="0.001").

- [ ] **Step 9: Rebuild db package**

Run: `cd packages/db && npm run build`

- [ ] **Step 10: TypeScript check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/admin/tsconfig.json`
Expected: no errors

- [ ] **Step 11: Commit**

```bash
git add packages/db/src/schema/game-config.ts packages/db/src/seed-game-config.ts packages/db/drizzle/ apps/api/src/modules/admin/game-config.service.ts apps/api/src/modules/admin/game-config.router.ts apps/admin/src/pages/Production.tsx
git commit -m "feat(db): add tempCoeffA/tempCoeffB to productionConfig schema + admin"
```

---

### Task 2: Parametrize production.ts formulas

**Files:**
- Modify: `packages/game-engine/src/formulas/production.ts`
- Modify: `packages/game-engine/src/formulas/production.test.ts`

**Context:** Each production function gets a config parameter with defaults matching current hardcoded values. This preserves backward compatibility — existing callers keep working without changes.

- [ ] **Step 1: Update production.ts**

Replace the entire file content with parametrized versions. Every function gets a config object as last parameter with defaults:

```typescript
/**
 * Generic resource production per hour.
 * Formula: baseProduction * level * exponentBase^level * productionFactor
 */
export function mineraiProduction(
  level: number,
  productionFactor: number = 1,
  config: { baseProduction: number; exponentBase: number } = { baseProduction: 30, exponentBase: 1.1 },
): number {
  return Math.floor(config.baseProduction * level * Math.pow(config.exponentBase, level) * productionFactor);
}

export function siliciumProduction(
  level: number,
  productionFactor: number = 1,
  config: { baseProduction: number; exponentBase: number } = { baseProduction: 20, exponentBase: 1.1 },
): number {
  return Math.floor(config.baseProduction * level * Math.pow(config.exponentBase, level) * productionFactor);
}

/**
 * Hydrogen synthesizer production per hour.
 * Formula: baseProduction * level * exponentBase^level * (tempCoeffA - tempCoeffB * maxTemp) * productionFactor
 */
export function hydrogeneProduction(
  level: number,
  maxTemp: number,
  productionFactor: number = 1,
  config: { baseProduction: number; exponentBase: number; tempCoeffA: number; tempCoeffB: number } = { baseProduction: 10, exponentBase: 1.1, tempCoeffA: 1.36, tempCoeffB: 0.004 },
): number {
  return Math.floor(config.baseProduction * level * Math.pow(config.exponentBase, level) * (config.tempCoeffA - config.tempCoeffB * maxTemp) * productionFactor);
}

/**
 * Solar plant energy production.
 * Formula: baseProduction * level * exponentBase^level
 */
export function solarPlantEnergy(
  level: number,
  config: { baseProduction: number; exponentBase: number } = { baseProduction: 20, exponentBase: 1.1 },
): number {
  return Math.floor(config.baseProduction * level * Math.pow(config.exponentBase, level));
}

/**
 * Minerai mine energy consumption.
 * Formula: baseConsumption * level * exponentBase^level
 */
export function mineraiMineEnergy(
  level: number,
  config: { baseConsumption: number; exponentBase: number } = { baseConsumption: 10, exponentBase: 1.1 },
): number {
  return Math.floor(config.baseConsumption * level * Math.pow(config.exponentBase, level));
}

export function siliciumMineEnergy(
  level: number,
  config: { baseConsumption: number; exponentBase: number } = { baseConsumption: 10, exponentBase: 1.1 },
): number {
  return Math.floor(config.baseConsumption * level * Math.pow(config.exponentBase, level));
}

export function hydrogeneSynthEnergy(
  level: number,
  config: { baseConsumption: number; exponentBase: number } = { baseConsumption: 20, exponentBase: 1.1 },
): number {
  return Math.floor(config.baseConsumption * level * Math.pow(config.exponentBase, level));
}

/**
 * Storage capacity.
 * Formula: storageBase * floor(coeffA * e^(coeffB * level / coeffC))
 */
export function storageCapacity(
  level: number,
  config: { storageBase: number; coeffA: number; coeffB: number; coeffC: number } = { storageBase: 5000, coeffA: 2.5, coeffB: 20, coeffC: 33 },
): number {
  return config.storageBase * Math.floor(config.coeffA * Math.exp((config.coeffB * level) / config.coeffC));
}

/**
 * Calculate the production factor based on energy balance.
 */
export function calculateProductionFactor(energyProduced: number, energyConsumed: number): number {
  if (energyConsumed === 0) return 1;
  if (energyProduced >= energyConsumed) return 1;
  return energyProduced / energyConsumed;
}

/**
 * Solar satellite energy production per unit.
 */
export function solarSatelliteEnergy(
  maxTemp: number,
  isHomePlanet: boolean = false,
  config: { homePlanetEnergy: number; baseDivisor: number; baseOffset: number } = { homePlanetEnergy: 50, baseDivisor: 4, baseOffset: 20 },
): number {
  if (isHomePlanet) return config.homePlanetEnergy;
  return Math.max(10, Math.floor(maxTemp / config.baseDivisor) + config.baseOffset);
}
```

- [ ] **Step 2: Add parametric tests to production.test.ts**

Add a new describe block at the end of the existing tests:

```typescript
describe('Parametric config', () => {
  it('mineraiProduction with custom config', () => {
    const result = mineraiProduction(5, 1, { baseProduction: 50, exponentBase: 1.2 });
    // 50 * 5 * 1.2^5 = 250 * 2.48832 = 622.08 -> 622
    expect(result).toBe(622);
  });

  it('hydrogeneProduction with custom temp coeffs', () => {
    const result = hydrogeneProduction(5, 80, 1, { baseProduction: 10, exponentBase: 1.1, tempCoeffA: 2.0, tempCoeffB: 0.01 });
    // 10 * 5 * 1.61051 * (2.0 - 0.8) = 80.5255 * 1.2 = 96.63 -> 96
    expect(result).toBe(96);
  });

  it('storageCapacity with custom config', () => {
    const result = storageCapacity(1, { storageBase: 10000, coeffA: 2.5, coeffB: 20, coeffC: 33 });
    // 10000 * floor(2.5 * e^(20/33)) = 10000 * floor(4.585) = 10000 * 4 = 40000
    expect(result).toBe(40000);
  });

  it('solarSatelliteEnergy with custom config', () => {
    expect(solarSatelliteEnergy(80, true, { homePlanetEnergy: 100, baseDivisor: 4, baseOffset: 20 })).toBe(100);
    expect(solarSatelliteEnergy(80, false, { homePlanetEnergy: 100, baseDivisor: 2, baseOffset: 10 })).toBe(50);
  });

  it('energyConsumption with custom config', () => {
    const result = mineraiMineEnergy(5, { baseConsumption: 20, exponentBase: 1.1 });
    // 20 * 5 * 1.61051 = 161.051 -> 161
    expect(result).toBe(161);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/game-engine && npx vitest run src/formulas/production.test.ts`
Expected: all tests pass (existing tests use defaults, new tests use custom config)

- [ ] **Step 4: Rebuild game-engine**

Run: `cd packages/game-engine && npm run build`

- [ ] **Step 5: TypeScript check API + web**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: no errors (defaults maintain backward compat)

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/formulas/production.ts packages/game-engine/src/formulas/production.test.ts
git commit -m "feat(game-engine): parametrize production formulas with config defaults"
```

---

### Task 3: Parametrize resources.ts (calculateProductionRates + calculateResources)

**Files:**
- Modify: `packages/game-engine/src/formulas/resources.ts`
- Modify: `packages/game-engine/src/formulas/resources.test.ts`

**Context:** `calculateProductionRates` calls all production.ts functions. It needs a `ProductionConfig` parameter to pass through. `calculateResources` calls `calculateProductionRates` and must forward it.

- [ ] **Step 1: Add ProductionConfig interface and update functions**

In `resources.ts`, add after the existing imports:

```typescript
export interface ProductionConfig {
  minerai: { baseProduction: number; exponentBase: number };
  silicium: { baseProduction: number; exponentBase: number };
  hydrogene: { baseProduction: number; exponentBase: number; tempCoeffA: number; tempCoeffB: number };
  solar: { baseProduction: number; exponentBase: number };
  mineraiEnergy: { baseConsumption: number; exponentBase: number };
  siliciumEnergy: { baseConsumption: number; exponentBase: number };
  hydrogeneEnergy: { baseConsumption: number; exponentBase: number };
  storage: { storageBase: number; coeffA: number; coeffB: number; coeffC: number };
  satellite: { homePlanetEnergy: number; baseDivisor: number; baseOffset: number };
}
```

Add a default config constant:

```typescript
const DEFAULT_PRODUCTION_CONFIG: ProductionConfig = {
  minerai: { baseProduction: 30, exponentBase: 1.1 },
  silicium: { baseProduction: 20, exponentBase: 1.1 },
  hydrogene: { baseProduction: 10, exponentBase: 1.1, tempCoeffA: 1.36, tempCoeffB: 0.004 },
  solar: { baseProduction: 20, exponentBase: 1.1 },
  mineraiEnergy: { baseConsumption: 10, exponentBase: 1.1 },
  siliciumEnergy: { baseConsumption: 10, exponentBase: 1.1 },
  hydrogeneEnergy: { baseConsumption: 20, exponentBase: 1.1 },
  storage: { storageBase: 5000, coeffA: 2.5, coeffB: 20, coeffC: 33 },
  satellite: { homePlanetEnergy: 50, baseDivisor: 4, baseOffset: 20 },
};
```

Update `calculateProductionRates` signature:

```typescript
export function calculateProductionRates(planet: PlanetLevels, bonus?: PlanetTypeBonus, prodConfig: ProductionConfig = DEFAULT_PRODUCTION_CONFIG): ProductionRates {
```

Inside the function body, pass config to each production.ts call:
- `solarSatelliteEnergy(planet.maxTemp, planet.isHomePlanet, prodConfig.satellite)`
- `solarPlantEnergy(planet.solarPlantLevel, prodConfig.solar)`
- `mineraiMineEnergy(planet.mineraiMineLevel, prodConfig.mineraiEnergy)`
- `siliciumMineEnergy(planet.siliciumMineLevel, prodConfig.siliciumEnergy)`
- `hydrogeneSynthEnergy(planet.hydrogeneSynthLevel, prodConfig.hydrogeneEnergy)`
- `mineraiProduction(planet.mineraiMineLevel, mineraiPct * factor, prodConfig.minerai)`
- `siliciumProduction(planet.siliciumMineLevel, siliciumPct * factor, prodConfig.silicium)`
- `hydrogeneProduction(planet.hydrogeneSynthLevel, planet.maxTemp, hydrogenePct * factor, prodConfig.hydrogene)`
- `storageCapacity(planet.storageMineraiLevel, prodConfig.storage)` (and same for silicium/hydrogene)

Update `calculateResources` signature:

```typescript
export function calculateResources(
  planet: PlanetResources,
  resourcesUpdatedAt: Date,
  now: Date,
  bonus?: PlanetTypeBonus,
  prodConfig?: ProductionConfig,
): { minerai: number; silicium: number; hydrogene: number } {
  const rates = calculateProductionRates(planet, bonus, prodConfig);
  // ... rest unchanged
}
```

- [ ] **Step 2: Add test for custom ProductionConfig**

Add to `resources.test.ts`:

```typescript
import type { ProductionConfig } from './resources.js';

describe('calculateProductionRates with custom config', () => {
  it('uses custom production config', () => {
    const customConfig: ProductionConfig = {
      minerai: { baseProduction: 60, exponentBase: 1.1 },
      silicium: { baseProduction: 20, exponentBase: 1.1 },
      hydrogene: { baseProduction: 10, exponentBase: 1.1, tempCoeffA: 1.36, tempCoeffB: 0.004 },
      solar: { baseProduction: 20, exponentBase: 1.1 },
      mineraiEnergy: { baseConsumption: 10, exponentBase: 1.1 },
      siliciumEnergy: { baseConsumption: 10, exponentBase: 1.1 },
      hydrogeneEnergy: { baseConsumption: 20, exponentBase: 1.1 },
      storage: { storageBase: 5000, coeffA: 2.5, coeffB: 20, coeffC: 33 },
      satellite: { homePlanetEnergy: 50, baseDivisor: 4, baseOffset: 20 },
    };
    const planet = {
      mineraiMineLevel: 1, siliciumMineLevel: 0, hydrogeneSynthLevel: 0,
      solarPlantLevel: 5, storageMineraiLevel: 0, storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0, maxTemp: 50, solarSatelliteCount: 0,
    };
    const rates = calculateProductionRates(planet, undefined, customConfig);
    // With baseProduction=60: 60 * 1 * 1.1 = 66 (vs default 33)
    expect(rates.mineraiPerHour).toBe(66);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/game-engine && npx vitest run src/formulas/resources.test.ts`
Expected: all pass

- [ ] **Step 4: Rebuild + TS check**

Run: `cd packages/game-engine && npm run build && cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/resources.ts packages/game-engine/src/formulas/resources.test.ts
git commit -m "feat(game-engine): parametrize calculateProductionRates/calculateResources with ProductionConfig"
```

---

### Task 4: Parametrize progression.ts + building-cost.ts + research-cost.ts + shipyard-cost.ts

**Files:**
- Modify: `packages/game-engine/src/constants/progression.ts`
- Modify: `packages/game-engine/src/formulas/building-cost.ts`
- Modify: `packages/game-engine/src/formulas/research-cost.ts`
- Modify: `packages/game-engine/src/formulas/shipyard-cost.ts`
- Modify: `packages/game-engine/src/formulas/building-cost.test.ts`

**Context:** `getPhaseMultiplier` uses hardcoded `PHASE_MULTIPLIER` map. `researchTime` uses hardcoded `1000` divisor. `shipTime`/`defenseTime` use hardcoded `2500` divisor. All these values are already in `universeConfig`.

- [ ] **Step 1: Update progression.ts**

Add an optional parameter to `getPhaseMultiplier`:

```typescript
export const PHASE_MULTIPLIER: Record<number, number> = {
  1: 0.35, 2: 0.45, 3: 0.55, 4: 0.65, 5: 0.78, 6: 0.90, 7: 0.95,
};

export function getPhaseMultiplier(level: number, phaseMap: Record<number, number> = PHASE_MULTIPLIER): number {
  return phaseMap[level] ?? 1.0;
}
```

- [ ] **Step 2: Update building-cost.ts**

Add `phaseMap` parameter to both functions:

```typescript
export function buildingCost(def: BuildingCostDef, level: number, phaseMap?: Record<number, number>): ResourceCost {
  const factor = Math.pow(def.costFactor, level - 1) * getPhaseMultiplier(level, phaseMap);
  return {
    minerai: Math.floor(def.baseCost.minerai * factor),
    silicium: Math.floor(def.baseCost.silicium * factor),
    hydrogene: Math.floor(def.baseCost.hydrogene * factor),
  };
}

export function buildingTime(def: BuildingCostDef, level: number, bonusMultiplier: number, phaseMap?: Record<number, number>): number {
  const seconds = Math.floor(def.baseTime * Math.pow(def.costFactor, level - 1) * bonusMultiplier * getPhaseMultiplier(level, phaseMap));
  return Math.max(1, seconds);
}
```

- [ ] **Step 3: Update research-cost.ts**

Add `phaseMap` and `timeDivisor` parameters:

```typescript
export function researchCost(def: ResearchCostDef, level: number, phaseMap?: Record<number, number>): ResourceCost {
  const factor = Math.pow(def.costFactor, level - 1) * getPhaseMultiplier(level, phaseMap);
  return {
    minerai: Math.floor(def.baseCost.minerai * factor),
    silicium: Math.floor(def.baseCost.silicium * factor),
    hydrogene: Math.floor(def.baseCost.hydrogene * factor),
  };
}

export function researchTime(def: ResearchCostDef, level: number, bonusMultiplier: number, config: { timeDivisor: number; phaseMap?: Record<number, number> } = { timeDivisor: 1000 }): number {
  const cost = researchCost(def, level, config.phaseMap);
  const seconds = Math.floor(((cost.minerai + cost.silicium) / config.timeDivisor) * 3600 * bonusMultiplier * getPhaseMultiplier(level, config.phaseMap));
  return Math.max(1, seconds);
}
```

- [ ] **Step 4: Update shipyard-cost.ts**

Add `timeDivisor` parameter:

```typescript
export function shipTime(def: UnitCostDef, bonusMultiplier: number, timeDivisor: number = 2500): number {
  const seconds = Math.floor(((def.cost.minerai + def.cost.silicium) / timeDivisor) * 3600 * bonusMultiplier);
  return Math.max(1, seconds);
}

export function defenseTime(def: UnitCostDef, bonusMultiplier: number, timeDivisor: number = 2500): number {
  const seconds = Math.floor(((def.cost.minerai + def.cost.silicium) / timeDivisor) * 3600 * bonusMultiplier);
  return Math.max(1, seconds);
}
```

- [ ] **Step 5: Add parametric tests**

In `building-cost.test.ts`, add:

```typescript
describe('Parametric config', () => {
  it('buildingCost with custom phaseMap', () => {
    const def = { baseCost: { minerai: 100, silicium: 50, hydrogene: 0 }, costFactor: 2, baseTime: 60 };
    const customPhase = { 1: 0.5 };
    const cost = buildingCost(def, 1, customPhase);
    // 100 * 2^0 * 0.5 = 50
    expect(cost.minerai).toBe(50);
  });
});
```

- [ ] **Step 6: Run all game-engine tests**

Run: `cd packages/game-engine && npx vitest run`
Expected: all pass

- [ ] **Step 7: Rebuild + TS check**

Run: `cd packages/game-engine && npm run build && cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json`

- [ ] **Step 8: Commit**

```bash
git add packages/game-engine/src/constants/progression.ts packages/game-engine/src/formulas/building-cost.ts packages/game-engine/src/formulas/research-cost.ts packages/game-engine/src/formulas/shipyard-cost.ts packages/game-engine/src/formulas/building-cost.test.ts
git commit -m "feat(game-engine): parametrize cost/time formulas with phaseMap and timeDivisor"
```

---

### Task 5: Parametrize combat.ts

**Files:**
- Modify: `packages/game-engine/src/formulas/combat.ts`
- Modify: `packages/game-engine/src/formulas/combat.test.ts`

**Context:** `combat.ts` has 5 hardcoded constants spread across internal functions: `bounceThreshold` (0.01), `rapidDestructionThreshold` (0.3), `maxRounds` (6), `repairProbability` (0.7), `debrisRatio` (0.3). All need to be gathered into a `CombatConfig` interface and threaded from `simulateCombat` through internal functions.

- [ ] **Step 1: Add CombatConfig and update functions**

Add at the top of combat.ts after existing interfaces:

```typescript
export interface CombatConfig {
  maxRounds: number;
  bounceThreshold: number;
  rapidDestructionThreshold: number;
  repairProbability: number;
}

const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  maxRounds: 6,
  bounceThreshold: 0.01,
  rapidDestructionThreshold: 0.3,
  repairProbability: 0.7,
};
```

Update `fireAtTarget` to accept config:

```typescript
function fireAtTarget(attacker: CombatUnit, target: CombatUnit, config: CombatConfig): void {
  if (attacker.destroyed || target.destroyed) return;
  const damage = attacker.weapons;
  if (damage < config.bounceThreshold * target.maxShield) return;
  if (target.shield >= damage) {
    target.shield -= damage;
  } else {
    const remaining = damage - target.shield;
    target.shield = 0;
    target.armor -= remaining;
  }
  if (target.armor <= 0 || target.armor <= config.rapidDestructionThreshold * target.maxArmor) {
    target.destroyed = true;
    target.armor = 0;
  }
}
```

Update `executeRound` — pass `config` to all `fireAtTarget` calls:

```typescript
function executeRound(
  attackers: CombatUnit[],
  defenders: CombatUnit[],
  rapidFireMap: Record<string, Record<string, number>>,
  config: CombatConfig,
): void {
  // ... same logic, but all fireAtTarget calls get config as last arg:
  // fireAtTarget(attacker, target, config);
  // fireAtTarget(defender, currentTarget, config);
}
```

Update `repairDefenses` to accept probability:

```typescript
export function repairDefenses(
  defenderLosses: Record<string, number>,
  defenseIds: Set<string>,
  repairProbability: number = 0.7,
): Record<string, number> {
  // ... use repairProbability instead of hardcoded 0.7
  if (Math.random() < repairProbability) {
```

Update `simulateCombat` — add `combatConfig` parameter:

```typescript
export function simulateCombat(
  attackerFleet: Record<string, number>,
  defenderFleet: Record<string, number>,
  attackerMultipliers: CombatMultipliers,
  defenderMultipliers: CombatMultipliers,
  combatStats: Record<string, UnitCombatStats>,
  rapidFireMap: Record<string, Record<string, number>>,
  shipIds: Set<string>,
  shipCosts: Record<string, { minerai: number; silicium: number }>,
  defenseIds: Set<string>,
  debrisRatio = 0.3,
  combatConfig: CombatConfig = DEFAULT_COMBAT_CONFIG,
): CombatResult {
  // use combatConfig.maxRounds instead of const maxRounds = 6
  // pass combatConfig to executeRound
  // pass combatConfig.repairProbability to repairDefenses
```

- [ ] **Step 2: Add parametric test**

In `combat.test.ts`, add:

```typescript
import type { CombatConfig } from './combat.js';

describe('CombatConfig', () => {
  it('respects custom maxRounds', () => {
    const config: CombatConfig = { maxRounds: 1, bounceThreshold: 0.01, rapidDestructionThreshold: 0.3, repairProbability: 0.7 };
    const stats = { a: { weapons: 1, shield: 0, armor: 1000 }, d: { weapons: 1, shield: 0, armor: 1000 } };
    const result = simulateCombat(
      { a: 10 }, { d: 10 },
      { weapons: 1, shielding: 1, armor: 1 },
      { weapons: 1, shielding: 1, armor: 1 },
      stats, {}, new Set(['a']), { a: { minerai: 100, silicium: 100 } }, new Set(), 0.3, config,
    );
    expect(result.rounds.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/game-engine && npx vitest run src/formulas/combat.test.ts`
Expected: all pass

- [ ] **Step 4: Rebuild + TS check**

Run: `cd packages/game-engine && npm run build && cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/combat.ts packages/game-engine/src/formulas/combat.test.ts
git commit -m "feat(game-engine): parametrize combat formulas with CombatConfig"
```

---

### Task 6: Parametrize fleet.ts

**Files:**
- Modify: `packages/game-engine/src/formulas/fleet.ts`
- Modify: `packages/game-engine/src/formulas/fleet.test.ts`

**Context:** `distance()` uses 5 hardcoded distance constants. `travelTime()` uses 10 and 35000. `fuelConsumption()` uses 10 and 35000. All values are already in `universeConfig` as `fleet_distance_*`, `fleet_speed_factor`, etc.

- [ ] **Step 1: Add FleetConfig and update functions**

Add at the top of fleet.ts:

```typescript
export interface FleetConfig {
  galaxyFactor: number;
  systemBase: number;
  systemFactor: number;
  positionBase: number;
  positionFactor: number;
  samePositionDistance: number;
  speedFactor: number;
}

const DEFAULT_FLEET_CONFIG: FleetConfig = {
  galaxyFactor: 20000,
  systemBase: 2700,
  systemFactor: 95,
  positionBase: 1000,
  positionFactor: 5,
  samePositionDistance: 5,
  speedFactor: 35000,
};
```

Update `distance`:

```typescript
export function distance(origin: Coordinates, target: Coordinates, config: FleetConfig = DEFAULT_FLEET_CONFIG): number {
  if (origin.galaxy !== target.galaxy) {
    return config.galaxyFactor * Math.abs(origin.galaxy - target.galaxy);
  }
  if (origin.system !== target.system) {
    return config.systemBase + config.systemFactor * Math.abs(origin.system - target.system);
  }
  if (origin.position !== target.position) {
    return config.positionBase + config.positionFactor * Math.abs(origin.position - target.position);
  }
  return config.samePositionDistance;
}
```

Update `travelTime`:

```typescript
export function travelTime(
  origin: Coordinates,
  target: Coordinates,
  speed: number,
  universeSpeed: number,
  config: FleetConfig = DEFAULT_FLEET_CONFIG,
): number {
  const dist = distance(origin, target, config);
  return Math.round(10 + (config.speedFactor / speed) * Math.sqrt((dist * 10) / universeSpeed));
}
```

Update `fuelConsumption`:

```typescript
export function fuelConsumption(
  ships: Record<string, number>,
  dist: number,
  duration: number,
  shipStatsMap: Record<string, ShipStats>,
  config: { speedFactor: number } = { speedFactor: 35000 },
): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = shipStatsMap[shipId];
      if (!stats) continue;
      const speedFac = duration <= 10 ? 1 : (duration + 10) / (duration - 10);
      const consumption = stats.fuelConsumption * count * (dist / config.speedFactor) * speedFac;
      total += Math.max(1, Math.round(consumption));
    }
  }
  return Math.max(1, Math.ceil(total));
}
```

- [ ] **Step 2: Add parametric test**

In `fleet.test.ts`, add:

```typescript
import type { FleetConfig } from './fleet.js';

describe('FleetConfig', () => {
  it('distance uses custom galaxy factor', () => {
    const config: FleetConfig = { galaxyFactor: 50000, systemBase: 2700, systemFactor: 95, positionBase: 1000, positionFactor: 5, samePositionDistance: 5, speedFactor: 35000 };
    const d = distance({ galaxy: 1, system: 1, position: 1 }, { galaxy: 2, system: 1, position: 1 }, config);
    expect(d).toBe(50000);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/game-engine && npx vitest run src/formulas/fleet.test.ts`

- [ ] **Step 4: Rebuild + TS check**

Run: `cd packages/game-engine && npm run build && cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/fleet.ts packages/game-engine/src/formulas/fleet.test.ts
git commit -m "feat(game-engine): parametrize fleet distance/speed formulas with FleetConfig"
```

---

### Task 7: Parametrize espionage.ts + ranking.ts + pve.ts

**Files:**
- Modify: `packages/game-engine/src/formulas/espionage.ts`
- Modify: `packages/game-engine/src/formulas/espionage.test.ts`
- Modify: `packages/game-engine/src/formulas/ranking.ts`
- Modify: `packages/game-engine/src/formulas/pve.ts`
- Modify: `packages/game-engine/src/formulas/pve.test.ts`

**Context:** Three small formula files with straightforward parametrization.

- [ ] **Step 1: Update espionage.ts**

```typescript
export function calculateSpyReport(
  probeCount: number,
  attackerEspionageTech: number,
  defenderEspionageTech: number,
  thresholds: number[] = [1, 3, 5, 7, 9],
): SpyReportVisibility {
  const probInfo = probeCount - (defenderEspionageTech - attackerEspionageTech);
  return {
    resources: probInfo >= thresholds[0],
    fleet: probInfo >= thresholds[1],
    defenses: probInfo >= thresholds[2],
    buildings: probInfo >= thresholds[3],
    research: probInfo >= thresholds[4],
  };
}

export function calculateDetectionChance(
  probeCount: number,
  attackerEspionageTech: number,
  defenderEspionageTech: number,
  config: { probeMultiplier: number; techMultiplier: number } = { probeMultiplier: 2, techMultiplier: 4 },
): number {
  const chance = probeCount * config.probeMultiplier - (attackerEspionageTech - defenderEspionageTech) * config.techMultiplier;
  return Math.max(0, Math.min(100, chance));
}
```

- [ ] **Step 2: Update ranking.ts**

Add `pointsDivisor` parameter to each function that uses `1000`:

```typescript
export function calculateBuildingPoints(
  levels: Record<string, number>,
  buildingDefs: Record<string, BuildingDef>,
  pointsDivisor: number = 1000,
): number {
  // ... same logic ...
  return Math.floor(totalResources / pointsDivisor);
}
```

Same for `calculateResearchPoints`, `calculateFleetPoints`, `calculateDefensePoints`.

- [ ] **Step 3: Update pve.ts**

Add config params to `discoveryCooldown` and `depositSize`:

```typescript
export function discoveryCooldown(
  centerLevel: number,
  config: { base: number; minimum: number } = { base: 7, minimum: 1 },
): number {
  return Math.max(config.minimum, config.base - centerLevel);
}

export function depositSize(
  centerLevel: number,
  varianceMultiplier: number,
  config: { base: number; increment: number } = { base: 15000, increment: 5000 },
): number {
  return Math.floor((config.base + config.increment * (centerLevel - 1)) * varianceMultiplier);
}

export function depositComposition(
  mineraiOffset: number,
  siliciumOffset: number,
  config: { baseMinerai: number; baseSilicium: number; minHydrogene: number } = { baseMinerai: 0.60, baseSilicium: 0.30, minHydrogene: 0.02 },
): { minerai: number; silicium: number; hydrogene: number } {
  const rawMinerai = config.baseMinerai + mineraiOffset;
  const rawSilicium = config.baseSilicium + siliciumOffset;
  const unclamped = 1 - rawMinerai - rawSilicium;
  const hydrogene = Math.max(config.minHydrogene, unclamped);
  const msTotal = rawMinerai + rawSilicium;
  const msRoom = 1 - hydrogene;
  const scale = msTotal > 0 ? msRoom / msTotal : 0;
  return { minerai: rawMinerai * scale, silicium: rawSilicium * scale, hydrogene };
}

export function computeSlagRate(
  baseSlagRate: number,
  refiningLevel: number,
  config: { decayBase: number; maxRate: number } = { decayBase: 0.85, maxRate: 0.99 },
): number {
  const rate = baseSlagRate * Math.pow(config.decayBase, refiningLevel);
  return Math.min(config.maxRate, Math.max(0, rate));
}
```

- [ ] **Step 4: Add parametric tests**

In `espionage.test.ts`:

```typescript
describe('Parametric config', () => {
  it('calculateSpyReport with custom thresholds', () => {
    const result = calculateSpyReport(2, 0, 0, [1, 2, 3, 4, 5]);
    expect(result.resources).toBe(true);
    expect(result.fleet).toBe(true);
    expect(result.defenses).toBe(false);
  });

  it('calculateDetectionChance with custom multipliers', () => {
    const chance = calculateDetectionChance(1, 0, 0, { probeMultiplier: 10, techMultiplier: 4 });
    expect(chance).toBe(10);
  });
});
```

In `pve.test.ts`:

```typescript
describe('Parametric config', () => {
  it('discoveryCooldown with custom base', () => {
    expect(discoveryCooldown(1, { base: 10, minimum: 2 })).toBe(9);
    expect(discoveryCooldown(9, { base: 10, minimum: 2 })).toBe(2);
  });

  it('depositSize with custom base and increment', () => {
    const size = depositSize(3, 1.0, { base: 20000, increment: 10000 });
    expect(size).toBe(40000);
  });
});
```

- [ ] **Step 5: Run all game-engine tests**

Run: `cd packages/game-engine && npx vitest run`
Expected: all pass

- [ ] **Step 6: Rebuild + TS check**

Run: `cd packages/game-engine && npm run build && cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json`

- [ ] **Step 7: Commit**

```bash
git add packages/game-engine/src/formulas/espionage.ts packages/game-engine/src/formulas/espionage.test.ts packages/game-engine/src/formulas/ranking.ts packages/game-engine/src/formulas/pve.ts packages/game-engine/src/formulas/pve.test.ts
git commit -m "feat(game-engine): parametrize espionage, ranking, and pve formulas"
```

---

### Task 8: Wire API callers — resource chain

**Files:**
- Modify: `apps/api/src/modules/resource/resource.service.ts`
- Modify: `apps/api/src/cron/resource-tick.ts`

**Context:** These files call `calculateResources` and `calculateProductionRates`. They need to build a `ProductionConfig` from the DB `productionConfig` entries + `universeConfig` values and pass it explicitly.

- [ ] **Step 1: Create helper to build ProductionConfig from DB config**

In `apps/api/src/modules/resource/resource.service.ts`, add a helper function inside `createResourceService` (next to `getRoleMap`):

```typescript
function buildProductionConfig(config: GameConfig): ProductionConfig {
  const mc = config.production['mineraiMine'];
  const sc = config.production['siliciumMine'];
  const hc = config.production['hydrogeneSynth'];
  const sp = config.production['solarPlant'];
  const st = config.production['storage'];
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
      storageBase: Number(config.universe.storage_base) || 5000,
      coeffA: Number(config.universe.storage_coeff_a) || 2.5,
      coeffB: Number(config.universe.storage_coeff_b) || 20,
      coeffC: Number(config.universe.storage_coeff_c) || 33,
    },
    satellite: {
      homePlanetEnergy: Number(config.universe.satellite_home_planet_energy) || 50,
      baseDivisor: Number(config.universe.satellite_base_divisor) || 4,
      baseOffset: Number(config.universe.satellite_base_offset) || 20,
    },
  };
}
```

Add `import type { ProductionConfig } from '@ogame-clone/game-engine';` at the top.

- [ ] **Step 2: Pass ProductionConfig in resource.service.ts**

In each method (`materializeResources`, `spendResources`, `getProductionRates`), after `const config = await gameConfigService.getFullConfig();`, add:

```typescript
const prodConfig = buildProductionConfig(config);
```

Then pass it to `calculateResources(...)` and `calculateProductionRates(...)` calls:

```typescript
// In materializeResources:
const resources = calculateResources(planetData, planet.resourcesUpdatedAt, now, bonus, prodConfig);

// In getProductionRates:
return calculateProductionRates(levels, bonus, prodConfig);
```

- [ ] **Step 3: Update resource-tick.ts**

Same pattern — build `ProductionConfig` at the top after loading config, pass to `calculateResources` calls:

```typescript
const prodConfig = buildProductionConfig(config);
// ... later in the loop:
const newResources = calculateResources(planetData, planet.resourcesUpdatedAt, now, bonus, prodConfig);
```

Import `buildProductionConfig` from the resource service, or duplicate the helper (it's small). If duplicating feels wrong, extract it to a shared location like `apps/api/src/lib/production-config.ts`.

**Recommended:** Extract to `apps/api/src/lib/production-config.ts` and import from both files.

- [ ] **Step 4: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/resource/resource.service.ts apps/api/src/cron/resource-tick.ts apps/api/src/lib/production-config.ts
git commit -m "feat(api): wire ProductionConfig from DB to resource calculations"
```

---

### Task 9: Wire API callers — fleet + combat + spy

**Files:**
- Modify: `apps/api/src/modules/fleet/fleet.service.ts`
- Modify: `apps/api/src/modules/fleet/handlers/attack.handler.ts`
- Modify: `apps/api/src/modules/fleet/handlers/spy.handler.ts`

**Context:** `fleet.service.ts` calls `distance`, `travelTime`, `fuelConsumption` — pass `FleetConfig`. `attack.handler.ts` calls `simulateCombat` — pass `CombatConfig`. `spy.handler.ts` calls `calculateSpyReport`, `calculateDetectionChance` — pass thresholds/config.

- [ ] **Step 1: Update fleet.service.ts**

After getting config via `gameConfigService.getFullConfig()`, build `FleetConfig`:

```typescript
import type { FleetConfig } from '@ogame-clone/game-engine';

// Inside the service, build fleet config from universe config:
const fleetConfig: FleetConfig = {
  galaxyFactor: Number(config.universe.fleet_distance_galaxy_factor) || 20000,
  systemBase: Number(config.universe.fleet_distance_system_base) || 2700,
  systemFactor: Number(config.universe.fleet_distance_system_factor) || 95,
  positionBase: Number(config.universe.fleet_distance_position_base) || 1000,
  positionFactor: Number(config.universe.fleet_distance_position_factor) || 5,
  samePositionDistance: Number(config.universe.fleet_same_position_distance) || 5,
  speedFactor: Number(config.universe.fleet_speed_factor) || 35000,
};
```

Pass `fleetConfig` to `distance(...)`, `travelTime(...)`, `fuelConsumption(...)` calls.

- [ ] **Step 2: Update attack.handler.ts**

After getting config, build `CombatConfig`:

```typescript
import type { CombatConfig } from '@ogame-clone/game-engine';

const combatConfig: CombatConfig = {
  maxRounds: Number(config.universe.combat_max_rounds) || 6,
  bounceThreshold: Number(config.universe.combat_bounce_threshold) || 0.01,
  rapidDestructionThreshold: Number(config.universe.combat_rapid_destruction_threshold) || 0.3,
  repairProbability: Number(config.universe.combat_defense_repair_probability) || 0.7,
};
const debrisRatio = Number(config.universe.debrisRatio) || 0.3;
```

Pass to `simulateCombat(... , debrisRatio, combatConfig)`.

- [ ] **Step 3: Update spy.handler.ts**

```typescript
const thresholds = (config.universe.spy_visibility_thresholds as number[]) ?? [1, 3, 5, 7, 9];
// Pass to calculateSpyReport:
const visibility = calculateSpyReport(probeCount, attackerTech, defenderTech, thresholds);
```

- [ ] **Step 4: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/fleet/fleet.service.ts apps/api/src/modules/fleet/handlers/attack.handler.ts apps/api/src/modules/fleet/handlers/spy.handler.ts
git commit -m "feat(api): wire FleetConfig, CombatConfig, spy thresholds from DB"
```

---

### Task 10: Wire API callers — building + research + shipyard + ranking + pve

**Files:**
- Modify: `apps/api/src/modules/building/building.service.ts`
- Modify: `apps/api/src/modules/research/research.service.ts`
- Modify: `apps/api/src/modules/shipyard/shipyard.service.ts`
- Modify: `apps/api/src/modules/ranking/ranking.service.ts`
- Modify: `apps/api/src/modules/pve/pve.service.ts`

**Context:** Each service calls formula functions. They need to read the relevant config values and pass them.

- [ ] **Step 1: Update building.service.ts**

Read `phase_multiplier` from config and pass to `buildingCost` and `buildingTime`:

```typescript
const phaseMap = (config.universe.phase_multiplier as Record<string, number>) ?? undefined;
// Convert string keys to number keys if needed:
const numericPhaseMap = phaseMap ? Object.fromEntries(Object.entries(phaseMap).map(([k, v]) => [Number(k), v])) : undefined;

// Pass to calls:
const cost = buildingCost(def, nextLevel, numericPhaseMap);
const time = buildingTime(def, nextLevel, bonusMultiplier, numericPhaseMap);
```

- [ ] **Step 2: Update research.service.ts**

Same pattern for `researchCost` and `researchTime`:

```typescript
const phaseMap = /* same as above */;
const timeDivisor = Number(config.universe.research_time_divisor) || 1000;

const cost = researchCost(def, nextLevel, numericPhaseMap);
const time = researchTime(def, nextLevel, bonusMultiplier, { timeDivisor, phaseMap: numericPhaseMap });
```

- [ ] **Step 3: Update shipyard.service.ts**

```typescript
const timeDivisor = Number(config.universe.shipyard_time_divisor) || 2500;
// Pass to shipTime and defenseTime:
const time = shipTime(def, bonusMultiplier, timeDivisor);
```

- [ ] **Step 4: Update ranking.service.ts**

```typescript
const pointsDivisor = Number(config.universe.ranking_points_divisor) || 1000;
// Pass to all calculate*Points functions:
const bp = calculateBuildingPoints(levels, buildingDefs, pointsDivisor);
```

- [ ] **Step 5: Update pve.service.ts**

```typescript
// discoveryCooldown:
const cooldownBase = Number(config.universe.pve_discovery_cooldown_base) || 7;
const cooldown = discoveryCooldown(centerLevel, { base: cooldownBase, minimum: 1 });

// depositSize:
const depositSizeBase = Number(config.universe.pve_deposit_size_base) || 15000;
const totalQuantity = depositSize(centerLevel, varianceMultiplier, { base: depositSizeBase, increment: 5000 });
```

- [ ] **Step 6: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/api/tsconfig.json`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/building/building.service.ts apps/api/src/modules/research/research.service.ts apps/api/src/modules/shipyard/shipyard.service.ts apps/api/src/modules/ranking/ranking.service.ts apps/api/src/modules/pve/pve.service.ts
git commit -m "feat(api): wire phaseMap, timeDivisors, pointsDivisor, pve config from DB"
```

---

### Task 11: Wire frontend callers

**Files:**
- Modify: `apps/web/src/pages/Buildings.tsx`
- Modify: `apps/web/src/pages/Resources.tsx`
- Modify: `apps/web/src/lib/entity-details.ts`
- Modify: `apps/web/src/components/entity-details/BuildingDetailContent.tsx`
- Modify: `apps/web/src/components/entity-details/ShipDetailContent.tsx`
- Modify: `apps/web/src/pages/Fleet.tsx`

**Context:** Frontend calls production formulas for display (level progression tables, energy calculations). `useGameConfig()` already provides `production` and `universe` config. Build `ProductionConfig` from them and pass to formula calls.

- [ ] **Step 1: Create frontend helper to build ProductionConfig**

Create `apps/web/src/lib/production-config.ts`:

```typescript
import type { ProductionConfig } from '@ogame-clone/game-engine';

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

- [ ] **Step 2: Update Buildings.tsx**

Import `buildProductionConfig` and use it. For each production formula call, pass the relevant config sub-object:

```typescript
import { buildProductionConfig } from '../lib/production-config';

// Inside the component, after getting gameConfig:
const prodConfig = gameConfig ? buildProductionConfig(gameConfig) : undefined;

// Replace calls like mineraiProduction(level, pf) with:
mineraiProduction(level, pf, prodConfig?.minerai)
mineraiMineEnergy(level, prodConfig?.mineraiEnergy)
storageCapacity(level, prodConfig?.storage)
// etc.
```

- [ ] **Step 3: Update entity-details.ts and BuildingDetailContent.tsx**

Same pattern — pass config to formula calls. These files receive `gameConfig` or can access it.

- [ ] **Step 4: Update ShipDetailContent.tsx and Resources.tsx**

Pass satellite config to `solarSatelliteEnergy` calls:

```typescript
solarSatelliteEnergy(maxTemp, isHomePlanet, prodConfig?.satellite)
```

- [ ] **Step 5: Update Fleet.tsx**

If it calls `computeSlagRate` or `miningDuration`, pass config.

- [ ] **Step 6: TS check**

Run: `cd /Users/julienaubree/_projet/ogame-clone && npx tsc --noEmit -p apps/web/tsconfig.json`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/production-config.ts apps/web/src/pages/Buildings.tsx apps/web/src/pages/Resources.tsx apps/web/src/lib/entity-details.ts apps/web/src/components/entity-details/BuildingDetailContent.tsx apps/web/src/components/entity-details/ShipDetailContent.tsx apps/web/src/pages/Fleet.tsx
git commit -m "feat(web): wire ProductionConfig to all frontend formula calls"
```

---

### Task 12: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run all game-engine tests**

Run: `cd packages/game-engine && npx vitest run`
Expected: all pass

- [ ] **Step 2: Run API tests**

Run: `cd apps/api && npx vitest run`
Expected: all pass

- [ ] **Step 3: TypeScript check all projects**

Run:
```bash
cd /Users/julienaubree/_projet/ogame-clone
npx tsc --noEmit -p apps/api/tsconfig.json
npx tsc --noEmit -p apps/web/tsconfig.json
npx tsc --noEmit -p apps/admin/tsconfig.json
```
Expected: no errors

- [ ] **Step 4: Grep for remaining hardcoded formula constants**

Verify no hardcoded constants remain (only defaults in formula files, which is intentional):

```bash
# Check that production.ts only has defaults, not raw hardcoded usage:
grep -n '30 \*\|20 \*\|10 \*' packages/game-engine/src/formulas/production.ts
# Should return 0 matches (all moved to default params)

# Check combat.ts:
grep -n '0\.01\|0\.3\|= 6' packages/game-engine/src/formulas/combat.ts
# Should only appear in DEFAULT_COMBAT_CONFIG

# Check fleet.ts:
grep -n '20000\|2700\|35000' packages/game-engine/src/formulas/fleet.ts
# Should only appear in DEFAULT_FLEET_CONFIG
```

- [ ] **Step 5: Build game-engine package**

Run: `cd packages/game-engine && npm run build`

- [ ] **Step 6: Commit any final fixes**
