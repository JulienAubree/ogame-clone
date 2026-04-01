# Flagship Hull System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hull selection system to the flagship that determines its specialization (combat, industrial, scientific) with passive bonuses, exclusive abilities, and a scan mission.

**Architecture:** Hull definitions live in game-config (seed). A `hullId` column on flagships stores the choice. Hull bonuses flow through `computeTalentContext` for build/research time, and through `flagship.get()` for combat stats. Scan mission is a new handler delegating to spy logic. Image directories reorganize by hull type.

**Tech Stack:** Drizzle ORM (Postgres), tRPC, React, BullMQ workers, game-engine formulas

**Spec:** `docs/superpowers/specs/2026-04-01-flagship-hull-system-design.md`

---

### Task 1: DB Schema — Add hull columns to flagships

**Files:**
- Modify: `packages/db/src/schema/flagships.ts`

- [ ] **Step 1: Add hull columns to schema**

In `packages/db/src/schema/flagships.ts`, add 4 new columns after `repairEndsAt` (line 34):

```typescript
  // Coque
  hullId: varchar('hull_id', { length: 32 }),
  hullChangedAt: timestamp('hull_changed_at', { withTimezone: true }),
  hullChangeAvailableAt: timestamp('hull_change_available_at', { withTimezone: true }),
  refitEndsAt: timestamp('refit_ends_at', { withTimezone: true }),
```

`hullId` is nullable for migration compatibility. New flagships will always have a value.

- [ ] **Step 2: Generate and run migration**

```bash
cd apps/api && npx drizzle-kit generate
```

Review the generated migration SQL — it should add 4 nullable columns. Then:

```bash
cd apps/api && npx drizzle-kit push
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/flagships.ts apps/api/drizzle/
git commit -m "feat(hull): add hull columns to flagships schema"
```

---

### Task 2: Game Config — Add hull definitions

**Files:**
- Modify: `packages/db/src/seed-game-config.ts`
- Modify: `apps/api/src/modules/admin/game-config.service.ts`

- [ ] **Step 1: Add HullConfig interface to GameConfigService**

In `apps/api/src/modules/admin/game-config.service.ts`, add after `TalentConfig` interface:

```typescript
export interface HullConfig {
  id: string;
  name: string;
  description: string;
  playstyle: 'warrior' | 'miner' | 'explorer';
  passiveBonuses: Record<string, number>;
  abilities: string[];
  changeCost: {
    baseMultiplier: number;
    resourceRatio: { minerai: number; silicium: number; hydrogene: number };
  };
  unavailabilitySeconds: number;
  cooldownSeconds: number;
  scanCooldownSeconds?: number;
  scanEspionageBonus?: number;
}
```

Then update the `getFullConfig()` return type to include `hulls: Record<string, HullConfig>`. Look at how `talents` is built from DB rows — hulls follow the same pattern. Add hulls to the query and return object.

- [ ] **Step 2: Add hull seed data**

In `packages/db/src/seed-game-config.ts`, add hull definitions alongside the talent branches. Create a `HULLS` array:

```typescript
const HULLS = [
  {
    id: 'combat',
    name: 'Coque de combat',
    description: 'Vaisseau taillé pour la guerre. Bonus de stats de combat et réduction du temps de construction des vaisseaux militaires.',
    playstyle: 'warrior',
    passiveBonuses: {
      combat_build_time_reduction: 0.20,
      bonus_armor: 6,
      bonus_shot_count: 2,
      bonus_weapons: 8,
    },
    abilities: [],
    changeCost: { baseMultiplier: 500, resourceRatio: { minerai: 3, silicium: 2, hydrogene: 1 } },
    unavailabilitySeconds: 7200,
    cooldownSeconds: 604800,
  },
  {
    id: 'industrial',
    name: 'Coque industrielle',
    description: 'Vaisseau optimisé pour l\'extraction et le recyclage. Réduction du temps de construction des vaisseaux industriels.',
    playstyle: 'miner',
    passiveBonuses: {
      industrial_build_time_reduction: 0.20,
    },
    abilities: ['mine_mission', 'recycle_mission'],
    changeCost: { baseMultiplier: 500, resourceRatio: { minerai: 3, silicium: 2, hydrogene: 1 } },
    unavailabilitySeconds: 7200,
    cooldownSeconds: 604800,
  },
  {
    id: 'scientific',
    name: 'Coque scientifique',
    description: 'Vaisseau orienté recherche et renseignement. Réduction du temps de recherche et capacité de scan.',
    playstyle: 'explorer',
    passiveBonuses: {
      research_time_reduction: 0.20,
    },
    abilities: ['scan_mission'],
    changeCost: { baseMultiplier: 500, resourceRatio: { minerai: 3, silicium: 2, hydrogene: 1 } },
    unavailabilitySeconds: 7200,
    cooldownSeconds: 604800,
    scanCooldownSeconds: 3600,
    scanEspionageBonus: 2,
  },
];
```

Add them to the `game_config` rows seeded into the DB (same pattern as talent branches — stored as a JSON row in the config table with key `'hulls'`).

- [ ] **Step 3: Wire hulls in GameConfigService.getFullConfig()**

Read the `hulls` config row and return it as `Record<string, HullConfig>` keyed by `id`, same pattern as `talents`.

- [ ] **Step 4: Run seed and verify**

```bash
cd apps/api && npx tsx src/scripts/seed.ts
```

Verify hulls appear in config output.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/seed-game-config.ts apps/api/src/modules/admin/game-config.service.ts
git commit -m "feat(hull): add hull definitions to game config"
```

---

### Task 3: Image Utils — Hull-based directory structure

**Files:**
- Modify: `apps/api/src/lib/flagship-image.util.ts`
- Modify: `apps/web/src/lib/assets.ts`

Reference pattern: `apps/api/src/lib/planet-image.util.ts`

- [ ] **Step 1: Refactor flagship-image.util.ts**

Rewrite the 3 functions to accept `hullId` as first parameter, scanning `/assets/flagships/{hullId}/` instead of `/assets/flagships/`:

```typescript
import fs from 'fs';
import path from 'path';

export function getRandomFlagshipImageIndex(hullId: string, assetsDir: string): number | null {
  const dir = path.join(assetsDir, 'flagships', hullId);
  if (!fs.existsSync(dir)) return null;

  const indexes = fs.readdirSync(dir)
    .filter((f) => /^\d+\.webp$/.test(f))
    .map((f) => parseInt(f, 10))
    .sort((a, b) => a - b);

  if (indexes.length === 0) return null;
  return indexes[Math.floor(Math.random() * indexes.length)];
}

export function getNextFlagshipImageIndex(hullId: string, assetsDir: string): number {
  const dir = path.join(assetsDir, 'flagships', hullId);
  if (!fs.existsSync(dir)) return 1;

  const indexes = fs.readdirSync(dir)
    .filter((f) => /^\d+\.webp$/.test(f))
    .map((f) => parseInt(f, 10));

  if (indexes.length === 0) return 1;
  return Math.max(...indexes) + 1;
}

export function listFlagshipImageIndexes(hullId: string, assetsDir: string): number[] {
  const dir = path.join(assetsDir, 'flagships', hullId);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => /^\d+\.webp$/.test(f))
    .map((f) => parseInt(f, 10))
    .sort((a, b) => a - b);
}
```

- [ ] **Step 2: Update all callers of these functions**

In `flagship.service.ts`, update calls to pass `hullId`:
- `create()` line 138: `getRandomFlagshipImageIndex(hullId, assetsDir)`
- `listImages()`: needs to receive `hullId` param → `listFlagshipImageIndexes(hullId, assetsDir)`
- `updateImage()`: validate index belongs to flagship's current hull

- [ ] **Step 3: Update frontend assets.ts**

Change `getFlagshipImageUrl` to accept `hullId`:

```typescript
export function getFlagshipImageUrl(
  hullId: string,
  imageIndex: number,
  size: AssetSize = 'full',
): string {
  return `/assets/flagships/${hullId}/${imageIndex}${SUFFIX[size]}.webp`;
}
```

- [ ] **Step 4: Move existing images**

```bash
mkdir -p apps/web/public/assets/flagships/industrial
mv apps/web/public/assets/flagships/*.webp apps/web/public/assets/flagships/industrial/ 2>/dev/null || true
mkdir -p apps/web/public/assets/flagships/combat
mkdir -p apps/web/public/assets/flagships/scientific
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/flagship-image.util.ts apps/web/src/lib/assets.ts apps/web/public/assets/flagships/
git commit -m "feat(hull): reorganize flagship images by hull type"
```

---

### Task 4: Flagship Service — Create with hull + playstyle

**Files:**
- Modify: `apps/api/src/modules/flagship/flagship.service.ts`
- Modify: `apps/api/src/modules/flagship/flagship.router.ts`

- [ ] **Step 1: Update create() to accept hullId**

In `flagship.service.ts`, modify the `create` method signature (line 110):

```typescript
async create(userId: string, name: string, hullId: string, description?: string) {
```

Add hull validation after name validation:

```typescript
const config = await gameConfigService.getFullConfig();
const hullConfig = config.hulls[hullId];
if (!hullConfig) {
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coque inconnue' });
}
```

Update the image call (line 138):

```typescript
const randomImage = assetsDir ? getRandomFlagshipImageIndex(hullId, assetsDir) : null;
```

Add `hullId` to the insert values (line 142):

```typescript
.values({
  userId,
  planetId: homePlanet.id,
  name: sanitizeText(name),
  description: sanitizedDesc,
  flagshipImageIndex: randomImage,
  hullId,
})
```

After creating the flagship, update the user's playstyle:

```typescript
import { users } from '@exilium/db';
// ...
await db.update(users).set({ playstyle: hullConfig.playstyle }).where(eq(users.id, userId));
```

- [ ] **Step 2: Update router to accept hullId**

In `flagship.router.ts`, update the `create` procedure input (around line 18):

```typescript
.input(z.object({
  name: z.string().min(2).max(32),
  description: z.string().max(256).optional(),
  hullId: z.enum(['combat', 'industrial', 'scientific']),
}))
```

Pass `hullId` to the service call:

```typescript
return ctx.flagshipService.create(ctx.userId, input.name, input.hullId, input.description);
```

- [ ] **Step 3: Add listImages hullId parameter**

Update `listImages` in service and router to require `hullId`:

Router:
```typescript
listImages: protectedProcedure
  .input(z.object({ hullId: z.string() }))
  .query(({ ctx, input }) => ctx.flagshipService.listImages(input.hullId)),
```

Service:
```typescript
async listImages(hullId: string) {
  if (!assetsDir) return [];
  return listFlagshipImageIndexes(hullId, assetsDir);
},
```

- [ ] **Step 4: Update updateImage to validate hull ownership**

In the `updateImage` method, fetch the flagship's `hullId` first and validate the image index belongs to that hull:

```typescript
async updateImage(userId: string, imageIndex: number) {
  const [flagship] = await db.select({ id: flagships.id, hullId: flagships.hullId })
    .from(flagships).where(eq(flagships.userId, userId)).limit(1);
  if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vaisseau amiral introuvable' });
  
  if (flagship.hullId && assetsDir) {
    const available = listFlagshipImageIndexes(flagship.hullId, assetsDir);
    if (!available.includes(imageIndex)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Image non disponible pour cette coque' });
    }
  }
  // ... existing update logic
},
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/flagship/flagship.service.ts apps/api/src/modules/flagship/flagship.router.ts
git commit -m "feat(hull): create flagship with hull selection and playstyle"
```

---

### Task 5: Flagship Service — Hull change with cost, refit, cooldown

**Files:**
- Modify: `apps/api/src/modules/flagship/flagship.service.ts`
- Modify: `apps/api/src/modules/flagship/flagship.router.ts`

Dependencies: Task 1, Task 2, Task 4

- [ ] **Step 1: Add changeHull method to flagship service**

Add after the `rename` method. This needs access to `resourceService` — add it to the service factory params if not already present, or import `userExilium` for reading `totalEarned`.

```typescript
async changeHull(userId: string, newHullId: string) {
  const config = await gameConfigService.getFullConfig();
  const hullConfig = config.hulls[newHullId];
  if (!hullConfig) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coque inconnue' });

  const [flagship] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
  if (!flagship) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vaisseau amiral introuvable' });
  if (flagship.hullId === newHullId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vous avez deja cette coque' });
  if (flagship.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le vaisseau amiral doit etre stationne' });

  const now = new Date();

  // Check cooldown (skip if first change: hullChangedAt is null)
  const isFirstChange = !flagship.hullChangedAt;
  if (!isFirstChange && flagship.hullChangeAvailableAt && now < flagship.hullChangeAvailableAt) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Changement de coque en cooldown' });
  }

  // Deduct resource cost (skip if first change)
  if (!isFirstChange) {
    const [exiliumRecord] = await db.select({ totalEarned: userExilium.totalEarned })
      .from(userExilium).where(eq(userExilium.userId, userId)).limit(1);
    const totalEarned = exiliumRecord?.totalEarned ?? 0;
    const totalCost = totalEarned * hullConfig.changeCost.baseMultiplier;
    const ratioSum = hullConfig.changeCost.resourceRatio.minerai + hullConfig.changeCost.resourceRatio.silicium + hullConfig.changeCost.resourceRatio.hydrogene;
    const cost = {
      minerai: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.minerai / ratioSum),
      silicium: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.silicium / ratioSum),
      hydrogene: Math.floor(totalCost * hullConfig.changeCost.resourceRatio.hydrogene / ratioSum),
    };
    // Use resourceService.spendResources or direct deduction
    await resourceService.spendResources(flagship.planetId, userId, cost);
  }

  // Start refit
  const refitEnd = new Date(now.getTime() + hullConfig.unavailabilitySeconds * 1000);
  const cooldownEnd = new Date(refitEnd.getTime() + hullConfig.cooldownSeconds * 1000);

  // Store the target hull in metadata, actual hull changes when refit completes
  await db.update(flagships).set({
    status: 'hull_refit',
    refitEndsAt: refitEnd,
    hullChangeAvailableAt: cooldownEnd,
    updatedAt: now,
  }).where(eq(flagships.id, flagship.id));

  // Store target hull temporarily — we need it when refit completes
  // Use a metadata approach or store the new hullId immediately
  // Simplest: update hullId now but keep status as hull_refit
  const newImage = assetsDir ? getRandomFlagshipImageIndex(newHullId, assetsDir) : null;
  await db.update(flagships).set({
    hullId: newHullId,
    flagshipImageIndex: newImage,
    hullChangedAt: now,
  }).where(eq(flagships.id, flagship.id));

  // Update playstyle
  await db.update(users).set({ playstyle: hullConfig.playstyle }).where(eq(users.id, userId));

  return { newHullId, refitEndsAt: refitEnd, cooldownEndsAt: cooldownEnd };
},
```

Note: the `resourceService` needs to be injected into `createFlagshipService`. Add it as a parameter. Also import `userExilium` and `users` from `@exilium/db`.

- [ ] **Step 2: Add lazy refit completion in get()**

In the `get()` method, after the lazy repair check (around line 51-71), add a similar block for refit:

```typescript
// Lazy refit completion
if (flagship.status === 'hull_refit' && flagship.refitEndsAt && flagship.refitEndsAt <= new Date()) {
  await db.update(flagships).set({
    status: 'active',
    refitEndsAt: null,
    updatedAt: new Date(),
  }).where(eq(flagships.id, flagship.id));
  Object.assign(flagship, { status: 'active', refitEndsAt: null });
}
```

- [ ] **Step 3: Add STATUS_LABELS for hull_refit in frontend**

This will be done in Task 14 (frontend). Note that `hull_refit` must be handled like `incapacitated` — show a banner with countdown.

- [ ] **Step 4: Add router endpoint**

In `flagship.router.ts`:

```typescript
changeHull: protectedProcedure
  .input(z.object({
    hullId: z.enum(['combat', 'industrial', 'scientific']),
  }))
  .mutation(({ ctx, input }) => ctx.flagshipService.changeHull(ctx.userId, input.hullId)),
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/flagship/flagship.service.ts apps/api/src/modules/flagship/flagship.router.ts
git commit -m "feat(hull): add hull change with cost, refit timer, and cooldown"
```

---

### Task 6: Hull combat bonuses in flagship.get()

**Files:**
- Modify: `apps/api/src/modules/flagship/flagship.service.ts` (get method, lines 73-104)

Dependencies: Task 2, Task 4

- [ ] **Step 1: Apply hull combat bonuses to effective stats**

In the `get()` method, after computing talent-based `effectiveStats` (line 79-88), apply hull combat bonuses if the flagship is stationed:

```typescript
// Apply hull combat bonuses (only combat hull, only when stationed)
if (flagship.hullId && flagship.status === 'active') {
  const hullConfig = config.hulls[flagship.hullId];
  if (hullConfig) {
    effectiveStats.weapons += (hullConfig.passiveBonuses.bonus_weapons ?? 0);
    effectiveStats.baseArmor += (hullConfig.passiveBonuses.bonus_armor ?? 0);
    effectiveStats.shotCount += (hullConfig.passiveBonuses.bonus_shot_count ?? 0);
  }
}
```

Also return `hullId` and hull info in the response:

```typescript
return { ...flagship, talentBonuses: statBonuses, effectiveStats, hullConfig: config.hulls[flagship.hullId ?? ''] ?? null };
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/flagship/flagship.service.ts
git commit -m "feat(hull): apply combat hull bonuses to effective stats"
```

---

### Task 7: Talent context — inject hull passive bonuses for research & build time

**Files:**
- Modify: `apps/api/src/modules/flagship/talent.service.ts` (computeTalentContext method)

Dependencies: Task 1, Task 2

- [ ] **Step 1: Extend computeTalentContext to include hull bonuses**

In `talent.service.ts`, in the `computeTalentContext` method (around line 380+), after computing talent bonuses and checking if flagship is stationed, add hull bonus injection:

```typescript
// Inject hull passive bonuses (only when stationed on the planet)
if (flagship && flagship.status === 'active' && planetId && flagship.planetId === planetId) {
  const hullId = flagship.hullId; // Need to query hullId — add it to the select
  if (hullId) {
    const config = await gameConfigService.getFullConfig();
    const hullConfig = config.hulls[hullId];
    if (hullConfig) {
      for (const [key, value] of Object.entries(hullConfig.passiveBonuses)) {
        // Only inject time-reduction bonuses here, stat bonuses are handled in flagship.get()
        if (key.endsWith('_time_reduction') || key.endsWith('_build_time_reduction')) {
          ctx[`hull_${key}`] = value;
        }
      }
    }
  }
}
```

Make sure the flagship select query in `computeTalentContext` also fetches `hullId`:

```typescript
const [flagship] = await db.select({ 
  id: flagships.id, 
  planetId: flagships.planetId, 
  status: flagships.status,
  hullId: flagships.hullId,  // ADD THIS
}).from(flagships).where(eq(flagships.userId, userId)).limit(1);
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/flagship/talent.service.ts
git commit -m "feat(hull): inject hull time bonuses into talent context"
```

---

### Task 8: Research service — apply hull research time reduction

**Files:**
- Modify: `apps/api/src/modules/research/research.service.ts`

Dependencies: Task 7

- [ ] **Step 1: Apply hull bonus in startResearch**

In `research.service.ts`, line 134, after `talentTimeMultiplier`:

```typescript
const talentTimeMultiplier = 1 / (1 + (talentCtx['research_time'] ?? 0));
const hullTimeMultiplier = 1 - (talentCtx['hull_research_time_reduction'] ?? 0);
const time = researchTime(def, nextLevel, bonusMultiplier, { timeDivisor, phaseMap }) * talentTimeMultiplier * hullTimeMultiplier;
```

- [ ] **Step 2: Apply same in listResearch for display consistency**

In the `listResearch` method (around line 55-65), apply the same multiplier so the UI shows correct times:

```typescript
const hullTimeMultiplier = 1 - (talentCtx['hull_research_time_reduction'] ?? 0);
const time = researchTime(def, nextLevel, bonusMultiplier, { timeDivisor, phaseMap }) * talentTimeMultiplier * hullTimeMultiplier;
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/research/research.service.ts
git commit -m "feat(hull): apply scientific hull -20% research time"
```

---

### Task 9: Shipyard service — apply hull build time reduction

**Files:**
- Modify: `apps/api/src/modules/shipyard/shipyard.service.ts`

Dependencies: Task 7

- [ ] **Step 1: Apply hull bonus in startBuild for ships**

In `shipyard.service.ts`, after line 201 (where `unitTime` is computed for ships):

```typescript
if (type === 'ship') {
  const buildCategory = getShipBuildCategory(def as any, config.bonuses);
  const bonusMultiplier = resolveBonus('ship_build_time', buildCategory, buildingLevels, config.bonuses);
  const talentTimeMultiplier = 1 / (1 + (talentCtx['ship_build_time'] ?? 0));
  // Hull bonus: combat hull reduces military, industrial hull reduces industrial
  const hullKey = buildCategory === 'build_military' ? 'hull_combat_build_time_reduction'
    : buildCategory === 'build_industrial' ? 'hull_industrial_build_time_reduction'
    : null;
  const hullTimeMultiplier = hullKey ? 1 - (talentCtx[hullKey] ?? 0) : 1;
  unitTime = shipTime(def, bonusMultiplier, timeDivisor) * talentTimeMultiplier * hullTimeMultiplier;
}
```

- [ ] **Step 2: Apply same in listShips for display consistency**

In the `listShips` method (around line 63-75), apply the same logic.

- [ ] **Step 3: Apply same in completeUnit for next-unit recalculation**

In the `completeUnit` method (around line 340-356), apply the same hull multiplier.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/shipyard/shipyard.service.ts
git commit -m "feat(hull): apply hull -20% build time for combat/industrial ships"
```

---

### Task 10: Fleet validation — block flagship on mine/recycle without industrial hull

**Files:**
- Modify: `apps/api/src/modules/fleet/fleet.service.ts`

Dependencies: Task 1

- [ ] **Step 1: Add hull check in sendFleet flagship validation**

In `fleet.service.ts`, in the flagship validation block (around line 152-177), after checking `flagship.status !== 'active'`, add:

```typescript
// Hull-restricted missions: flagship can only mine/recycle with industrial hull
if ((input.mission === 'mine' || input.mission === 'recycle') && flagship.hullId !== 'industrial') {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Seule la coque industrielle permet au vaisseau amiral de participer aux missions de minage et recyclage',
  });
}
```

Also block `hull_refit` status (treat like incapacitated):

```typescript
if (flagship.status !== 'active') {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Votre vaisseau amiral n\'est pas disponible (statut: ' + flagship.status + ')',
  });
}
```

This already handles `hull_refit` since it's not `active`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/fleet/fleet.service.ts
git commit -m "feat(hull): restrict flagship mine/recycle to industrial hull"
```

---

### Task 11: Scan mission handler (scientific hull)

**Files:**
- Create: `apps/api/src/modules/fleet/handlers/scan.handler.ts`
- Modify: `apps/api/src/modules/fleet/fleet.service.ts` (handler registry)
- Modify: `apps/api/src/modules/fleet/fleet.types.ts` (if needed)

Dependencies: Task 1, Task 2

- [ ] **Step 1: Create ScanHandler**

Create `apps/api/src/modules/fleet/handlers/scan.handler.ts`. This handler delegates to spy logic but with modifications:

```typescript
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { fleetEvents, flagships, flagshipCooldowns } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { SpyHandler } from './spy.handler.js';

const SCAN_COOLDOWN_ID = 'scan_mission';

export class ScanHandler implements MissionHandler {
  private spyHandler = new SpyHandler();

  async validateFleet(input: SendFleetInput, config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    // Scan requires exactly the flagship, no other ships
    const shipIds = Object.entries(input.ships).filter(([, count]) => count > 0).map(([id]) => id);
    if (!shipIds.includes('flagship') || shipIds.length !== 1) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La mission de scan utilise uniquement le vaisseau amiral' });
    }

    // Verify hull is scientific
    if (!ctx.flagshipService) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Service flagship non disponible' });
    const userId = input.userId!;
    const flagship = await ctx.flagshipService.get(userId);
    if (!flagship || flagship.hullId !== 'scientific') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seule la coque scientifique permet les missions de scan' });
    }

    // Check cooldown
    const [cooldown] = await ctx.db.select().from(flagshipCooldowns)
      .where(and(
        eq(flagshipCooldowns.flagshipId, flagship.id),
        eq(flagshipCooldowns.talentId, SCAN_COOLDOWN_ID),
      )).limit(1);
    if (cooldown && cooldown.cooldownEnds && new Date() < cooldown.cooldownEnds) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Scan en cooldown' });
    }

    // Start cooldown
    const config2 = await ctx.gameConfigService.getFullConfig();
    const hullConfig = config2.hulls['scientific'];
    const cooldownSeconds = hullConfig?.scanCooldownSeconds ?? 3600;
    const now = new Date();
    const cooldownEnds = new Date(now.getTime() + cooldownSeconds * 1000);

    // Upsert cooldown
    await ctx.db.insert(flagshipCooldowns).values({
      flagshipId: flagship.id,
      talentId: SCAN_COOLDOWN_ID,
      activatedAt: now,
      expiresAt: now, // no active buff duration
      cooldownEnds,
    }).onConflictDoUpdate({
      target: [flagshipCooldowns.flagshipId, flagshipCooldowns.talentId],
      set: { activatedAt: now, expiresAt: now, cooldownEnds },
    });
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    // Delegate to SpyHandler but with ephemeral probe logic
    // The scan creates a virtual spy probe with +2 espionage bonus
    // Override the spy fleet to use 1 virtual probe instead of the flagship
    // After spy logic completes, probe is always destroyed (never returned)

    // Reuse SpyHandler.processArrival with modified context
    // The spy handler expects espionage probes in the fleet — we simulate one
    const config = await ctx.gameConfigService.getFullConfig();
    const hullConfig = config.hulls['scientific'];
    const espionageBonus = hullConfig?.scanEspionageBonus ?? 2;

    // Create a modified fleet event with a virtual spy probe
    const modifiedEvent = {
      ...fleetEvent,
      ships: { espionageProbe: 1 }, // Virtual probe
      metadata: {
        ...(fleetEvent.metadata as Record<string, unknown> ?? {}),
        scanMission: true,
        espionageBonus,
      },
    };

    // Call spy arrival logic
    const result = await this.spyHandler.processArrival(modifiedEvent, ctx);

    // Force probe destruction: override result to not return the probe
    return {
      ...result,
      scheduleReturn: true,
      shipsAfterArrival: {}, // No ships return — flagship stays home, probe is destroyed
      cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
    };
  }
}
```

Note: The SpyHandler's `processArrival` handles espionage logic (counter-espionage roll, report generation). The scan handler wraps it. You may need to check if SpyHandler reads `espionageBonus` from metadata — if not, you'll need to modify it to accept the bonus. Check `spy.handler.ts` for the espionage level calculation and inject the bonus there.

- [ ] **Step 2: Register scan handler in fleet.service.ts**

In `fleet.service.ts`, add to the handler registry (line 50-60):

```typescript
import { ScanHandler } from './handlers/scan.handler.js';
// ...
const handlers: Record<string, MissionHandler> = {
  // ... existing handlers
  scan: new ScanHandler(),
};
```

- [ ] **Step 3: Handle scan mission in sendFleet**

The scan mission is special — the flagship doesn't actually move. The system creates a fleet event with just the virtual probe. In `sendFleet`, when mission is `scan`:

- Skip the normal flagship injection into `shipStatsMap`
- Instead, create the fleet event with `ships: { espionageProbe: 1 }` for travel calculation
- Don't set the flagship to `in_mission` status (it stays stationed)

This requires a special case in `sendFleet` around the flagship validation block.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/scan.handler.ts apps/api/src/modules/fleet/fleet.service.ts
git commit -m "feat(hull): add scan mission handler for scientific hull"
```

---

### Task 12: User service — playstyle derived from hull

**Files:**
- Modify: `apps/api/src/modules/user/user.service.ts`
- Modify: `apps/api/src/modules/user/user.router.ts`

- [ ] **Step 1: Remove playstyle from updateProfile**

In `user.router.ts` line 28, remove `playstyle` from the input schema:

```typescript
.input(z.object({
  bio: z.string().max(500).nullable().optional(),
  avatarId: z.string().max(128).nullable().optional(),
  seekingAlliance: z.boolean().optional(),
  profileVisibility: z.record(z.string(), z.boolean()).optional(),
}))
```

In `user.service.ts`, remove the `playstyle` parameter from `updateProfile` (line 72) and the assignment (line 90).

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/user/user.service.ts apps/api/src/modules/user/user.router.ts
git commit -m "feat(hull): make playstyle read-only, derived from hull"
```

---

### Task 13: Frontend — Creation modal with hull selection

**Files:**
- Modify: `apps/web/src/components/flagship/FlagshipNamingModal.tsx`

Dependencies: Task 4

- [ ] **Step 1: Add hull selection to the creation modal**

Rewrite `FlagshipNamingModal.tsx` to include hull selection before naming. The component shows 3 hull cards side by side, then name/description fields below.

Key changes:
- Add state: `const [selectedHull, setSelectedHull] = useState<'combat' | 'industrial' | 'scientific' | null>(null)`
- Fetch hull config: use `trpc.admin.getFullConfig` or inline the hull data (names, descriptions, bonuses) since they're static
- Display 3 clickable cards with hull name, description, bonus summary
- The submit button is disabled until a hull is selected AND name is valid
- Pass `hullId: selectedHull` to `trpc.flagship.create`

- [ ] **Step 2: Update mutation call**

```typescript
const createMutation = trpc.flagship.create.useMutation({
  onSuccess: () => {
    utils.flagship.get.invalidate();
    utils.tutorial.getCurrent.invalidate();
    onClose();
  },
});
// ...
createMutation.mutate({
  name,
  description: description || undefined,
  hullId: selectedHull!,
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/flagship/FlagshipNamingModal.tsx
git commit -m "feat(hull): add hull selection to flagship creation modal"
```

---

### Task 14: Frontend — Profile page hull display

**Files:**
- Modify: `apps/web/src/pages/FlagshipProfile.tsx`

Dependencies: Task 5, Task 6

- [ ] **Step 1: Update STATUS_LABELS**

Add `hull_refit` to the status labels (line 168-172):

```typescript
const STATUS_LABELS = {
  active: { label: 'Operationnel', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  in_mission: { label: 'En mission', color: 'text-blue-400', dot: 'bg-blue-400' },
  incapacitated: { label: 'Incapacite', color: 'text-red-400', dot: 'bg-red-400' },
  hull_refit: { label: 'Changement de coque', color: 'text-amber-400', dot: 'bg-amber-400' },
};
```

- [ ] **Step 2: Add refit banner**

Add a banner similar to the incapacitation banner that shows when `status === 'hull_refit'`, with a countdown to `refitEndsAt`.

- [ ] **Step 3: Display hull info**

Show the current hull name and description on the profile page. Add a "Changer de coque" button that opens a hull change modal (reuses the hull selection cards from the creation modal).

- [ ] **Step 4: Update image URL calls**

Update all `getFlagshipImageUrl(flagship.flagshipImageIndex, ...)` calls to include `hullId`:

```typescript
getFlagshipImageUrl(flagship.hullId ?? 'industrial', flagship.flagshipImageIndex, 'thumb')
```

Search the frontend for all usages of `getFlagshipImageUrl` and update them.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/FlagshipProfile.tsx
git commit -m "feat(hull): display hull info and refit status on flagship profile"
```

---

### Task 15: Migration — existing players get industrial hull

**Files:**
- Create: migration SQL (via drizzle-kit or manual)

Dependencies: Task 1

- [ ] **Step 1: Write data migration**

After the schema migration from Task 1 is applied, run a data migration:

```sql
UPDATE flagships SET hull_id = 'industrial' WHERE hull_id IS NULL;
```

This can be added as a separate migration file or run as part of the seed script. The `hullChangedAt` stays `null`, which signals the player is eligible for one free hull change.

- [ ] **Step 2: Update user playstyles for existing flagship owners**

```sql
UPDATE users SET playstyle = 'miner'
WHERE id IN (SELECT user_id FROM flagships WHERE hull_id = 'industrial')
AND (playstyle IS NULL OR playstyle != 'miner');
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/drizzle/
git commit -m "feat(hull): migrate existing flagships to industrial hull"
```

---

### Task 16: Frontend — update all getFlagshipImageUrl callers

**Files:**
- Search all `.tsx` and `.ts` files for `getFlagshipImageUrl`

Dependencies: Task 3

- [ ] **Step 1: Find and update all callers**

```bash
grep -rn "getFlagshipImageUrl" apps/web/src/
```

Update each call to pass `hullId` as first parameter. For components that display a flagship belonging to another player (e.g., combat reports, public profiles), the `hullId` must come from the API response. Ensure `hullId` is included in all flagship-related API responses.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/
git commit -m "feat(hull): update all frontend flagship image URL calls with hullId"
```

---

## Parallelization Guide

Tasks can be grouped for parallel agent execution:

- **Sequential foundation:** Task 1 → Task 2 (schema then config)
- **Parallel backend (after Task 1+2):** Task 3, Task 6, Task 7, Task 8, Task 10, Task 11, Task 12
- **Depends on Task 7:** Task 8 (research), Task 9 (shipyard)
- **Depends on Task 3+4:** Task 4, Task 5
- **Parallel frontend (after backend):** Task 13, Task 14, Task 16
- **Last:** Task 15 (migration)
