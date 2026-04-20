# Abandon Colony — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player voluntarily abandon a colony. Remaining ships become a return fleet loaded with on-planet resources (minerai → silicium → hydrogène), overflow minerai+silicium becomes a debris field, the planet is deleted and buildings/defenses/queues lost.

**Architecture:** A new dedicated mission `abandon_return` (not `transport`, because `TransportHandler` schedules a return to a now-deleted origin). A new `PlanetAbandonService` orchestrates the whole abandonment in one DB transaction: validate blockers → build the fleet event → move the flagship → write debris → delete the planet (cascades take care of child rows). A new `AbandonReturnHandler` delivers the ships/resources at destination and writes the report. Two tRPC endpoints on `planet.*`: `abandonPreview` (query) and `abandon` (mutation). A two-step web modal drives the UX.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, tRPC, BullMQ, Vitest, React + React Router + TanStack Query (via tRPC hooks).

**Spec:** `docs/superpowers/specs/2026-04-20-abandon-colony-design.md`

---

## File Structure

**Schema / migrations**
- Create: `packages/db/drizzle/0049_abandon_colony.sql` — adds `abandon_return` enum value + fixes `fleet_events.origin_planet_id` FK to `SET NULL` (currently `CASCADE` — would delete the return fleet we just created).
- Modify: `packages/db/src/schema/fleet-events.ts` — add `'abandon_return'` to `fleetMissionEnum`; change `originPlanetId.notNull()` to nullable with `onDelete: 'set null'`.

**Shared**
- Modify: `packages/shared/src/types/missions.ts` — add `AbandonReturn = 'abandon_return'`.

**Game config seed**
- Modify: `packages/db/src/seed-game-config.ts` — add a `MISSION_DEFINITIONS` entry for `abandon_return` with `requiresPveMission: true` (not manually selectable in the send-fleet UI; only produced by the abandon mutation).

**Backend service (new)**
- Create: `apps/api/src/modules/planet/planet-abandon.service.ts` — pure service with dependency-injected context. Exports `createPlanetAbandonService` and two pure helpers (`computeCargoLoad`, `assertNoBlockers`).
- Create: `apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts` — unit + integration tests.

**Backend handler (new)**
- Create: `apps/api/src/modules/fleet/handlers/abandon-return.handler.ts` — implements `MissionHandler`: no validate, `processArrival` deposits ships + cargo on destination, re-stations flagship if applicable, writes `abandon_return` report, returns `{ scheduleReturn: false }`.

**Backend wiring**
- Modify: `apps/api/src/modules/fleet/fleet.service.ts` — import + register `AbandonReturnHandler` in the `handlers` record.
- Modify: `apps/api/src/modules/planet/planet.router.ts` — expose `abandonPreview` + `abandon`.
- Modify: `apps/api/src/trpc/context.ts` (or wherever services are constructed) — instantiate `PlanetAbandonService` and pass it into `planet.router`.

**Frontend**
- Create: `apps/web/src/components/empire/AbandonColonyModal.tsx` — two-step modal (destination → summary).
- Create: `apps/web/src/components/reports/AbandonReportDetail.tsx` — arrival report detail.
- Modify: `apps/web/src/pages/Empire.tsx` — add a "⋯" menu on each planet card/row, opening `AbandonColonyModal`. Hide the entry on the homeworld and on `status='colonizing'` cards.
- Modify: `apps/web/src/pages/ReportDetail.tsx` — wire `AbandonReportDetail` for `missionType === 'abandon_return'`.

---

## Task 1: Migration + FK audit

**Files:**
- Create: `packages/db/drizzle/0049_abandon_colony.sql`
- Modify: `packages/db/src/schema/fleet-events.ts`

- [ ] **Step 1.1: Write the migration**

Create `packages/db/drizzle/0049_abandon_colony.sql`:

```sql
-- Abandon colony feature.
--
-- 1. New fleet mission value used only by PlanetAbandonService.
-- 2. origin_planet_id must survive planet deletion, otherwise the return
--    fleet we create when abandoning a colony gets cascade-deleted along
--    with the planet and the ships/resources aboard vanish.

ALTER TYPE "fleet_mission" ADD VALUE IF NOT EXISTS 'abandon_return';

ALTER TABLE "fleet_events"
  DROP CONSTRAINT IF EXISTS "fleet_events_origin_planet_id_planets_id_fk";

ALTER TABLE "fleet_events"
  ALTER COLUMN "origin_planet_id" DROP NOT NULL;

ALTER TABLE "fleet_events"
  ADD CONSTRAINT "fleet_events_origin_planet_id_planets_id_fk"
  FOREIGN KEY ("origin_planet_id") REFERENCES "planets"("id")
  ON DELETE SET NULL;
```

- [ ] **Step 1.2: Update Drizzle schema to match**

In `packages/db/src/schema/fleet-events.ts`:

```typescript
export const fleetMissionEnum = pgEnum('fleet_mission', [
  'transport', 'station', 'spy', 'attack', 'colonize', 'recycle', 'mine', 'pirate', 'trade', 'scan', 'explore', 'colonize_supply', 'colonize_reinforce', 'abandon_return',
]);
```

Change the `originPlanetId` column definition:

```typescript
originPlanetId: uuid('origin_planet_id').references(() => planets.id, { onDelete: 'set null' }),
```

(Drop the `.notNull()`.)

- [ ] **Step 1.3: Audit other planet FKs**

Grep the schema for all `references(() => planets.id`:

Run: `grep -rn "references(() => planets.id" packages/db/src/schema`

Expected entries and required policy:
- `fleet_events.origin_planet_id` → `SET NULL` (fixed above)
- `fleet_events.target_planet_id` → already `SET NULL` ✓
- `mission_reports`: no direct FK to planets — reports reference `fleet_events` with `SET NULL` ✓
- `market_offers.planet_id` → `CASCADE` acceptable (abandon mutation blocks on active/reserved offers)
- `planet_ships`, `planet_defenses`, `planet_buildings`, `planet_biomes`, `colonization_processes`, `build_queue`, etc. → `CASCADE` expected (we want these gone with the planet)

No other FK change required; note the findings in the commit message.

- [ ] **Step 1.4: Apply migration locally**

Run: `psql "$DATABASE_URL" -f packages/db/drizzle/0049_abandon_colony.sql`
Expected: no errors.

- [ ] **Step 1.5: Commit**

```bash
git add packages/db/drizzle/0049_abandon_colony.sql packages/db/src/schema/fleet-events.ts
git commit -m "feat(db): add abandon_return mission + fix fleet_events origin FK to SET NULL"
git push
```

---

## Task 2: Shared MissionType

**Files:**
- Modify: `packages/shared/src/types/missions.ts`

- [ ] **Step 2.1: Add enum value**

In `packages/shared/src/types/missions.ts`:

```typescript
export enum MissionType {
  Transport = 'transport',
  Station = 'station',
  Spy = 'spy',
  Attack = 'attack',
  Colonize = 'colonize',
  Recycle = 'recycle',
  Mine = 'mine',
  Pirate = 'pirate',
  Trade = 'trade',
  Scan = 'scan',
  Explore = 'explore',
  ColonizeSupply = 'colonize_supply',
  ColonizeReinforce = 'colonize_reinforce',
  AbandonReturn = 'abandon_return',
}
```

- [ ] **Step 2.2: Commit**

```bash
git add packages/shared/src/types/missions.ts
git commit -m "feat(shared): add AbandonReturn mission type"
git push
```

---

## Task 3: Seed mission definition

**Files:**
- Modify: `packages/db/src/seed-game-config.ts`

- [ ] **Step 3.1: Add mission definition entry**

Locate the `MISSION_DEFINITIONS` array in `packages/db/src/seed-game-config.ts` and append:

```typescript
{
  id: 'abandon_return',
  label: 'Abandon de colonie',
  hint: 'Retour forcé après abandon d\'une colonie',
  buttonLabel: 'Retour',
  color: '#f97316',
  sortOrder: 14,
  dangerous: false,
  requiredShipRoles: null as string[] | null,
  exclusive: false,
  recommendedShipRoles: null as string[] | null,
  requiresPveMission: true,
},
```

(`requiresPveMission: true` hides the mission from the manual fleet selector — this mission is only produced by `PlanetAbandonService`.)

- [ ] **Step 3.2: Re-seed game config**

Run: `npx tsx packages/db/src/seed-game-config.ts`
Expected: the mission appears in the `mission_definitions` table. Verify with `psql "$DATABASE_URL" -c "SELECT id, label FROM mission_definitions WHERE id='abandon_return';"`.

- [ ] **Step 3.3: Commit**

```bash
git add packages/db/src/seed-game-config.ts
git commit -m "feat(seed): register abandon_return mission definition"
git push
```

---

## Task 4: Pure cargo-load helper (TDD)

**Files:**
- Create: `apps/api/src/modules/planet/planet-abandon.service.ts`
- Create: `apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts`

- [ ] **Step 4.1: Write failing test for `computeCargoLoad`**

Create `apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeCargoLoad } from '../planet-abandon.service.js';

describe('computeCargoLoad', () => {
  it('loads minerai then silicium then hydrogene up to capacity', () => {
    const res = computeCargoLoad(
      { minerai: 500, silicium: 300, hydrogene: 200 },
      1000,
    );
    expect(res.loaded).toEqual({ minerai: 500, silicium: 300, hydrogene: 200 });
    expect(res.overflow).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
  });

  it('fills minerai first, overflow goes to debris for minerai+silicium', () => {
    const res = computeCargoLoad(
      { minerai: 2000, silicium: 1000, hydrogene: 500 },
      1500,
    );
    expect(res.loaded).toEqual({ minerai: 1500, silicium: 0, hydrogene: 0 });
    expect(res.overflow).toEqual({ minerai: 500, silicium: 1000, hydrogene: 500 });
  });

  it('fills minerai fully then partial silicium', () => {
    const res = computeCargoLoad(
      { minerai: 400, silicium: 800, hydrogene: 300 },
      1000,
    );
    expect(res.loaded).toEqual({ minerai: 400, silicium: 600, hydrogene: 0 });
    expect(res.overflow).toEqual({ minerai: 0, silicium: 200, hydrogene: 300 });
  });

  it('returns zero everywhere if capacity is 0', () => {
    const res = computeCargoLoad({ minerai: 100, silicium: 100, hydrogene: 100 }, 0);
    expect(res.loaded).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    expect(res.overflow).toEqual({ minerai: 100, silicium: 100, hydrogene: 100 });
  });

  it('floors fractional capacities toward loaded (keeps loaded never > stock)', () => {
    const res = computeCargoLoad({ minerai: 10, silicium: 10, hydrogene: 10 }, 15);
    expect(res.loaded).toEqual({ minerai: 10, silicium: 5, hydrogene: 0 });
    expect(res.overflow).toEqual({ minerai: 0, silicium: 5, hydrogene: 10 });
  });
});
```

- [ ] **Step 4.2: Run test to see it fail**

Run: `pnpm --filter @exilium/api test planet-abandon.service.test`
Expected: FAIL with "Cannot find module '../planet-abandon.service.js'".

- [ ] **Step 4.3: Write minimal `computeCargoLoad` implementation**

Create `apps/api/src/modules/planet/planet-abandon.service.ts`:

```typescript
export interface ResourceBundle {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

export interface CargoLoadResult {
  loaded: ResourceBundle;
  overflow: ResourceBundle;
}

export function computeCargoLoad(stock: ResourceBundle, capacity: number): CargoLoadResult {
  const remaining = Math.max(0, capacity);
  const loadedMinerai = Math.min(stock.minerai, remaining);
  const afterMinerai = remaining - loadedMinerai;
  const loadedSilicium = Math.min(stock.silicium, afterMinerai);
  const afterSilicium = afterMinerai - loadedSilicium;
  const loadedHydrogene = Math.min(stock.hydrogene, afterSilicium);
  return {
    loaded: {
      minerai: loadedMinerai,
      silicium: loadedSilicium,
      hydrogene: loadedHydrogene,
    },
    overflow: {
      minerai: stock.minerai - loadedMinerai,
      silicium: stock.silicium - loadedSilicium,
      hydrogene: stock.hydrogene - loadedHydrogene,
    },
  };
}
```

- [ ] **Step 4.4: Run test to confirm pass**

Run: `pnpm --filter @exilium/api test planet-abandon.service.test`
Expected: PASS (5 tests).

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/modules/planet/planet-abandon.service.ts apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts
git commit -m "feat(api): add computeCargoLoad helper for colony abandonment"
git push
```

---

## Task 5: Blocker validation (TDD)

**Files:**
- Modify: `apps/api/src/modules/planet/planet-abandon.service.ts`
- Modify: `apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts`

- [ ] **Step 5.1: Write failing tests for blocker detection**

Append to `apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts`:

```typescript
import { detectBlockers, type AbandonContext } from '../planet-abandon.service.js';

describe('detectBlockers', () => {
  const baseCtx: AbandonContext = {
    planet: { id: 'p1', userId: 'u1', status: 'active', planetClassId: 'rocky' } as any,
    destinationPlanet: { id: 'p2', userId: 'u1', status: 'active' } as any,
    inboundHostile: 0,
    outboundActive: 0,
    activeMarketOffers: 0,
  };

  it('returns empty list when everything is fine', () => {
    expect(detectBlockers(baseCtx)).toEqual([]);
  });

  it('blocks homeworld', () => {
    const ctx = { ...baseCtx, planet: { ...baseCtx.planet, planetClassId: 'homeworld' } as any };
    expect(detectBlockers(ctx)).toContain('homeworld');
  });

  it('blocks colonizing planet', () => {
    const ctx = { ...baseCtx, planet: { ...baseCtx.planet, status: 'colonizing' } as any };
    expect(detectBlockers(ctx)).toContain('colonizing');
  });

  it('blocks on inbound hostile fleets', () => {
    const ctx = { ...baseCtx, inboundHostile: 1 };
    expect(detectBlockers(ctx)).toContain('inbound_hostile');
  });

  it('blocks on outbound active fleets', () => {
    const ctx = { ...baseCtx, outboundActive: 2 };
    expect(detectBlockers(ctx)).toContain('outbound_active');
  });

  it('blocks on active market offers', () => {
    const ctx = { ...baseCtx, activeMarketOffers: 1 };
    expect(detectBlockers(ctx)).toContain('market_offers');
  });

  it('blocks if destination is the abandoned planet itself', () => {
    const ctx = { ...baseCtx, destinationPlanet: baseCtx.planet };
    expect(detectBlockers(ctx)).toContain('destination_invalid');
  });

  it('blocks if destination is not active', () => {
    const ctx = { ...baseCtx, destinationPlanet: { ...baseCtx.destinationPlanet, status: 'colonizing' } as any };
    expect(detectBlockers(ctx)).toContain('destination_invalid');
  });

  it('blocks if destination belongs to another user', () => {
    const ctx = { ...baseCtx, destinationPlanet: { ...baseCtx.destinationPlanet, userId: 'other' } as any };
    expect(detectBlockers(ctx)).toContain('destination_invalid');
  });
});
```

- [ ] **Step 5.2: Run tests to see them fail**

Run: `pnpm --filter @exilium/api test planet-abandon.service.test`
Expected: FAIL (`detectBlockers is not a function`).

- [ ] **Step 5.3: Implement `detectBlockers`**

Append to `apps/api/src/modules/planet/planet-abandon.service.ts`:

```typescript
export type AbandonBlocker =
  | 'homeworld'
  | 'colonizing'
  | 'inbound_hostile'
  | 'outbound_active'
  | 'market_offers'
  | 'destination_invalid';

export interface AbandonContext {
  planet: {
    id: string;
    userId: string;
    status: string;
    planetClassId: string | null;
  };
  destinationPlanet: {
    id: string;
    userId: string;
    status: string;
  } | null;
  inboundHostile: number;
  outboundActive: number;
  activeMarketOffers: number;
}

export function detectBlockers(ctx: AbandonContext): AbandonBlocker[] {
  const blockers: AbandonBlocker[] = [];
  if (ctx.planet.planetClassId === 'homeworld') blockers.push('homeworld');
  if (ctx.planet.status === 'colonizing') blockers.push('colonizing');
  if (ctx.inboundHostile > 0) blockers.push('inbound_hostile');
  if (ctx.outboundActive > 0) blockers.push('outbound_active');
  if (ctx.activeMarketOffers > 0) blockers.push('market_offers');
  const dest = ctx.destinationPlanet;
  if (
    !dest ||
    dest.id === ctx.planet.id ||
    dest.userId !== ctx.planet.userId ||
    dest.status !== 'active'
  ) {
    blockers.push('destination_invalid');
  }
  return blockers;
}
```

- [ ] **Step 5.4: Run tests**

Run: `pnpm --filter @exilium/api test planet-abandon.service.test`
Expected: PASS (all 14 tests).

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/src/modules/planet/planet-abandon.service.ts apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts
git commit -m "feat(api): add detectBlockers for colony abandonment"
git push
```

---

## Task 6: Full `PlanetAbandonService` (preview + abandon)

**Files:**
- Modify: `apps/api/src/modules/planet/planet-abandon.service.ts`
- Modify: `apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts`

- [ ] **Step 6.1: Sketch the service contract**

Append to `planet-abandon.service.ts`:

```typescript
import { and, eq, inArray, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  planets,
  planetShips,
  fleetEvents,
  marketOffers,
  debrisFields,
  flagships,
} from '@exilium/db';
import type { Database } from '@exilium/db';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createReportService } from '../report/report.service.js';
import type { createFleetService } from '../fleet/fleet.service.js';
import { totalCargoCapacity, travelTime, distance } from '@exilium/game-engine';
import { buildShipStatsMap } from '../fleet/fleet.types.js';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { publishNotification } from '../notification/notification.publisher.js';

export interface AbandonPreview {
  planetId: string;
  destinationPlanetId: string;
  blockers: AbandonBlocker[];
  ships: Record<string, number>;
  cargoCapacity: number;
  loaded: ResourceBundle;
  overflow: ResourceBundle;
  stock: ResourceBundle;
  travelSeconds: number;
  arrivalTime: Date;
  flagshipIncluded: boolean;
  buildingsLost: number;
  defensesLost: number;
  queuesLost: number;
}

export function createPlanetAbandonService(
  db: Database,
  gameConfigService: GameConfigService,
  reportService: ReturnType<typeof createReportService>,
  fleetQueue: Queue,
  redis: Redis,
) {
  async function loadContext(userId: string, planetId: string, destinationPlanetId: string) {
    const [planet] = await db.select().from(planets).where(eq(planets.id, planetId)).limit(1);
    if (!planet || planet.userId !== userId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Planète introuvable' });
    }
    const [destination] = await db.select().from(planets).where(eq(planets.id, destinationPlanetId)).limit(1);
    const [shipsRow] = await db.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);

    const [{ count: inboundHostile }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleetEvents)
      .where(and(
        eq(fleetEvents.targetPlanetId, planetId),
        eq(fleetEvents.status, 'active'),
        inArray(fleetEvents.mission, ['attack', 'spy', 'pirate']),
      ));

    const [{ count: outboundActive }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleetEvents)
      .where(and(
        eq(fleetEvents.originPlanetId, planetId),
        eq(fleetEvents.status, 'active'),
      ));

    const [{ count: marketCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketOffers)
      .where(and(
        eq(marketOffers.planetId, planetId),
        inArray(marketOffers.status, ['active', 'reserved']),
      ));

    const [flagship] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
    const flagshipIncluded = !!flagship && flagship.planetId === planetId && flagship.status === 'active';

    return { planet, destination, shipsRow, inboundHostile, outboundActive, marketCount, flagship, flagshipIncluded };
  }
  // ...continued in Step 6.2
}
```

- [ ] **Step 6.2: Implement `preview` method**

Inside the `return { ... }` body, add:

```typescript
  return {
    async preview(userId: string, planetId: string, destinationPlanetId: string): Promise<AbandonPreview> {
      const ctxData = await loadContext(userId, planetId, destinationPlanetId);
      const { planet, destination, shipsRow, flagship, flagshipIncluded } = ctxData;

      const ships: Record<string, number> = {};
      if (shipsRow) {
        for (const [k, v] of Object.entries(shipsRow)) {
          if (k === 'planetId' || k === 'createdAt' || k === 'updatedAt') continue;
          const count = typeof v === 'number' ? v : 0;
          if (count > 0) ships[k] = count;
        }
      }
      if (flagshipIncluded) ships['flagship'] = 1;

      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);
      if (flagshipIncluded && flagship) {
        shipStatsMap['flagship'] = {
          baseSpeed: flagship.baseSpeed,
          fuelConsumption: flagship.fuelConsumption,
          cargoCapacity: flagship.cargoCapacity,
          driveType: flagship.driveType as any,
          miningExtraction: 0,
        };
      }
      const cargoCapacity = totalCargoCapacity(ships, shipStatsMap);

      const stock: ResourceBundle = {
        minerai: Number(planet.minerai),
        silicium: Number(planet.silicium),
        hydrogene: Number(planet.hydrogene),
      };
      const { loaded, overflow } = computeCargoLoad(stock, cargoCapacity);

      const blockers = detectBlockers({
        planet: {
          id: planet.id,
          userId: planet.userId,
          status: planet.status,
          planetClassId: planet.planetClassId,
        },
        destinationPlanet: destination
          ? { id: destination.id, userId: destination.userId, status: destination.status }
          : null,
        inboundHostile: ctxData.inboundHostile,
        outboundActive: ctxData.outboundActive,
        activeMarketOffers: ctxData.marketCount,
      });

      // Travel time
      const fleetConfig = {
        galaxyFactor: Number(config.universe.fleet_distance_galaxy_factor) || 20000,
        systemBase: Number(config.universe.fleet_distance_system_base) || 2700,
        systemFactor: Number(config.universe.fleet_distance_system_factor) || 95,
        positionBase: Number(config.universe.fleet_distance_position_base) || 1000,
        positionFactor: Number(config.universe.fleet_distance_position_factor) || 5,
        samePositionDistance: Number(config.universe.fleet_same_position_distance) || 5,
        speedFactor: Number(config.universe.fleet_speed_factor) || 35000,
      };
      const originCoords = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      let travelSeconds = 0;
      let arrivalTime = new Date();
      if (destination) {
        const destCoords = { galaxy: destination.galaxy, system: destination.system, position: destination.position };
        const { fleetSpeed } = await import('@exilium/game-engine');
        const speed = fleetSpeed(ships, shipStatsMap, {});
        const universeSpeed = Number(config.universe.speed) || 1;
        travelSeconds = speed > 0
          ? travelTime(originCoords, destCoords, speed, universeSpeed, fleetConfig)
          : 0;
        arrivalTime = new Date(Date.now() + travelSeconds * 1000);
      }

      // Count lost entities (best-effort; UI only)
      const [{ buildings, defenses, queues }] = await db.execute<{ buildings: number; defenses: number; queues: number }>(
        sql`
          SELECT
            (SELECT COALESCE(SUM(level), 0)::int FROM planet_buildings WHERE planet_id = ${planetId}) AS buildings,
            (SELECT COALESCE(SUM(count), 0)::int FROM (
               SELECT UNNEST(ARRAY[
                 missile_defense, laser_defense, plasma_defense,
                 small_shield, large_shield
               ]) AS count
               FROM planet_defenses WHERE planet_id = ${planetId}
             ) x) AS defenses,
            (SELECT COUNT(*)::int FROM build_queue WHERE planet_id = ${planetId}) AS queues
        `,
      ).then((r: any) => r.rows ?? r);

      return {
        planetId,
        destinationPlanetId,
        blockers,
        ships,
        cargoCapacity,
        loaded,
        overflow,
        stock,
        travelSeconds,
        arrivalTime,
        flagshipIncluded,
        buildingsLost: buildings ?? 0,
        defensesLost: defenses ?? 0,
        queuesLost: queues ?? 0,
      };
    },
```

- [ ] **Step 6.3: Implement `abandon` method**

Continuing inside the same `return { ... }`:

```typescript
    async abandon(userId: string, planetId: string, destinationPlanetId: string) {
      const config = await gameConfigService.getFullConfig();
      const shipStatsMap = buildShipStatsMap(config);

      const jobData = await db.transaction(async (tx) => {
        // Re-validate with FOR UPDATE to close races
        const [planet] = await tx
          .select()
          .from(planets)
          .where(eq(planets.id, planetId))
          .for('update');
        if (!planet || planet.userId !== userId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Planète introuvable' });
        }

        const [destination] = await tx
          .select()
          .from(planets)
          .where(eq(planets.id, destinationPlanetId))
          .for('update');

        const [{ count: inboundHostile }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fleetEvents)
          .where(and(
            eq(fleetEvents.targetPlanetId, planetId),
            eq(fleetEvents.status, 'active'),
            inArray(fleetEvents.mission, ['attack', 'spy', 'pirate']),
          ));

        const [{ count: outboundActive }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(fleetEvents)
          .where(and(
            eq(fleetEvents.originPlanetId, planetId),
            eq(fleetEvents.status, 'active'),
          ));

        const [{ count: marketCount }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(marketOffers)
          .where(and(
            eq(marketOffers.planetId, planetId),
            inArray(marketOffers.status, ['active', 'reserved']),
          ));

        const [flagship] = await tx.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
        const flagshipIncluded = !!flagship && flagship.planetId === planetId && flagship.status === 'active';

        const blockers = detectBlockers({
          planet: {
            id: planet.id, userId: planet.userId, status: planet.status, planetClassId: planet.planetClassId,
          },
          destinationPlanet: destination
            ? { id: destination.id, userId: destination.userId, status: destination.status }
            : null,
          inboundHostile,
          outboundActive,
          activeMarketOffers: marketCount,
        });
        if (blockers.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Abandon impossible: ${blockers.join(', ')}`,
          });
        }

        const [shipsRow] = await tx.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
        const ships: Record<string, number> = {};
        if (shipsRow) {
          for (const [k, v] of Object.entries(shipsRow)) {
            if (k === 'planetId' || k === 'createdAt' || k === 'updatedAt') continue;
            const count = typeof v === 'number' ? v : 0;
            if (count > 0) ships[k] = count;
          }
        }
        if (flagshipIncluded) {
          ships['flagship'] = 1;
          shipStatsMap['flagship'] = {
            baseSpeed: flagship!.baseSpeed,
            fuelConsumption: flagship!.fuelConsumption,
            cargoCapacity: flagship!.cargoCapacity,
            driveType: flagship!.driveType as any,
            miningExtraction: 0,
          };
        }

        const capacity = totalCargoCapacity(ships, shipStatsMap);
        const stock: ResourceBundle = {
          minerai: Number(planet.minerai),
          silicium: Number(planet.silicium),
          hydrogene: Number(planet.hydrogene),
        };
        const { loaded, overflow } = computeCargoLoad(stock, capacity);

        // Travel time (destination guaranteed by blocker check)
        const fleetConfig = {
          galaxyFactor: Number(config.universe.fleet_distance_galaxy_factor) || 20000,
          systemBase: Number(config.universe.fleet_distance_system_base) || 2700,
          systemFactor: Number(config.universe.fleet_distance_system_factor) || 95,
          positionBase: Number(config.universe.fleet_distance_position_base) || 1000,
          positionFactor: Number(config.universe.fleet_distance_position_factor) || 5,
          samePositionDistance: Number(config.universe.fleet_same_position_distance) || 5,
          speedFactor: Number(config.universe.fleet_speed_factor) || 35000,
        };
        const originCoords = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
        const destCoords = { galaxy: destination!.galaxy, system: destination!.system, position: destination!.position };
        const { fleetSpeed } = await import('@exilium/game-engine');
        const speed = fleetSpeed(ships, shipStatsMap, {});
        const universeSpeed = Number(config.universe.speed) || 1;
        const duration = speed > 0 ? travelTime(originCoords, destCoords, speed, universeSpeed, fleetConfig) : 0;
        const now = new Date();
        const arrivalTime = new Date(now.getTime() + duration * 1000);

        // Create the return fleet event
        const [event] = await tx
          .insert(fleetEvents)
          .values({
            userId,
            originPlanetId: planet.id,
            targetPlanetId: destination!.id,
            targetGalaxy: destination!.galaxy,
            targetSystem: destination!.system,
            targetPosition: destination!.position,
            mission: 'abandon_return',
            phase: 'outbound',
            status: 'active',
            departureTime: now,
            arrivalTime,
            mineraiCargo: String(loaded.minerai),
            siliciumCargo: String(loaded.silicium),
            hydrogeneCargo: String(loaded.hydrogene),
            ships,
            metadata: {
              abandonedPlanet: {
                name: planet.name,
                galaxy: planet.galaxy,
                system: planet.system,
                position: planet.position,
              },
              overflow,
              buildingsLost: 0, // filled by UI; authoritative counts happen at report time
            },
          })
          .returning();

        // Flagship: mark as in_mission + detach from planet (so cascade on planet doesn't apply via planet_id)
        if (flagshipIncluded) {
          await tx
            .update(flagships)
            .set({ status: 'in_mission', planetId: null, updatedAt: new Date() })
            .where(eq(flagships.userId, userId));
        }

        // Debris field for overflow minerai + silicium
        if (overflow.minerai > 0 || overflow.silicium > 0) {
          await tx.execute(sql`
            INSERT INTO debris_fields (galaxy, system, position, minerai, silicium, updated_at)
            VALUES (
              ${planet.galaxy}, ${planet.system}, ${planet.position},
              ${String(overflow.minerai)}, ${String(overflow.silicium)}, now()
            )
            ON CONFLICT (galaxy, system, position)
            DO UPDATE SET
              minerai = debris_fields.minerai + EXCLUDED.minerai,
              silicium = debris_fields.silicium + EXCLUDED.silicium,
              updated_at = now()
          `);
        }

        // Delete the planet (cascade cleans planet_ships, planet_buildings, planet_defenses,
        // planet_biomes, colonization_processes, build_queue, etc.)
        await tx.delete(planets).where(eq(planets.id, planet.id));

        return { eventId: event.id, arrivalTime, duration };
      });

      // Schedule arrival (outside the transaction)
      const delayMs = Math.max(0, jobData.arrivalTime.getTime() - Date.now());
      await fleetQueue.add('arrive', { fleetEventId: jobData.eventId }, { delay: delayMs });

      await publishNotification(redis, userId, {
        type: 'empire_updated',
      });

      return { fleetEventId: jobData.eventId, arrivalTime: jobData.arrivalTime };
    },
  };
}
```

- [ ] **Step 6.4: Verify service typechecks**

Run: `pnpm --filter @exilium/api typecheck`
Expected: 0 errors in `planet-abandon.service.ts`.

- [ ] **Step 6.5: Commit**

```bash
git add apps/api/src/modules/planet/planet-abandon.service.ts
git commit -m "feat(api): PlanetAbandonService preview + abandon mutation"
git push
```

---

## Task 7: tRPC endpoints

**Files:**
- Modify: `apps/api/src/modules/planet/planet.router.ts`
- Modify: `apps/api/src/trpc/context.ts` (or wherever the planet router is constructed)

- [ ] **Step 7.1: Extend the router signature and add endpoints**

Replace `apps/api/src/modules/planet/planet.router.ts` with:

```typescript
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createPlanetService } from './planet.service.js';
import type { createPlanetAbandonService } from './planet-abandon.service.js';

export function createPlanetRouter(
  planetService: ReturnType<typeof createPlanetService>,
  abandonService: ReturnType<typeof createPlanetAbandonService>,
) {
  return router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return planetService.listPlanets(ctx.userId!);
    }),

    get: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return planetService.getPlanet(ctx.userId!, input.planetId);
      }),

    rename: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        name: z.string().min(1).max(30),
      }))
      .mutation(async ({ ctx, input }) => {
        return planetService.rename(ctx.userId!, input.planetId, input.name);
      }),

    reorder: protectedProcedure
      .input(z.object({
        order: z.array(z.object({
          planetId: z.string().uuid(),
          sortOrder: z.number().int().min(0),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return planetService.reorderPlanets(ctx.userId!, input.order);
      }),

    empire: protectedProcedure.query(async ({ ctx }) => {
      return planetService.getEmpireOverview(ctx.userId!);
    }),

    abandonPreview: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        destinationPlanetId: z.string().uuid(),
      }))
      .query(async ({ ctx, input }) => {
        return abandonService.preview(ctx.userId!, input.planetId, input.destinationPlanetId);
      }),

    abandon: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        destinationPlanetId: z.string().uuid(),
      }))
      .mutation(async ({ ctx, input }) => {
        return abandonService.abandon(ctx.userId!, input.planetId, input.destinationPlanetId);
      }),
  });
}
```

- [ ] **Step 7.2: Wire the service at context construction**

Find where `createPlanetRouter` is called. Search: `grep -rn "createPlanetRouter" apps/api/src`.

Add next to the existing `planetService` instantiation:

```typescript
import { createPlanetAbandonService } from '../modules/planet/planet-abandon.service.js';
// ...
const planetAbandonService = createPlanetAbandonService(
  db,
  gameConfigService,
  reportService,
  fleetQueue,
  redis,
);
// ...
planet: createPlanetRouter(planetService, planetAbandonService),
```

- [ ] **Step 7.3: Typecheck**

Run: `pnpm --filter @exilium/api typecheck`
Expected: no errors.

- [ ] **Step 7.4: Commit**

```bash
git add apps/api/src/modules/planet/planet.router.ts apps/api/src/trpc/context.ts
git commit -m "feat(api): expose planet.abandonPreview + planet.abandon endpoints"
git push
```

---

## Task 8: `AbandonReturnHandler` (TDD at handler level)

**Files:**
- Create: `apps/api/src/modules/fleet/handlers/abandon-return.handler.ts`
- Modify: `apps/api/src/modules/fleet/fleet.service.ts`

- [ ] **Step 8.1: Write the handler**

Create `apps/api/src/modules/fleet/handlers/abandon-return.handler.ts`:

```typescript
import { eq, sql } from 'drizzle-orm';
import { planets, planetShips } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';
import { totalCargoCapacity } from '@exilium/game-engine';

export class AbandonReturnHandler implements MissionHandler {
  async validateFleet(_input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    // Never created from the UI — no validation.
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);
    const ships = fleetEvent.ships;
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);

    const metadata = (fleetEvent.metadata ?? {}) as {
      abandonedPlanet?: { name: string; galaxy: number; system: number; position: number };
      overflow?: { minerai: number; silicium: number; hydrogene: number };
    };

    const createReport = async (title: string, result: Record<string, unknown>) => {
      if (!ctx.reportService) return undefined;
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'abandon_return',
        title,
        coordinates: {
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
        },
        originCoordinates: metadata.abandonedPlanet ? {
          galaxy: metadata.abandonedPlanet.galaxy,
          system: metadata.abandonedPlanet.system,
          position: metadata.abandonedPlanet.position,
          planetName: metadata.abandonedPlanet.name,
        } : undefined,
        fleet: { ships, totalCargo: totalCargoCapacity(ships, shipStatsMap) },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result,
      });
      return report.id;
    };

    const [target] = fleetEvent.targetPlanetId
      ? await ctx.db.select().from(planets).where(eq(planets.id, fleetEvent.targetPlanetId)).limit(1)
      : [];

    if (!target) {
      // Destination also gone — resources+ships lost (documented edge case).
      const reportId = await createReport(
        `Retour d'abandon échoué`,
        { aborted: true, reason: 'no_destination', shipsLost: ships, cargoLost: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo } },
      );
      return { scheduleReturn: false, reportId };
    }

    // Deposit cargo on destination
    await ctx.db
      .update(planets)
      .set({
        minerai: String(Number(target.minerai) + mineraiCargo),
        silicium: String(Number(target.silicium) + siliciumCargo),
        hydrogene: String(Number(target.hydrogene) + hydrogeneCargo),
      })
      .where(eq(planets.id, target.id));

    // Merge ships into destination planet_ships (skip flagship)
    const nonFlagshipShips = Object.fromEntries(
      Object.entries(ships).filter(([k]) => k !== 'flagship'),
    );
    if (Object.keys(nonFlagshipShips).length > 0) {
      const shipUpdates: Record<string, any> = {};
      for (const [shipId, count] of Object.entries(nonFlagshipShips)) {
        const col = planetShips[shipId as keyof typeof planetShips];
        if (!col) continue;
        shipUpdates[shipId] = sql`${col} + ${count}`;
      }
      if (Object.keys(shipUpdates).length > 0) {
        await ctx.db
          .insert(planetShips)
          .values({ planetId: target.id, ...nonFlagshipShips })
          .onConflictDoUpdate({
            target: planetShips.planetId,
            set: shipUpdates,
          });
      }
    }

    // Re-station the flagship if it was part of the return fleet
    if (ships['flagship'] && ships['flagship'] > 0 && ctx.flagshipService) {
      await ctx.flagshipService.returnFromMission(fleetEvent.userId, target.id);
    }

    const reportId = await createReport(
      `Abandon de ${metadata.abandonedPlanet?.name ?? 'colonie'} terminé`,
      {
        destination: {
          id: target.id,
          name: target.name,
          galaxy: target.galaxy,
          system: target.system,
          position: target.position,
        },
        delivered: {
          ships,
          cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        },
        overflow: metadata.overflow ?? null,
      },
    );

    return { scheduleReturn: false, reportId };
  }
}
```

- [ ] **Step 8.2: Register the handler**

In `apps/api/src/modules/fleet/fleet.service.ts`, add the import near the other handler imports:

```typescript
import { AbandonReturnHandler } from './handlers/abandon-return.handler.js';
```

And add the entry inside the `handlers` record (around line 56):

```typescript
  abandon_return: new AbandonReturnHandler(),
```

- [ ] **Step 8.3: Typecheck + run existing fleet tests**

Run: `pnpm --filter @exilium/api test fleet`
Expected: all existing tests pass.

- [ ] **Step 8.4: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/abandon-return.handler.ts apps/api/src/modules/fleet/fleet.service.ts
git commit -m "feat(api): AbandonReturnHandler delivers ships+cargo on arrival"
git push
```

---

## Task 9: End-to-end integration test

**Files:**
- Modify: `apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts` (append)

- [ ] **Step 9.1: Write the integration test**

Append a new `describe` block that uses the real test database harness used by other services (`apps/api/src/test/test-db.ts` or equivalent — match the pattern used in `colonization.service.test.ts`). The test must:

```typescript
describe('planet-abandon integration (real DB)', () => {
  it('abandons a colony end-to-end', async () => {
    // Arrange: seed user with homeworld + one colony + 5 transports on the colony
    //          + 1000 minerai / 500 silicium / 100 hydrogene on the colony.
    // Act 1: call service.preview(user, colonyId, homeworldId)
    // Assert: blockers=[]; loaded/overflow consistent with cargo capacity.
    // Act 2: call service.abandon(user, colonyId, homeworldId)
    // Assert 1: planets row for the colony is deleted.
    // Assert 2: fleet_events has exactly one row with mission='abandon_return',
    //           origin_planet_id IS NULL (because the planet was deleted and
    //           the FK is SET NULL), target_planet_id = homeworld.
    // Assert 3: debris_fields has a row at the colony coords with overflow > 0.
    // Act 3: manually invoke AbandonReturnHandler.processArrival on the event.
    // Assert 4: destination planet resources incremented, planet_ships merged,
    //           event result report created with mission_type='abandon_return'.
  });

  it('blocks when there is an inbound hostile fleet', async () => {
    // Seed an active attack fleet_event targeting the colony.
    // Expect service.abandon() to throw TRPCError code BAD_REQUEST with
    // message containing "inbound_hostile".
  });

  it('blocks when there is an active market offer on the colony', async () => {
    // Seed market_offers row with status='active' and planetId=colonyId.
    // Expect service.abandon() to throw "market_offers".
  });

  it('flagship on colony is moved to in_mission then re-stationed at destination on arrival', async () => {
    // Seed flagships row with planetId=colonyId, status='active'.
    // After abandon: flagships.status='in_mission', planetId=null.
    // After processArrival: flagships.status='active', planetId=destinationId.
  });
});
```

Keep the test literal — copy the setup helpers from `colonization.service.test.ts` (look for `setupTestDb`, `seedUser`, etc.).

- [ ] **Step 9.2: Run integration tests**

Run: `pnpm --filter @exilium/api test planet-abandon.service.test`
Expected: PASS.

- [ ] **Step 9.3: Commit**

```bash
git add apps/api/src/modules/planet/__tests__/planet-abandon.service.test.ts
git commit -m "test(api): integration coverage for colony abandonment"
git push
```

---

## Task 10: Frontend — `AbandonColonyModal`

**Files:**
- Create: `apps/web/src/components/empire/AbandonColonyModal.tsx`
- Modify: `apps/web/src/pages/Empire.tsx`

- [ ] **Step 10.1: Implement the modal**

Create `apps/web/src/components/empire/AbandonColonyModal.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Planet = {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  status: string;
  planetClassId: string | null;
};

const BLOCKER_LABELS: Record<string, string> = {
  homeworld: 'La planète-mère ne peut pas être abandonnée.',
  colonizing: 'Une colonisation est en cours — elle doit s\'achever ou être annulée.',
  inbound_hostile: 'Une flotte hostile est en route vers cette planète.',
  outbound_active: 'Cette planète a une flotte en mission.',
  market_offers: 'Des offres marché actives partent de cette planète.',
  destination_invalid: 'Destination invalide.',
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function AbandonColonyModal({
  planet,
  allPlanets,
  open,
  onOpenChange,
}: {
  planet: Planet;
  allPlanets: Planet[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const destinations = useMemo(
    () => allPlanets.filter(p => p.id !== planet.id && p.status === 'active'),
    [allPlanets, planet.id],
  );

  const preview = trpc.planet.abandonPreview.useQuery(
    { planetId: planet.id, destinationPlanetId: destinationId! },
    { enabled: !!destinationId && step === 2 },
  );

  const utils = trpc.useUtils();
  const abandonMutation = trpc.planet.abandon.useMutation({
    onSuccess: () => {
      utils.planet.empire.invalidate();
      utils.planet.list.invalidate();
      utils.colonization.governance.invalidate();
      utils.report.list.invalidate();
      utils.report.unreadCount.invalidate();
      onOpenChange(false);
    },
  });

  const handleClose = () => {
    setStep(1);
    setDestinationId(null);
    setConfirmed(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? `Abandonner ${planet.name} — destination` : `Abandonner ${planet.name} — résumé`}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sélectionnez la planète de destination pour la flotte de retour.
            </p>
            {destinations.length === 0 ? (
              <Alert><AlertDescription>Aucune autre colonie active.</AlertDescription></Alert>
            ) : (
              <RadioGroup value={destinationId ?? ''} onValueChange={setDestinationId}>
                {destinations.map(p => (
                  <label key={p.id} className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent">
                    <RadioGroupItem value={p.id} />
                    <div className="flex-1">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">[{p.galaxy}:{p.system}:{p.position}]</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>Annuler</Button>
              <Button disabled={!destinationId} onClick={() => setStep(2)}>Suivant</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {preview.isLoading && <div>Calcul en cours…</div>}
            {preview.data && (
              <>
                {preview.data.blockers.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <div className="font-semibold mb-2">Abandon impossible :</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {preview.data.blockers.map(b => (
                          <li key={b}>{BLOCKER_LABELS[b] ?? b}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <section>
                      <h3 className="font-semibold mb-1">Sauvé</h3>
                      <ul className="text-sm space-y-0.5">
                        {Object.entries(preview.data.ships).map(([ship, count]) => (
                          <li key={ship}>{count}× {ship}{ship === 'flagship' ? ' (vaisseau amiral inclus)' : ''}</li>
                        ))}
                        <li>Minerai chargé : {preview.data.loaded.minerai.toLocaleString('fr-FR')}</li>
                        <li>Silicium chargé : {preview.data.loaded.silicium.toLocaleString('fr-FR')}</li>
                        <li>Hydrogène chargé : {preview.data.loaded.hydrogene.toLocaleString('fr-FR')}</li>
                        <li>Arrivée : {new Date(preview.data.arrivalTime).toLocaleString('fr-FR')} ({formatDuration(preview.data.travelSeconds)})</li>
                      </ul>
                    </section>
                    <section>
                      <h3 className="font-semibold mb-1">Champ de débris</h3>
                      <ul className="text-sm space-y-0.5">
                        <li>Minerai : {preview.data.overflow.minerai.toLocaleString('fr-FR')}</li>
                        <li>Silicium : {preview.data.overflow.silicium.toLocaleString('fr-FR')}</li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-1">
                        Un recycleur peut les récupérer — y compris les vôtres.
                      </p>
                    </section>
                    <section>
                      <h3 className="font-semibold mb-1">Perdu définitivement</h3>
                      <ul className="text-sm space-y-0.5">
                        <li>{preview.data.buildingsLost} niveau(x) de bâtiments</li>
                        <li>{preview.data.defensesLost} défense(s)</li>
                        <li>{preview.data.queuesLost} élément(s) en file de construction</li>
                        <li>{preview.data.overflow.hydrogene.toLocaleString('fr-FR')} hydrogène (non récupérable)</li>
                      </ul>
                    </section>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
                      J'ai compris ce que je vais perdre.
                    </label>
                  </>
                )}
              </>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(1)}>Retour</Button>
              <Button
                variant="destructive"
                disabled={!preview.data || preview.data.blockers.length > 0 || !confirmed || abandonMutation.isPending}
                onClick={() => abandonMutation.mutate({ planetId: planet.id, destinationPlanetId: destinationId! })}
              >
                Abandonner définitivement
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 10.2: Wire the modal into Empire page**

Read `apps/web/src/pages/Empire.tsx` to find the planet card component. Add a "⋯" dropdown on each card (hidden when `planetClassId === 'homeworld'` or `status === 'colonizing'`). One menu item "Abandonner la colonie" opens `AbandonColonyModal`, passing the planet and the full list of active non-homeworld planets.

Example snippet to add inside the card:

```tsx
import { AbandonColonyModal } from '@/components/empire/AbandonColonyModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
// ...
const [abandonOpen, setAbandonOpen] = useState(false);
const canAbandon = planet.planetClassId !== 'homeworld' && planet.status === 'active';

{canAbandon && (
  <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actions">⋯</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => setAbandonOpen(true)}>
          Abandonner la colonie
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AbandonColonyModal
      planet={planet}
      allPlanets={empire.planets}
      open={abandonOpen}
      onOpenChange={setAbandonOpen}
    />
  </>
)}
```

- [ ] **Step 10.3: Smoke-test in browser**

Run: `pnpm --filter @exilium/web dev`
Open: http://localhost:5173/empire
Verify: "⋯" menu absent on homeworld, present on a colony. Open modal, pick destination, confirm summary contents match backend data.

- [ ] **Step 10.4: Commit**

```bash
git add apps/web/src/components/empire/AbandonColonyModal.tsx apps/web/src/pages/Empire.tsx
git commit -m "feat(web): abandon colony modal + empire menu entry"
git push
```

---

## Task 11: Abandon report detail

**Files:**
- Create: `apps/web/src/components/reports/AbandonReportDetail.tsx`
- Modify: `apps/web/src/pages/ReportDetail.tsx`

- [ ] **Step 11.1: Create the report detail component**

Create `apps/web/src/components/reports/AbandonReportDetail.tsx`:

```tsx
import { CoordsLink } from '@/components/common/CoordsLink';
import { getShipName } from '@/lib/entity-names';

export function AbandonReportDetail({
  result,
  gameConfig,
}: {
  result: any;
  gameConfig: any;
}) {
  if (result.aborted) {
    return (
      <div className="glass-card p-4 border border-red-500/20">
        <h3 className="font-semibold text-red-400">Retour échoué</h3>
        <p className="text-sm text-muted-foreground mt-1">
          La planète de destination n'existe plus. Ships et ressources perdus.
        </p>
      </div>
    );
  }
  const { destination, delivered, overflow } = result;
  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Arrivée sur <CoordsLink galaxy={destination.galaxy} system={destination.system} position={destination.position} />
        </h3>
        <div className="text-sm space-y-1">
          <div>Destination : {destination.name}</div>
          {delivered.cargo && (
            <>
              <div>Minerai livré : {Number(delivered.cargo.minerai).toLocaleString('fr-FR')}</div>
              <div>Silicium livré : {Number(delivered.cargo.silicium).toLocaleString('fr-FR')}</div>
              <div>Hydrogène livré : {Number(delivered.cargo.hydrogene).toLocaleString('fr-FR')}</div>
            </>
          )}
        </div>
      </div>
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ships arrivés</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(delivered.ships ?? {}).map(([ship, count]: [string, any]) => (
            <span key={ship} className="text-sm">
              <span className="font-medium">{count}x</span>{' '}
              <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
            </span>
          ))}
        </div>
      </div>
      {overflow && (overflow.minerai > 0 || overflow.silicium > 0) && (
        <div className="glass-card p-4 border border-amber-500/20">
          <h3 className="text-sm font-semibold text-amber-300 mb-2">Champ de débris laissé</h3>
          <div className="text-sm space-y-1">
            <div>Minerai : {Number(overflow.minerai).toLocaleString('fr-FR')}</div>
            <div>Silicium : {Number(overflow.silicium).toLocaleString('fr-FR')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11.2: Wire into `ReportDetail`**

In `apps/web/src/pages/ReportDetail.tsx`:

Add the import at the top with the other report detail imports:

```tsx
import { AbandonReportDetail } from '@/components/reports/AbandonReportDetail';
```

Add a branch with the other `{report.missionType === '...' && ...}` blocks:

```tsx
{report.missionType === 'abandon_return' && (
  <AbandonReportDetail result={result} gameConfig={gameConfig} />
)}
```

- [ ] **Step 11.3: Smoke-test**

Run the full flow in the browser: abandon a colony → wait for fleet to arrive → open the generated report.
Expected: report shows destination, ships delivered, cargo delivered, debris if any.

- [ ] **Step 11.4: Commit**

```bash
git add apps/web/src/components/reports/AbandonReportDetail.tsx apps/web/src/pages/ReportDetail.tsx
git commit -m "feat(web): abandon_return report detail"
git push
```

---

## Task 12: End-to-end verification

- [ ] **Step 12.1: Run the full test suite**

Run: `pnpm test`
Expected: all unit + integration tests pass.

- [ ] **Step 12.2: Manual E2E scenario**

1. Log in with a test account with 2+ colonies and one flagship.
2. Stock the secondary colony with 5k minerai / 5k silicium / 5k hydrogène and 3 transports.
3. Open Empire → "⋯" on the secondary colony → "Abandonner la colonie".
4. Pick the homeworld as destination → verify preview shows expected loaded/overflow/lost numbers.
5. Confirm.
6. Observe: toast shown, colony card disappears from Empire, a new `abandon_return` fleet appears in Fleets.
7. Open the debris-fields overlay at the abandoned coords → overflow minerai+silicium should be there.
8. Wait for arrival (or advance time via dev tools).
9. Observe: report with title `Abandon de <name> terminé`; destination planet resources incremented; ships merged; flagship re-stationed at destination.
10. Check `colonization.governance` colonyCount decremented by 1.

- [ ] **Step 12.3: Close the loop**

If any step fails, return to Phase 1 of systematic-debugging. Do not attempt fixes without root cause.

---

## Deployment checklist

- [ ] Migration `0049_abandon_colony.sql` applied on staging + prod.
- [ ] Game config re-seed executed so `abandon_return` exists in `mission_definitions`.
- [ ] API restarted so the new handler is registered.
- [ ] Web deploy includes the new modal + report detail.
- [ ] Changelog / release note mentions "Abandonner une colonie".
