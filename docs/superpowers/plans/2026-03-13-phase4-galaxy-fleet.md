# Phase 4 : Vue Galaxie + Flotte — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter la vue galaxie (9×499×15) et le système de flottes (envoi, trajet, missions transport/stationner/rappel), sans le combat (Phase 5).

**Architecture:** La vue galaxie requiert un endpoint qui query les planètes d'un système (galaxy+system → 15 slots). Le système de flottes utilise une table `fleet_events` avec des jobs BullMQ delayed pour l'arrivée et le retour. Le game-engine calcule les vitesses de flotte, le temps de trajet et la consommation de deutérium. Les missions MVP Phase 4 sont : Transport, Stationner, Espionner (envoi seulement, sans résultat), et Rappel. L'attaque et la colonisation sont Phase 5.

**Tech Stack:** game-engine (constantes combat unitaires + formules fleet), Drizzle ORM (fleet_events), BullMQ (fleet-arrival, fleet-return workers), tRPC (galaxy + fleet routers), React (Galaxy page, Fleet wizard, Movements page)

---

## File Structure

### game-engine (constantes + formules)

| File | Responsabilité |
|------|---------------|
| `packages/game-engine/src/constants/ship-stats.ts` | Stats de combat/vitesse/fret par vaisseau (baseSpeed, fuelConsumption, cargoCapacity) |
| `packages/game-engine/src/formulas/fleet.ts` | `fleetSpeed()`, `travelTime()`, `fuelConsumption()`, `totalCargoCapacity()` |
| `packages/game-engine/src/formulas/fleet.test.ts` | Tests fleet formulas |

### db (nouveau schema)

| File | Responsabilité |
|------|---------------|
| `packages/db/src/schema/fleet-events.ts` | Table `fleet_events` (missions, phases, cargo, ships JSONB) |

### api (modules galaxy + fleet)

| File | Responsabilité |
|------|---------------|
| `apps/api/src/modules/galaxy/galaxy.service.ts` | getSystem(galaxy, system) → 15 slots avec joueurs |
| `apps/api/src/modules/galaxy/galaxy.router.ts` | tRPC router galaxy (system query) |
| `apps/api/src/modules/fleet/fleet.service.ts` | sendFleet, recallFleet, listMovements, processArrival, processReturn |
| `apps/api/src/modules/fleet/fleet.router.ts` | tRPC router fleet (send, recall, movements) |
| `apps/api/src/workers/fleet-arrival.worker.ts` | Worker arrivée flotte (transport, stationner) |
| `apps/api/src/workers/fleet-return.worker.ts` | Worker retour flotte |

### web (pages frontend)

| File | Responsabilité |
|------|---------------|
| `apps/web/src/pages/Galaxy.tsx` | Vue galaxie (table 15 slots, navigation galaxy/system) |
| `apps/web/src/pages/Fleet.tsx` | Wizard 3 étapes : sélection vaisseaux → coordonnées + mission → confirmation |
| `apps/web/src/pages/Movements.tsx` | Liste des mouvements de flotte en cours avec timers |

---

## Chunk 1: Game Engine — Stats vaisseaux + Formules flotte

### Task 1: Constantes stats vaisseaux

**Files:**
- Create: `packages/game-engine/src/constants/ship-stats.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// packages/game-engine/src/constants/ship-stats.ts
import type { ShipId } from './ships.js';

export interface ShipStats {
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
  /** Which drive tech this ship uses: 'combustion' | 'impulse' | 'hyperspaceDrive' */
  driveType: 'combustion' | 'impulse' | 'hyperspaceDrive';
}

/**
 * Base stats per ship type (OGame classic values).
 * Speed is base speed at drive tech level 0.
 * Fuel consumption is base deuterium per unit for travel.
 */
export const SHIP_STATS: Record<ShipId, ShipStats> = {
  smallCargo: {
    baseSpeed: 5000,
    fuelConsumption: 10,
    cargoCapacity: 5000,
    driveType: 'combustion',
  },
  largeCargo: {
    baseSpeed: 7500,
    fuelConsumption: 50,
    cargoCapacity: 25000,
    driveType: 'combustion',
  },
  lightFighter: {
    baseSpeed: 12500,
    fuelConsumption: 20,
    cargoCapacity: 50,
    driveType: 'combustion',
  },
  heavyFighter: {
    baseSpeed: 10000,
    fuelConsumption: 75,
    cargoCapacity: 100,
    driveType: 'impulse',
  },
  cruiser: {
    baseSpeed: 15000,
    fuelConsumption: 300,
    cargoCapacity: 800,
    driveType: 'impulse',
  },
  battleship: {
    baseSpeed: 10000,
    fuelConsumption: 500,
    cargoCapacity: 1500,
    driveType: 'hyperspaceDrive',
  },
  espionageProbe: {
    baseSpeed: 100000000,
    fuelConsumption: 1,
    cargoCapacity: 0,
    driveType: 'combustion',
  },
  colonyShip: {
    baseSpeed: 2500,
    fuelConsumption: 1000,
    cargoCapacity: 7500,
    driveType: 'impulse',
  },
  recycler: {
    baseSpeed: 2000,
    fuelConsumption: 300,
    cargoCapacity: 20000,
    driveType: 'combustion',
  },
};
```

- [ ] **Step 2: Exporter depuis l'index**

Ajouter dans `packages/game-engine/src/index.ts` :
```typescript
export * from './constants/ship-stats.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/src/constants/ship-stats.ts packages/game-engine/src/index.ts
git commit -m "feat(game-engine): add ship stats constants (speed, fuel, cargo)"
```

---

### Task 2: Formules fleet (vitesse, trajet, consommation deut)

**Files:**
- Create: `packages/game-engine/src/formulas/fleet.test.ts`
- Create: `packages/game-engine/src/formulas/fleet.ts`

- [ ] **Step 1: Écrire les tests**

```typescript
// packages/game-engine/src/formulas/fleet.test.ts
import { describe, it, expect } from 'vitest';
import { shipSpeed, fleetSpeed, travelTime, fuelConsumption, totalCargoCapacity } from './fleet.js';

describe('shipSpeed', () => {
  it('small cargo with combustion 0 = 5000', () => {
    expect(shipSpeed('smallCargo', { combustion: 0, impulse: 0, hyperspaceDrive: 0 })).toBe(5000);
  });

  it('small cargo with combustion 5 = 5000 * (1 + 0.1*5) = 7500', () => {
    expect(shipSpeed('smallCargo', { combustion: 5, impulse: 0, hyperspaceDrive: 0 })).toBe(7500);
  });

  it('cruiser with impulse 4 = 15000 * (1 + 0.2*4) = 27000', () => {
    expect(shipSpeed('cruiser', { combustion: 0, impulse: 4, hyperspaceDrive: 0 })).toBe(27000);
  });

  it('battleship with hyperspace 3 = 10000 * (1 + 0.3*3) = 19000', () => {
    expect(shipSpeed('battleship', { combustion: 0, impulse: 0, hyperspaceDrive: 3 })).toBe(19000);
  });
});

describe('fleetSpeed', () => {
  it('fleet speed is the minimum of all ships', () => {
    const ships = { smallCargo: 5, cruiser: 2 } as Record<string, number>;
    const techs = { combustion: 5, impulse: 4, hyperspaceDrive: 0 };
    // smallCargo: 7500, cruiser: 27000 → min = 7500
    expect(fleetSpeed(ships, techs)).toBe(7500);
  });

  it('single ship fleet', () => {
    const ships = { lightFighter: 10 } as Record<string, number>;
    const techs = { combustion: 3, impulse: 0, hyperspaceDrive: 0 };
    // 12500 * (1 + 0.1*3) = 16250
    expect(fleetSpeed(ships, techs)).toBe(16250);
  });
});

describe('travelTime', () => {
  it('same system different position = galaxy distance', () => {
    const origin = { galaxy: 1, system: 100, position: 4 };
    const target = { galaxy: 1, system: 100, position: 8 };
    const speed = 10000;
    const universeSpeed = 1;
    // distance = 1000 + 5 * abs(4-8) = 1020
    // time = round(10 + 35000 / speed * sqrt(distance * 10 / universeSpeed))
    const time = travelTime(origin, target, speed, universeSpeed);
    expect(time).toBeGreaterThan(0);
    expect(typeof time).toBe('number');
  });

  it('different systems same galaxy', () => {
    const origin = { galaxy: 1, system: 100, position: 4 };
    const target = { galaxy: 1, system: 200, position: 4 };
    const speed = 10000;
    const universeSpeed = 1;
    // distance = 2700 + 95 * abs(100-200) = 12200
    const time = travelTime(origin, target, speed, universeSpeed);
    expect(time).toBeGreaterThan(0);
  });

  it('different galaxies', () => {
    const origin = { galaxy: 1, system: 100, position: 4 };
    const target = { galaxy: 3, system: 200, position: 8 };
    const speed = 10000;
    const universeSpeed = 1;
    // distance = 20000 * abs(1-3) = 40000
    const time = travelTime(origin, target, speed, universeSpeed);
    expect(time).toBeGreaterThan(0);
  });

  it('higher universe speed = faster', () => {
    const origin = { galaxy: 1, system: 100, position: 4 };
    const target = { galaxy: 1, system: 200, position: 4 };
    const speed = 10000;
    const t1 = travelTime(origin, target, speed, 1);
    const t2 = travelTime(origin, target, speed, 2);
    expect(t2).toBeLessThan(t1);
  });
});

describe('fuelConsumption', () => {
  it('calculates total fuel for a fleet', () => {
    const ships = { smallCargo: 10 } as Record<string, number>;
    const distance = 12200;
    const duration = 3600;
    const fuel = fuelConsumption(ships, distance, duration);
    expect(fuel).toBeGreaterThan(0);
    expect(typeof fuel).toBe('number');
  });
});

describe('totalCargoCapacity', () => {
  it('small cargos have 5000 each', () => {
    const ships = { smallCargo: 10 } as Record<string, number>;
    expect(totalCargoCapacity(ships)).toBe(50000);
  });

  it('mixed fleet', () => {
    const ships = { smallCargo: 5, largeCargo: 2 } as Record<string, number>;
    // 5*5000 + 2*25000 = 75000
    expect(totalCargoCapacity(ships)).toBe(75000);
  });

  it('empty fleet = 0', () => {
    expect(totalCargoCapacity({})).toBe(0);
  });
});
```

- [ ] **Step 2: Lancer les tests — vérifier qu'ils échouent**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH" && cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```
Expected: FAIL — `fleet.js` not found

- [ ] **Step 3: Implémenter**

```typescript
// packages/game-engine/src/formulas/fleet.ts
import { SHIP_STATS } from '../constants/ship-stats.js';
import type { ShipId } from '../constants/ships.js';

interface DriveTechs {
  combustion: number;
  impulse: number;
  hyperspaceDrive: number;
}

interface Coordinates {
  galaxy: number;
  system: number;
  position: number;
}

/** Speed bonus multiplier per drive type per tech level */
const DRIVE_BONUS: Record<string, number> = {
  combustion: 0.1,
  impulse: 0.2,
  hyperspaceDrive: 0.3,
};

/**
 * Speed of a single ship type given drive tech levels.
 * Formula: baseSpeed * (1 + bonus * techLevel)
 */
export function shipSpeed(shipId: ShipId, techs: DriveTechs): number {
  const stats = SHIP_STATS[shipId];
  const techLevel = techs[stats.driveType];
  const bonus = DRIVE_BONUS[stats.driveType];
  return Math.floor(stats.baseSpeed * (1 + bonus * techLevel));
}

/**
 * Fleet speed = minimum speed of all ships in the fleet.
 */
export function fleetSpeed(ships: Record<string, number>, techs: DriveTechs): number {
  let minSpeed = Infinity;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const speed = shipSpeed(shipId as ShipId, techs);
      if (speed < minSpeed) minSpeed = speed;
    }
  }
  return minSpeed === Infinity ? 0 : minSpeed;
}

/**
 * Distance between two coordinates.
 * OGame formula:
 * - Same position: 5
 * - Same system, different position: 1000 + 5 * |p1 - p2|
 * - Same galaxy, different system: 2700 + 95 * |s1 - s2|
 * - Different galaxy: 20000 * |g1 - g2|
 */
export function distance(origin: Coordinates, target: Coordinates): number {
  if (origin.galaxy !== target.galaxy) {
    return 20000 * Math.abs(origin.galaxy - target.galaxy);
  }
  if (origin.system !== target.system) {
    return 2700 + 95 * Math.abs(origin.system - target.system);
  }
  if (origin.position !== target.position) {
    return 1000 + 5 * Math.abs(origin.position - target.position);
  }
  return 5;
}

/**
 * Travel time in seconds.
 * Formula: round(10 + 35000 / speed * sqrt(distance * 10 / universeSpeed))
 */
export function travelTime(
  origin: Coordinates,
  target: Coordinates,
  speed: number,
  universeSpeed: number,
): number {
  const dist = distance(origin, target);
  return Math.round(10 + (35000 / speed) * Math.sqrt((dist * 10) / universeSpeed));
}

/**
 * Total deuterium fuel consumption for a fleet traveling a given distance.
 * Formula per ship type: baseFuel * count * (distance / 35000) * (duration + 10) / (duration - 10)
 * (Simplified OGame approximation, minimum 1)
 */
export function fuelConsumption(
  ships: Record<string, number>,
  dist: number,
  duration: number,
): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = SHIP_STATS[shipId as ShipId];
      if (!stats) continue;
      const consumption = stats.fuelConsumption * count * (dist / 35000) * ((duration + 10) / (duration - 10));
      total += Math.max(1, Math.round(consumption));
    }
  }
  return Math.max(1, Math.ceil(total));
}

/**
 * Total cargo capacity of a fleet.
 */
export function totalCargoCapacity(ships: Record<string, number>): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = SHIP_STATS[shipId as ShipId];
      if (stats) total += stats.cargoCapacity * count;
    }
  }
  return total;
}
```

- [ ] **Step 4: Exporter depuis l'index**

Ajouter dans `packages/game-engine/src/index.ts` :
```typescript
export * from './formulas/fleet.js';
```

- [ ] **Step 5: Lancer les tests — vérifier que tout passe**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH" && cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/game-engine test -- --run
```
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/formulas/fleet.ts packages/game-engine/src/formulas/fleet.test.ts packages/game-engine/src/index.ts
git commit -m "feat(game-engine): add fleet speed, travel time, fuel consumption formulas with tests"
```

---

## Chunk 2: Schema DB + Module Galaxy

### Task 3: Schema fleet_events

**Files:**
- Create: `packages/db/src/schema/fleet-events.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Créer le schema**

```typescript
// packages/db/src/schema/fleet-events.ts
import { pgTable, uuid, smallint, timestamp, numeric, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets } from './planets.js';

export const fleetMissionEnum = pgEnum('fleet_mission', [
  'transport',
  'station',
  'spy',
  'attack',
  'colonize',
]);

export const fleetPhaseEnum = pgEnum('fleet_phase', ['outbound', 'return']);

export const fleetStatusEnum = pgEnum('fleet_status', ['active', 'completed', 'recalled']);

export const fleetEvents = pgTable('fleet_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  originPlanetId: uuid('origin_planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  targetPlanetId: uuid('target_planet_id').references(() => planets.id, { onDelete: 'set null' }),
  targetGalaxy: smallint('target_galaxy').notNull(),
  targetSystem: smallint('target_system').notNull(),
  targetPosition: smallint('target_position').notNull(),
  mission: fleetMissionEnum('mission').notNull(),
  phase: fleetPhaseEnum('phase').notNull().default('outbound'),
  status: fleetStatusEnum('status').notNull().default('active'),
  departureTime: timestamp('departure_time', { withTimezone: true }).notNull(),
  arrivalTime: timestamp('arrival_time', { withTimezone: true }).notNull(),
  metalCargo: numeric('metal_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  crystalCargo: numeric('crystal_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  deuteriumCargo: numeric('deuterium_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  /** Ships composition as { shipId: count } */
  ships: jsonb('ships').notNull().default('{}'),
}, (table) => [
  index('fleet_events_arrival_idx').on(table.arrivalTime).where('status = \'active\''),
  index('fleet_events_user_idx').on(table.userId),
]);
```

- [ ] **Step 2: Exporter depuis l'index DB**

Ajouter dans `packages/db/src/schema/index.ts` :
```typescript
export * from './fleet-events.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/fleet-events.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add fleet_events schema"
```

---

### Task 4: Module galaxy service + router

**Files:**
- Create: `apps/api/src/modules/galaxy/galaxy.service.ts`
- Create: `apps/api/src/modules/galaxy/galaxy.router.ts`

- [ ] **Step 1: Créer le service galaxy**

```typescript
// apps/api/src/modules/galaxy/galaxy.service.ts
import { eq, and } from 'drizzle-orm';
import { planets, users } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

export function createGalaxyService(db: Database) {
  return {
    async getSystem(galaxy: number, system: number) {
      const systemPlanets = await db
        .select({
          position: planets.position,
          planetId: planets.id,
          planetName: planets.name,
          planetType: planets.planetType,
          userId: planets.userId,
          username: users.username,
        })
        .from(planets)
        .leftJoin(users, eq(users.id, planets.userId))
        .where(and(eq(planets.galaxy, galaxy), eq(planets.system, system)));

      // Build 15-slot array
      const slots: (typeof systemPlanets[number] | null)[] = Array(15).fill(null);
      for (const planet of systemPlanets) {
        slots[planet.position - 1] = planet;
      }

      return { galaxy, system, slots };
    },
  };
}
```

- [ ] **Step 2: Créer le router galaxy**

```typescript
// apps/api/src/modules/galaxy/galaxy.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createGalaxyService } from './galaxy.service.js';

export function createGalaxyRouter(galaxyService: ReturnType<typeof createGalaxyService>) {
  return router({
    system: protectedProcedure
      .input(z.object({
        galaxy: z.number().int().min(1).max(9),
        system: z.number().int().min(1).max(499),
      }))
      .query(async ({ input }) => {
        return galaxyService.getSystem(input.galaxy, input.system);
      }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/galaxy/
git commit -m "feat(api): add galaxy service and router"
```

---

## Chunk 3: Module Fleet (service + router + workers)

### Task 5: Fleet service

**Files:**
- Create: `apps/api/src/modules/fleet/fleet.service.ts`

- [ ] **Step 1: Implémenter**

```typescript
// apps/api/src/modules/fleet/fleet.service.ts
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips, fleetEvents, userResearch } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import {
  fleetSpeed,
  travelTime,
  distance,
  fuelConsumption,
  totalCargoCapacity,
  type ShipId,
  SHIP_STATS,
} from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { Queue } from 'bullmq';

interface SendFleetInput {
  originPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  mission: 'transport' | 'station' | 'spy' | 'attack' | 'colonize';
  ships: Record<string, number>;
  metalCargo?: number;
  crystalCargo?: number;
  deuteriumCargo?: number;
}

export function createFleetService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  fleetArrivalQueue: Queue,
  fleetReturnQueue: Queue,
  universeSpeed: number,
) {
  return {
    async sendFleet(userId: string, input: SendFleetInput) {
      const planet = await this.getOwnedPlanet(userId, input.originPlanetId);

      // Validate ships are available
      const planetShipRow = await this.getOrCreateShips(input.originPlanetId);
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count <= 0) continue;
        const available = (planetShipRow[shipId as keyof typeof planetShipRow] ?? 0) as number;
        if (available < count) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Pas assez de ${shipId} (disponible: ${available}, demandé: ${count})`,
          });
        }
      }

      // Get research levels for speed calculation
      const driveTechs = await this.getDriveTechs(userId);
      const speed = fleetSpeed(input.ships, driveTechs);
      if (speed === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucun vaisseau sélectionné' });
      }

      const origin = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
      const target = { galaxy: input.targetGalaxy, system: input.targetSystem, position: input.targetPosition };
      const dist = distance(origin, target);
      const duration = travelTime(origin, target, speed, universeSpeed);
      const fuel = fuelConsumption(input.ships, dist, duration);

      // Validate cargo doesn't exceed capacity
      const cargo = totalCargoCapacity(input.ships);
      const metalCargo = input.metalCargo ?? 0;
      const crystalCargo = input.crystalCargo ?? 0;
      const deuteriumCargo = input.deuteriumCargo ?? 0;
      const totalCargo = metalCargo + crystalCargo + deuteriumCargo;
      if (totalCargo > cargo) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Capacité de fret dépassée' });
      }

      // Find target planet (may not exist for colonization)
      const [targetPlanet] = await db
        .select()
        .from(planets)
        .where(
          and(
            eq(planets.galaxy, input.targetGalaxy),
            eq(planets.system, input.targetSystem),
            eq(planets.position, input.targetPosition),
          ),
        )
        .limit(1);

      // Spend resources (cargo + fuel)
      const totalDeutCost = deuteriumCargo + fuel;
      await resourceService.spendResources(input.originPlanetId, userId, {
        metal: metalCargo,
        crystal: crystalCargo,
        deuterium: totalDeutCost,
      });

      // Deduct ships from planet
      const shipUpdates: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(input.ships)) {
        if (count > 0) {
          const current = (planetShipRow[shipId as keyof typeof planetShipRow] ?? 0) as number;
          shipUpdates[shipId] = current - count;
        }
      }
      await db
        .update(planetShips)
        .set(shipUpdates)
        .where(eq(planetShips.planetId, input.originPlanetId));

      // Create fleet event
      const now = new Date();
      const arrivalTime = new Date(now.getTime() + duration * 1000);

      const [event] = await db
        .insert(fleetEvents)
        .values({
          userId,
          originPlanetId: input.originPlanetId,
          targetPlanetId: targetPlanet?.id ?? null,
          targetGalaxy: input.targetGalaxy,
          targetSystem: input.targetSystem,
          targetPosition: input.targetPosition,
          mission: input.mission,
          phase: 'outbound',
          status: 'active',
          departureTime: now,
          arrivalTime,
          metalCargo: String(metalCargo),
          crystalCargo: String(crystalCargo),
          deuteriumCargo: String(deuteriumCargo),
          ships: input.ships,
        })
        .returning();

      // Schedule arrival job
      await fleetArrivalQueue.add(
        'arrive',
        { fleetEventId: event.id },
        { delay: duration * 1000, jobId: `fleet-arrive-${event.id}` },
      );

      return {
        event,
        arrivalTime: arrivalTime.toISOString(),
        travelTime: duration,
        fuelConsumed: fuel,
      };
    },

    async recallFleet(userId: string, fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(
          and(
            eq(fleetEvents.id, fleetEventId),
            eq(fleetEvents.userId, userId),
            eq(fleetEvents.status, 'active'),
            eq(fleetEvents.phase, 'outbound'),
          ),
        )
        .limit(1);

      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Flotte non trouvée ou non rappelable' });
      }

      // Calculate return time = time already traveled
      const now = new Date();
      const elapsed = now.getTime() - event.departureTime.getTime();
      const returnTime = new Date(now.getTime() + elapsed);

      // Remove arrival job
      await fleetArrivalQueue.remove(`fleet-arrive-${event.id}`);

      // Update event to return phase
      await db
        .update(fleetEvents)
        .set({
          phase: 'return',
          departureTime: now,
          arrivalTime: returnTime,
        })
        .where(eq(fleetEvents.id, event.id));

      // Schedule return job
      await fleetReturnQueue.add(
        'return',
        { fleetEventId: event.id },
        { delay: elapsed, jobId: `fleet-return-${event.id}` },
      );

      return { recalled: true, returnTime: returnTime.toISOString() };
    },

    async listMovements(userId: string) {
      return db
        .select()
        .from(fleetEvents)
        .where(
          and(
            eq(fleetEvents.userId, userId),
            eq(fleetEvents.status, 'active'),
          ),
        );
    },

    /**
     * Process fleet arrival. Handles transport and station missions.
     * Attack, spy, colonize are handled in Phase 5.
     */
    async processArrival(fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(and(eq(fleetEvents.id, fleetEventId), eq(fleetEvents.status, 'active')))
        .limit(1);

      if (!event) return null;

      const ships = event.ships as Record<string, number>;
      const metalCargo = Number(event.metalCargo);
      const crystalCargo = Number(event.crystalCargo);
      const deuteriumCargo = Number(event.deuteriumCargo);

      if (event.mission === 'transport') {
        // Deposit cargo at target planet
        if (event.targetPlanetId) {
          const [targetPlanet] = await db
            .select()
            .from(planets)
            .where(eq(planets.id, event.targetPlanetId))
            .limit(1);

          if (targetPlanet) {
            await db
              .update(planets)
              .set({
                metal: String(Number(targetPlanet.metal) + metalCargo),
                crystal: String(Number(targetPlanet.crystal) + crystalCargo),
                deuterium: String(Number(targetPlanet.deuterium) + deuteriumCargo),
              })
              .where(eq(planets.id, event.targetPlanetId));
          }
        }

        // Schedule return (empty cargo)
        await this.scheduleReturn(event.id, event.originPlanetId, {
          galaxy: event.targetGalaxy,
          system: event.targetSystem,
          position: event.targetPosition,
        }, ships, 0, 0, 0);

        return { mission: 'transport', delivered: true };
      }

      if (event.mission === 'station') {
        // Deposit ships + cargo at target planet
        if (event.targetPlanetId) {
          // Add cargo
          const [targetPlanet] = await db
            .select()
            .from(planets)
            .where(eq(planets.id, event.targetPlanetId))
            .limit(1);

          if (targetPlanet) {
            await db
              .update(planets)
              .set({
                metal: String(Number(targetPlanet.metal) + metalCargo),
                crystal: String(Number(targetPlanet.crystal) + crystalCargo),
                deuterium: String(Number(targetPlanet.deuterium) + deuteriumCargo),
              })
              .where(eq(planets.id, event.targetPlanetId));

            // Add ships to target planet
            const targetShips = await this.getOrCreateShips(event.targetPlanetId);
            const shipUpdates: Record<string, number> = {};
            for (const [shipId, count] of Object.entries(ships)) {
              if (count > 0) {
                const current = (targetShips[shipId as keyof typeof targetShips] ?? 0) as number;
                shipUpdates[shipId] = current + count;
              }
            }
            await db
              .update(planetShips)
              .set(shipUpdates)
              .where(eq(planetShips.planetId, event.targetPlanetId));
          }
        }

        // Mark completed (no return for station)
        await db
          .update(fleetEvents)
          .set({ status: 'completed' })
          .where(eq(fleetEvents.id, event.id));

        return { mission: 'station', stationed: true };
      }

      // For other missions (attack, spy, colonize) — Phase 5
      // For now, just schedule return with cargo
      await this.scheduleReturn(
        event.id, event.originPlanetId,
        { galaxy: event.targetGalaxy, system: event.targetSystem, position: event.targetPosition },
        ships, metalCargo, crystalCargo, deuteriumCargo,
      );

      return { mission: event.mission, placeholder: true };
    },

    /**
     * Process fleet return. Returns ships + cargo to origin planet.
     */
    async processReturn(fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(
          and(
            eq(fleetEvents.id, fleetEventId),
            eq(fleetEvents.status, 'active'),
            eq(fleetEvents.phase, 'return'),
          ),
        )
        .limit(1);

      if (!event) return null;

      const ships = event.ships as Record<string, number>;

      // Return ships to origin planet
      const originShips = await this.getOrCreateShips(event.originPlanetId);
      const shipUpdates: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(ships)) {
        if (count > 0) {
          const current = (originShips[shipId as keyof typeof originShips] ?? 0) as number;
          shipUpdates[shipId] = current + count;
        }
      }
      await db
        .update(planetShips)
        .set(shipUpdates)
        .where(eq(planetShips.planetId, event.originPlanetId));

      // Return cargo to origin planet
      const metalCargo = Number(event.metalCargo);
      const crystalCargo = Number(event.crystalCargo);
      const deuteriumCargo = Number(event.deuteriumCargo);

      if (metalCargo > 0 || crystalCargo > 0 || deuteriumCargo > 0) {
        const [originPlanet] = await db
          .select()
          .from(planets)
          .where(eq(planets.id, event.originPlanetId))
          .limit(1);

        if (originPlanet) {
          await db
            .update(planets)
            .set({
              metal: String(Number(originPlanet.metal) + metalCargo),
              crystal: String(Number(originPlanet.crystal) + crystalCargo),
              deuterium: String(Number(originPlanet.deuterium) + deuteriumCargo),
            })
            .where(eq(planets.id, event.originPlanetId));
        }
      }

      // Mark completed
      await db
        .update(fleetEvents)
        .set({ status: 'completed' })
        .where(eq(fleetEvents.id, event.id));

      return { returned: true, ships };
    },

    async scheduleReturn(
      fleetEventId: string,
      originPlanetId: string,
      targetCoords: { galaxy: number; system: number; position: number },
      ships: Record<string, number>,
      metalCargo: number,
      crystalCargo: number,
      deuteriumCargo: number,
    ) {
      const [originPlanet] = await db
        .select()
        .from(planets)
        .where(eq(planets.id, originPlanetId))
        .limit(1);

      if (!originPlanet) return;

      const driveTechs = await this.getDriveTechsByEvent(fleetEventId);
      const speed = fleetSpeed(ships, driveTechs);
      const origin = { galaxy: originPlanet.galaxy, system: originPlanet.system, position: originPlanet.position };
      const duration = travelTime(targetCoords, origin, speed, universeSpeed);

      const now = new Date();
      const returnTime = new Date(now.getTime() + duration * 1000);

      // Update fleet event to return phase
      await db
        .update(fleetEvents)
        .set({
          phase: 'return',
          departureTime: now,
          arrivalTime: returnTime,
          metalCargo: String(metalCargo),
          crystalCargo: String(crystalCargo),
          deuteriumCargo: String(deuteriumCargo),
          ships,
        })
        .where(eq(fleetEvents.id, fleetEventId));

      await fleetReturnQueue.add(
        'return',
        { fleetEventId },
        { delay: duration * 1000, jobId: `fleet-return-${fleetEventId}` },
      );
    },

    async getDriveTechs(userId: string) {
      const [research] = await db
        .select()
        .from(userResearch)
        .where(eq(userResearch.userId, userId))
        .limit(1);

      return {
        combustion: (research?.combustion ?? 0) as number,
        impulse: (research?.impulse ?? 0) as number,
        hyperspaceDrive: (research?.hyperspaceDrive ?? 0) as number,
      };
    },

    async getDriveTechsByEvent(fleetEventId: string) {
      const [event] = await db
        .select()
        .from(fleetEvents)
        .where(eq(fleetEvents.id, fleetEventId))
        .limit(1);

      if (!event) return { combustion: 0, impulse: 0, hyperspaceDrive: 0 };
      return this.getDriveTechs(event.userId);
    },

    async getOrCreateShips(planetId: string) {
      const [existing] = await db.select().from(planetShips).where(eq(planetShips.planetId, planetId)).limit(1);
      if (existing) return existing;
      const [created] = await db.insert(planetShips).values({ planetId }).returning();
      return created;
    },

    async getOwnedPlanet(userId: string, planetId: string) {
      const [planet] = await db
        .select()
        .from(planets)
        .where(and(eq(planets.id, planetId), eq(planets.userId, userId)))
        .limit(1);

      if (!planet) throw new TRPCError({ code: 'NOT_FOUND' });
      return planet;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/fleet/fleet.service.ts
git commit -m "feat(api): add fleet service (send, recall, arrival, return)"
```

---

### Task 6: Fleet router

**Files:**
- Create: `apps/api/src/modules/fleet/fleet.router.ts`

- [ ] **Step 1: Créer le router**

```typescript
// apps/api/src/modules/fleet/fleet.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createFleetService } from './fleet.service.js';

const shipIds = [
  'smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter',
  'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler',
] as const;

const missionTypes = ['transport', 'station', 'spy', 'attack', 'colonize'] as const;

export function createFleetRouter(fleetService: ReturnType<typeof createFleetService>) {
  return router({
    send: protectedProcedure
      .input(z.object({
        originPlanetId: z.string().uuid(),
        targetGalaxy: z.number().int().min(1).max(9),
        targetSystem: z.number().int().min(1).max(499),
        targetPosition: z.number().int().min(1).max(15),
        mission: z.enum(missionTypes),
        ships: z.record(z.enum(shipIds), z.number().int().min(0).max(999999)),
        metalCargo: z.number().min(0).default(0),
        crystalCargo: z.number().min(0).default(0),
        deuteriumCargo: z.number().min(0).default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        return fleetService.sendFleet(ctx.userId!, input);
      }),

    recall: protectedProcedure
      .input(z.object({ fleetEventId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return fleetService.recallFleet(ctx.userId!, input.fleetEventId);
      }),

    movements: protectedProcedure
      .query(async ({ ctx }) => {
        return fleetService.listMovements(ctx.userId!);
      }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/fleet/fleet.router.ts
git commit -m "feat(api): add fleet router"
```

---

### Task 7: Workers fleet-arrival + fleet-return

**Files:**
- Create: `apps/api/src/workers/fleet-arrival.worker.ts`
- Create: `apps/api/src/workers/fleet-return.worker.ts`

- [ ] **Step 1: Créer fleet-arrival worker**

```typescript
// apps/api/src/workers/fleet-arrival.worker.ts
import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createFleetService } from '../modules/fleet/fleet.service.js';
import { fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';
import { env } from '../config/env.js';
import { UNIVERSE_CONFIG } from '../modules/universe/universe.config.js';

export function startFleetArrivalWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed);

  const worker = new Worker(
    'fleet-arrival',
    async (job) => {
      const { fleetEventId } = job.data as { fleetEventId: string };
      console.log(`[fleet-arrival] Processing job ${job.id}`);
      const result = await fleetService.processArrival(fleetEventId);
      if (result) {
        console.log(`[fleet-arrival] Mission ${result.mission} processed`);
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[fleet-arrival] Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

- [ ] **Step 2: Créer fleet-return worker**

```typescript
// apps/api/src/workers/fleet-return.worker.ts
import { Worker } from 'bullmq';
import { createDb } from '@ogame-clone/db';
import { createResourceService } from '../modules/resource/resource.service.js';
import { createFleetService } from '../modules/fleet/fleet.service.js';
import { fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';
import { env } from '../config/env.js';
import { UNIVERSE_CONFIG } from '../modules/universe/universe.config.js';

export function startFleetReturnWorker(db: ReturnType<typeof createDb>) {
  const resourceService = createResourceService(db);
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed);

  const worker = new Worker(
    'fleet-return',
    async (job) => {
      const { fleetEventId } = job.data as { fleetEventId: string };
      console.log(`[fleet-return] Processing job ${job.id}`);
      const result = await fleetService.processReturn(fleetEventId);
      if (result) {
        console.log(`[fleet-return] Fleet returned with ${Object.keys(result.ships).length} ship types`);
      }
    },
    { connection: { url: env.REDIS_URL }, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[fleet-return] Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/workers/fleet-arrival.worker.ts apps/api/src/workers/fleet-return.worker.ts
git commit -m "feat(api): add fleet arrival and return workers"
```

---

### Task 8: Wire queues, workers, event-catchup, app-router

**Files:**
- Modify: `apps/api/src/queues/queue.ts`
- Modify: `apps/api/src/trpc/app-router.ts`
- Modify: `apps/api/src/workers/worker.ts`
- Modify: `apps/api/src/cron/event-catchup.ts`

- [ ] **Step 1: Ajouter les queues**

Dans `apps/api/src/queues/queue.ts`, ajouter :
```typescript
export const fleetArrivalQueue = new Queue('fleet-arrival', { connection });
export const fleetReturnQueue = new Queue('fleet-return', { connection });
```

- [ ] **Step 2: Mettre à jour app-router.ts**

Ajouter les imports et wiring :
```typescript
import { createGalaxyService } from '../modules/galaxy/galaxy.service.js';
import { createGalaxyRouter } from '../modules/galaxy/galaxy.router.js';
import { createFleetService } from '../modules/fleet/fleet.service.js';
import { createFleetRouter } from '../modules/fleet/fleet.router.js';
import { fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';
import { UNIVERSE_CONFIG } from '../modules/universe/universe.config.js';

// Dans buildAppRouter:
const galaxyService = createGalaxyService(db);
const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed);
const galaxyRouter = createGalaxyRouter(galaxyService);
const fleetRouter = createFleetRouter(fleetService);

// Dans le router:
galaxy: galaxyRouter,
fleet: fleetRouter,
```

- [ ] **Step 3: Mettre à jour worker.ts**

Ajouter :
```typescript
import { startFleetArrivalWorker } from './fleet-arrival.worker.js';
import { startFleetReturnWorker } from './fleet-return.worker.js';

// Après les autres workers:
startFleetArrivalWorker(db);
console.log('[worker] Fleet arrival worker started');
startFleetReturnWorker(db);
console.log('[worker] Fleet return worker started');
```

- [ ] **Step 4: Mettre à jour event-catchup.ts**

Ajouter import et handling pour fleet events expirés :
```typescript
import { fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';
```

Ajouter après le scan buildQueue existant :
```typescript
// Fleet events catchup
const { fleetEvents: fleetEventsTable } = await import('@ogame-clone/db');
const expiredFleets = await db
  .select()
  .from(fleetEventsTable)
  .where(and(eq(fleetEventsTable.status, 'active'), lte(fleetEventsTable.arrivalTime, now)));

for (const fleet of expiredFleets) {
  const queue = fleet.phase === 'return' ? fleetReturnQueue : fleetArrivalQueue;
  const jobId = fleet.phase === 'return'
    ? `fleet-return-${fleet.id}`
    : `fleet-arrive-${fleet.id}`;

  const existingJob = await queue.getJob(jobId);
  if (!existingJob) {
    console.log(`[event-catchup] Re-queuing expired fleet ${fleet.id} (${fleet.phase})`);
    await queue.add(fleet.phase === 'return' ? 'return' : 'arrive', { fleetEventId: fleet.id }, { jobId });
  }
}
```

Remplacement complet de event-catchup.ts :
```typescript
import { lte, eq, and } from 'drizzle-orm';
import { buildQueue, fleetEvents } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { buildingCompletionQueue, researchCompletionQueue, shipyardCompletionQueue, fleetArrivalQueue, fleetReturnQueue } from '../queues/queue.js';

export async function eventCatchup(db: Database) {
  const now = new Date();

  // Build queue catchup
  const expiredEntries = await db
    .select()
    .from(buildQueue)
    .where(and(eq(buildQueue.status, 'active'), lte(buildQueue.endTime, now)));

  for (const entry of expiredEntries) {
    let queue;
    let jobId: string;

    if (entry.type === 'building') {
      queue = buildingCompletionQueue;
      jobId = `building-${entry.id}`;
    } else if (entry.type === 'research') {
      queue = researchCompletionQueue;
      jobId = `research-${entry.id}`;
    } else {
      queue = shipyardCompletionQueue;
      jobId = `shipyard-${entry.id}-${entry.completedCount + 1}`;
    }

    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      console.log(`[event-catchup] Re-queuing expired ${entry.type} ${entry.id}`);
      await queue.add('complete', { buildQueueId: entry.id }, { jobId });
    }
  }

  // Fleet events catchup
  const expiredFleets = await db
    .select()
    .from(fleetEvents)
    .where(and(eq(fleetEvents.status, 'active'), lte(fleetEvents.arrivalTime, now)));

  for (const fleet of expiredFleets) {
    const queue = fleet.phase === 'return' ? fleetReturnQueue : fleetArrivalQueue;
    const jobId = fleet.phase === 'return'
      ? `fleet-return-${fleet.id}`
      : `fleet-arrive-${fleet.id}`;

    const existingJob = await queue.getJob(jobId);
    if (!existingJob) {
      console.log(`[event-catchup] Re-queuing expired fleet ${fleet.id} (${fleet.phase})`);
      await queue.add(fleet.phase === 'return' ? 'return' : 'arrive', { fleetEventId: fleet.id }, { jobId });
    }
  }

  const totalExpired = expiredEntries.length + expiredFleets.length;
  if (totalExpired > 0) {
    console.log(`[event-catchup] Found ${totalExpired} expired entries`);
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/queues/queue.ts apps/api/src/trpc/app-router.ts apps/api/src/workers/worker.ts apps/api/src/cron/event-catchup.ts
git commit -m "feat(api): wire galaxy and fleet routers, queues, workers, and event catchup"
```

---

## Chunk 4: Frontend — Pages Galaxie, Flotte, Mouvements

### Task 9: Page Galaxie

**Files:**
- Create: `apps/web/src/pages/Galaxy.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Créer la page**

```tsx
// apps/web/src/pages/Galaxy.tsx
import { useState } from 'react';
import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Galaxy() {
  const [galaxy, setGalaxy] = useState(1);
  const [system, setSystem] = useState(1);

  const { data, isLoading } = trpc.galaxy.system.useQuery(
    { galaxy, system },
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Galaxie</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Galaxie</label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGalaxy(Math.max(1, galaxy - 1))}
              disabled={galaxy <= 1}
            >
              &lt;
            </Button>
            <Input
              type="number"
              min={1}
              max={9}
              value={galaxy}
              onChange={(e) => setGalaxy(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
              className="w-16 text-center"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGalaxy(Math.min(9, galaxy + 1))}
              disabled={galaxy >= 9}
            >
              &gt;
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Système</label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSystem(Math.max(1, system - 1))}
              disabled={system <= 1}
            >
              &lt;
            </Button>
            <Input
              type="number"
              min={1}
              max={499}
              value={system}
              onChange={(e) => setSystem(Math.max(1, Math.min(499, Number(e.target.value) || 1)))}
              className="w-20 text-center"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSystem(Math.min(499, system + 1))}
              disabled={system >= 499}
            >
              &gt;
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Système solaire [{galaxy}:{system}]
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground">Chargement...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1 w-12">Pos</th>
                  <th className="px-2 py-1">Planète</th>
                  <th className="px-2 py-1">Joueur</th>
                  <th className="px-2 py-1 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.slots.map((slot, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                    {slot ? (
                      <>
                        <td className="px-2 py-1">{slot.planetName}</td>
                        <td className="px-2 py-1">{slot.username}</td>
                        <td className="px-2 py-1">
                          <span className="text-xs text-muted-foreground">-</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1 text-muted-foreground">-</td>
                        <td className="px-2 py-1 text-muted-foreground">-</td>
                        <td className="px-2 py-1">-</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter la route**

Dans `apps/web/src/router.tsx`, ajouter dans les children de `/` :
```tsx
{
  path: 'galaxy',
  lazy: () => import('./pages/Galaxy').then((m) => ({ Component: m.default })),
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Galaxy.tsx apps/web/src/router.tsx
git commit -m "feat(web): add Galaxy page with system navigation"
```

---

### Task 10: Page Fleet (wizard 3 étapes)

**Files:**
- Create: `apps/web/src/pages/Fleet.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Créer la page**

```tsx
// apps/web/src/pages/Fleet.tsx
import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Mission = 'transport' | 'station' | 'spy' | 'attack' | 'colonize';

const MISSION_LABELS: Record<Mission, string> = {
  transport: 'Transporter',
  station: 'Stationner',
  spy: 'Espionner',
  attack: 'Attaquer',
  colonize: 'Coloniser',
};

export default function Fleet() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();

  const [step, setStep] = useState(1);
  const [selectedShips, setSelectedShips] = useState<Record<string, number>>({});
  const [target, setTarget] = useState({ galaxy: 1, system: 1, position: 1 });
  const [mission, setMission] = useState<Mission>('transport');
  const [cargo, setCargo] = useState({ metal: 0, crystal: 0, deuterium: 0 });

  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const sendMutation = trpc.fleet.send.useMutation({
    onSuccess: () => {
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      setStep(1);
      setSelectedShips({});
      setCargo({ metal: 0, crystal: 0, deuterium: 0 });
    },
  });

  const hasShips = Object.values(selectedShips).some((v) => v > 0);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Flotte</h1>

      {/* Step indicators */}
      <div className="flex gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={s === step ? 'text-primary font-bold' : 'text-muted-foreground'}
          >
            Étape {s}
          </span>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sélection des vaisseaux</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ships?.filter((s) => s.count > 0).map((ship) => (
              <div key={ship.id} className="flex items-center gap-3">
                <span className="w-40 text-sm">{ship.name}</span>
                <span className="text-xs text-muted-foreground">({ship.count} dispo)</span>
                <Input
                  type="number"
                  min={0}
                  max={ship.count}
                  value={selectedShips[ship.id] || 0}
                  onChange={(e) =>
                    setSelectedShips({
                      ...selectedShips,
                      [ship.id]: Math.max(0, Math.min(ship.count, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-24"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedShips({ ...selectedShips, [ship.id]: ship.count })}
                >
                  Max
                </Button>
              </div>
            ))}

            {(!ships || ships.filter((s) => s.count > 0).length === 0) && (
              <p className="text-sm text-muted-foreground">Aucun vaisseau disponible</p>
            )}

            <Button onClick={() => setStep(2)} disabled={!hasShips}>
              Suivant
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destination et mission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Galaxie</label>
                <Input
                  type="number"
                  min={1}
                  max={9}
                  value={target.galaxy}
                  onChange={(e) => setTarget({ ...target, galaxy: Number(e.target.value) || 1 })}
                  className="w-20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Système</label>
                <Input
                  type="number"
                  min={1}
                  max={499}
                  value={target.system}
                  onChange={(e) => setTarget({ ...target, system: Number(e.target.value) || 1 })}
                  className="w-24"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Position</label>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={target.position}
                  onChange={(e) => setTarget({ ...target, position: Number(e.target.value) || 1 })}
                  className="w-20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Mission</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MISSION_LABELS) as Mission[]).map((m) => (
                  <Button
                    key={m}
                    variant={mission === m ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMission(m)}
                  >
                    {MISSION_LABELS[m]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Retour
              </Button>
              <Button onClick={() => setStep(3)}>
                Suivant
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chargement et confirmation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-1">
              <div>Destination : [{target.galaxy}:{target.system}:{target.position}]</div>
              <div>Mission : {MISSION_LABELS[mission]}</div>
              <div>
                Vaisseaux :{' '}
                {Object.entries(selectedShips)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')}
              </div>
            </div>

            {(mission === 'transport' || mission === 'station') && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Cargo</label>
                <div className="flex gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Métal</label>
                    <Input
                      type="number"
                      min={0}
                      value={cargo.metal}
                      onChange={(e) => setCargo({ ...cargo, metal: Number(e.target.value) || 0 })}
                      className="w-28"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Cristal</label>
                    <Input
                      type="number"
                      min={0}
                      value={cargo.crystal}
                      onChange={(e) => setCargo({ ...cargo, crystal: Number(e.target.value) || 0 })}
                      className="w-28"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Deutérium</label>
                    <Input
                      type="number"
                      min={0}
                      value={cargo.deuterium}
                      onChange={(e) => setCargo({ ...cargo, deuterium: Number(e.target.value) || 0 })}
                      className="w-28"
                    />
                  </div>
                </div>
              </div>
            )}

            {sendMutation.error && (
              <p className="text-sm text-destructive">{sendMutation.error.message}</p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Retour
              </Button>
              <Button
                onClick={() =>
                  sendMutation.mutate({
                    originPlanetId: planetId!,
                    targetGalaxy: target.galaxy,
                    targetSystem: target.system,
                    targetPosition: target.position,
                    mission,
                    ships: selectedShips,
                    metalCargo: cargo.metal,
                    crystalCargo: cargo.crystal,
                    deuteriumCargo: cargo.deuterium,
                  })
                }
                disabled={sendMutation.isPending}
              >
                Envoyer la flotte
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ajouter la route**

```tsx
{
  path: 'fleet',
  lazy: () => import('./pages/Fleet').then((m) => ({ Component: m.default })),
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Fleet.tsx apps/web/src/router.tsx
git commit -m "feat(web): add Fleet page with 3-step wizard"
```

---

### Task 11: Page Mouvements

**Files:**
- Create: `apps/web/src/pages/Movements.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Créer la page**

```tsx
// apps/web/src/pages/Movements.tsx
import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timer } from '@/components/common/Timer';

const MISSION_LABELS: Record<string, string> = {
  transport: 'Transport',
  station: 'Stationner',
  spy: 'Espionnage',
  attack: 'Attaque',
  colonize: 'Colonisation',
};

export default function Movements() {
  const utils = trpc.useUtils();

  const { data: movements, isLoading } = trpc.fleet.movements.useQuery();

  const recallMutation = trpc.fleet.recall.useMutation({
    onSuccess: () => {
      utils.fleet.movements.invalidate();
    },
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Mouvements</h1>

      {!movements || movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun mouvement de flotte en cours.</p>
      ) : (
        <div className="space-y-4">
          {movements.map((event) => {
            const ships = event.ships as Record<string, number>;
            const isOutbound = event.phase === 'outbound';

            return (
              <Card key={event.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {MISSION_LABELS[event.mission] ?? event.mission}
                      {' — '}
                      <span className="text-muted-foreground">
                        {isOutbound ? 'Aller' : 'Retour'}
                      </span>
                    </CardTitle>
                    <Timer
                      endTime={new Date(event.arrivalTime)}
                      onComplete={() => utils.fleet.movements.invalidate()}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Destination : [{event.targetGalaxy}:{event.targetSystem}:{event.targetPosition}]
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Vaisseaux :{' '}
                    {Object.entries(ships)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ')}
                  </div>
                  {(Number(event.metalCargo) > 0 || Number(event.crystalCargo) > 0 || Number(event.deuteriumCargo) > 0) && (
                    <div className="text-xs text-muted-foreground">
                      Cargo : M:{Number(event.metalCargo).toLocaleString('fr-FR')} C:{Number(event.crystalCargo).toLocaleString('fr-FR')} D:{Number(event.deuteriumCargo).toLocaleString('fr-FR')}
                    </div>
                  )}

                  {isOutbound && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => recallMutation.mutate({ fleetEventId: event.id })}
                      disabled={recallMutation.isPending}
                    >
                      Rappeler
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ajouter la route**

```tsx
{
  path: 'movements',
  lazy: () => import('./pages/Movements').then((m) => ({ Component: m.default })),
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Movements.tsx apps/web/src/router.tsx
git commit -m "feat(web): add Movements page with fleet tracking"
```

---

## Chunk 5: Typecheck + Lint + Test

### Task 12: Vérification finale

- [ ] **Step 1: Turbo typecheck**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH" && cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo typecheck
```
Expected: PASS

- [ ] **Step 2: Turbo lint**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH" && cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo lint
```
Expected: PASS (fix any issues)

- [ ] **Step 3: Turbo test**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH" && cd /Users/julienaubree/_projet/ogame-clone && pnpm turbo test
```
Expected: ALL PASS — tous les tests existants + fleet formulas

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve typecheck and lint issues from Phase 4"
```

---

## Verification Checklist

1. `pnpm turbo typecheck` — pas d'erreur TS
2. `pnpm turbo test` — tous les tests passent (78 existants + ~12 fleet)
3. `pnpm turbo lint` — pas d'erreur lint
4. API répond à `trpc.galaxy.system`
5. API répond à `trpc.fleet.send/recall/movements`
6. Workers fleet-arrival et fleet-return démarrent sans erreur
7. Event catchup rattrape les fleet events expirés
8. Page Galaxie affiche les 15 slots avec navigation galaxy/system
9. Page Flotte wizard 3 étapes fonctionne
10. Page Mouvements affiche les flottes en cours avec timers et rappel
