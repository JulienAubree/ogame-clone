# Building Reorganization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single Chantier spatial into 3 specialized buildings (Chantier spatial industriel, Arsenal planétaire, Centre de commandement), migrate building levels to a dynamic `planetBuildings` table, add 2 new ships (Prospecteur, Explorateur), and add configurable build time reduction per category.

**Architecture:** Replace hardcoded `*Level` columns on `planets` with a `planetBuildings(planetId, buildingId, level)` join table. Update all services to use a `getBuildingLevels()` helper returning `Record<string, number>` keyed by `buildingId`. Each of the 3 new buildings has a `buildTimeReductionFactor` that reduces construction time for its category.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, tRPC, React, Fastify, BullMQ

**Spec:** `docs/superpowers/specs/2026-03-17-building-reorganization-design.md`

---

## Chunk 1: Database Schema & Migration

### Task 1: Create `planetBuildings` schema table

**Files:**
- Create: `packages/db/src/schema/planet-buildings.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// packages/db/src/schema/planet-buildings.ts
import { pgTable, uuid, varchar, smallint, primaryKey } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';

export const planetBuildings = pgTable('planet_buildings', {
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  buildingId: varchar('building_id', { length: 64 }).notNull(),
  level: smallint('level').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.planetId, t.buildingId] }),
]);
```

- [ ] **Step 2: Export from schema index**

In `packages/db/src/schema/index.ts`, add after line 12:
```typescript
export * from './planet-buildings.js';
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/db build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/planet-buildings.ts packages/db/src/schema/index.ts
git commit -m "feat: add planetBuildings schema table"
```

---

### Task 2: Update `buildingDefinitions` schema — add new fields, remove `levelColumn`

**Files:**
- Modify: `packages/db/src/schema/game-config.ts:14-26`

- [ ] **Step 1: Update buildingDefinitions table**

In `packages/db/src/schema/game-config.ts`, replace the `buildingDefinitions` table (lines 14-26) with:

```typescript
export const buildingDefinitions = pgTable('building_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  baseCostMinerai: integer('base_cost_minerai').notNull().default(0),
  baseCostSilicium: integer('base_cost_silicium').notNull().default(0),
  baseCostHydrogene: integer('base_cost_hydrogene').notNull().default(0),
  costFactor: real('cost_factor').notNull().default(1.5),
  baseTime: integer('base_time').notNull().default(60),
  buildTimeReductionFactor: real('build_time_reduction_factor'),
  reducesTimeForCategory: varchar('reduces_time_for_category', { length: 64 }).references(() => entityCategories.id, { onDelete: 'set null' }),
  categoryId: varchar('category_id', { length: 64 }).references(() => entityCategories.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
});
```

- [ ] **Step 2: Add `prospector` and `explorer` columns to `planetShips`**

In `packages/db/src/schema/planet-ships.ts`, add after line 16 (before the closing `});`):

```typescript
  prospector: integer('prospector').notNull().default(0),
  explorer: integer('explorer').notNull().default(0),
```

- [ ] **Step 3: Remove `*Level` columns from `planets`**

In `packages/db/src/schema/planets.ts`, remove lines 28-38 (the entire "Building levels (inline)" section with all 10 `*Level` columns).

- [ ] **Step 4: Verify build**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/db build`
Expected: Build succeeds (downstream packages will break, that's expected)

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/game-config.ts packages/db/src/schema/planet-ships.ts packages/db/src/schema/planets.ts
git commit -m "feat: update DB schema for building reorganization"
```

---

### Task 3: Write the SQL migration script

**Files:**
- Create: `packages/db/src/migrate-buildings.ts`

- [ ] **Step 1: Create the migration script**

```typescript
// packages/db/src/migrate-buildings.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ogame:ogame@localhost:5432/ogame';
const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function migrate() {
  console.log('Starting building reorganization migration...');

  await db.execute(sql`BEGIN`);

  try {
    // Step 1: Rename old shipyard → commandCenter in buildingDefinitions & all FK references
    console.log('  Step 1: Renaming shipyard → commandCenter...');
    await db.execute(sql`UPDATE building_definitions SET id = 'commandCenter', name = 'Centre de commandement', description = 'Débloque et construit les vaisseaux militaires.' WHERE id = 'shipyard'`);
    await db.execute(sql`UPDATE building_prerequisites SET required_building_id = 'commandCenter' WHERE required_building_id = 'shipyard'`);
    await db.execute(sql`UPDATE ship_prerequisites SET required_building_id = 'commandCenter' WHERE required_building_id = 'shipyard'`);
    await db.execute(sql`UPDATE defense_prerequisites SET required_building_id = 'commandCenter' WHERE required_building_id = 'shipyard'`);
    await db.execute(sql`UPDATE research_prerequisites SET required_building_id = 'commandCenter' WHERE required_building_id = 'shipyard'`);
    await db.execute(sql`UPDATE build_queue SET item_id = 'commandCenter' WHERE item_id = 'shipyard' AND type = 'building'`);

    // Step 2: Create planetBuildings table
    console.log('  Step 2: Creating planet_buildings table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS planet_buildings (
        planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
        building_id VARCHAR(64) NOT NULL,
        level SMALLINT NOT NULL DEFAULT 0,
        PRIMARY KEY (planet_id, building_id)
      )
    `);

    // Step 3: Migrate data from planets columns → planetBuildings
    console.log('  Step 3: Migrating building levels to planet_buildings...');
    const buildingMappings = [
      { buildingId: 'mineraiMine', column: 'minerai_mine_level' },
      { buildingId: 'siliciumMine', column: 'silicium_mine_level' },
      { buildingId: 'hydrogeneSynth', column: 'hydrogene_synth_level' },
      { buildingId: 'solarPlant', column: 'solar_plant_level' },
      { buildingId: 'robotics', column: 'robotics_level' },
      { buildingId: 'commandCenter', column: 'shipyard_level' },
      { buildingId: 'researchLab', column: 'research_lab_level' },
      { buildingId: 'storageMinerai', column: 'storage_minerai_level' },
      { buildingId: 'storageSilicium', column: 'storage_silicium_level' },
      { buildingId: 'storageHydrogene', column: 'storage_hydrogene_level' },
    ];

    for (const { buildingId, column } of buildingMappings) {
      await db.execute(sql.raw(`
        INSERT INTO planet_buildings (planet_id, building_id, level)
        SELECT id, '${buildingId}', ${column} FROM planets
      `));
    }

    // Step 3b: Remove levelColumn from buildingDefinitions
    console.log('  Step 3b: Removing levelColumn from building_definitions...');
    await db.execute(sql`ALTER TABLE building_definitions DROP COLUMN IF EXISTS level_column`);

    // Step 3c: Add new columns to buildingDefinitions
    console.log('  Step 3c: Adding new columns to building_definitions...');
    await db.execute(sql`ALTER TABLE building_definitions ADD COLUMN IF NOT EXISTS build_time_reduction_factor REAL`);
    await db.execute(sql`ALTER TABLE building_definitions ADD COLUMN IF NOT EXISTS reduces_time_for_category VARCHAR(64) REFERENCES entity_categories(id) ON DELETE SET NULL`);

    // Step 4: Insert new buildings
    console.log('  Step 4: Creating new buildings (shipyard, arsenal)...');
    await db.execute(sql`
      INSERT INTO building_definitions (id, name, description, base_cost_minerai, base_cost_silicium, base_cost_hydrogene, cost_factor, base_time, category_id, sort_order)
      VALUES ('shipyard', 'Chantier spatial', 'Débloque et construit les vaisseaux industriels.', 400, 200, 100, 2, 60, 'building_defense', 5)
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO building_definitions (id, name, description, base_cost_minerai, base_cost_silicium, base_cost_hydrogene, cost_factor, base_time, category_id, sort_order)
      VALUES ('arsenal', 'Arsenal planétaire', 'Débloque et construit les défenses planétaires.', 400, 200, 100, 2, 60, 'building_defense', 6)
      ON CONFLICT (id) DO NOTHING
    `);

    // Update commandCenter sort order
    await db.execute(sql`UPDATE building_definitions SET sort_order = 7 WHERE id = 'commandCenter'`);

    // Insert shipyard and arsenal at level 0 for all existing planets
    await db.execute(sql`
      INSERT INTO planet_buildings (planet_id, building_id, level)
      SELECT id, 'shipyard', 0 FROM planets
      ON CONFLICT DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO planet_buildings (planet_id, building_id, level)
      SELECT id, 'arsenal', 0 FROM planets
      ON CONFLICT DO NOTHING
    `);

    // Step 5: Update prerequisites
    console.log('  Step 5: Updating prerequisites...');

    // Industrial ships: smallCargo, largeCargo, espionageProbe, colonyShip, recycler → shipyard
    await db.execute(sql`UPDATE ship_prerequisites SET required_building_id = 'shipyard' WHERE ship_id IN ('smallCargo', 'largeCargo', 'espionageProbe', 'colonyShip', 'recycler') AND required_building_id = 'commandCenter'`);

    // Military ships stay on commandCenter (lightFighter, heavyFighter, cruiser, battleship)

    // All defenses → arsenal
    await db.execute(sql`UPDATE defense_prerequisites SET required_building_id = 'arsenal' WHERE required_building_id = 'commandCenter'`);

    // Building prerequisites: commandCenter requires robotics 4 + shipyard 2
    await db.execute(sql`UPDATE building_prerequisites SET required_level = 4 WHERE building_id = 'commandCenter' AND required_building_id = 'robotics'`);
    await db.execute(sql`
      INSERT INTO building_prerequisites (building_id, required_building_id, required_level)
      VALUES ('commandCenter', 'shipyard', 2)
      ON CONFLICT DO NOTHING
    `);

    // New shipyard requires robotics 1
    await db.execute(sql`
      INSERT INTO building_prerequisites (building_id, required_building_id, required_level)
      VALUES ('shipyard', 'robotics', 1)
      ON CONFLICT DO NOTHING
    `);

    // Arsenal requires robotics 2
    await db.execute(sql`
      INSERT INTO building_prerequisites (building_id, required_building_id, required_level)
      VALUES ('arsenal', 'robotics', 2)
      ON CONFLICT DO NOTHING
    `);

    // Step 6: Drop old columns from planets
    console.log('  Step 6: Dropping old level columns from planets...');
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS minerai_mine_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS silicium_mine_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS hydrogene_synth_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS solar_plant_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS robotics_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS shipyard_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS research_lab_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS storage_minerai_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS storage_silicium_level`);
    await db.execute(sql`ALTER TABLE planets DROP COLUMN IF EXISTS storage_hydrogene_level`);

    // Add prospector and explorer to planet_ships
    await db.execute(sql`ALTER TABLE planet_ships ADD COLUMN IF NOT EXISTS prospector INTEGER NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE planet_ships ADD COLUMN IF NOT EXISTS explorer INTEGER NOT NULL DEFAULT 0`);

    await db.execute(sql`COMMIT`);
    console.log('Migration complete!');
  } catch (err) {
    await db.execute(sql`ROLLBACK`);
    console.error('Migration failed, rolled back:', err);
    throw err;
  }

  await client.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add migration script to package.json**

In `packages/db/package.json`, add to `"scripts"`:
```json
"db:migrate-buildings": "tsx src/migrate-buildings.ts"
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrate-buildings.ts packages/db/package.json
git commit -m "feat: add building reorganization migration script"
```

---

## Chunk 2: Game Engine Updates

### Task 4: Update prerequisites — remove `+Level` key convention

**Files:**
- Modify: `packages/game-engine/src/prerequisites/prerequisites.ts:28-29`

- [ ] **Step 1: Fix the key convention**

In `packages/game-engine/src/prerequisites/prerequisites.ts`, replace lines 27-29:
```typescript
    for (const req of prereqs.buildings) {
      const columnKey = req.buildingId + 'Level';
      const current = buildingLevels[columnKey] ?? 0;
```
with:
```typescript
    for (const req of prereqs.buildings) {
      const current = buildingLevels[req.buildingId] ?? 0;
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine build`

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/src/prerequisites/prerequisites.ts
git commit -m "refactor: use buildingId directly as key in prerequisite checks"
```

---

### Task 5: Update ranking formulas — remove `levelColumn` dependency

**Files:**
- Modify: `packages/game-engine/src/formulas/ranking.ts:1-5,24-25`

- [ ] **Step 1: Update BuildingDef interface and function**

In `packages/game-engine/src/formulas/ranking.ts`, replace lines 1-5:
```typescript
export interface BuildingDef {
  levelColumn: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
}
```
with:
```typescript
export interface BuildingDef {
  id: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
}
```

Then replace line 25:
```typescript
    const level = levels[def.levelColumn] ?? 0;
```
with:
```typescript
    const level = levels[def.id] ?? 0;
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine build`

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/src/formulas/ranking.ts
git commit -m "refactor: use building id instead of levelColumn in ranking formulas"
```

---

### Task 6: Update shipTime/defenseTime — add `reductionFactor` parameter

**Files:**
- Modify: `packages/game-engine/src/formulas/shipyard-cost.ts:11-23`

- [ ] **Step 1: Add reductionFactor parameter**

In `packages/game-engine/src/formulas/shipyard-cost.ts`, replace the `shipTime` and `defenseTime` functions (lines 11-23):
```typescript
export function shipTime(def: UnitCostDef, buildingLevel: number, reductionFactor: number = 1): number {
  const seconds = Math.floor(((def.cost.minerai + def.cost.silicium) / (2500 * (1 + buildingLevel * reductionFactor))) * 3600);
  return Math.max(1, seconds);
}

export function defenseCost(def: UnitCostDef): ResourceCost {
  return { ...def.cost };
}

export function defenseTime(def: UnitCostDef, buildingLevel: number, reductionFactor: number = 1): number {
  const seconds = Math.floor(((def.cost.minerai + def.cost.silicium) / (2500 * (1 + buildingLevel * reductionFactor))) * 3600);
  return Math.max(1, seconds);
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine build`

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/src/formulas/shipyard-cost.ts
git commit -m "feat: add buildTimeReductionFactor to ship/defense time formulas"
```

---

## Chunk 3: Seed Data Update

### Task 7: Update seed with new buildings, ships, categories, and prerequisites

**Files:**
- Modify: `packages/db/src/seed-game-config.ts`

- [ ] **Step 1: Add 3 new entity categories**

In `packages/db/src/seed-game-config.ts`, add after line 43 (before the closing `];` of CATEGORIES):
```typescript
  // Build time reduction categories
  { id: 'build_industrial', entityType: 'build', name: 'Vaisseaux industriels', sortOrder: 0 },
  { id: 'build_military', entityType: 'build', name: 'Vaisseaux militaires', sortOrder: 1 },
  { id: 'build_defense', entityType: 'build', name: 'Défenses', sortOrder: 2 },
```

- [ ] **Step 2: Update BUILDINGS array**

Replace the entire BUILDINGS array (lines 48-59) with:
```typescript
const BUILDINGS = [
  { id: 'mineraiMine', name: 'Mine de minerai', description: 'Produit du minerai, ressource de base.', baseCostMinerai: 60, baseCostSilicium: 15, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 60, categoryId: 'building_industrie', sortOrder: 0, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] as { buildingId: string; level: number }[] },
  { id: 'siliciumMine', name: 'Mine de silicium', description: 'Produit du silicium.', baseCostMinerai: 48, baseCostSilicium: 24, baseCostHydrogene: 0, costFactor: 1.6, baseTime: 60, categoryId: 'building_industrie', sortOrder: 1, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'hydrogeneSynth', name: "Synthétiseur d'hydrogène", description: "Produit de l'hydrogène.", baseCostMinerai: 225, baseCostSilicium: 75, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 60, categoryId: 'building_industrie', sortOrder: 2, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'solarPlant', name: 'Centrale solaire', description: "Produit de l'énergie.", baseCostMinerai: 75, baseCostSilicium: 30, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 60, categoryId: 'building_industrie', sortOrder: 3, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'robotics', name: 'Usine de robots', description: 'Réduit le temps de construction des bâtiments.', baseCostMinerai: 400, baseCostSilicium: 120, baseCostHydrogene: 200, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 4, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'shipyard', name: 'Chantier spatial', description: 'Débloque et construit les vaisseaux industriels.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 5, buildTimeReductionFactor: 1.0, reducesTimeForCategory: 'build_industrial', prerequisites: [{ buildingId: 'robotics', level: 1 }] },
  { id: 'arsenal', name: 'Arsenal planétaire', description: 'Débloque et construit les défenses planétaires.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 6, buildTimeReductionFactor: 1.0, reducesTimeForCategory: 'build_defense', prerequisites: [{ buildingId: 'robotics', level: 2 }] },
  { id: 'commandCenter', name: 'Centre de commandement', description: 'Débloque et construit les vaisseaux militaires.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 7, buildTimeReductionFactor: 1.0, reducesTimeForCategory: 'build_military', prerequisites: [{ buildingId: 'robotics', level: 4 }, { buildingId: 'shipyard', level: 2 }] },
  { id: 'researchLab', name: 'Laboratoire de recherche', description: 'Permet les recherches.', baseCostMinerai: 200, baseCostSilicium: 400, baseCostHydrogene: 200, costFactor: 2, baseTime: 60, categoryId: 'building_recherche', sortOrder: 8, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'storageMinerai', name: 'Entrepôt de minerai', description: 'Augmente le stockage de minerai.', baseCostMinerai: 1000, baseCostSilicium: 0, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 9, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'storageSilicium', name: 'Entrepôt de silicium', description: 'Augmente le stockage de silicium.', baseCostMinerai: 1000, baseCostSilicium: 500, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 10, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'storageHydrogene', name: "Réservoir d'hydrogène", description: "Augmente le stockage d'hydrogène.", baseCostMinerai: 1000, baseCostSilicium: 1000, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 11, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
];
```

- [ ] **Step 3: Update the seed function to handle new building fields**

In the seed function, the building insertion loop (lines 168-172) needs to destructure the new fields. Replace:
```typescript
  for (const b of BUILDINGS) {
    const { prerequisites: _bp, ...row } = b;
    await db.insert(buildingDefinitions).values(row)
      .onConflictDoUpdate({ target: buildingDefinitions.id, set: { ...row } });
  }
```
with:
```typescript
  for (const b of BUILDINGS) {
    const { prerequisites: _bp, ...row } = b;
    await db.insert(buildingDefinitions).values(row as any)
      .onConflictDoUpdate({ target: buildingDefinitions.id, set: { ...row } as any });
  }
```

- [ ] **Step 4: Update SHIPS array — reassign prerequisites + add new ships**

Replace the entire SHIPS array (lines 77-87) with:
```typescript
const SHIPS = [
  // Industrial ships → shipyard
  { id: 'prospector', name: 'Prospecteur', description: 'Vaisseau de minage early-game.', costMinerai: 1500, costSilicium: 500, costHydrogene: 0, countColumn: 'prospector', baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 500, driveType: 'combustion', weapons: 2, shield: 5, armor: 2000, categoryId: 'ship_utilitaire', sortOrder: 0, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'explorer', name: 'Explorateur', description: "Sonde d'exploration spatiale pour missions lointaines.", costMinerai: 0, costSilicium: 1500, costHydrogene: 0, countColumn: 'explorer', baseSpeed: 80000, fuelConsumption: 1, cargoCapacity: 100, driveType: 'combustion', weapons: 0, shield: 0, armor: 1000, categoryId: 'ship_utilitaire', sortOrder: 1, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'smallCargo', name: 'Petit transporteur', description: 'Transport léger de ressources.', costMinerai: 2000, costSilicium: 2000, costHydrogene: 0, countColumn: 'smallCargo', baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000, driveType: 'combustion', weapons: 5, shield: 10, armor: 4000, categoryId: 'ship_transport', sortOrder: 2, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [{ researchId: 'combustion', level: 2 }] } },
  { id: 'largeCargo', name: 'Grand transporteur', description: 'Transport lourd de ressources.', costMinerai: 6000, costSilicium: 6000, costHydrogene: 0, countColumn: 'largeCargo', baseSpeed: 7500, fuelConsumption: 50, cargoCapacity: 25000, driveType: 'combustion', weapons: 5, shield: 25, armor: 12000, categoryId: 'ship_transport', sortOrder: 3, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }] } },
  { id: 'espionageProbe', name: "Sonde d'espionnage", description: 'Sonde rapide pour espionner.', costMinerai: 0, costSilicium: 1000, costHydrogene: 0, countColumn: 'espionageProbe', baseSpeed: 100000000, fuelConsumption: 1, cargoCapacity: 0, driveType: 'combustion', weapons: 0, shield: 0, armor: 1000, categoryId: 'ship_utilitaire', sortOrder: 4, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 3 }], research: [{ researchId: 'combustion', level: 3 }, { researchId: 'espionageTech', level: 2 }] } },
  { id: 'colonyShip', name: 'Vaisseau de colonisation', description: 'Colonise de nouvelles planètes.', costMinerai: 10000, costSilicium: 20000, costHydrogene: 10000, countColumn: 'colonyShip', baseSpeed: 2500, fuelConsumption: 1000, cargoCapacity: 7500, driveType: 'impulse', weapons: 50, shield: 100, armor: 30000, categoryId: 'ship_utilitaire', sortOrder: 5, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'impulse', level: 3 }] } },
  { id: 'recycler', name: 'Recycleur', description: 'Collecte les champs de débris.', costMinerai: 10000, costSilicium: 6000, costHydrogene: 2000, countColumn: 'recycler', baseSpeed: 2000, fuelConsumption: 300, cargoCapacity: 20000, driveType: 'combustion', weapons: 1, shield: 10, armor: 16000, categoryId: 'ship_utilitaire', sortOrder: 6, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }, { researchId: 'shielding', level: 2 }] } },
  // Military ships → commandCenter
  { id: 'lightFighter', name: 'Chasseur léger', description: 'Vaisseau de combat de base.', costMinerai: 3000, costSilicium: 1000, costHydrogene: 0, countColumn: 'lightFighter', baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion', weapons: 50, shield: 10, armor: 4000, categoryId: 'ship_combat', sortOrder: 7, prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'heavyFighter', name: 'Chasseur lourd', description: 'Vaisseau de combat amélioré.', costMinerai: 6000, costSilicium: 4000, costHydrogene: 0, countColumn: 'heavyFighter', baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100, driveType: 'impulse', weapons: 150, shield: 25, armor: 10000, categoryId: 'ship_combat', sortOrder: 8, prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 3 }], research: [{ researchId: 'armor', level: 2 }, { researchId: 'impulse', level: 2 }] } },
  { id: 'cruiser', name: 'Croiseur', description: 'Vaisseau de guerre polyvalent.', costMinerai: 20000, costSilicium: 7000, costHydrogene: 2000, countColumn: 'cruiser', baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse', weapons: 400, shield: 50, armor: 27000, categoryId: 'ship_combat', sortOrder: 9, prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 5 }], research: [{ researchId: 'impulse', level: 4 }, { researchId: 'weapons', level: 3 }] } },
  { id: 'battleship', name: 'Vaisseau de bataille', description: 'Puissant navire de guerre.', costMinerai: 45000, costSilicium: 15000, costHydrogene: 0, countColumn: 'battleship', baseSpeed: 10000, fuelConsumption: 500, cargoCapacity: 1500, driveType: 'hyperspaceDrive', weapons: 1000, shield: 200, armor: 60000, categoryId: 'ship_combat', sortOrder: 10, prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 7 }], research: [{ researchId: 'hyperspaceDrive', level: 4 }] } },
];
```

- [ ] **Step 5: Update DEFENSES array — all require arsenal instead of shipyard**

Replace the entire DEFENSES array (lines 91-99) with:
```typescript
const DEFENSES = [
  { id: 'rocketLauncher', name: 'Lanceur de missiles', description: 'Défense de base, peu coûteuse.', costMinerai: 2000, costSilicium: 0, costHydrogene: 0, countColumn: 'rocketLauncher', weapons: 80, shield: 20, armor: 2000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 0, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 1 }], research: [] as { researchId: string; level: number }[] } },
  { id: 'lightLaser', name: 'Artillerie laser légère', description: 'Défense laser de base.', costMinerai: 1500, costSilicium: 500, costHydrogene: 0, countColumn: 'lightLaser', weapons: 100, shield: 25, armor: 2000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 1, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 2 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'heavyLaser', name: 'Artillerie laser lourde', description: 'Défense laser puissante.', costMinerai: 6000, costSilicium: 2000, costHydrogene: 0, countColumn: 'heavyLaser', weapons: 250, shield: 100, armor: 8000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 2, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 4 }], research: [{ researchId: 'energyTech', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'gaussCannon', name: 'Canon de Gauss', description: 'Défense balistique puissante.', costMinerai: 20000, costSilicium: 15000, costHydrogene: 2000, countColumn: 'gaussCannon', weapons: 1100, shield: 200, armor: 35000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 3, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 6 }], research: [{ researchId: 'energyTech', level: 6 }, { researchId: 'weapons', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'plasmaTurret', name: 'Artillerie à ions', description: 'Défense plasma dévastatrice.', costMinerai: 50000, costSilicium: 50000, costHydrogene: 30000, countColumn: 'plasmaTurret', weapons: 3000, shield: 300, armor: 100000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 4, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 8 }], research: [{ researchId: 'energyTech', level: 8 }, { researchId: 'weapons', level: 7 }] } },
  { id: 'smallShield', name: 'Petit bouclier', description: 'Bouclier planétaire de base.', costMinerai: 10000, costSilicium: 10000, costHydrogene: 0, countColumn: 'smallShield', weapons: 1, shield: 2000, armor: 2000, maxPerPlanet: 1, categoryId: 'defense_boucliers', sortOrder: 5, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 1 }], research: [{ researchId: 'shielding', level: 2 }] } },
  { id: 'largeShield', name: 'Grand bouclier', description: 'Bouclier planétaire avancé.', costMinerai: 50000, costSilicium: 50000, costHydrogene: 0, countColumn: 'largeShield', weapons: 1, shield: 10000, armor: 10000, maxPerPlanet: 1, categoryId: 'defense_boucliers', sortOrder: 6, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 4 }], research: [{ researchId: 'shielding', level: 6 }] } },
];
```

- [ ] **Step 6: Update RAPID_FIRE_DATA — add entries for prospector and explorer**

Replace the RAPID_FIRE_DATA array (lines 103-118) with:
```typescript
const RAPID_FIRE_DATA = [
  { attackerId: 'smallCargo', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'smallCargo', targetId: 'prospector', value: 5 },
  { attackerId: 'smallCargo', targetId: 'explorer', value: 5 },
  { attackerId: 'largeCargo', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'largeCargo', targetId: 'prospector', value: 5 },
  { attackerId: 'largeCargo', targetId: 'explorer', value: 5 },
  { attackerId: 'lightFighter', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'lightFighter', targetId: 'prospector', value: 5 },
  { attackerId: 'lightFighter', targetId: 'explorer', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'prospector', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'explorer', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'smallCargo', value: 3 },
  { attackerId: 'cruiser', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'cruiser', targetId: 'prospector', value: 5 },
  { attackerId: 'cruiser', targetId: 'explorer', value: 5 },
  { attackerId: 'cruiser', targetId: 'lightFighter', value: 6 },
  { attackerId: 'cruiser', targetId: 'smallCargo', value: 3 },
  { attackerId: 'cruiser', targetId: 'rocketLauncher', value: 10 },
  { attackerId: 'battleship', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'battleship', targetId: 'prospector', value: 5 },
  { attackerId: 'battleship', targetId: 'explorer', value: 5 },
  { attackerId: 'battleship', targetId: 'lightFighter', value: 4 },
  { attackerId: 'battleship', targetId: 'smallCargo', value: 4 },
  { attackerId: 'battleship', targetId: 'largeCargo', value: 4 },
  { attackerId: 'colonyShip', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'colonyShip', targetId: 'prospector', value: 5 },
  { attackerId: 'colonyShip', targetId: 'explorer', value: 5 },
];
```

- [ ] **Step 7: Remove `levelColumn` from seed building insertion**

The seed function's building insertion needs to NOT send `levelColumn` to the DB. This is already handled by the schema change (the column no longer exists). The `as any` cast in Step 3 handles any type mismatch.

- [ ] **Step 8: Verify build**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/db build`

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/seed-game-config.ts
git commit -m "feat: update seed with new buildings, ships, categories, and prerequisites"
```

---

## Chunk 4: API Service Updates

### Task 8: Update `game-config.service.ts` — remove `levelColumn`, add new fields

**Files:**
- Modify: `apps/api/src/modules/admin/game-config.service.ts`
- Modify: `apps/api/src/modules/admin/game-config.router.ts`

- [ ] **Step 1: Update BuildingConfig interface**

In `game-config.service.ts`, replace the `BuildingConfig` interface (around line 40-51):
```typescript
export interface BuildingConfig {
  id: string;
  name: string;
  description: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  baseTime: number;
  buildTimeReductionFactor: number | null;
  reducesTimeForCategory: string | null;
  categoryId: string | null;
  sortOrder: number;
  prerequisites: { buildingId: string; level: number }[];
}
```

- [ ] **Step 2: Update `getFullConfig` building mapping**

Find the section in `getFullConfig()` that maps buildings (around line 180-195). Remove `levelColumn: b.levelColumn,` and add:
```typescript
buildTimeReductionFactor: b.buildTimeReductionFactor,
reducesTimeForCategory: b.reducesTimeForCategory,
```

- [ ] **Step 3: Update `createBuilding` and `updateBuilding` methods**

In `createBuilding`, remove `levelColumn` from the values object and add `buildTimeReductionFactor` and `reducesTimeForCategory`.

In `updateBuilding`, add `buildTimeReductionFactor` and `reducesTimeForCategory` to the update set.

- [ ] **Step 4: Update router Zod schemas**

In `game-config.router.ts`, update the `createBuilding` and `updateBuilding` input schemas:
- Remove `levelColumn` from createBuilding
- Add: `buildTimeReductionFactor: z.number().nullable().optional(),`
- Add: `reducesTimeForCategory: z.string().nullable().optional(),`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/game-config.service.ts apps/api/src/modules/admin/game-config.router.ts
git commit -m "refactor: update admin game-config service for building reorganization"
```

---

### Task 9: Create `getBuildingLevels` helper and update `building.service.ts`

**Files:**
- Modify: `apps/api/src/modules/building/building.service.ts`

- [ ] **Step 1: Add planetBuildings import and helper function**

At the top of `building.service.ts`, update imports:
```typescript
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, buildQueue, planetBuildings } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
```

Inside the `createBuildingService` return object, add a `getBuildingLevels` method:
```typescript
    async getBuildingLevels(planetId: string): Promise<Record<string, number>> {
      const rows = await db
        .select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
        .from(planetBuildings)
        .where(eq(planetBuildings.planetId, planetId));
      const levels: Record<string, number> = {};
      for (const row of rows) {
        levels[row.buildingId] = row.level;
      }
      return levels;
    },
```

- [ ] **Step 2: Update `listBuildings`**

Replace `listBuildings` (lines 17-53):
```typescript
    async listBuildings(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const config = await gameConfigService.getFullConfig();
      const buildingLevels = await this.getBuildingLevels(planetId);

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

      return Object.values(config.buildings)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const currentLevel = buildingLevels[def.id] ?? 0;
          const nextLevel = currentLevel + 1;
          const cost = buildingCost(def, nextLevel);
          const roboticsLevel = buildingLevels['robotics'] ?? 0;
          const time = buildingTime(def, nextLevel, roboticsLevel);

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
    },
```

- [ ] **Step 3: Update `startUpgrade`**

Replace `startUpgrade` (lines 55-143):
```typescript
    async startUpgrade(userId: string, planetId: string, buildingId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const config = await gameConfigService.getFullConfig();
      const def = config.buildings[buildingId];
      if (!def) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bâtiment invalide' });

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

      const buildingLevels = await this.getBuildingLevels(planetId);

      // Check prerequisites
      for (const prereq of def.prerequisites) {
        const prereqLevel = buildingLevels[prereq.buildingId] ?? 0;
        if (prereqLevel < prereq.level) {
          const prereqDef = config.buildings[prereq.buildingId];
          const prereqName = prereqDef?.name ?? prereq.buildingId;
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Prérequis non rempli : ${prereqName} niveau ${prereq.level}`,
          });
        }
      }

      // Check building slots
      const totalLevels = Object.values(buildingLevels).reduce((sum, lvl) => sum + lvl, 0);
      if (totalLevels >= planet.maxFields) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Plus de champs disponibles' });
      }

      const currentLevel = buildingLevels[buildingId] ?? 0;
      const nextLevel = currentLevel + 1;
      const cost = buildingCost(def, nextLevel);
      const roboticsLevel = buildingLevels['robotics'] ?? 0;
      const time = buildingTime(def, nextLevel, roboticsLevel);

      await resourceService.spendResources(planetId, userId, cost);

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

      await buildingQueue.add(
        'complete',
        { buildQueueId: entry.id },
        { delay: time * 1000, jobId: `building-${entry.id}` },
      );

      return { entry, endTime: endTime.toISOString(), buildingTime: time };
    },
```

- [ ] **Step 4: Update `cancelUpgrade`**

Replace the `cancelUpgrade` method to use `getBuildingLevels`:
```typescript
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

      const config = await gameConfigService.getFullConfig();
      const def = config.buildings[activeBuild.itemId];
      const buildingLevels = await this.getBuildingLevels(planetId);
      const currentLevel = buildingLevels[activeBuild.itemId] ?? 0;
      const cost = def ? buildingCost(def, currentLevel + 1) : { minerai: 0, silicium: 0, hydrogene: 0 };

      const planet = await this.getOwnedPlanet(userId, planetId);
      await db
        .update(planets)
        .set({
          minerai: String(Number(planet.minerai) + cost.minerai),
          silicium: String(Number(planet.silicium) + cost.silicium),
          hydrogene: String(Number(planet.hydrogene) + cost.hydrogene),
        })
        .where(eq(planets.id, planetId));

      await buildingQueue.remove(`building-${activeBuild.id}`);
      await db.delete(buildQueue).where(eq(buildQueue.id, activeBuild.id));

      return { cancelled: true };
    },
```

- [ ] **Step 5: Update `completeUpgrade` — write to planetBuildings instead of planets**

Replace `completeUpgrade` (lines 190-230):
```typescript
    async completeUpgrade(buildQueueId: string) {
      const [entry] = await db
        .select()
        .from(buildQueue)
        .where(and(eq(buildQueue.id, buildQueueId), eq(buildQueue.status, 'active')))
        .limit(1);

      if (!entry) return null;

      const config = await gameConfigService.getFullConfig();
      const def = config.buildings[entry.itemId];
      if (!def) return null;

      const buildingLevels = await this.getBuildingLevels(entry.planetId);
      const currentLevel = buildingLevels[entry.itemId] ?? 0;
      const newLevel = currentLevel + 1;

      // Upsert planet building level
      await db
        .insert(planetBuildings)
        .values({ planetId: entry.planetId, buildingId: entry.itemId, level: newLevel })
        .onConflictDoUpdate({
          target: [planetBuildings.planetId, planetBuildings.buildingId],
          set: { level: newLevel },
        });

      await db
        .update(buildQueue)
        .set({ status: 'completed' })
        .where(eq(buildQueue.id, buildQueueId));

      return { buildingId: entry.itemId, newLevel };
    },
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/building/building.service.ts
git commit -m "refactor: building service uses planetBuildings table"
```

---

### Task 10: Update `shipyard.service.ts` — use `getBuildingLevels` + `reductionFactor`

**Files:**
- Modify: `apps/api/src/modules/shipyard/shipyard.service.ts`

- [ ] **Step 1: Update imports and add building level helper**

Add `planetBuildings` to imports. Add a `getBuildingLevels` method (same as building service), or import it from building service.

Since these services are independent, the simplest approach is to add a local helper:
```typescript
    async getBuildingLevels(planetId: string): Promise<Record<string, number>> {
      const rows = await db
        .select({ buildingId: planetBuildings.buildingId, level: planetBuildings.level })
        .from(planetBuildings)
        .where(eq(planetBuildings.planetId, planetId));
      const levels: Record<string, number> = {};
      for (const row of rows) {
        levels[row.buildingId] = row.level;
      }
      return levels;
    },
```

- [ ] **Step 2: Add helper to find production building for a unit**

```typescript
    getProductionBuilding(def: { prerequisites: { buildings?: { buildingId: string; level: number }[] } }, config: any): { level: number; reductionFactor: number } {
      const buildingPrereqs = def.prerequisites.buildings ?? [];
      for (const prereq of buildingPrereqs) {
        const buildingDef = config.buildings[prereq.buildingId];
        if (buildingDef?.buildTimeReductionFactor != null) {
          return { level: 0, reductionFactor: buildingDef.buildTimeReductionFactor };
        }
      }
      return { level: 0, reductionFactor: 1 };
    },
```

- [ ] **Step 3: Update `listShips`**

Replace lines 17-47:
```typescript
    async listShips(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const ships = await this.getOrCreateShips(planetId);
      const research = await this.getResearchLevels(userId);
      const config = await gameConfigService.getFullConfig();
      const buildingLevels = await this.getBuildingLevels(planetId);

      return Object.values(config.ships)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const count = (ships[def.countColumn as keyof typeof ships] ?? 0) as number;
          const prereqCheck = checkShipPrerequisites(def.prerequisites, buildingLevels, research);

          // Find the production building for this ship
          const productionBuildingId = def.prerequisites.buildings?.[0]?.buildingId;
          const productionBuildingDef = productionBuildingId ? config.buildings[productionBuildingId] : null;
          const buildingLevel = productionBuildingId ? (buildingLevels[productionBuildingId] ?? 0) : 0;
          const reductionFactor = productionBuildingDef?.buildTimeReductionFactor ?? 1;

          const cost = shipCost(def);
          const time = shipTime(def, buildingLevel, reductionFactor);

          return {
            id: def.id,
            name: def.name,
            description: def.description,
            count,
            cost,
            timePerUnit: time,
            prerequisitesMet: prereqCheck.met,
            missingPrerequisites: prereqCheck.missing,
          };
        });
    },
```

- [ ] **Step 4: Update `listDefenses`**

Replace lines 49-80 with the same pattern but for defenses:
```typescript
    async listDefenses(userId: string, planetId: string) {
      const planet = await this.getOwnedPlanet(userId, planetId);
      const defenses = await this.getOrCreateDefenses(planetId);
      const research = await this.getResearchLevels(userId);
      const config = await gameConfigService.getFullConfig();
      const buildingLevels = await this.getBuildingLevels(planetId);

      return Object.values(config.defenses)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((def) => {
          const count = (defenses[def.countColumn as keyof typeof defenses] ?? 0) as number;
          const prereqCheck = checkDefensePrerequisites(def.prerequisites, buildingLevels, research);

          const productionBuildingId = def.prerequisites.buildings?.[0]?.buildingId;
          const productionBuildingDef = productionBuildingId ? config.buildings[productionBuildingId] : null;
          const buildingLevel = productionBuildingId ? (buildingLevels[productionBuildingId] ?? 0) : 0;
          const reductionFactor = productionBuildingDef?.buildTimeReductionFactor ?? 1;

          const cost = defenseCost(def);
          const time = defenseTime(def, buildingLevel, reductionFactor);

          return {
            id: def.id,
            name: def.name,
            description: def.description,
            count,
            cost,
            timePerUnit: time,
            maxPerPlanet: def.maxPerPlanet,
            prerequisitesMet: prereqCheck.met,
            missingPrerequisites: prereqCheck.missing,
          };
        });
    },
```

- [ ] **Step 5: Update `startBuild`, `completeUnit`, `activateNextBatch`**

In all these methods, replace every `planet.shipyardLevel` with the correct building level from `getBuildingLevels()`. The pattern is:

```typescript
const buildingLevels = await this.getBuildingLevels(entry.planetId);
const config = await gameConfigService.getFullConfig();
const def = entry.type === 'ship' ? config.ships[entry.itemId] : config.defenses[entry.itemId];
const productionBuildingId = def?.prerequisites?.buildings?.[0]?.buildingId;
const productionBuildingDef = productionBuildingId ? config.buildings[productionBuildingId] : null;
const buildingLevel = productionBuildingId ? (buildingLevels[productionBuildingId] ?? 0) : 0;
const reductionFactor = productionBuildingDef?.buildTimeReductionFactor ?? 1;
const unitTime = def
  ? (entry.type === 'ship' ? shipTime(def, buildingLevel, reductionFactor) : defenseTime(def, buildingLevel, reductionFactor))
  : 60;
```

Apply this pattern in:
- `startBuild` (around line 135-137)
- `completeUnit` (around line 220-222)
- `activateNextBatch` (around line 258-260)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/shipyard/shipyard.service.ts
git commit -m "refactor: shipyard service uses planetBuildings + reductionFactor"
```

---

### Task 11: Update `resource.service.ts` — use `getBuildingLevels`

**Files:**
- Modify: `apps/api/src/modules/resource/resource.service.ts`

- [ ] **Step 1: Add planetBuildings import and helper**

Add `planetBuildings` to imports. Add a local `getBuildingLevels` helper (same as before).

- [ ] **Step 2: Update `materializeResources` and `spendResources`**

Both methods construct the same `calculateResources` call with `planet.*Level` fields. Replace those with `getBuildingLevels`:

```typescript
    async materializeResources(planetId: string, userId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });

      const bonus = await loadPlanetTypeBonus(db, planet.planetClassId);
      const buildingLevels = await this.getBuildingLevels(planetId);

      const now = new Date();
      const resources = calculateResources(
        {
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
          mineraiMineLevel: buildingLevels['mineraiMine'] ?? 0,
          siliciumMineLevel: buildingLevels['siliciumMine'] ?? 0,
          hydrogeneSynthLevel: buildingLevels['hydrogeneSynth'] ?? 0,
          solarPlantLevel: buildingLevels['solarPlant'] ?? 0,
          storageMineraiLevel: buildingLevels['storageMinerai'] ?? 0,
          storageSiliciumLevel: buildingLevels['storageSilicium'] ?? 0,
          storageHydrogeneLevel: buildingLevels['storageHydrogene'] ?? 0,
          maxTemp: planet.maxTemp,
          mineraiMinePercent: planet.mineraiMinePercent,
          siliciumMinePercent: planet.siliciumMinePercent,
          hydrogeneSynthPercent: planet.hydrogeneSynthPercent,
        },
        planet.resourcesUpdatedAt,
        now,
        bonus,
      );
      // ... rest unchanged
    },
```

Apply same pattern to `spendResources` and `getProductionRates`.

For `getProductionRates`, the method signature changes — it can no longer accept a planet object directly. It should accept `buildingLevels: Record<string, number>` plus the planet's temperature and percents. Update callers accordingly.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/resource/resource.service.ts
git commit -m "refactor: resource service uses planetBuildings for building levels"
```

---

### Task 12: Update `ranking.service.ts`

**Files:**
- Modify: `apps/api/src/modules/ranking/ranking.service.ts`

- [ ] **Step 1: Replace hardcoded level lookups with getBuildingLevels**

Replace the building points calculation (lines 24-36):
```typescript
        for (const planet of userPlanets) {
          const buildingLevels = await this.getBuildingLevels(planet.id);
          buildingPoints += calculateBuildingPoints(buildingLevels, config.buildings);
        }
```

Add `planetBuildings` import and the `getBuildingLevels` helper.

Also add `prospector` and `explorer` to the fleet points calculation:
```typescript
          if (ships) {
            fleetPoints += calculateFleetPoints({
              smallCargo: ships.smallCargo,
              largeCargo: ships.largeCargo,
              lightFighter: ships.lightFighter,
              heavyFighter: ships.heavyFighter,
              cruiser: ships.cruiser,
              battleship: ships.battleship,
              espionageProbe: ships.espionageProbe,
              colonyShip: ships.colonyShip,
              recycler: ships.recycler,
              prospector: ships.prospector,
              explorer: ships.explorer,
            }, config.ships);
          }
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/ranking/ranking.service.ts
git commit -m "refactor: ranking service uses planetBuildings"
```

---

### Task 13: Update remaining API services that reference planet building levels

**Files:**
- Check and update: `apps/api/src/modules/planet/planet.service.ts`
- Check and update: any cron/tick files that read planet levels

- [ ] **Step 1: Search for remaining references to planet level columns**

Run: `grep -rn 'mineraiMineLevel\|shipyardLevel\|roboticsLevel\|solarPlantLevel\|researchLabLevel' apps/api/src/`

Fix each remaining occurrence to use `getBuildingLevels()`.

- [ ] **Step 2: Check planet creation**

In `planet.service.ts`, when creating a new planet, ensure a `planetBuildings` row is inserted for each building with level 0 (or at minimum, the production buildings).

Add after planet INSERT:
```typescript
const allBuildings = Object.keys(config.buildings);
if (allBuildings.length > 0) {
  await db.insert(planetBuildings).values(
    allBuildings.map(buildingId => ({ planetId: newPlanet.id, buildingId, level: 0 }))
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/
git commit -m "refactor: update all remaining services for planetBuildings"
```

---

## Chunk 5: Frontend Updates

### Task 14: Update admin Buildings page — add new fields

**Files:**
- Modify: `apps/admin/src/pages/Buildings.tsx`

- [ ] **Step 1: Add buildTimeReductionFactor and reducesTimeForCategory fields**

In the admin Buildings page, find the table columns and form fields. Add:
- A column showing `buildTimeReductionFactor` (nullable number)
- A column showing `reducesTimeForCategory` (nullable string)
- In the create/edit form, add inputs for both fields

Remove any reference to `levelColumn` from the form.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/pages/Buildings.tsx
git commit -m "feat: admin buildings page shows buildTimeReductionFactor"
```

---

### Task 15: Update web app pages for new data structure

**Files:**
- Modify: `apps/web/src/pages/Buildings.tsx`
- Modify: `apps/web/src/pages/Shipyard.tsx`
- Modify: `apps/web/src/pages/Defense.tsx`

- [ ] **Step 1: Verify web pages work with API changes**

The web pages should mostly work since they consume the API response format which hasn't changed structurally (still returns `currentLevel`, `cost`, `time`, `prerequisitesMet`, etc.). The main concern is the `formatMissingPrerequisite` helper.

- [ ] **Step 2: Update `formatMissingPrerequisite` if needed**

In `apps/web/src/lib/prerequisites.ts`, the function parses strings like `"shipyard level 2 (current: 0)"`. With the new building IDs (`commandCenter`, `arsenal`), these need French display names. Check if this helper maps building IDs to names — if it uses a static map, add the new entries. If it uses the API-provided names, no change needed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/
git commit -m "fix: update web pages for building reorganization"
```

---

## Chunk 6: Build, Test, and Deploy

### Task 16: Full build verification

- [ ] **Step 1: Run full monorepo build**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm build`
Expected: All packages and apps build successfully.

- [ ] **Step 2: Fix any remaining type errors**

Search for any remaining references to removed fields:
```bash
grep -rn 'levelColumn' packages/ apps/
grep -rn 'planet\.shipyardLevel\|planet\.roboticsLevel\|planet\.mineraiMineLevel' apps/
```

Fix all occurrences.

- [ ] **Step 3: Commit fixes**

```bash
git add .
git commit -m "fix: resolve remaining type errors from building reorganization"
```

---

### Task 17: Push schema and run migration

- [ ] **Step 1: Push all changes**

```bash
git push
```

- [ ] **Step 2: Deploy instructions for VPS**

On the VPS, run:
```bash
cd /opt/ogame-clone
pm2 stop ogame-worker
pm2 stop ogame-api
bash scripts/deploy.sh
# After deploy.sh does git pull + pnpm install + turbo build:
cd packages/db
pnpm db:migrate-buildings
pnpm db:seed
cd /opt/ogame-clone
pm2 start ecosystem.config.cjs
```

**IMPORTANT:** The migration must run AFTER the build but BEFORE starting the API/worker, because the new code expects the `planetBuildings` table to exist and the old columns to be gone.

Update `scripts/deploy.sh` to include the migration step, or run it manually the first time.
