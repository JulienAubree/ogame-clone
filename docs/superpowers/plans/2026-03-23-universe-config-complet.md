# Universe Config Complet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all hardcoded universe constants (UNIVERSE_CONFIG, BELT_POSITIONS, CANCEL_REFUND_RATIO, PvE magic numbers) into the `universe_config` DB table, making them fully editable via admin panel.

**Architecture:** The existing `universe_config` table is a key-value JSONB store. We add ~34 new keys via the seed, migrate every backend consumer to read from `config.universe` (loaded via `gameConfigService.getFullConfig()`), then delete `universe.config.ts`. The admin Universe page gets section grouping for readability.

**Tech Stack:** TypeScript, Drizzle ORM, tRPC, React, PostgreSQL (JSONB key-value)

---

## File Structure

**Delete:**
- `apps/api/src/modules/universe/universe.config.ts` — hardcoded constants file

**Modify:**
- `packages/db/src/seed-game-config.ts` — add 34 new universe_config keys
- `apps/api/src/modules/galaxy/galaxy.service.ts` — add gameConfigService dep, read config
- `apps/api/src/modules/galaxy/galaxy.router.ts` — remove UNIVERSE_CONFIG, permissive Zod bounds
- `apps/api/src/modules/fleet/fleet.service.ts` — remove universeSpeed param, read from config
- `apps/api/src/modules/fleet/fleet.router.ts` — remove UNIVERSE_CONFIG, permissive Zod bounds
- `apps/api/src/modules/fleet/fleet.types.ts` — remove universeSpeed from MissionHandlerContext
- `apps/api/src/modules/fleet/handlers/colonize.handler.ts` — read belt_positions + maxPlanetsPerPlayer from config
- `apps/api/src/modules/fleet/handlers/mine.handler.ts` — read belt_positions from config
- `apps/api/src/modules/planet/planet.service.ts` — remove UNIVERSE_CONFIG import + fallbacks
- `apps/api/src/modules/pve/pve.service.ts` — add gameConfigService dep, replace all magic numbers
- `apps/api/src/modules/building/building.service.ts` — read cancel_refund_ratio from config
- `apps/api/src/modules/research/research.service.ts` — read cancel_refund_ratio from config
- `apps/api/src/modules/shipyard/shipyard.service.ts` — read cancel_refund_ratio from config
- `apps/api/src/trpc/app-router.ts` — update service creation calls
- `apps/api/src/workers/worker.ts` — update service creation calls
- `apps/admin/src/pages/Universe.tsx` — section grouping UI

---

### Task 1: Seed — Add new universe_config keys

**Files:**
- Modify: `packages/db/src/seed-game-config.ts:381-396`

- [ ] **Step 1: Add new keys to the UNIVERSE_CONFIG seed array**

Add these entries after the existing `slag_rate.pos16` line (line 395). Keep existing keys untouched.

```typescript
const UNIVERSE_CONFIG = [
  // ── Existing keys (untouched) ──
  { key: 'name', value: 'Universe 1' },
  { key: 'speed', value: 1 },
  { key: 'galaxies', value: 9 },
  { key: 'systems', value: 499 },
  { key: 'positions', value: 16 },
  { key: 'maxPlanetsPerPlayer', value: 9 },
  { key: 'debrisRatio', value: 0.3 },
  { key: 'lootRatio', value: 0.5 },
  { key: 'startingMinerai', value: 500 },
  { key: 'startingSilicium', value: 300 },
  { key: 'startingHydrogene', value: 100 },
  { key: 'slag_rate.pos8', value: 0.45 },
  { key: 'slag_rate.pos16', value: 0.30 },

  // ── Economy & general rules ──
  { key: 'cancel_refund_ratio', value: 0.7 },
  { key: 'belt_positions', value: [8, 16] },
  { key: 'homePlanetDiameter', value: 12000 },
  { key: 'home_planet_position_min', value: 4 },
  { key: 'home_planet_position_max', value: 12 },

  // ── Combat ──
  { key: 'combat_max_rounds', value: 6 },
  { key: 'combat_defense_repair_probability', value: 0.7 },
  { key: 'combat_bounce_threshold', value: 0.01 },
  { key: 'combat_rapid_destruction_threshold', value: 0.3 },

  // ── PvE ──
  { key: 'pve_max_concurrent_missions', value: 3 },
  { key: 'pve_hydrogene_cap', value: 1500 },
  { key: 'pve_dismiss_cooldown_hours', value: 24 },
  { key: 'pve_mission_expiry_days', value: 7 },
  { key: 'pve_search_radius', value: 5 },
  { key: 'pve_tier_medium_unlock', value: 4 },
  { key: 'pve_tier_hard_unlock', value: 6 },
  { key: 'pve_deposit_variance_min', value: 0.6 },
  { key: 'pve_deposit_variance_max', value: 1.6 },

  // ── Fleet ──
  { key: 'fleet_distance_galaxy_factor', value: 20000 },
  { key: 'fleet_distance_system_base', value: 2700 },
  { key: 'fleet_distance_system_factor', value: 95 },
  { key: 'fleet_distance_position_base', value: 1000 },
  { key: 'fleet_distance_position_factor', value: 5 },
  { key: 'fleet_same_position_distance', value: 5 },
  { key: 'fleet_speed_factor', value: 35000 },

  // ── Formulas (consumed by SP3, created here) ──
  { key: 'pve_discovery_cooldown_base', value: 7 },
  { key: 'pve_deposit_size_base', value: 15000 },
  { key: 'spy_visibility_thresholds', value: [1, 3, 5, 7, 9] },
  { key: 'ranking_points_divisor', value: 1000 },
  { key: 'shipyard_time_divisor', value: 2500 },
  { key: 'research_time_divisor', value: 1000 },
  { key: 'storage_base', value: 5000 },
  { key: 'storage_coeff_a', value: 2.5 },
  { key: 'storage_coeff_b', value: 20 },
  { key: 'storage_coeff_c', value: 33 },
  { key: 'satellite_home_planet_energy', value: 50 },
  { key: 'satellite_base_divisor', value: 4 },
  { key: 'satellite_base_offset', value: 20 },
  { key: 'phase_multiplier', value: {"1":0.35,"2":0.45,"3":0.55,"4":0.65,"5":0.78,"6":0.90,"7":0.95} },
];
```

Note: `homePlanetDiameter` already exists in the current seed data on the VPS, but it was not in the seed array — only in `UNIVERSE_CONFIG` TypeScript const. Adding it to the seed ensures it exists in DB. The upsert pattern (`onConflictDoUpdate`) handles duplicates gracefully.

- [ ] **Step 2: Verify seed compiles**

Run: `cd packages/db && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/seed-game-config.ts
git commit -m "feat(seed): add 34 new universe_config keys for SP2"
```

---

### Task 2: Galaxy service + router — use config.universe

**Files:**
- Modify: `apps/api/src/modules/galaxy/galaxy.service.ts`
- Modify: `apps/api/src/modules/galaxy/galaxy.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts:56` (galaxyService creation)

**Context:** `galaxyService` currently imports `UNIVERSE_CONFIG` and `BELT_POSITIONS` from `universe.config.ts`. It uses:
- `UNIVERSE_CONFIG.positions` to create the slot array (line 26)
- `BELT_POSITIONS` to mark belt positions (line 29)

`galaxyRouter` uses `UNIVERSE_CONFIG.galaxies` and `.systems` for Zod max bounds (lines 10-11).

The service does NOT currently receive `gameConfigService`. It needs to be injected.

- [ ] **Step 1: Modify galaxy.service.ts**

Replace the entire file. Key changes:
- Import `GameConfigService` instead of `UNIVERSE_CONFIG`/`BELT_POSITIONS`
- Add `gameConfigService` as second parameter to `createGalaxyService`
- Load config at start of `getSystem`, read `positions` and `belt_positions`

```typescript
import { eq, and } from 'drizzle-orm';
import { planets, users, debrisFields, allianceMembers, alliances } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import type { GameConfigService } from '../admin/game-config.service.js';

export function createGalaxyService(db: Database, gameConfigService: GameConfigService) {
  return {
    async getSystem(galaxy: number, system: number, _currentUserId?: string) {
      const config = await gameConfigService.getFullConfig();
      const positions = Number(config.universe.positions) || 16;
      const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];

      const systemPlanets = await db
        .select({
          position: planets.position,
          planetId: planets.id,
          planetName: planets.name,
          planetType: planets.planetType,
          userId: planets.userId,
          username: users.username,
          allianceTag: alliances.tag,
          planetClassId: planets.planetClassId,
        })
        .from(planets)
        .leftJoin(users, eq(users.id, planets.userId))
        .leftJoin(allianceMembers, eq(allianceMembers.userId, planets.userId))
        .leftJoin(alliances, eq(alliances.id, allianceMembers.allianceId))
        .where(and(eq(planets.galaxy, galaxy), eq(planets.system, system)));

      const slots: (typeof systemPlanets[number] | { type: 'belt'; position: number } | null)[] = Array(positions).fill(null);

      for (const pos of beltPositions) {
        slots[pos - 1] = { type: 'belt', position: pos };
      }

      for (const planet of systemPlanets) {
        slots[planet.position - 1] = planet;
      }

      const debris = await db
        .select()
        .from(debrisFields)
        .where(
          and(
            eq(debrisFields.galaxy, galaxy),
            eq(debrisFields.system, system),
          ),
        );

      for (const d of debris) {
        const slot = slots[d.position - 1];
        if (slot) {
          (slot as any).debris = { minerai: Number(d.minerai), silicium: Number(d.silicium) };
        }
      }

      return { galaxy, system, slots };
    },
  };
}
```

- [ ] **Step 2: Modify galaxy.router.ts**

Remove `UNIVERSE_CONFIG` import. Use permissive max bounds (999/9999) for basic input sanitization. The real constraint is data-driven.

```typescript
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createGalaxyService } from './galaxy.service.js';

export function createGalaxyRouter(galaxyService: ReturnType<typeof createGalaxyService>) {
  return router({
    system: protectedProcedure
      .input(z.object({
        galaxy: z.number().int().min(1).max(999),
        system: z.number().int().min(1).max(9999),
      }))
      .query(async ({ ctx, input }) => {
        return galaxyService.getSystem(input.galaxy, input.system, ctx.userId);
      }),
  });
}
```

- [ ] **Step 3: Update app-router.ts**

At line 56, change:
```typescript
// Before:
const galaxyService = createGalaxyService(db);
// After:
const galaxyService = createGalaxyService(db, gameConfigService);
```

Remove the `UNIVERSE_CONFIG` import from `app-router.ts` (line 41) — it will still be needed for `fleetService` until Task 3 is done. If other imports from that line remain, keep it. Otherwise remove.

**Important:** After Task 3, the `UNIVERSE_CONFIG` import in `app-router.ts` will be fully removed. For now, it's still needed for `fleetService`. Only remove the import if `fleetService` no longer uses it (which happens in Task 3).

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/galaxy/galaxy.service.ts apps/api/src/modules/galaxy/galaxy.router.ts apps/api/src/trpc/app-router.ts
git commit -m "feat(galaxy): read positions and belt_positions from config.universe"
```

---

### Task 3: Fleet service + router — remove universeSpeed param

**Files:**
- Modify: `apps/api/src/modules/fleet/fleet.service.ts:28-32,61,108,669,745`
- Modify: `apps/api/src/modules/fleet/fleet.router.ts:1-13`
- Modify: `apps/api/src/modules/fleet/fleet.types.ts:73`
- Modify: `apps/api/src/trpc/app-router.ts:64`
- Modify: `apps/api/src/workers/worker.ts:43`

**Context:** `createFleetService` takes `universeSpeed: number` as 4th parameter (line 32). This is read from `UNIVERSE_CONFIG.speed` at call sites. The service already has `gameConfigService` as a later parameter. The value is used in 3 places inside fleet.service.ts and stored in `handlerCtx.universeSpeed`.

No handlers access `ctx.universeSpeed` — it's only used in fleet.service.ts itself.

- [ ] **Step 1: Modify fleet.types.ts**

Remove `universeSpeed` from `MissionHandlerContext` (line 73):

```typescript
// Before (line 63-75):
export interface MissionHandlerContext {
  db: Database;
  resourceService: ReturnType<typeof createResourceService>;
  gameConfigService: GameConfigService;
  messageService?: ReturnType<typeof createMessageService>;
  pveService?: ReturnType<typeof createPveService>;
  asteroidBeltService?: ReturnType<typeof createAsteroidBeltService>;
  pirateService?: ReturnType<typeof createPirateService>;
  reportService?: ReturnType<typeof createReportService>;
  fleetQueue: Queue;
  universeSpeed: number;    // ← REMOVE THIS LINE
  assetsDir: string;
}
```

- [ ] **Step 2: Modify fleet.service.ts**

Changes:
1. Remove `universeSpeed: number` from `createFleetService` parameters (line 32)
2. Remove `universeSpeed` from `handlerCtx` object (line 61)
3. In methods that use `universeSpeed`, read it from config instead

The 3 usage sites are:
- Line 108: `const duration = travelTime(origin, target, speed, universeSpeed);`
- Line 669: `const duration = travelTime(targetCoords, origin, speed, universeSpeed);`
- Line 745: `const dur = travelTime(origin, target, speed, universeSpeed);`

All 3 are inside methods that already call `gameConfigService.getFullConfig()` or can do so. Replace each with:

```typescript
const universeSpeed = Number(config.universe.speed) || 1;
const duration = travelTime(origin, target, speed, universeSpeed);
```

If `config` is not already loaded in that method, add `const config = await gameConfigService.getFullConfig();` before the usage.

For the function signature change:
```typescript
// Before:
export function createFleetService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  fleetQueue: Queue,
  universeSpeed: number,
  messageService: ...,
  gameConfigService: GameConfigService,
  ...
)

// After:
export function createFleetService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  fleetQueue: Queue,
  messageService: ...,
  gameConfigService: GameConfigService,
  ...
)
```

Note: removing the 4th positional parameter shifts all subsequent params. Update accordingly.

- [ ] **Step 3: Modify fleet.router.ts**

Remove `UNIVERSE_CONFIG` import and use permissive Zod bounds:

```typescript
import { z } from 'zod';
import { MissionType } from '@ogame-clone/shared';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFleetService } from './fleet.service.js';

const shipsSchema = z.record(z.string(), z.number().int().min(0).max(999999));
const missionValues = Object.values(MissionType) as [string, ...string[]];
const coordSchema = {
  targetGalaxy: z.number().int().min(1).max(999),
  targetSystem: z.number().int().min(1).max(9999),
  targetPosition: z.number().int().min(1).max(999),
};
```

- [ ] **Step 4: Update call sites in app-router.ts and worker.ts**

In `apps/api/src/trpc/app-router.ts` (line 64):
```typescript
// Before:
const fleetService = createFleetService(db, resourceService, fleetQueue, UNIVERSE_CONFIG.speed, messageService, gameConfigService, pveService, asteroidBeltService, pirateService, reportService);
// After:
const fleetService = createFleetService(db, resourceService, fleetQueue, messageService, gameConfigService, pveService, asteroidBeltService, pirateService, reportService);
```

Now remove the `UNIVERSE_CONFIG` import entirely from `app-router.ts` (line 41) — it's no longer used.

In `apps/api/src/workers/worker.ts` (line 43):
```typescript
// Before:
const fleetService = createFleetService(db, resourceService, fleetQueue, UNIVERSE_CONFIG.speed, messageService, gameConfigService, pveService, asteroidBeltService, pirateService, reportService);
// After:
const fleetService = createFleetService(db, resourceService, fleetQueue, messageService, gameConfigService, pveService, asteroidBeltService, pirateService, reportService);
```

Remove the `UNIVERSE_CONFIG` import from `worker.ts` (line 17).

- [ ] **Step 5: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`

Fix any remaining references to the removed `universeSpeed` parameter.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/fleet/ apps/api/src/trpc/app-router.ts apps/api/src/workers/worker.ts
git commit -m "feat(fleet): read universe speed from config.universe instead of constructor param"
```

---

### Task 4: Planet service — use config.universe for home planet

**Files:**
- Modify: `apps/api/src/modules/planet/planet.service.ts`

**Context:** `planet.service.ts` imports `UNIVERSE_CONFIG` (line 12) and uses it as fallback defaults for `homePlanetDiameter`, `startingMinerai`, `startingSilicium`, `startingHydrogene` (lines 34-39). It also uses a hardcoded `randomInt(4, 12)` for home planet position (line 29). The service already has `gameConfigService` and loads config at line 21.

- [ ] **Step 1: Remove UNIVERSE_CONFIG import and fallbacks**

Replace the `createHomePlanet` method:

```typescript
async createHomePlanet(userId: string) {
  const config = await gameConfigService.getFullConfig();
  const universe = config.universe;

  const galaxies = Number(universe.galaxies) || 9;
  const systems = Number(universe.systems) || 499;
  const posMin = Number(universe.home_planet_position_min) || 4;
  const posMax = Number(universe.home_planet_position_max) || 12;

  const galaxy = randomInt(1, galaxies);
  const system = randomInt(1, systems);
  const position = randomInt(posMin, posMax);

  const randomOffset = randomInt(-20, 20);
  const maxTemp = calculateMaxTemp(position, randomOffset);
  const minTemp = calculateMinTemp(maxTemp);
  const diameter = Number(universe.homePlanetDiameter) || 12000;
  const maxFields = calculateMaxFields(diameter);

  const startingMinerai = Number(universe.startingMinerai) || 500;
  const startingSilicium = Number(universe.startingSilicium) || 300;
  const startingHydrogene = Number(universe.startingHydrogene) || 100;

  // ... rest unchanged
```

Remove the import line:
```typescript
// DELETE: import { UNIVERSE_CONFIG } from '../universe/universe.config.js';
```

Note: We keep `|| defaultValue` as a safety net since these values cause broken gameplay if 0/NaN. The source of truth is the DB seed, not these fallbacks.

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/planet/planet.service.ts
git commit -m "feat(planet): read home planet config from config.universe"
```

---

### Task 5: Fleet handlers — colonize + mine use config

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/colonize.handler.ts`
- Modify: `apps/api/src/modules/fleet/handlers/mine.handler.ts`

**Context:**
- `colonize.handler.ts` imports `BELT_POSITIONS` and `UNIVERSE_CONFIG` (line 5). Uses `BELT_POSITIONS` for checking if target is an asteroid belt (line 28), and `UNIVERSE_CONFIG.maxPlanetsPerPlayer` for max planets check (lines 77, 83). The handler receives `ctx.gameConfigService` via `MissionHandlerContext`.
- `mine.handler.ts` imports `BELT_POSITIONS` (line 5). Uses it to validate target position is a belt (line 15).

- [ ] **Step 1: Modify colonize.handler.ts**

Remove the import:
```typescript
// DELETE: import { BELT_POSITIONS, UNIVERSE_CONFIG } from '../../universe/universe.config.js';
```

In `processArrival`, load config and read values:
```typescript
async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
  // ... existing variable declarations ...
  const config = await ctx.gameConfigService.getFullConfig();
  const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
  const maxPlanetsPerPlayer = Number(config.universe.maxPlanetsPerPlayer) || 9;

  // Replace line 28:
  // Before: if ((BELT_POSITIONS as readonly number[]).includes(fleetEvent.targetPosition))
  // After:
  if (beltPositions.includes(fleetEvent.targetPosition)) {
    // ... same error handling ...
  }

  // Replace line 77:
  // Before: if (userPlanets.length >= UNIVERSE_CONFIG.maxPlanetsPerPlayer)
  // After:
  if (userPlanets.length >= maxPlanetsPerPlayer) {
    // ... error message uses maxPlanetsPerPlayer instead of UNIVERSE_CONFIG.maxPlanetsPerPlayer ...
  }
```

At line 83, replace `UNIVERSE_CONFIG.maxPlanetsPerPlayer` in the error message string with `maxPlanetsPerPlayer`.

- [ ] **Step 2: Modify mine.handler.ts**

Remove the import:
```typescript
// DELETE: import { BELT_POSITIONS } from '../../universe/universe.config.js';
```

In `validateFleet`, load config and read belt positions:
```typescript
async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
  const config = await ctx.gameConfigService.getFullConfig();
  const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];

  // Replace line 15:
  // Before: if (!BELT_POSITIONS.includes(input.targetPosition as 8 | 16))
  // After:
  if (!beltPositions.includes(input.targetPosition)) {
```

Note: The `_config` parameter is already the full game config. Since `belt_positions` is in `_config.universe`, you can use `_config` directly instead of calling `getFullConfig()` again:
```typescript
async validateFleet(input: SendFleetInput, config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
  const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
  if (!beltPositions.includes(input.targetPosition)) {
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/colonize.handler.ts apps/api/src/modules/fleet/handlers/mine.handler.ts
git commit -m "feat(fleet-handlers): read belt_positions and maxPlanetsPerPlayer from config"
```

---

### Task 6: PvE service — add gameConfigService, replace magic numbers

**Files:**
- Modify: `apps/api/src/modules/pve/pve.service.ts`
- Modify: `apps/api/src/trpc/app-router.ts:61` (pveService creation)
- Modify: `apps/api/src/workers/worker.ts:33` (pveService creation)

**Context:** `pve.service.ts` imports `UNIVERSE_CONFIG` and `BELT_POSITIONS` (line 8) and uses them throughout. It also has hardcoded magic numbers:
- `CAP = 3` (line 123) → `pve_max_concurrent_missions`
- `HYDROGENE_CAP = 1500` (line 184) → `pve_hydrogene_cap`
- `offset <= 5` (line 150) → `pve_search_radius`
- `hoursSinceLastDismiss < 24` (line 220) → `pve_dismiss_cooldown_hours`
- `INTERVAL '7 days'` (line 300) → `pve_mission_expiry_days`
- `centerLevel >= 4` (line 264) → `pve_tier_medium_unlock`
- `centerLevel >= 6` (line 265) → `pve_tier_hard_unlock`
- `0.6 + Math.random() * 1.0` (line 173) → `pve_deposit_variance_min/max`
- `centerLevel >= 3` for second belt position (line 148) — keep as-is (game logic, not a tunable constant)
- `UNIVERSE_CONFIG.systems` (line 152) and `.positions` (line 275)

The service does NOT currently receive `gameConfigService`. It must be added.

- [ ] **Step 1: Add gameConfigService to createPveService signature**

```typescript
// Before:
export function createPveService(
  db: Database,
  asteroidBeltService: ReturnType<typeof createAsteroidBeltService>,
  pirateService: ReturnType<typeof createPirateService>,
)

// After:
export function createPveService(
  db: Database,
  asteroidBeltService: ReturnType<typeof createAsteroidBeltService>,
  pirateService: ReturnType<typeof createPirateService>,
  gameConfigService: GameConfigService,
)
```

Add the import:
```typescript
import type { GameConfigService } from '../admin/game-config.service.js';
```

Remove the old import:
```typescript
// DELETE: import { UNIVERSE_CONFIG, BELT_POSITIONS } from '../universe/universe.config.js';
```

- [ ] **Step 2: Replace magic numbers in materializeDiscoveries**

In `materializeDiscoveries` (line 70+), load config and replace `CAP = 3`:

```typescript
async materializeDiscoveries(userId: string) {
  const centerLevel = await this.getMissionCenterLevel(userId);
  if (centerLevel === 0) return;

  const config = await gameConfigService.getFullConfig();
  const now = new Date();

  // ... existing state loading ...

  const CAP = Number(config.universe.pve_max_concurrent_missions) || 3;
  const toCreate = Math.min(n, CAP - currentCount);
  // ... rest unchanged ...
```

- [ ] **Step 3: Replace magic numbers in generateDiscoveredMission**

```typescript
async generateDiscoveredMission(userId: string, galaxy: number, system: number, centerLevel: number) {
  const config = await gameConfigService.getFullConfig();
  const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];
  const systems = Number(config.universe.systems) || 499;
  const searchRadius = Number(config.universe.pve_search_radius) || 5;
  const hydrogeneCap = Number(config.universe.pve_hydrogene_cap) || 1500;
  const varianceMin = Number(config.universe.pve_deposit_variance_min) || 0.6;
  const varianceMax = Number(config.universe.pve_deposit_variance_max) || 1.6;

  const positions = centerLevel >= 3 ? [...beltPositions] : [beltPositions[0]];
  const candidates: { system: number; position: number }[] = [];
  for (let offset = 0; offset <= searchRadius; offset++) {
    for (const pos of positions) {
      if (system + offset <= systems) candidates.push({ system: system + offset, position: pos });
      if (offset > 0 && system - offset >= 1) candidates.push({ system: system - offset, position: pos });
    }
  }

  // ... existing exclusion logic ...

  const varianceMultiplier = varianceMin + Math.random() * (varianceMax - varianceMin);
  const totalQuantity = depositSize(centerLevel, varianceMultiplier);

  // ... existing composition logic ...

  if (hydrogene > hydrogeneCap) {
    const excess = hydrogene - hydrogeneCap;
    hydrogene = hydrogeneCap;
    // ...
  }
  // ... rest unchanged ...
```

- [ ] **Step 4: Replace magic numbers in dismissMission**

```typescript
async dismissMission(userId: string, missionId: string) {
  const config = await gameConfigService.getFullConfig();
  const dismissCooldownHours = Number(config.universe.pve_dismiss_cooldown_hours) || 24;

  const [state] = await db.select().from(missionCenterState)
    .where(eq(missionCenterState.userId, userId)).limit(1);

  if (state?.lastDismissAt) {
    const hoursSinceLastDismiss = (Date.now() - state.lastDismissAt.getTime()) / (3600 * 1000);
    if (hoursSinceLastDismiss < dismissCooldownHours) {
      const remainingHours = Math.ceil(dismissCooldownHours - hoursSinceLastDismiss);
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Vous devez attendre encore ${remainingHours}h avant de pouvoir annuler un gisement`,
      });
    }
  }
  // ... rest unchanged ...
```

- [ ] **Step 5: Replace magic numbers in generatePirateMission**

```typescript
async generatePirateMission(userId: string, galaxy: number, system: number, centerLevel: number) {
  const config = await gameConfigService.getFullConfig();
  const tierMediumUnlock = Number(config.universe.pve_tier_medium_unlock) || 4;
  const tierHardUnlock = Number(config.universe.pve_tier_hard_unlock) || 6;
  const positions = Number(config.universe.positions) || 16;
  const beltPositions = (config.universe.belt_positions as number[]) ?? [8, 16];

  const availableTiers: ('easy' | 'medium' | 'hard')[] = ['easy'];
  if (centerLevel >= tierMediumUnlock) availableTiers.push('medium');
  if (centerLevel >= tierHardUnlock) availableTiers.push('hard');

  // ...

  const beltSet = new Set<number>(beltPositions);
  let position: number;
  do {
    position = 1 + Math.floor(Math.random() * positions);
  } while (beltSet.has(position));
  // ... rest unchanged ...
```

- [ ] **Step 6: Replace magic number in expireOldMissions**

```typescript
async expireOldMissions() {
  const config = await gameConfigService.getFullConfig();
  const expiryDays = Number(config.universe.pve_mission_expiry_days) || 7;

  await db.execute(sql`
    DELETE FROM pve_missions
    WHERE status = 'available'
      AND created_at < NOW() - INTERVAL '1 day' * ${expiryDays}
  `);
},
```

- [ ] **Step 7: Update call sites for createPveService**

In `apps/api/src/trpc/app-router.ts` (line 61):
```typescript
// Before:
const pveService = createPveService(db, asteroidBeltService, pirateService);
// After:
const pveService = createPveService(db, asteroidBeltService, pirateService, gameConfigService);
```

In `apps/api/src/workers/worker.ts` (line 33):
```typescript
// Before:
const pveService = createPveService(db, asteroidBeltService, pirateService);
// After:
const pveService = createPveService(db, asteroidBeltService, pirateService, gameConfigService);
```

- [ ] **Step 8: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/pve/pve.service.ts apps/api/src/trpc/app-router.ts apps/api/src/workers/worker.ts
git commit -m "feat(pve): read all PvE constants from config.universe"
```

---

### Task 7: Cancel refund services — building, research, shipyard

**Files:**
- Modify: `apps/api/src/modules/building/building.service.ts:10,181`
- Modify: `apps/api/src/modules/research/research.service.ts:10,177`
- Modify: `apps/api/src/modules/shipyard/shipyard.service.ts:10,410-422`

**Context:** All three services import `CANCEL_REFUND_RATIO` from `universe.config.ts` and use it for cancel refund calculations. All three already receive `gameConfigService` and call `getFullConfig()` in their cancel methods.

- [ ] **Step 1: Modify building.service.ts**

Remove the import:
```typescript
// DELETE: import { CANCEL_REFUND_RATIO } from '../universe/universe.config.js';
```

In the cancel method (around line 170-181), after `const config = await gameConfigService.getFullConfig();`, add:
```typescript
const cancelRefundRatio = Number(config.universe.cancel_refund_ratio) || 0.7;
```

Replace `CANCEL_REFUND_RATIO` with `cancelRefundRatio` at line 181:
```typescript
const refundRatio = Math.min(cancelRefundRatio, totalDuration > 0 ? timeLeft / totalDuration : 0);
```

- [ ] **Step 2: Modify research.service.ts**

Same pattern. Remove import, add after config load:
```typescript
const cancelRefundRatio = Number(config.universe.cancel_refund_ratio) || 0.7;
```

Replace `CANCEL_REFUND_RATIO` with `cancelRefundRatio` at line 177.

- [ ] **Step 3: Modify shipyard.service.ts**

Same pattern. Remove import. The shipyard uses `CANCEL_REFUND_RATIO` in multiple places (lines 410, 413, 414, 415, 420, 421, 422). All are in the same cancel method. Add after config load:
```typescript
const cancelRefundRatio = Number(config.universe.cancel_refund_ratio) || 0.7;
```

Replace all 7 occurrences of `CANCEL_REFUND_RATIO` with `cancelRefundRatio`.

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/building/building.service.ts apps/api/src/modules/research/research.service.ts apps/api/src/modules/shipyard/shipyard.service.ts
git commit -m "feat(cancel): read cancel_refund_ratio from config.universe"
```

---

### Task 8: Admin Universe page — section grouping

**Files:**
- Modify: `apps/admin/src/pages/Universe.tsx`

**Context:** Currently displays a flat alphabetically-sorted list of all universe config keys. Needs section grouping (General, Combat, PvE, Fleet, Formules) for readability.

- [ ] **Step 1: Rewrite Universe.tsx with section grouping**

Define a section mapping and group entries. Keys not matching any section go in a "Divers" fallback section.

```typescript
import { useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { Save, X, Pencil } from 'lucide-react';

const SECTIONS: { id: string; label: string; keys: string[] }[] = [
  {
    id: 'general',
    label: 'General',
    keys: [
      'name', 'speed', 'galaxies', 'systems', 'positions',
      'maxPlanetsPerPlayer', 'homePlanetDiameter',
      'home_planet_position_min', 'home_planet_position_max',
      'startingMinerai', 'startingSilicium', 'startingHydrogene',
      'cancel_refund_ratio', 'belt_positions',
    ],
  },
  {
    id: 'combat',
    label: 'Combat',
    keys: [
      'debrisRatio', 'lootRatio',
      'combat_max_rounds', 'combat_defense_repair_probability',
      'combat_bounce_threshold', 'combat_rapid_destruction_threshold',
    ],
  },
  {
    id: 'pve',
    label: 'PvE',
    keys: [
      'pve_max_concurrent_missions', 'pve_hydrogene_cap',
      'pve_dismiss_cooldown_hours', 'pve_mission_expiry_days',
      'pve_search_radius', 'pve_tier_medium_unlock', 'pve_tier_hard_unlock',
      'pve_deposit_variance_min', 'pve_deposit_variance_max',
      'pve_discovery_cooldown_base', 'pve_deposit_size_base',
      'slag_rate.pos8', 'slag_rate.pos16',
    ],
  },
  {
    id: 'fleet',
    label: 'Fleet',
    keys: [
      'fleet_distance_galaxy_factor', 'fleet_distance_system_base',
      'fleet_distance_system_factor', 'fleet_distance_position_base',
      'fleet_distance_position_factor', 'fleet_same_position_distance',
      'fleet_speed_factor',
    ],
  },
  {
    id: 'formulas',
    label: 'Formules',
    keys: [
      'spy_visibility_thresholds', 'ranking_points_divisor',
      'shipyard_time_divisor', 'research_time_divisor',
      'storage_base', 'storage_coeff_a', 'storage_coeff_b', 'storage_coeff_c',
      'satellite_home_planet_energy', 'satellite_base_divisor', 'satellite_base_offset',
      'phase_multiplier',
    ],
  },
];

function getSectionForKey(key: string): string {
  for (const section of SECTIONS) {
    if (section.keys.includes(key)) return section.id;
  }
  return 'other';
}

export default function Universe() {
  const { data, isLoading, refetch } = useGameConfig();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const updateMutation = trpc.gameConfig.admin.updateUniverseConfig.useMutation({
    onSuccess: () => {
      refetch();
      setEditingKey(null);
    },
  });

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const entries = Object.entries(data.universe);

  // Group entries by section
  const grouped = new Map<string, [string, unknown][]>();
  for (const entry of entries) {
    const sectionId = getSectionForKey(entry[0]);
    if (!grouped.has(sectionId)) grouped.set(sectionId, []);
    grouped.get(sectionId)!.push(entry);
  }
  // Sort entries within each section alphabetically
  for (const arr of grouped.values()) arr.sort(([a], [b]) => a.localeCompare(b));

  const allSections = [
    ...SECTIONS,
    { id: 'other', label: 'Divers', keys: [] as string[] },
  ];

  function handleSave(key: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editValue);
    } catch {
      parsed = editValue;
    }
    updateMutation.mutate({ key, value: parsed });
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold text-gray-100 mb-4">Configuration Univers</h1>

      {allSections.map((section) => {
        const sectionEntries = grouped.get(section.id);
        if (!sectionEntries || sectionEntries.length === 0) return null;
        return (
          <div key={section.id} className="mb-6">
            <h2 className="text-sm font-semibold text-hull-400 uppercase tracking-wider mb-2">
              {section.label}
            </h2>
            <div className="admin-card overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cle</th>
                    <th>Valeur</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {sectionEntries.map(([key, value]) => {
                    const isEditing = editingKey === key;
                    const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

                    return (
                      <tr key={key}>
                        <td className="font-mono text-gray-400 text-sm">{key}</td>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="admin-input py-1 text-sm w-full"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave(key);
                                if (e.key === 'Escape') setEditingKey(null);
                              }}
                            />
                          ) : (
                            <span className="font-mono text-sm">{displayValue}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleSave(key)}
                                disabled={updateMutation.isPending}
                                className="admin-btn-ghost p-1.5 text-hull-400"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingKey(null)} className="admin-btn-ghost p-1.5">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingKey(key);
                                setEditValue(displayValue);
                              }}
                              className="admin-btn-ghost p-1.5"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/Universe.tsx
git commit -m "feat(admin): group universe config by sections"
```

---

### Task 9: Delete universe.config.ts + final verification

**Files:**
- Delete: `apps/api/src/modules/universe/universe.config.ts`

**Context:** After Tasks 2-7, no file should import from `universe.config.ts` anymore.

- [ ] **Step 1: Verify no remaining imports**

Run a grep to check:
```bash
grep -r "universe.config" apps/api/src/ --include="*.ts" | grep -v node_modules
```

Expected: zero results. If any remain, fix them before proceeding.

- [ ] **Step 2: Delete the file**

```bash
rm apps/api/src/modules/universe/universe.config.ts
```

- [ ] **Step 3: Typecheck all three apps**

```bash
cd apps/api && npx tsc --noEmit
cd ../admin && npx tsc --noEmit
cd ../web && npx tsc --noEmit
```

All must pass.

- [ ] **Step 4: Final grep for remaining hardcoded values**

```bash
grep -rn "UNIVERSE_CONFIG\|BELT_POSITIONS\|CANCEL_REFUND_RATIO" apps/ packages/ --include="*.ts" | grep -v node_modules | grep -v ".d.ts"
```

Expected: zero results (the seed file uses a local `UNIVERSE_CONFIG` variable name, which is fine — it's data, not a consumed constant).

The seed file's `const UNIVERSE_CONFIG = [...]` is acceptable — it's the data array that populates the DB, not a consumed constant.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "feat(SP2): delete universe.config.ts — all values now DB-driven"
git push
```
