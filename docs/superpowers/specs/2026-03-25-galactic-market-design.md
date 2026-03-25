# Galactic Market Design Spec

## Goal

Add a player-to-player resource trading system unlocked by a new building (Galactic Market). Players can sell resources at a fixed price and other players can purchase them by sending a trade fleet.

## Architecture

The market is a global order book: sellers post offers visible to all players, buyers reserve an offer then dispatch a fleet to complete the trade. Resources are escrowed on creation, payment happens on fleet arrival, and merchandise returns with the fleet. A configurable commission (paid by the buyer) acts as an economic sink.

## Tech Stack

- **Database**: Drizzle ORM, new `market_offers` table + schema additions to `fleet_events` and `universe_config`
- **Backend**: tRPC router + service (same pattern as fleet/building), BullMQ jobs for expiration
- **Game Engine**: Pure formulas for max offers, commission calculation
- **Frontend**: React page with 3 tabs (Buy/Sell/My Offers), integration with fleet send page
- **Notifications**: SSE via existing `publishNotification` pipeline

---

## 1. Data Model

### 1.1 New table: `market_offers`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | Offer ID |
| `seller_id` | uuid, FK -> users | Seller |
| `planet_id` | uuid, FK -> planets | Seller's planet (origin of escrowed resources) |
| `resource_type` | enum(`minerai`, `silicium`, `hydrogene`) | Resource being sold |
| `quantity` | numeric(20,2) | Amount for sale |
| `price_minerai` | numeric(20,2), default 0 | Price component in minerai |
| `price_silicium` | numeric(20,2), default 0 | Price component in silicium |
| `price_hydrogene` | numeric(20,2), default 0 | Price component in hydrogene |
| `status` | enum(`active`, `reserved`, `sold`, `expired`, `cancelled`) | Offer state |
| `reserved_by` | uuid, nullable, FK -> users | Buyer who reserved |
| `reserved_at` | timestamp with tz, nullable | Reservation start |
| `fleet_event_id` | uuid, nullable, FK -> fleet_events | Linked trade fleet |
| `expires_at` | timestamp with tz | Offer expiration time |
| `created_at` | timestamp with tz, default now() | Creation time |

### 1.2 Schema additions

**`fleet_events`**: Add column `trade_id` (uuid, nullable, FK -> `market_offers`) to link a trade fleet to its offer.

**`planet_buildings`**: No change needed — the existing `planetBuildings` table already supports any building ID.

### 1.3 Indexes

- `market_offers(status)` — filter active offers
- `market_offers(seller_id, status)` — "my offers" queries
- `market_offers(resource_type, status)` — filter by resource

---

## 2. Configuration

### 2.1 `universe_config` entries

| Key | Default | Description |
|-----|---------|-------------|
| `market_commission_percent` | `5` | Commission percentage paid by buyer |
| `market_offer_duration_hours` | `48` | Offer lifetime before expiration |
| `market_reservation_minutes` | `60` | Time buyer has to send fleet after reserving |

### 2.2 Building definition: `galacticMarket`

| Field | Value |
|-------|-------|
| `id` | `galacticMarket` |
| `name` | Marche Galactique |
| `categoryId` | `building_industrie` |
| `baseCostMinerai` | 5000 |
| `baseCostSilicium` | 5000 |
| `baseCostHydrogene` | 1000 |
| `costFactor` | 1.5 |
| `baseTime` | 120 |
| `role` | `market` |
| Prerequisites | `shipyard` level 2 |

### 2.3 Mission definition: `trade`

| Field | Value |
|-------|-------|
| `id` | `trade` |
| `label` | Commerce |
| `hint` | Envoyez une flotte chercher des marchandises achetees sur le marche |
| `buttonLabel` | Commercer |
| `color` | `#a78bfa` (violet) |
| `sortOrder` | 9 |
| `dangerous` | false |
| `requiredShipRoles` | `null` (cargo capacity validation in sendFleet is sufficient) |
| `recommendedShipRoles` | `["smallCargo", "largeCargo"]` |
| `exclusive` | false |
| `requiresPveMission` | false |

Note: No new ship role needed. The existing cargo capacity check in `sendFleet` naturally enforces that the fleet has enough cargo ships to carry the payment. Standard fuel consumption applies (same as any fleet mission).

### 2.4 Formulas (game-engine)

- **Max offers**: `galacticMarketLevel * 2`
- **Commission amount**: `price * market_commission_percent / 100` (per resource component, rounded up)

---

## 3. Business Flows

### 3.1 Create offer (sell)

1. Validate: market building level >= 1 on selected planet
2. Validate: active offer count < max offers (`level * 2`)
3. Validate: no hostile fleet detected inbound to this planet
4. Validate: sufficient resources on planet
5. Deduct resources from planet (escrow)
6. Insert `market_offers` row with `status: active`, `expires_at: now + offer_duration`
7. Schedule BullMQ job `market-expire` with delay = offer_duration

### 3.2 Cancel offer

1. Validate: offer belongs to seller, status is `active` (not `reserved`)
2. Restore escrowed resources to seller's planet
3. Set status to `cancelled`
4. Remove scheduled `market-expire` job

### 3.3 Reserve offer (buy)

1. Validate: buyer has `galacticMarket` building level >= 1 on current planet
2. Validate: offer status is `active`
3. Validate: buyer is not the seller
4. Set `status: reserved`, `reserved_by: buyerId`, `reserved_at: now()`
5. Schedule BullMQ job `market-reservation-expire` with delay = reservation timeout
6. Notify seller via SSE: `market-offer-reserved`
7. Return offer details + seller planet coordinates for fleet dispatch

### 3.3b Cancel reservation

1. Validate: offer is `reserved` by this buyer, and no `fleet_event_id` (fleet not yet sent)
2. Clear `reserved_by`, `reserved_at`
3. Set offer back to `active`
4. Cancel the `market-reservation-expire` job

### 3.4 Send trade fleet

1. Buyer composes fleet on fleet page with locked coordinates and `mission: trade`
2. `sendFleet` validates:
   - `tradeId` is provided and offer is `reserved` by this buyer
   - Target coordinates match seller's planet
   - Total cargo >= price + commission (all resource components)
3. Fleet cargo is loaded with payment: `mineraiCargo = price_minerai + commission_minerai`, etc.
4. Resources (payment) deducted from buyer's planet
5. `fleet_event` created with `trade_id` set
6. `market_offers.fleet_event_id` updated
7. Cancel the `market-reservation-expire` job (fleet was sent in time)

### 3.5 Trade fleet arrival (outbound)

1. `TradeHandler.processArrival`:
   - Credit seller's planet with payment (price only, no commission)
   - Commission is destroyed (not credited anywhere — economic sink)
   - Load merchandise (escrowed resources) into fleet cargo
   - Set offer `status: sold`
   - Set fleet `phase: return`, schedule return job
2. Notify seller via SSE: `market-offer-sold`

### 3.6 Trade fleet return

1. Standard `processReturn` handles this — credits cargo (merchandise) to buyer's planet
2. Notify buyer via SSE: `fleet-returned` (existing event)

### 3.7 Fleet recall

1. Standard recall flow — fleet returns with its cargo (the payment)
2. Additionally: set offer back to `status: active`, clear `reserved_by`, `reserved_at`, `fleet_event_id`
3. Re-schedule `market-expire` job for remaining offer duration

### 3.8 Reservation expiration

1. `market-reservation-expire` job fires
2. If offer is still `reserved` and no `fleet_event_id`: set back to `active`, clear reservation fields
3. Notify buyer via SSE: `market-reservation-expired`

### 3.9 Offer expiration

1. `market-expire` job fires
2. If offer status is `active`: restore resources to seller's planet, set status to `expired`
3. If offer status is `reserved`: do nothing (reservation or fleet in progress — the reservation expiry or fleet completion will handle it)
4. Notify seller via SSE: `market-offer-expired`

---

## 4. Anti-abuse: Attack lockout

When a hostile fleet is detected inbound to a planet (i.e., `fleet_events` with `detected_at IS NOT NULL`, `phase = 'outbound'`, `status = 'active'` targeting the planet), **creating new offers from that planet is blocked**.

- Scope: per-planet only (other planets of the same player are unaffected)
- Cancelling existing offers is allowed (resources return to the planet, remain pillable)
- Buying from the market is unaffected

This prevents players from hiding resources in the market to avoid pillage.

---

## 5. API (tRPC Router)

### 5.1 Queries

- `market.list` — List `active` offers only (paginated, cursor-based). Reserved/sold/expired offers are excluded. Filters: `resourceType`, sort by price. Excludes own offers. Returns coordinates (no seller name).
- `market.myOffers` — List own offers (all statuses). Shows status, remaining time, buyer info for reserved ones.
- `market.offerDetail` — Single offer details (for fleet dispatch page).

### 5.2 Mutations

- `market.createOffer` — Create a sell offer. Input: `planetId`, `resourceType`, `quantity`, `priceMinerai`, `priceSilicium`, `priceHydrogene`.
- `market.cancelOffer` — Cancel own active offer.
- `market.reserveOffer` — Reserve an offer for purchase. Returns seller planet coordinates.
- `market.cancelReservation` — Cancel own reservation (offer goes back to active).

The actual fleet dispatch uses the existing `fleet.send` mutation with `mission: 'trade'` and `tradeId`.

---

## 6. Frontend

### 6.1 Page structure

New page `/market` accessible from main navigation. Requires `galacticMarket` building level >= 1 on current planet.

**3 tabs:**
- **Acheter** — Table of active offers with columns: Resource, Quantity, Price, Distance, Action. Filter pills by resource type. Sort by price (ascending). "Acheter" button triggers reservation + redirect to fleet page.
- **Vendre** — Form: select resource, enter quantity, set price (per resource component). Shows commission preview, remaining offer slots. "Mettre en vente" button.
- **Mes offres** — List of own offers with status badges (Active/Reserved/Sold/Expired/Cancelled). Cancel button for active offers.

### 6.2 Fleet page integration

When navigating from a market purchase:
- Coordinates pre-filled and locked (seller's planet)
- Mission locked to `trade`
- Cargo pre-calculated: price + commission auto-loaded
- Validation: total fleet cargo capacity >= payment amount
- `tradeId` passed as hidden parameter

### 6.3 Notifications (useNotifications.ts)

New SSE event handlers:
- `market-offer-reserved` — invalidate `market.myOffers`, toast "Votre offre a ete reservee"
- `market-offer-sold` — invalidate `market.myOffers`, toast "Vente finalisee ! Paiement recu"
- `market-offer-expired` — invalidate `market.myOffers`, toast "Offre expiree, ressources restituees"
- `market-reservation-expired` — invalidate `market.list`, toast "Reservation expiree"

---

## 7. BullMQ Jobs

| Queue | Job name | Trigger | Action |
|-------|----------|---------|--------|
| `market` | `market-expire` | Offer creation | Expire offer, restore resources |
| `market` | `market-reservation-expire` | Offer reservation | Release reservation if no fleet sent |

Both jobs use delayed scheduling (same pattern as fleet jobs).

---

## 8. Files to create/modify

### New files
- `packages/db/src/schema/market-offers.ts` — Schema
- `packages/db/drizzle/XXXX_galactic_market.sql` — Migration
- `packages/game-engine/src/formulas/market.ts` — Pure formulas
- `apps/api/src/modules/market/market.service.ts` — Business logic
- `apps/api/src/modules/market/market.router.ts` — tRPC router
- `apps/api/src/modules/fleet/handlers/trade.handler.ts` — Trade mission handler
- `apps/api/src/workers/market.worker.ts` — BullMQ worker
- `apps/web/src/pages/Market.tsx` — Frontend page

### Modified files
- `packages/db/src/schema/fleet-events.ts` — Add `trade_id` column
- `packages/db/src/schema/index.ts` — Export new schema
- `packages/db/src/seed-game-config.ts` — Add building + mission definitions
- `packages/game-engine/src/index.ts` — Export market formulas
- `apps/api/src/modules/fleet/fleet.service.ts` — Handle trade mission in sendFleet, recallFleet
- `apps/api/src/modules/fleet/fleet.types.ts` — Add `trade` to mission handlers registry
- `apps/api/src/trpc/app-router.ts` — Wire market router + service
- `apps/api/src/workers/index.ts` — Start market worker
- `apps/web/src/hooks/useNotifications.ts` — Add market SSE handlers
- `apps/web/src/App.tsx` (or routes config) — Add /market route
- `apps/web/src/pages/Fleet.tsx` (or fleet send page) — Handle locked trade mode
