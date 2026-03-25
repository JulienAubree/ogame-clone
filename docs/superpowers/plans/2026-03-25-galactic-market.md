# Galactic Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player-to-player resource trading system unlocked by a Galactic Market building, with sell offers, buyer reservations, trade fleet missions, commission, and expiration.

**Architecture:** New `market_offers` table stores sell orders with escrow. Sellers create offers (resources deducted), buyers reserve then send a trade fleet. On arrival, payment is delivered and merchandise loaded for return trip. BullMQ handles offer/reservation expiration. SSE notifies both parties.

**Tech Stack:** Drizzle ORM, tRPC, BullMQ, React, SSE notifications

**Spec:** `docs/superpowers/specs/2026-03-25-galactic-market-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/db/src/schema/market-offers.ts` | Schema: `marketOfferStatusEnum`, `marketOffers` table |
| `packages/db/drizzle/0017_galactic_market.sql` | Migration: new table, enum, fleet_events.trade_id, seed data |
| `packages/game-engine/src/formulas/market.ts` | Pure formulas: maxOffers, commission |
| `apps/api/src/modules/market/market.service.ts` | Business logic: create/cancel/reserve/expire offers |
| `apps/api/src/modules/market/market.router.ts` | tRPC router: list, myOffers, createOffer, cancelOffer, reserveOffer, cancelReservation |
| `apps/api/src/modules/fleet/handlers/trade.handler.ts` | MissionHandler: validateFleet, processArrival for trade |
| `apps/api/src/workers/market.worker.ts` | BullMQ worker: market-expire, market-reservation-expire jobs |
| `apps/web/src/pages/Market.tsx` | Frontend page: 3 tabs (Buy/Sell/My Offers) |

### Modified files
| File | Changes |
|------|---------|
| `packages/db/src/schema/fleet-events.ts` | Add `'trade'` to `fleetMissionEnum`, add `tradeId` column |
| `packages/db/src/schema/index.ts` | Export `market-offers.js` |
| `packages/db/src/seed-game-config.ts` | Add `galacticMarket` building + `trade` mission definitions |
| `packages/shared/src/types/missions.ts` | Add `Trade = 'trade'` to `MissionType` enum |
| `packages/game-engine/src/index.ts` | Export `market.js` formulas |
| `apps/api/src/modules/fleet/fleet.types.ts` | Add `tradeId?` to `SendFleetInput` |
| `apps/api/src/modules/fleet/fleet.service.ts` | Register `TradeHandler`, handle trade recall side-effects, add `tradeId` to sendFleet |
| `apps/api/src/queues/queues.ts` | Add `marketQueue` |
| `apps/api/src/trpc/app-router.ts` | Wire `marketService`, `marketRouter` |
| `apps/api/src/workers/worker.ts` | Start `marketWorker` |
| `apps/web/src/hooks/useNotifications.ts` | Add market SSE handlers |
| `apps/web/src/components/layout/Sidebar.tsx` | Add Market nav item |
| `apps/web/src/lib/icons.tsx` | Add `MarketIcon` |
| `apps/web/src/router.tsx` | Add `/market` route |
| `apps/web/src/pages/Fleet.tsx` | Handle trade mode (locked coords, mission, auto-cargo) |

---

### Task 1: Database schema + migration

**Files:**
- Create: `packages/db/src/schema/market-offers.ts`
- Create: `packages/db/drizzle/0017_galactic_market.sql`
- Modify: `packages/db/src/schema/fleet-events.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create market-offers schema**

Create `packages/db/src/schema/market-offers.ts`:

```typescript
import { pgTable, uuid, smallint, timestamp, numeric, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { planets } from './planets.js';
import { fleetEvents } from './fleet-events.js';

export const marketOfferStatusEnum = pgEnum('market_offer_status', [
  'active',
  'reserved',
  'sold',
  'expired',
  'cancelled',
]);

export const marketResourceTypeEnum = pgEnum('market_resource_type', [
  'minerai',
  'silicium',
  'hydrogene',
]);

export const marketOffers = pgTable('market_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: uuid('seller_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  resourceType: marketResourceTypeEnum('resource_type').notNull(),
  quantity: numeric('quantity', { precision: 20, scale: 2 }).notNull(),
  priceMinerai: numeric('price_minerai', { precision: 20, scale: 2 }).notNull().default('0'),
  priceSilicium: numeric('price_silicium', { precision: 20, scale: 2 }).notNull().default('0'),
  priceHydrogene: numeric('price_hydrogene', { precision: 20, scale: 2 }).notNull().default('0'),
  status: marketOfferStatusEnum('status').notNull().default('active'),
  reservedBy: uuid('reserved_by').references(() => users.id, { onDelete: 'set null' }),
  reservedAt: timestamp('reserved_at', { withTimezone: true }),
  fleetEventId: uuid('fleet_event_id').references(() => fleetEvents.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index('market_offers_status_idx').on(table.status),
  index('market_offers_seller_idx').on(table.sellerId, table.status),
  index('market_offers_resource_idx').on(table.resourceType, table.status),
]);
```

- [ ] **Step 2: Add trade to fleet-events schema**

In `packages/db/src/schema/fleet-events.ts`:

1. Add `'trade'` to the `fleetMissionEnum` array (after `'pirate'`).
2. Import `marketOffers` (will exist after step 1).
3. Add column to `fleetEvents` table:
```typescript
tradeId: uuid('trade_id').references(() => marketOffers.id, { onDelete: 'set null' }),
```

**Note:** There is a circular reference risk (marketOffers references fleetEvents, fleetEvents references marketOffers). To avoid this, use a raw SQL reference in the market-offers schema instead of the Drizzle `references()` helper for the `fleetEventId` column, OR remove the FK constraint on `fleetEventId` in the schema (keep it as a plain uuid). The simpler approach: make `fleetEventId` a plain `uuid` without FK in the Drizzle schema, and add the FK constraint only in the migration SQL.

- [ ] **Step 3: Export new schema**

Add to `packages/db/src/schema/index.ts`:
```typescript
export * from './market-offers.js';
```

- [ ] **Step 4: Write migration**

Create `packages/db/drizzle/0017_galactic_market.sql`:

```sql
-- Market offer status enum
CREATE TYPE "market_offer_status" AS ENUM ('active', 'reserved', 'sold', 'expired', 'cancelled');
CREATE TYPE "market_resource_type" AS ENUM ('minerai', 'silicium', 'hydrogene');

-- Market offers table
CREATE TABLE "market_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seller_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "planet_id" uuid NOT NULL REFERENCES "planets"("id") ON DELETE CASCADE,
  "resource_type" "market_resource_type" NOT NULL,
  "quantity" numeric(20, 2) NOT NULL,
  "price_minerai" numeric(20, 2) NOT NULL DEFAULT '0',
  "price_silicium" numeric(20, 2) NOT NULL DEFAULT '0',
  "price_hydrogene" numeric(20, 2) NOT NULL DEFAULT '0',
  "status" "market_offer_status" NOT NULL DEFAULT 'active',
  "reserved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reserved_at" timestamp with time zone,
  "fleet_event_id" uuid REFERENCES "fleet_events"("id") ON DELETE SET NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "market_offers_status_idx" ON "market_offers" ("status");
CREATE INDEX "market_offers_seller_idx" ON "market_offers" ("seller_id", "status");
CREATE INDEX "market_offers_resource_idx" ON "market_offers" ("resource_type", "status");

-- Add trade mission to fleet enum
ALTER TYPE "fleet_mission" ADD VALUE 'trade';

-- Add trade_id to fleet_events
ALTER TABLE "fleet_events" ADD COLUMN "trade_id" uuid REFERENCES "market_offers"("id") ON DELETE SET NULL;

-- Building definition: Galactic Market
INSERT INTO "building_definitions" ("id", "name", "description", "category_id", "base_cost_minerai", "base_cost_silicium", "base_cost_hydrogene", "cost_factor", "base_time", "sort_order", "role", "flavor_text")
VALUES ('galacticMarket', 'Marché Galactique', 'Permet les échanges de ressources avec les autres joueurs de l''univers.', 'building_industrie', 5000, 5000, 1000, 1.5, 120, 7, 'market', 'Le marché galactique met en relation acheteurs et vendeurs à travers l''univers. Les transactions sont sécurisées par un système d''entiercement automatique.')
ON CONFLICT ("id") DO NOTHING;

-- Building prerequisite: shipyard level 2
INSERT INTO "building_prerequisites" ("building_id", "required_building_id", "required_level")
SELECT 'galacticMarket', 'shipyard', 2
WHERE NOT EXISTS (SELECT 1 FROM "building_prerequisites" WHERE "building_id" = 'galacticMarket' AND "required_building_id" = 'shipyard');

-- Mission definition: trade
INSERT INTO "mission_definitions" ("id", "label", "hint", "button_label", "color", "sort_order", "dangerous", "required_ship_roles", "exclusive", "recommended_ship_roles", "requires_pve_mission")
VALUES ('trade', 'Commerce', 'Envoyez une flotte chercher des marchandises achetées sur le marché', 'Commercer', '#a78bfa', 9, false, null, false, '["smallCargo", "largeCargo"]', false)
ON CONFLICT ("id") DO NOTHING;

-- Universe config
INSERT INTO "universe_config" ("key", "value", "label")
VALUES
  ('market_commission_percent', '5', 'Commission du marché galactique (%)'),
  ('market_offer_duration_hours', '48', 'Durée de vie des offres du marché (heures)'),
  ('market_reservation_minutes', '60', 'Temps de réservation avant expiration (minutes)')
ON CONFLICT ("key") DO NOTHING;
```

- [ ] **Step 5: Update seed-game-config.ts**

In `packages/db/src/seed-game-config.ts`, add to the BUILDINGS array:
```typescript
{
  id: 'galacticMarket',
  name: 'Marché Galactique',
  description: 'Permet les échanges de ressources avec les autres joueurs de l\'univers.',
  baseCostMinerai: 5000,
  baseCostSilicium: 5000,
  baseCostHydrogene: 1000,
  costFactor: 1.5,
  baseTime: 120,
  categoryId: 'building_industrie',
  sortOrder: 7,
  role: 'market',
  flavorText: 'Le marché galactique met en relation acheteurs et vendeurs à travers l\'univers.',
  prerequisites: [{ buildingId: 'shipyard', level: 2 }],
},
```

Add to the MISSION_DEFINITIONS array:
```typescript
{
  id: 'trade',
  label: 'Commerce',
  hint: 'Envoyez une flotte chercher des marchandises achetées sur le marché',
  buttonLabel: 'Commercer',
  color: '#a78bfa',
  sortOrder: 9,
  dangerous: false,
  requiredShipRoles: null,
  exclusive: false,
  recommendedShipRoles: ['smallCargo', 'largeCargo'],
  requiresPveMission: false,
},
```

Add to the UNIVERSE_CONFIG array:
```typescript
{ key: 'market_commission_percent', value: 5, label: 'Commission du marché galactique (%)' },
{ key: 'market_offer_duration_hours', value: 48, label: 'Durée de vie des offres du marché (heures)' },
{ key: 'market_reservation_minutes', value: 60, label: 'Temps de réservation avant expiration (minutes)' },
```

- [ ] **Step 6: Add Trade to MissionType enum**

In `packages/shared/src/types/missions.ts`, add:
```typescript
Trade = 'trade',
```

- [ ] **Step 7: Build packages and verify**

Run: `pnpm --filter @ogame-clone/db build && pnpm --filter @ogame-clone/shared build`
Expected: Build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/market-offers.ts packages/db/src/schema/fleet-events.ts packages/db/src/schema/index.ts packages/db/drizzle/0017_galactic_market.sql packages/db/src/seed-game-config.ts packages/shared/src/types/missions.ts
git commit -m "feat(market): add database schema, migration, and seed data for galactic market"
```

---

### Task 2: Game engine formulas

**Files:**
- Create: `packages/game-engine/src/formulas/market.ts`
- Modify: `packages/game-engine/src/index.ts`

- [ ] **Step 1: Create market formulas**

Create `packages/game-engine/src/formulas/market.ts`:

```typescript
/**
 * Maximum number of simultaneous market offers for a given market building level.
 */
export function maxMarketOffers(marketLevel: number): number {
  return marketLevel * 2;
}

/**
 * Calculate commission amounts per resource component.
 * Commission is paid by the buyer on top of the price.
 * Each component is rounded up (ceil) to avoid fractional exploits.
 */
export function calculateCommission(
  price: { minerai: number; silicium: number; hydrogene: number },
  commissionPercent: number,
): { minerai: number; silicium: number; hydrogene: number } {
  return {
    minerai: price.minerai > 0 ? Math.ceil(price.minerai * commissionPercent / 100) : 0,
    silicium: price.silicium > 0 ? Math.ceil(price.silicium * commissionPercent / 100) : 0,
    hydrogene: price.hydrogene > 0 ? Math.ceil(price.hydrogene * commissionPercent / 100) : 0,
  };
}

/**
 * Total payment the buyer must load as cargo (price + commission).
 */
export function totalPayment(
  price: { minerai: number; silicium: number; hydrogene: number },
  commissionPercent: number,
): { minerai: number; silicium: number; hydrogene: number } {
  const commission = calculateCommission(price, commissionPercent);
  return {
    minerai: price.minerai + commission.minerai,
    silicium: price.silicium + commission.silicium,
    hydrogene: price.hydrogene + commission.hydrogene,
  };
}
```

- [ ] **Step 2: Export from game-engine index**

Add to `packages/game-engine/src/index.ts`:
```typescript
export * from './formulas/market.js';
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @ogame-clone/game-engine build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/game-engine/src/formulas/market.ts packages/game-engine/src/index.ts
git commit -m "feat(market): add pure formulas for max offers and commission"
```

---

### Task 3: Trade mission handler

**Files:**
- Create: `apps/api/src/modules/fleet/handlers/trade.handler.ts`
- Modify: `apps/api/src/modules/fleet/fleet.types.ts`
- Modify: `apps/api/src/modules/fleet/fleet.service.ts`

- [ ] **Step 1: Add tradeId to SendFleetInput**

In `apps/api/src/modules/fleet/fleet.types.ts`:

1. Add to the `SendFleetInput` interface:
```typescript
tradeId?: string;
```

2. Add to the `FleetEvent` type:
```typescript
tradeId: string | null;
```

- [ ] **Step 2: Create trade handler**

Create `apps/api/src/modules/fleet/handlers/trade.handler.ts`:

```typescript
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { marketOffers, planets } from '@ogame-clone/db';
import { calculateCommission } from '@ogame-clone/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';

export class TradeHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    if (!input.tradeId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'tradeId requis pour une mission commerce' });
    }

    const [offer] = await ctx.db
      .select()
      .from(marketOffers)
      .where(
        and(
          eq(marketOffers.id, input.tradeId),
          eq(marketOffers.status, 'reserved'),
        ),
      )
      .limit(1);

    if (!offer) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Offre non trouvée ou non réservée' });
    }

    // Verify the reserver is the one sending the fleet
    // (userId is checked upstream in sendFleet, but we pass it via ctx or input)
    // The offer.reservedBy check happens in the service layer where userId is available.

    // Verify coordinates match seller's planet
    const [sellerPlanet] = await ctx.db
      .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
      .from(planets)
      .where(eq(planets.id, offer.planetId))
      .limit(1);

    if (!sellerPlanet) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Planète du vendeur introuvable' });
    }

    if (
      input.targetGalaxy !== sellerPlanet.galaxy ||
      input.targetSystem !== sellerPlanet.system ||
      input.targetPosition !== sellerPlanet.position
    ) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coordonnées ne correspondent pas à l\'offre' });
    }

    // Verify cargo covers price + commission
    const commissionPercent = Number(config.universe.market_commission_percent) || 5;
    const price = {
      minerai: Number(offer.priceMinerai),
      silicium: Number(offer.priceSilicium),
      hydrogene: Number(offer.priceHydrogene),
    };
    const commission = calculateCommission(price, commissionPercent);
    const requiredMinerai = price.minerai + commission.minerai;
    const requiredSilicium = price.silicium + commission.silicium;
    const requiredHydrogene = price.hydrogene + commission.hydrogene;

    const cargoMinerai = input.mineraiCargo ?? 0;
    const cargoSilicium = input.siliciumCargo ?? 0;
    const cargoHydrogene = input.hydrogeneCargo ?? 0;

    if (cargoMinerai < requiredMinerai || cargoSilicium < requiredSilicium || cargoHydrogene < requiredHydrogene) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cargo insuffisant. Requis: ${requiredMinerai} Mi, ${requiredSilicium} Si, ${requiredHydrogene} H2`,
      });
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const tradeId = fleetEvent.tradeId;
    if (!tradeId) {
      return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 } };
    }

    const [offer] = await ctx.db
      .select()
      .from(marketOffers)
      .where(and(eq(marketOffers.id, tradeId), eq(marketOffers.status, 'reserved')))
      .limit(1);

    if (!offer) {
      // Offer was cancelled/expired — return with payment
      return {
        scheduleReturn: true,
        cargo: {
          minerai: Number(fleetEvent.mineraiCargo),
          silicium: Number(fleetEvent.siliciumCargo),
          hydrogene: Number(fleetEvent.hydrogeneCargo),
        },
      };
    }

    const config = await ctx.gameConfigService.getFullConfig();
    const commissionPercent = Number(config.universe.market_commission_percent) || 5;
    const price = {
      minerai: Number(offer.priceMinerai),
      silicium: Number(offer.priceSilicium),
      hydrogene: Number(offer.priceHydrogene),
    };
    const commission = calculateCommission(price, commissionPercent);

    // Credit seller's planet with price (NOT commission)
    const [sellerPlanet] = await ctx.db
      .select()
      .from(planets)
      .where(eq(planets.id, offer.planetId))
      .limit(1);

    if (sellerPlanet) {
      await ctx.db
        .update(planets)
        .set({
          minerai: String(Number(sellerPlanet.minerai) + price.minerai),
          silicium: String(Number(sellerPlanet.silicium) + price.silicium),
          hydrogene: String(Number(sellerPlanet.hydrogene) + price.hydrogene),
        })
        .where(eq(planets.id, offer.planetId));
    }

    // Commission is destroyed (not credited anywhere — economic sink)

    // Mark offer as sold
    await ctx.db
      .update(marketOffers)
      .set({ status: 'sold' })
      .where(eq(marketOffers.id, tradeId));

    // Load merchandise into fleet cargo for return trip
    const merchandise = { minerai: 0, silicium: 0, hydrogene: 0 };
    merchandise[offer.resourceType as keyof typeof merchandise] = Number(offer.quantity);

    return {
      scheduleReturn: true,
      cargo: merchandise,
    };
  }
}
```

- [ ] **Step 3: Register handler and add trade support in fleet.service.ts**

In `apps/api/src/modules/fleet/fleet.service.ts`:

1. Import `TradeHandler`:
```typescript
import { TradeHandler } from './handlers/trade.handler.js';
```

2. Add to the `handlers` record (after `mine: new MineHandler()`):
```typescript
trade: new TradeHandler(),
```

3. In `sendFleet`, after fleet event creation, add trade-specific logic to link the fleet event to the offer. Find where `pveMissionId` is handled and add similar handling for `tradeId`:
```typescript
// After the fleetEvents insert, if input.tradeId:
if (input.tradeId) {
  await db
    .update(marketOffers)
    .set({ fleetEventId: newFleetEvent.id })
    .where(eq(marketOffers.id, input.tradeId));
}
```

Also add `tradeId` to the `fleetEvents.insert` values:
```typescript
tradeId: input.tradeId ?? null,
```

4. In `recallFleet`, after the PvE release block, add trade recall handling:
```typescript
// Release trade offer back to active if recalling
if (event.tradeId) {
  await db
    .update(marketOffers)
    .set({
      status: 'active',
      reservedBy: null,
      reservedAt: null,
      fleetEventId: null,
    })
    .where(eq(marketOffers.id, event.tradeId));
  // Note: the market-expire job for the offer is still running — it will handle expiration
}
```

5. Import `marketOffers` from `@ogame-clone/db` at the top of the file.

- [ ] **Step 4: Add tradeId to fleet router input**

In `apps/api/src/modules/fleet/fleet.router.ts`, add to the `send` mutation input schema:
```typescript
tradeId: z.string().uuid().optional(),
```

- [ ] **Step 5: Build and verify**

Run: `pnpm --filter api build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/trade.handler.ts apps/api/src/modules/fleet/fleet.types.ts apps/api/src/modules/fleet/fleet.service.ts apps/api/src/modules/fleet/fleet.router.ts
git commit -m "feat(market): add trade mission handler with fleet integration"
```

---

### Task 4: Market service

**Files:**
- Create: `apps/api/src/modules/market/market.service.ts`

- [ ] **Step 1: Create market service**

Create `apps/api/src/modules/market/market.service.ts`:

```typescript
import { eq, and, ne, desc, lt, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { Queue } from 'bullmq';
import { marketOffers, planets, planetBuildings, fleetEvents } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { maxMarketOffers, calculateCommission } from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import { publishNotification } from '../notification/notification.publisher.js';
import type Redis from 'ioredis';

export function createMarketService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  gameConfigService: GameConfigService,
  marketQueue: Queue,
  redis: Redis,
) {
  async function getMarketLevel(planetId: string): Promise<number> {
    const [row] = await db
      .select({ level: planetBuildings.level })
      .from(planetBuildings)
      .where(
        and(
          eq(planetBuildings.planetId, planetId),
          eq(planetBuildings.buildingId, 'galacticMarket'),
        ),
      )
      .limit(1);
    return row?.level ?? 0;
  }

  async function hasHostileInbound(planetId: string): Promise<boolean> {
    const [planet] = await db
      .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
      .from(planets)
      .where(eq(planets.id, planetId))
      .limit(1);
    if (!planet) return false;

    const [hostile] = await db
      .select({ id: fleetEvents.id })
      .from(fleetEvents)
      .where(
        and(
          eq(fleetEvents.targetGalaxy, planet.galaxy),
          eq(fleetEvents.targetSystem, planet.system),
          eq(fleetEvents.targetPosition, planet.position),
          eq(fleetEvents.status, 'active'),
          eq(fleetEvents.phase, 'outbound'),
          sql`${fleetEvents.detectedAt} IS NOT NULL`,
        ),
      )
      .limit(1);
    return !!hostile;
  }

  return {
    async createOffer(userId: string, planetId: string, input: {
      resourceType: 'minerai' | 'silicium' | 'hydrogene';
      quantity: number;
      priceMinerai: number;
      priceSilicium: number;
      priceHydrogene: number;
    }) {
      const marketLevel = await getMarketLevel(planetId);
      if (marketLevel < 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Marché Galactique requis' });
      }

      // Check max offers
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketOffers)
        .where(
          and(
            eq(marketOffers.sellerId, userId),
            eq(marketOffers.status, 'active'),
          ),
        );
      if (count >= maxMarketOffers(marketLevel)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Nombre maximum d'offres atteint (${maxMarketOffers(marketLevel)})` });
      }

      // Check hostile inbound
      if (await hasHostileInbound(planetId)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Impossible de créer une offre pendant une attaque' });
      }

      // Validate price (at least one component > 0)
      if (input.priceMinerai <= 0 && input.priceSilicium <= 0 && input.priceHydrogene <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le prix doit être supérieur à 0' });
      }

      if (input.quantity <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La quantité doit être supérieure à 0' });
      }

      // Deduct resources (escrow)
      const cost = { minerai: 0, silicium: 0, hydrogene: 0 };
      cost[input.resourceType] = input.quantity;
      await resourceService.spendResources(planetId, userId, cost);

      // Calculate expiration
      const config = await gameConfigService.getFullConfig();
      const durationHours = Number(config.universe.market_offer_duration_hours) || 48;
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

      // Create offer
      const [offer] = await db
        .insert(marketOffers)
        .values({
          sellerId: userId,
          planetId,
          resourceType: input.resourceType,
          quantity: String(input.quantity),
          priceMinerai: String(input.priceMinerai),
          priceSilicium: String(input.priceSilicium),
          priceHydrogene: String(input.priceHydrogene),
          expiresAt,
        })
        .returning();

      // Schedule expiration job
      await marketQueue.add(
        'market-expire',
        { offerId: offer.id },
        { delay: durationHours * 60 * 60 * 1000, jobId: `market-expire-${offer.id}` },
      );

      return offer;
    },

    async cancelOffer(userId: string, offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(
          and(
            eq(marketOffers.id, offerId),
            eq(marketOffers.sellerId, userId),
            eq(marketOffers.status, 'active'),
          ),
        )
        .limit(1);

      if (!offer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Offre non trouvée ou non annulable' });
      }

      // Restore escrowed resources to seller's planet
      const [planet] = await db.select().from(planets).where(eq(planets.id, offer.planetId)).limit(1);
      if (planet) {
        const updates: Record<string, string> = {};
        updates[offer.resourceType] = String(Number((planet as any)[offer.resourceType]) + Number(offer.quantity));
        await db.update(planets).set(updates).where(eq(planets.id, offer.planetId));
      }

      // Update status
      await db
        .update(marketOffers)
        .set({ status: 'cancelled' })
        .where(eq(marketOffers.id, offerId));

      // Cancel expiration job
      await marketQueue.remove(`market-expire-${offerId}`);

      return { success: true };
    },

    async reserveOffer(userId: string, planetId: string, offerId: string) {
      // Verify buyer has market building
      const marketLevel = await getMarketLevel(planetId);
      if (marketLevel < 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Marché Galactique requis pour acheter' });
      }

      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(
          and(
            eq(marketOffers.id, offerId),
            eq(marketOffers.status, 'active'),
          ),
        )
        .limit(1);

      if (!offer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Offre non disponible' });
      }

      if (offer.sellerId === userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Impossible d\'acheter sa propre offre' });
      }

      const now = new Date();
      const config = await gameConfigService.getFullConfig();
      const reservationMinutes = Number(config.universe.market_reservation_minutes) || 60;

      // Reserve
      await db
        .update(marketOffers)
        .set({
          status: 'reserved',
          reservedBy: userId,
          reservedAt: now,
        })
        .where(eq(marketOffers.id, offerId));

      // Schedule reservation expiration
      await marketQueue.add(
        'market-reservation-expire',
        { offerId },
        { delay: reservationMinutes * 60 * 1000, jobId: `market-reservation-${offerId}` },
      );

      // Notify seller
      publishNotification(redis, offer.sellerId, {
        type: 'market-offer-reserved',
        payload: {
          offerId: offer.id,
          resourceType: offer.resourceType,
          quantity: Number(offer.quantity),
        },
      });

      // Return offer details + seller planet coordinates for fleet dispatch
      const [sellerPlanet] = await db
        .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
        .from(planets)
        .where(eq(planets.id, offer.planetId))
        .limit(1);

      const commissionPercent = Number(config.universe.market_commission_percent) || 5;
      const price = {
        minerai: Number(offer.priceMinerai),
        silicium: Number(offer.priceSilicium),
        hydrogene: Number(offer.priceHydrogene),
      };
      const commission = calculateCommission(price, commissionPercent);

      return {
        offer: {
          id: offer.id,
          resourceType: offer.resourceType,
          quantity: Number(offer.quantity),
          price,
          commission,
          totalPayment: {
            minerai: price.minerai + commission.minerai,
            silicium: price.silicium + commission.silicium,
            hydrogene: price.hydrogene + commission.hydrogene,
          },
        },
        sellerPlanet: sellerPlanet!,
      };
    },

    async cancelReservation(userId: string, offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(
          and(
            eq(marketOffers.id, offerId),
            eq(marketOffers.status, 'reserved'),
            eq(marketOffers.reservedBy, userId),
          ),
        )
        .limit(1);

      if (!offer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Réservation non trouvée' });
      }

      if (offer.fleetEventId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Flotte déjà envoyée, rappelez la flotte pour annuler' });
      }

      await db
        .update(marketOffers)
        .set({
          status: 'active',
          reservedBy: null,
          reservedAt: null,
        })
        .where(eq(marketOffers.id, offerId));

      await marketQueue.remove(`market-reservation-${offerId}`);

      return { success: true };
    },

    async listOffers(userId: string, planetId: string, options?: {
      resourceType?: string;
      cursor?: string;
      limit?: number;
    }) {
      const limit = options?.limit ?? 20;

      // Get buyer's planet for distance calculation
      const [buyerPlanet] = await db
        .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
        .from(planets)
        .where(eq(planets.id, planetId))
        .limit(1);

      const conditions = [
        eq(marketOffers.status, 'active'),
        ne(marketOffers.sellerId, userId),
      ];

      if (options?.resourceType) {
        conditions.push(eq(marketOffers.resourceType, options.resourceType as any));
      }

      if (options?.cursor) {
        conditions.push(lt(marketOffers.createdAt, new Date(options.cursor)));
      }

      const offers = await db
        .select({
          offer: marketOffers,
          sellerGalaxy: planets.galaxy,
          sellerSystem: planets.system,
          sellerPosition: planets.position,
        })
        .from(marketOffers)
        .innerJoin(planets, eq(marketOffers.planetId, planets.id))
        .where(and(...conditions))
        .orderBy(desc(marketOffers.createdAt))
        .limit(limit + 1);

      const hasMore = offers.length > limit;
      const results = hasMore ? offers.slice(0, limit) : offers;
      const nextCursor = hasMore ? results[results.length - 1]?.offer.createdAt.toISOString() : undefined;

      return {
        offers: results.map((r) => ({
          id: r.offer.id,
          resourceType: r.offer.resourceType,
          quantity: Number(r.offer.quantity),
          priceMinerai: Number(r.offer.priceMinerai),
          priceSilicium: Number(r.offer.priceSilicium),
          priceHydrogene: Number(r.offer.priceHydrogene),
          sellerCoords: { galaxy: r.sellerGalaxy, system: r.sellerSystem, position: r.sellerPosition },
          expiresAt: r.offer.expiresAt.toISOString(),
          createdAt: r.offer.createdAt.toISOString(),
        })),
        nextCursor,
      };
    },

    async myOffers(userId: string) {
      const offers = await db
        .select()
        .from(marketOffers)
        .where(eq(marketOffers.sellerId, userId))
        .orderBy(desc(marketOffers.createdAt));

      return offers.map((o) => ({
        id: o.id,
        resourceType: o.resourceType,
        quantity: Number(o.quantity),
        priceMinerai: Number(o.priceMinerai),
        priceSilicium: Number(o.priceSilicium),
        priceHydrogene: Number(o.priceHydrogene),
        status: o.status,
        fleetEventId: o.fleetEventId,
        expiresAt: o.expiresAt.toISOString(),
        createdAt: o.createdAt.toISOString(),
      }));
    },

    // Called by market worker on offer expiration
    async processExpiration(offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(and(eq(marketOffers.id, offerId), eq(marketOffers.status, 'active')))
        .limit(1);

      if (!offer) return; // Already sold/cancelled/reserved

      // Restore resources to seller's planet
      const [planet] = await db.select().from(planets).where(eq(planets.id, offer.planetId)).limit(1);
      if (planet) {
        const updates: Record<string, string> = {};
        updates[offer.resourceType] = String(Number((planet as any)[offer.resourceType]) + Number(offer.quantity));
        await db.update(planets).set(updates).where(eq(planets.id, offer.planetId));
      }

      await db
        .update(marketOffers)
        .set({ status: 'expired' })
        .where(eq(marketOffers.id, offerId));

      // Notify seller
      publishNotification(redis, offer.sellerId, {
        type: 'market-offer-expired',
        payload: {
          offerId: offer.id,
          resourceType: offer.resourceType,
          quantity: Number(offer.quantity),
        },
      });
    },

    // Called by market worker on reservation expiration
    async processReservationExpiration(offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(and(eq(marketOffers.id, offerId), eq(marketOffers.status, 'reserved')))
        .limit(1);

      if (!offer || offer.fleetEventId) return; // Fleet already sent or offer no longer reserved

      await db
        .update(marketOffers)
        .set({
          status: 'active',
          reservedBy: null,
          reservedAt: null,
        })
        .where(eq(marketOffers.id, offerId));

      // Notify buyer
      if (offer.reservedBy) {
        publishNotification(redis, offer.reservedBy, {
          type: 'market-reservation-expired',
          payload: { offerId: offer.id },
        });
      }
    },

    // Called by trade handler on arrival to notify seller
    async notifySold(offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(eq(marketOffers.id, offerId))
        .limit(1);

      if (!offer) return;

      publishNotification(redis, offer.sellerId, {
        type: 'market-offer-sold',
        payload: {
          offerId: offer.id,
          resourceType: offer.resourceType,
          quantity: Number(offer.quantity),
          payment: {
            minerai: Number(offer.priceMinerai),
            silicium: Number(offer.priceSilicium),
            hydrogene: Number(offer.priceHydrogene),
          },
        },
      });
    },
  };
}
```

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter api build`
Expected: Build succeeds (may need to build db + game-engine first if not done).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/market/market.service.ts
git commit -m "feat(market): add market service with create/cancel/reserve/list/expire logic"
```

---

### Task 5: Market router

**Files:**
- Create: `apps/api/src/modules/market/market.router.ts`

- [ ] **Step 1: Create market router**

Create `apps/api/src/modules/market/market.router.ts`:

```typescript
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createMarketService } from './market.service.js';

export function createMarketRouter(marketService: ReturnType<typeof createMarketService>) {
  return router({
    list: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        resourceType: z.enum(['minerai', 'silicium', 'hydrogene']).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return marketService.listOffers(ctx.userId!, input.planetId, {
          resourceType: input.resourceType,
          cursor: input.cursor,
          limit: input.limit,
        });
      }),

    myOffers: protectedProcedure
      .query(async ({ ctx }) => {
        return marketService.myOffers(ctx.userId!);
      }),

    createOffer: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        resourceType: z.enum(['minerai', 'silicium', 'hydrogene']),
        quantity: z.number().min(1),
        priceMinerai: z.number().min(0).default(0),
        priceSilicium: z.number().min(0).default(0),
        priceHydrogene: z.number().min(0).default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        return marketService.createOffer(ctx.userId!, input.planetId, input);
      }),

    cancelOffer: protectedProcedure
      .input(z.object({ offerId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return marketService.cancelOffer(ctx.userId!, input.offerId);
      }),

    reserveOffer: protectedProcedure
      .input(z.object({
        planetId: z.string().uuid(),
        offerId: z.string().uuid(),
      }))
      .mutation(async ({ ctx, input }) => {
        return marketService.reserveOffer(ctx.userId!, input.planetId, input.offerId);
      }),

    cancelReservation: protectedProcedure
      .input(z.object({ offerId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return marketService.cancelReservation(ctx.userId!, input.offerId);
      }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/market/market.router.ts
git commit -m "feat(market): add tRPC router for market operations"
```

---

### Task 6: Market worker

**Files:**
- Create: `apps/api/src/workers/market.worker.ts`

- [ ] **Step 1: Create market worker**

Create `apps/api/src/workers/market.worker.ts`:

```typescript
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import type { createMarketService } from '../modules/market/market.service.js';

export function startMarketWorker(marketService: ReturnType<typeof createMarketService>) {
  const worker = new Worker(
    'market',
    async (job) => {
      console.log(`[market] Processing ${job.name} job ${job.id}`);

      switch (job.name) {
        case 'market-expire': {
          const { offerId } = job.data as { offerId: string };
          await marketService.processExpiration(offerId);
          console.log(`[market] Offer ${offerId} expired`);
          break;
        }
        case 'market-reservation-expire': {
          const { offerId } = job.data as { offerId: string };
          await marketService.processReservationExpiration(offerId);
          console.log(`[market] Reservation for ${offerId} expired`);
          break;
        }
        default:
          console.error(`[market] Unknown job name: ${job.name}`);
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[market] Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/workers/market.worker.ts
git commit -m "feat(market): add BullMQ worker for offer and reservation expiration"
```

---

### Task 7: Wire everything in queues, app-router, and worker startup

**Files:**
- Modify: `apps/api/src/queues/queues.ts`
- Modify: `apps/api/src/trpc/app-router.ts`
- Modify: `apps/api/src/workers/worker.ts`

- [ ] **Step 1: Add market queue to queues.ts**

In `apps/api/src/queues/queues.ts`, add after the `fleetQueue` line:
```typescript
export const marketQueue = new Queue('market', { connection, defaultJobOptions });
```

- [ ] **Step 2: Wire market service and router in app-router.ts**

In `apps/api/src/trpc/app-router.ts`:

1. Import:
```typescript
import { createMarketService } from '../modules/market/market.service.js';
import { createMarketRouter } from '../modules/market/market.router.js';
import { marketQueue } from '../queues/queues.js';
```

(Note: `marketQueue` import should be added alongside the existing `buildCompletionQueue, fleetQueue` import.)

2. Create the market service (after other service instantiations):
```typescript
const marketService = createMarketService(db, resourceService, gameConfigService, marketQueue, redis);
```

3. Create the router:
```typescript
const marketRouter = createMarketRouter(marketService);
```

4. Add to the root router:
```typescript
market: marketRouter,
```

- [ ] **Step 3: Start market worker in worker.ts**

In `apps/api/src/workers/worker.ts`:

1. Add imports:
```typescript
import { createMarketService } from '../modules/market/market.service.js';
import { startMarketWorker } from './market.worker.js';
import { marketQueue } from '../queues/queues.js';
```

(Note: add `marketQueue` to the existing `import { buildCompletionQueue, fleetQueue } from '../queues/queues.js'` line.)

2. Create the market service (after other service instantiations, before worker starts):
```typescript
const marketService = createMarketService(db, resourceService, gameConfigService, marketQueue, redis);
```

3. Start the worker (after other worker starts):
```typescript
startMarketWorker(marketService);
console.log('[worker] Market worker started');
```

- [ ] **Step 4: Build and verify**

Run: `pnpm --filter api build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/queues/queues.ts apps/api/src/trpc/app-router.ts apps/api/src/workers/worker.ts
git commit -m "feat(market): wire market service, router, and worker into app"
```

---

### Task 8: SSE notification handlers (frontend)

**Files:**
- Modify: `apps/web/src/hooks/useNotifications.ts`

- [ ] **Step 1: Add market event handlers**

In `apps/web/src/hooks/useNotifications.ts`, inside the `switch (event.type)` block, add these cases before the closing `}`:

```typescript
case 'market-offer-reserved':
  utils.market.myOffers.invalidate();
  addToast(`Votre offre a été réservée (${event.payload.quantity}x ${event.payload.resourceType})`);
  showBrowserNotification('Offre réservée', `${event.payload.quantity}x ${event.payload.resourceType}`);
  break;
case 'market-offer-sold':
  utils.market.myOffers.invalidate();
  utils.resource.production.invalidate();
  addToast(`Vente finalisée ! Paiement reçu`);
  showBrowserNotification('Vente finalisée', `${event.payload.quantity}x ${event.payload.resourceType} vendu`);
  break;
case 'market-offer-expired':
  utils.market.myOffers.invalidate();
  utils.resource.production.invalidate();
  addToast(`Offre expirée, ressources restituées (${event.payload.quantity}x ${event.payload.resourceType})`);
  showBrowserNotification('Offre expirée', 'Ressources restituées');
  break;
case 'market-reservation-expired':
  utils.market.list.invalidate();
  addToast('Réservation expirée');
  showBrowserNotification('Réservation expirée', 'Vous n\'avez pas envoyé de flotte à temps');
  break;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/useNotifications.ts
git commit -m "feat(market): add SSE notification handlers for market events"
```

---

### Task 9: Frontend — Market page

**Files:**
- Create: `apps/web/src/pages/Market.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/lib/icons.tsx`

- [ ] **Step 1: Add MarketIcon**

In `apps/web/src/lib/icons.tsx`, add:

```typescript
export function MarketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 21h18" />
      <path d="M3 7v1a3 3 0 0 0 6 0V7" />
      <path d="M9 7v1a3 3 0 0 0 6 0V7" />
      <path d="M15 7v1a3 3 0 0 0 6 0V7" />
      <path d="M3 7l2-4h14l2 4" />
      <path d="M5 21V10" />
      <path d="M19 21V10" />
    </Icon>
  );
}
```

- [ ] **Step 2: Add sidebar navigation**

In `apps/web/src/components/layout/Sidebar.tsx`:

1. Import `MarketIcon`:
```typescript
import { ..., MarketIcon } from '@/lib/icons';
```

2. Add to the 'Galaxie' section items array (after Mouvements):
```typescript
{ label: 'Marché', path: '/market', icon: MarketIcon },
```

- [ ] **Step 3: Add route**

In `apps/web/src/router.tsx`, add to the children array:
```typescript
{ path: 'market', lazy: lazyLoad(() => import('./pages/Market')), errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary> },
```

- [ ] **Step 4: Create Market page**

Create `apps/web/src/pages/Market.tsx`. This is a large file — the page has 3 tabs:

**Tab "Acheter"**: Table of active offers with filter pills (Tout/Minerai/Silicium/Hydrogene), columns: Resource, Quantity, Price, Coordinates, Action ("Acheter" button). Cursor-based pagination. When "Acheter" is clicked, call `market.reserveOffer` mutation, then navigate to `/fleet?mission=trade&galaxy=X&system=Y&position=Z&tradeId=OFFER_ID`.

**Tab "Vendre"**: Form with resource select, quantity input, price inputs (minerai, silicium, hydrogene). Shows commission preview and remaining slots. Calls `market.createOffer` mutation.

**Tab "Mes offres"**: List of own offers with status badges (Active/Reserved/Sold/Expired/Cancelled). Cancel button for active offers.

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { cn } from '@/lib/utils';

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

const RESOURCE_LABELS: Record<string, string> = {
  minerai: 'Minerai',
  silicium: 'Silicium',
  hydrogene: 'Hydrogène',
};

type Tab = 'buy' | 'sell' | 'my';

export default function Market() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const { data: gameConfig } = useGameConfig();
  const [tab, setTab] = useState<Tab>('buy');
  const [resourceFilter, setResourceFilter] = useState<string | undefined>(undefined);

  // Sell form state
  const [sellResource, setSellResource] = useState<'minerai' | 'silicium' | 'hydrogene'>('minerai');
  const [sellQuantity, setSellQuantity] = useState(0);
  const [sellPriceMinerai, setSellPriceMinerai] = useState(0);
  const [sellPriceSilicium, setSellPriceSilicium] = useState(0);
  const [sellPriceHydrogene, setSellPriceHydrogene] = useState(0);

  const commissionPercent = Number(gameConfig?.universe?.market_commission_percent) || 5;

  // Queries
  const { data: offersData, isFetching: offersLoading } = trpc.market.list.useQuery(
    { planetId: planetId!, resourceType: resourceFilter as any },
    { enabled: !!planetId && tab === 'buy' },
  );
  const { data: myOffers } = trpc.market.myOffers.useQuery(
    undefined,
    { enabled: tab === 'my' },
  );

  // Mutations
  const createOfferMutation = trpc.market.createOffer.useMutation({
    onSuccess: () => {
      addToast('Offre créée !');
      utils.market.myOffers.invalidate();
      utils.resource.production.invalidate();
      setSellQuantity(0);
      setSellPriceMinerai(0);
      setSellPriceSilicium(0);
      setSellPriceHydrogene(0);
      setTab('my');
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const cancelOfferMutation = trpc.market.cancelOffer.useMutation({
    onSuccess: () => {
      addToast('Offre annulée');
      utils.market.myOffers.invalidate();
      utils.resource.production.invalidate();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const reserveMutation = trpc.market.reserveOffer.useMutation({
    onSuccess: (data) => {
      addToast('Offre réservée ! Envoyez votre flotte.');
      const { sellerPlanet, offer } = data;
      navigate(`/fleet?mission=trade&galaxy=${sellerPlanet.galaxy}&system=${sellerPlanet.system}&position=${sellerPlanet.position}&tradeId=${offer.id}`);
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const cancelReservationMutation = trpc.market.cancelReservation.useMutation({
    onSuccess: () => {
      addToast('Réservation annulée');
      utils.market.myOffers.invalidate();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const handleCreateOffer = () => {
    if (!planetId) return;
    createOfferMutation.mutate({
      planetId,
      resourceType: sellResource,
      quantity: sellQuantity,
      priceMinerai: sellPriceMinerai,
      priceSilicium: sellPriceSilicium,
      priceHydrogene: sellPriceHydrogene,
    });
  };

  const handleBuy = (offerId: string) => {
    if (!planetId) return;
    reserveMutation.mutate({ planetId, offerId });
  };

  const formatPrice = (mi: number, si: number, h2: number) => {
    const parts: string[] = [];
    if (mi > 0) parts.push(`${mi.toLocaleString('fr-FR')} Mi`);
    if (si > 0) parts.push(`${si.toLocaleString('fr-FR')} Si`);
    if (h2 > 0) parts.push(`${h2.toLocaleString('fr-FR')} H2`);
    return parts.join(' + ') || '0';
  };

  const STATUS_STYLES: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400',
    reserved: 'bg-amber-500/20 text-amber-400',
    sold: 'bg-blue-500/20 text-blue-400',
    expired: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-white/10 text-muted-foreground',
  };

  const STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    reserved: 'Réservée',
    sold: 'Vendue',
    expired: 'Expirée',
    cancelled: 'Annulée',
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Marché Galactique" />

      {/* Tabs */}
      <div className="flex gap-0">
        {([
          { key: 'buy' as Tab, label: 'Acheter' },
          { key: 'sell' as Tab, label: 'Vendre' },
          { key: 'my' as Tab, label: 'Mes offres' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors',
              tab === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Buy tab */}
      {tab === 'buy' && (
        <section className="glass-card p-4">
          {/* Resource filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setResourceFilter(undefined)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm transition-colors',
                !resourceFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              Tout
            </button>
            {(['minerai', 'silicium', 'hydrogene'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setResourceFilter(r)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm transition-colors',
                  resourceFilter === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                {RESOURCE_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Offers table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left py-2 px-2">Ressource</th>
                  <th className="text-right py-2 px-2">Quantité</th>
                  <th className="text-right py-2 px-2">Prix</th>
                  <th className="text-right py-2 px-2">Commission</th>
                  <th className="text-center py-2 px-2">Coords</th>
                  <th className="text-center py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {offersLoading && (
                  <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">Chargement...</td></tr>
                )}
                {!offersLoading && (!offersData?.offers || offersData.offers.length === 0) && (
                  <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">Aucune offre disponible</td></tr>
                )}
                {offersData?.offers.map((offer) => {
                  const commMi = offer.priceMinerai > 0 ? Math.ceil(offer.priceMinerai * commissionPercent / 100) : 0;
                  const commSi = offer.priceSilicium > 0 ? Math.ceil(offer.priceSilicium * commissionPercent / 100) : 0;
                  const commH2 = offer.priceHydrogene > 0 ? Math.ceil(offer.priceHydrogene * commissionPercent / 100) : 0;
                  return (
                    <tr key={offer.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className={cn('py-2 px-2 font-medium', RESOURCE_COLORS[offer.resourceType])}>
                        {RESOURCE_LABELS[offer.resourceType]}
                      </td>
                      <td className="text-right py-2 px-2">{offer.quantity.toLocaleString('fr-FR')}</td>
                      <td className="text-right py-2 px-2">{formatPrice(offer.priceMinerai, offer.priceSilicium, offer.priceHydrogene)}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{formatPrice(commMi, commSi, commH2)}</td>
                      <td className="text-center py-2 px-2 text-muted-foreground">
                        [{offer.sellerCoords.galaxy}:{offer.sellerCoords.system}:{offer.sellerCoords.position}]
                      </td>
                      <td className="text-center py-2 px-2">
                        <Button
                          size="sm"
                          onClick={() => handleBuy(offer.id)}
                          disabled={reserveMutation.isPending}
                        >
                          Acheter
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Sell tab */}
      {tab === 'sell' && (
        <section className="glass-card p-4 max-w-lg">
          <div className="space-y-4">
            {/* Resource select */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ressource à vendre</label>
              <div className="flex gap-2">
                {(['minerai', 'silicium', 'hydrogene'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setSellResource(r)}
                    className={cn(
                      'flex-1 rounded px-3 py-2 text-sm font-medium transition-colors',
                      sellResource === r
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {RESOURCE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Quantité</label>
              <input
                type="number"
                min={1}
                value={sellQuantity || ''}
                onChange={(e) => setSellQuantity(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded bg-muted px-3 py-2 text-sm"
                placeholder="10000"
              />
            </div>

            {/* Price */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prix demandé</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] text-orange-400 mb-1">Minerai</div>
                  <input
                    type="number"
                    min={0}
                    value={sellPriceMinerai || ''}
                    onChange={(e) => setSellPriceMinerai(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded bg-muted px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-emerald-400 mb-1">Silicium</div>
                  <input
                    type="number"
                    min={0}
                    value={sellPriceSilicium || ''}
                    onChange={(e) => setSellPriceSilicium(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded bg-muted px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-blue-400 mb-1">Hydrogène</div>
                  <input
                    type="number"
                    min={0}
                    value={sellPriceHydrogene || ''}
                    onChange={(e) => setSellPriceHydrogene(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded bg-muted px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Commission preview */}
            {(sellPriceMinerai > 0 || sellPriceSilicium > 0 || sellPriceHydrogene > 0) && (
              <div className="rounded border border-border p-3 text-xs text-muted-foreground">
                <div>Commission ({commissionPercent}%) payée par l'acheteur :</div>
                <div className="text-foreground mt-1">
                  {formatPrice(
                    sellPriceMinerai > 0 ? Math.ceil(sellPriceMinerai * commissionPercent / 100) : 0,
                    sellPriceSilicium > 0 ? Math.ceil(sellPriceSilicium * commissionPercent / 100) : 0,
                    sellPriceHydrogene > 0 ? Math.ceil(sellPriceHydrogene * commissionPercent / 100) : 0,
                  )}
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleCreateOffer}
              disabled={
                createOfferMutation.isPending ||
                sellQuantity <= 0 ||
                (sellPriceMinerai <= 0 && sellPriceSilicium <= 0 && sellPriceHydrogene <= 0)
              }
            >
              Mettre en vente
            </Button>
          </div>
        </section>
      )}

      {/* My offers tab */}
      {tab === 'my' && (
        <section className="glass-card p-4">
          <div className="space-y-2">
            {!myOffers || myOffers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune offre.</p>
            ) : (
              myOffers.map((offer) => (
                <div key={offer.id} className="flex items-center justify-between rounded border border-border p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-medium', RESOURCE_COLORS[offer.resourceType])}>
                        {Number(offer.quantity).toLocaleString('fr-FR')} {RESOURCE_LABELS[offer.resourceType]}
                      </span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_STYLES[offer.status])}>
                        {STATUS_LABELS[offer.status]}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Prix : {formatPrice(offer.priceMinerai, offer.priceSilicium, offer.priceHydrogene)}
                    </div>
                  </div>
                  {offer.status === 'active' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelOfferMutation.mutate({ offerId: offer.id })}
                      disabled={cancelOfferMutation.isPending}
                    >
                      Annuler
                    </Button>
                  )}
                  {offer.status === 'reserved' && !offer.fleetEventId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelReservationMutation.mutate({ offerId: offer.id })}
                      disabled={cancelReservationMutation.isPending}
                    >
                      Annuler réservation
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Build frontend and verify**

Run: `pnpm --filter web build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Market.tsx apps/web/src/router.tsx apps/web/src/components/layout/Sidebar.tsx apps/web/src/lib/icons.tsx
git commit -m "feat(market): add Market page with buy/sell/my-offers tabs and navigation"
```

---

### Task 10: Fleet page trade mode integration

**Files:**
- Modify: `apps/web/src/pages/Fleet.tsx`

- [ ] **Step 1: Add trade mode support**

In `apps/web/src/pages/Fleet.tsx`:

1. Add state for trade mode (similar to pveMode):
```typescript
const [tradeId, setTradeId] = useState<string | null>(null);
const [tradeMode, setTradeMode] = useState(false);
```

2. In the URL param handling `useEffect`, add trade handling:
```typescript
const paramTradeId = searchParams.get('tradeId');
if (paramTradeId) {
  setTradeId(paramTradeId);
  setTradeMode(true);
}
```

3. Lock coordinates and mission when `tradeMode` is true (same pattern as `pveMode`):
- Mission selector: `locked={pveMode || tradeMode}`
- Coordinate inputs: `disabled={pveMode || tradeMode}`

4. In the send handler, pass `tradeId`:
```typescript
...(tradeId ? { tradeId } : {}),
```

5. When `tradeMode` is true, auto-set cargo to match the required payment (price + commission). This requires fetching the offer details. Add a query:
```typescript
const { data: tradeOffer } = trpc.market.list.useQuery(
  { planetId: planetId! },
  { enabled: false }, // We don't actually need this — the trade info comes from URL params
);
```

Actually, the simpler approach: pass the required cargo as URL params from the Market page when redirecting. Update the Market page's `reserveMutation.onSuccess` to include cargo info:
```typescript
navigate(`/fleet?mission=trade&galaxy=${sellerPlanet.galaxy}&system=${sellerPlanet.system}&position=${sellerPlanet.position}&tradeId=${offer.id}&cargoMi=${offer.totalPayment.minerai}&cargoSi=${offer.totalPayment.silicium}&cargoH2=${offer.totalPayment.hydrogene}`);
```

Then in Fleet.tsx URL param handling:
```typescript
if (paramTradeId) {
  setTradeId(paramTradeId);
  setTradeMode(true);
  const cargoMi = Number(searchParams.get('cargoMi')) || 0;
  const cargoSi = Number(searchParams.get('cargoSi')) || 0;
  const cargoH2 = Number(searchParams.get('cargoH2')) || 0;
  setCargo({ minerai: cargoMi, silicium: cargoSi, hydrogene: cargoH2 });
}
```

6. When `tradeMode`, make cargo inputs read-only:
```typescript
readOnly={tradeMode}
```

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter web build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Fleet.tsx apps/web/src/pages/Market.tsx
git commit -m "feat(market): integrate trade mode in fleet page with locked coords and auto-cargo"
```

---

### Task 11: Run migration and end-to-end verification

- [ ] **Step 1: Run migration**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm --filter @ogame-clone/db db:migrate
```

- [ ] **Step 2: Re-seed game config**

```bash
pnpm --filter @ogame-clone/db db:seed
```

- [ ] **Step 3: Build all packages**

```bash
pnpm build
```

- [ ] **Step 4: Start dev server and verify**

```bash
pnpm dev
```

Verify:
1. Galactic Market building appears in building list (requires shipyard level 2)
2. Market page accessible at `/market` after building market level 1
3. Can create a sell offer (resources deducted)
4. Offer appears in buy tab for other players
5. Can reserve and send trade fleet
6. Trade completes: seller gets payment, buyer gets merchandise

- [ ] **Step 5: Final commit and push**

```bash
git add -A && git status
git push
```
