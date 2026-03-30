# Seller Commission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move market commission from buyer (at trade time) to seller (at offer creation), making it a non-refundable fee on the sold resource.

**Architecture:** 4 tasks in sequence — game-engine formula (TDD), API market service, API trade handler cleanup, frontend update. Each task produces a working commit.

**Tech Stack:** TypeScript, Vitest, tRPC, Drizzle ORM, React

---

### Task 1: Replace `calculateCommission` with `calculateSellerCommission` in game-engine

**Files:**
- Modify: `packages/game-engine/src/formulas/market.ts`
- Create: `packages/game-engine/src/formulas/market.test.ts`

- [ ] **Step 1: Create test file with failing tests**

Create `packages/game-engine/src/formulas/market.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateSellerCommission, maxMarketOffers } from './market.js';

describe('calculateSellerCommission', () => {
  it('returns 5% of quantity rounded up', () => {
    expect(calculateSellerCommission(10000, 5)).toBe(500);
  });

  it('rounds up fractional results', () => {
    expect(calculateSellerCommission(101, 5)).toBe(6); // 5.05 → 6
  });

  it('returns 0 for zero quantity', () => {
    expect(calculateSellerCommission(0, 5)).toBe(0);
  });

  it('returns 0 for zero percent', () => {
    expect(calculateSellerCommission(10000, 0)).toBe(0);
  });

  it('handles reduced commission from talent', () => {
    // 5% / (1 + 0.5) = 3.333...%
    const adjusted = 5 / (1 + 0.5);
    expect(calculateSellerCommission(10000, adjusted)).toBe(334); // 333.33 → 334
  });
});

describe('maxMarketOffers', () => {
  it('returns level * 2', () => {
    expect(maxMarketOffers(1)).toBe(2);
    expect(maxMarketOffers(5)).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/game-engine && npx vitest run src/formulas/market.test.ts`
Expected: FAIL — `calculateSellerCommission` is not exported

- [ ] **Step 3: Replace the function in market.ts**

Replace the entire content of `packages/game-engine/src/formulas/market.ts` with:

```ts
/**
 * Maximum number of simultaneous market offers for a given market building level.
 */
export function maxMarketOffers(marketLevel: number): number {
  return marketLevel * 2;
}

/**
 * Calculate the seller commission on a market offer.
 * Commission is paid by the seller at offer creation, on the same resource being sold.
 * Rounded up (ceil) to avoid fractional exploits.
 */
export function calculateSellerCommission(quantity: number, commissionPercent: number): number {
  if (quantity <= 0 || commissionPercent <= 0) return 0;
  return Math.ceil((quantity * commissionPercent) / 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/game-engine && npx vitest run src/formulas/market.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/formulas/market.ts packages/game-engine/src/formulas/market.test.ts
git commit -m "feat(market): replace calculateCommission with calculateSellerCommission"
```

---

### Task 2: Update market service to charge seller commission at offer creation

**Files:**
- Modify: `apps/api/src/modules/market/market.service.ts`

The `createMarketService` function receives `_talentService` as its 8th parameter (currently unused, prefixed with `_`). We need to activate it.

- [ ] **Step 1: Rename `_talentService` to `talentService` in the function signature**

In `apps/api/src/modules/market/market.service.ts` line 22, replace:

```ts
  _talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
```

With:

```ts
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
```

- [ ] **Step 2: Add import for `calculateSellerCommission`**

In line 6, replace:

```ts
import { maxMarketOffers } from '@exilium/game-engine';
```

With:

```ts
import { maxMarketOffers, calculateSellerCommission } from '@exilium/game-engine';
```

- [ ] **Step 3: Update `createOffer` to charge commission**

In the `createOffer` method, replace the escrow block (lines 104-107):

```ts
      // Deduct resources (escrow)
      const cost = { minerai: 0, silicium: 0, hydrogene: 0 };
      cost[input.resourceType] = input.quantity;
      await resourceService.spendResources(planetId, userId, cost);
```

With:

```ts
      // Calculate commission (paid by seller, non-refundable)
      const config = await gameConfigService.getFullConfig();
      const commissionPercent = Number(config.universe.market_commission_percent) || 5;
      const talentCtx = talentService ? await talentService.computeTalentContext(userId) : {};
      const adjustedPercent = commissionPercent / (1 + (talentCtx['market_fee'] ?? 0));
      const commission = calculateSellerCommission(input.quantity, adjustedPercent);

      // Deduct resources (escrow + commission)
      const cost = { minerai: 0, silicium: 0, hydrogene: 0 };
      cost[input.resourceType] = input.quantity + commission;
      await resourceService.spendResources(planetId, userId, cost);
```

- [ ] **Step 4: Move `config` fetch to avoid duplicate call**

The `config` variable is now fetched earlier (in step 3). Remove the duplicate fetch that was at line 110:

```ts
      const config = await gameConfigService.getFullConfig();
```

This line is now unnecessary since `config` was already fetched in step 3. Delete it. The `durationHours` line that follows should use the `config` from step 3.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && pnpm build`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/market/market.service.ts
git commit -m "feat(market): charge seller commission at offer creation"
```

---

### Task 3: Remove buyer commission from trade handler

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/trade.handler.ts`

- [ ] **Step 1: Remove `calculateCommission` import**

In line 4, replace:

```ts
import { calculateCommission, totalCargoCapacity } from '@exilium/game-engine';
```

With:

```ts
import { totalCargoCapacity } from '@exilium/game-engine';
```

- [ ] **Step 2: Remove commission calculation in `validateFleet`**

Replace the entire block from line 73 to line 103 (commission calculation + cargo validation):

```ts
    // Verify cargo covers price + commission
    const commissionPercent = Number(config.universe.market_commission_percent) || 5;

    // Apply talent bonus to reduce commission for buyer
    const talentCtxValidate = ctx.talentService ? await ctx.talentService.computeTalentContext(userId) : {};
    const adjustedCommissionValidate = commissionPercent / (1 + (talentCtxValidate['market_fee'] ?? 0));

    const price = {
      minerai: Number(offer.priceMinerai),
      silicium: Number(offer.priceSilicium),
      hydrogene: Number(offer.priceHydrogene),
    };
    const commission = calculateCommission(price, adjustedCommissionValidate);
    const requiredMinerai = price.minerai + commission.minerai;
    const requiredSilicium = price.silicium + commission.silicium;
    const requiredHydrogene = price.hydrogene + commission.hydrogene;

    const cargoMinerai = input.mineraiCargo ?? 0;
    const cargoSilicium = input.siliciumCargo ?? 0;
    const cargoHydrogene = input.hydrogeneCargo ?? 0;

    if (cargoMinerai < requiredMinerai || cargoSilicium < requiredSilicium || cargoHydrogene < requiredHydrogene) {
      // Rollback reservation
      await ctx.db
        .update(marketOffers)
        .set({ status: 'active', reservedBy: null, reservedAt: null })
        .where(eq(marketOffers.id, input.tradeId));
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cargo insuffisant. Requis: ${requiredMinerai} Mi, ${requiredSilicium} Si, ${requiredHydrogene} H2`,
      });
    }
```

With:

```ts
    // Verify cargo covers price (no buyer commission — seller paid it at offer creation)
    const priceMinerai = Number(offer.priceMinerai);
    const priceSilicium = Number(offer.priceSilicium);
    const priceHydrogene = Number(offer.priceHydrogene);

    const cargoMinerai = input.mineraiCargo ?? 0;
    const cargoSilicium = input.siliciumCargo ?? 0;
    const cargoHydrogene = input.hydrogeneCargo ?? 0;

    if (cargoMinerai < priceMinerai || cargoSilicium < priceSilicium || cargoHydrogene < priceHydrogene) {
      // Rollback reservation
      await ctx.db
        .update(marketOffers)
        .set({ status: 'active', reservedBy: null, reservedAt: null })
        .where(eq(marketOffers.id, input.tradeId));
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cargo insuffisant. Requis: ${priceMinerai} Mi, ${priceSilicium} Si, ${priceHydrogene} H2`,
      });
    }
```

- [ ] **Step 3: Update comment in `processArrival`**

In `processArrival`, replace the comment at line 165:

```ts
    // Commission was already deducted from buyer at purchase time (economic sink)
```

With:

```ts
    // Commission was paid by seller at offer creation (economic sink)
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && pnpm build`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/trade.handler.ts
git commit -m "feat(market): remove buyer commission from trade handler"
```

---

### Task 4: Update Market.tsx frontend

**Files:**
- Modify: `apps/web/src/pages/Market.tsx`

- [ ] **Step 1: Update `handleBuy` function — remove commission from cargo**

Around line 118-124, replace the `handleBuy` function body:

```ts
    const commMi = offer.priceMinerai > 0 ? Math.ceil(offer.priceMinerai * commissionPercent / 100) : 0;
    const commSi = offer.priceSilicium > 0 ? Math.ceil(offer.priceSilicium * commissionPercent / 100) : 0;
    const commH2 = offer.priceHydrogene > 0 ? Math.ceil(offer.priceHydrogene * commissionPercent / 100) : 0;
    navigate(`/fleet/send?mission=trade&galaxy=${offer.sellerCoords.galaxy}&system=${offer.sellerCoords.system}&position=${offer.sellerCoords.position}&tradeId=${offer.id}&cargoMi=${offer.priceMinerai + commMi}&cargoSi=${offer.priceSilicium + commSi}&cargoH2=${offer.priceHydrogene + commH2}`);
```

With:

```ts
    navigate(`/fleet/send?mission=trade&galaxy=${offer.sellerCoords.galaxy}&system=${offer.sellerCoords.system}&position=${offer.sellerCoords.position}&tradeId=${offer.id}&cargoMi=${offer.priceMinerai}&cargoSi=${offer.priceSilicium}&cargoH2=${offer.priceHydrogene}`);
```

- [ ] **Step 2: Remove commission display from buy offer cards**

In the buy tab offer cards (around lines 244-283), remove the commission calculation and display. Replace the entire price/commission/total block:

```tsx
                  const commMi = offer.priceMinerai > 0 ? Math.ceil(offer.priceMinerai * commissionPercent / 100) : 0;
                  const commSi = offer.priceSilicium > 0 ? Math.ceil(offer.priceSilicium * commissionPercent / 100) : 0;
                  const commH2 = offer.priceHydrogene > 0 ? Math.ceil(offer.priceHydrogene * commissionPercent / 100) : 0;
```

Delete these 3 lines (no replacement needed — they're no longer used).

Then remove the commission row and total row from the card JSX. Replace the block from "Prix" through "Total":

```tsx
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Prix</span>
                          <span className="text-foreground">{formatPrice(offer.priceMinerai, offer.priceSilicium, offer.priceHydrogene)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Commission ({commissionPercent}%)</span>
                          <span className="text-muted-foreground">{formatPrice(commMi, commSi, commH2)}</span>
                        </div>
                        <div className="border-t border-white/10 pt-1 flex justify-between font-medium">
                          <span className="text-muted-foreground">Total</span>
                          <span className="text-foreground">
                            {formatPrice(
                              offer.priceMinerai + commMi,
                              offer.priceSilicium + commSi,
                              offer.priceHydrogene + commH2,
                            )}
                          </span>
                        </div>
```

With just the price line:

```tsx
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Prix</span>
                          <span className="text-foreground">{formatPrice(offer.priceMinerai, offer.priceSilicium, offer.priceHydrogene)}</span>
                        </div>
```

- [ ] **Step 3: Update sell tab commission preview**

Replace the entire commission preview block (lines 366-379):

```tsx
              {/* Commission preview */}
              {(sellPriceMinerai > 0 || sellPriceSilicium > 0 || sellPriceHydrogene > 0) && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-xs">
                  <div className="text-muted-foreground mb-1.5">
                    Commission ({commissionPercent}%) payee par l'acheteur :
                  </div>
                  <div className="text-primary font-medium">
                    {formatPrice(
                      sellPriceMinerai > 0 ? Math.ceil(sellPriceMinerai * commissionPercent / 100) : 0,
                      sellPriceSilicium > 0 ? Math.ceil(sellPriceSilicium * commissionPercent / 100) : 0,
                      sellPriceHydrogene > 0 ? Math.ceil(sellPriceHydrogene * commissionPercent / 100) : 0,
                    )}
                  </div>
                </div>
              )}
```

With:

```tsx
              {/* Commission preview (paid by seller) */}
              {sellQuantity > 0 && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quantite en vente</span>
                    <span className="text-foreground">{sellQuantity.toLocaleString('fr-FR')} {RESOURCE_LABELS[sellResource]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Commission ({commissionPercent}%)</span>
                    <span className="text-destructive">{Math.ceil(sellQuantity * commissionPercent / 100).toLocaleString('fr-FR')} {RESOURCE_LABELS[sellResource]}</span>
                  </div>
                  <div className="border-t border-white/10 pt-1 flex justify-between font-medium">
                    <span className="text-muted-foreground">Total preleve</span>
                    <span className="text-foreground">{(sellQuantity + Math.ceil(sellQuantity * commissionPercent / 100)).toLocaleString('fr-FR')} {RESOURCE_LABELS[sellResource]}</span>
                  </div>
                </div>
              )}
```

- [ ] **Step 4: Clean up unused `commissionPercent` usage if only used for sell tab**

Check: `commissionPercent` is still needed for the sell tab preview. Keep the declaration at line 58. But verify it's not used elsewhere after removing buy-tab references. If it's only in the sell tab now, that's fine.

- [ ] **Step 5: Verify build**

Run: `cd /Users/julienaubree/_projet/exilium-game/exilium && pnpm build`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Market.tsx
git commit -m "feat(market): update frontend for seller-paid commission"
```
