# Colonization Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace instant colonization with a multi-phase stabilization process gated by a governance building, events, and fleet/local missions.

**Architecture:** New `colonization_processes` and `colonization_events` tables with a dedicated `ColonizationService`. A BullMQ repeatable worker ticks progress and generates events. The colonize fleet handler creates the process instead of a fully-formed planet. Governance penalties are injected into the existing `talentCtx` pipeline in resource and building services.

**Tech Stack:** Drizzle ORM, tRPC, BullMQ, React, Tailwind CSS. Follows existing factory-function service pattern.

**Spec:** `docs/superpowers/specs/2026-04-14-colonization-rework-design.md`

---

## Task 1: Database schema — new tables and planet status

**Files:**
- Create: `packages/db/src/schema/colonization.ts`
- Modify: `packages/db/src/schema/planets.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create colonization schema file**

Create `packages/db/src/schema/colonization.ts`:

```typescript
import { pgTable, uuid, real, varchar, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';
import { users } from './users.js';

export const colonizationStatusEnum = pgEnum('colonization_status', ['active', 'completed', 'failed']);
export const colonizationEventTypeEnum = pgEnum('colonization_event_type', ['raid', 'shortage']);
export const colonizationEventStatusEnum = pgEnum('colonization_event_status', ['pending', 'resolved', 'expired']);

export const colonizationProcesses = pgTable('colonization_processes', {
  id: uuid('id').primaryKey().defaultRandom(),
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  colonyShipOriginPlanetId: uuid('colony_ship_origin_planet_id').notNull(),
  progress: real('progress').notNull().default(0),
  difficultyFactor: real('difficulty_factor').notNull().default(1),
  status: colonizationStatusEnum('status').notNull().default('active'),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }).notNull().defaultNow(),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const colonizationEvents = pgTable('colonization_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  processId: uuid('process_id').notNull().references(() => colonizationProcesses.id, { onDelete: 'cascade' }),
  eventType: colonizationEventTypeEnum('event_type').notNull(),
  status: colonizationEventStatusEnum('status').notNull().default('pending'),
  penalty: real('penalty').notNull(),
  resolveBonus: real('resolve_bonus').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Add status column to planets**

In `packages/db/src/schema/planets.ts`, add after the `sortOrder` column:

```typescript
status: varchar('status', { length: 32 }).notNull().default('active'),
```

- [ ] **Step 3: Export from schema index**

In `packages/db/src/schema/index.ts`, add:

```typescript
export * from './colonization.js';
```

- [ ] **Step 4: Generate and review migration**

```bash
cd packages/db && npm run db:generate
```

Review the generated SQL file. It should create the two new tables, their enums, and add the `status` column to `planets`.

- [ ] **Step 5: Apply migration**

```bash
npm run db:push
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project packages/db/tsconfig.json
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add colonization_processes, colonization_events tables and planet status column"
```

---

## Task 2: Game config — Imperial Power Center building and universe config

**Files:**
- Modify: `packages/db/src/seed-game-config.ts`

- [ ] **Step 1: Add building category**

In the `CATEGORIES` array in `seed-game-config.ts`, add:

```typescript
{ id: 'building_governance', entityType: 'building', name: 'Gouvernance', sortOrder: 7 },
```

- [ ] **Step 2: Add Imperial Power Center building definition**

In the `BUILDINGS` array, add:

```typescript
{
  id: 'imperialPowerCenter',
  name: 'Centre de Pouvoir Impérial',
  description: "Siège du pouvoir politique de votre empire. Chaque niveau augmente votre capacité de gouvernance, permettant de gérer efficacement davantage de colonies. Sans capacité suffisante, vos colonies subissent des pénalités de production et de construction.",
  baseCostMinerai: 5000,
  baseCostSilicium: 8000,
  baseCostHydrogene: 3000,
  costFactor: 1.8,
  baseTime: 7200,
  categoryId: 'building_governance',
  sortOrder: 0,
  role: 'governance',
  flavorText: "Le cœur politique d'un empire en expansion.",
  allowedPlanetTypes: null,
},
```

- [ ] **Step 3: Add building prerequisite**

In the `BUILDING_PREREQUISITES` array, add the prerequisite for Imperial Power Center (requires HQ level 4):

```typescript
{ buildingId: 'imperialPowerCenter', requiredBuildingId: 'headquarters', requiredLevel: 4 },
```

Look up the exact ID for the HQ building in the existing BUILDINGS array first — it may be `'headquarters'` or another ID. Use the correct one.

- [ ] **Step 4: Add homeworldOnly flag to building_definitions schema**

In `packages/db/src/schema/game-config.ts`, add to the `buildingDefinitions` table:

```typescript
homeworldOnly: boolean('homeworld_only').notNull().default(false),
```

Set `homeworldOnly: true` in the seed data for `imperialPowerCenter`.

- [ ] **Step 5: Add universe config keys for colonization**

In the universe config section of seed, add these entries:

```typescript
{ key: 'colonization_passive_rate', value: 0.10 },
{ key: 'colonization_event_interval', value: 7200 },
{ key: 'colonization_event_deadline_min', value: 14400 },
{ key: 'colonization_event_deadline_max', value: 21600 },
{ key: 'colonization_event_raid_penalty', value: 0.12 },
{ key: 'colonization_event_shortage_penalty', value: 0.12 },
{ key: 'colonization_event_resolve_bonus', value: 0.04 },
{ key: 'colonization_supply_boost', value: 0.18 },
{ key: 'colonization_reinforce_boost', value: 0.12 },
{ key: 'colonization_consolidate_boost', value: 0.09 },
{ key: 'colonization_consolidate_cooldown', value: 14400 },
{ key: 'governance_penalty_harvest', value: [0.15, 0.35, 0.60] },
{ key: 'governance_penalty_construction', value: [0.15, 0.35, 0.60] },
{ key: 'colonization_difficulty_temperate', value: 1.0 },
{ key: 'colonization_difficulty_arid', value: 0.7 },
{ key: 'colonization_difficulty_glacial', value: 0.7 },
{ key: 'colonization_difficulty_volcanic', value: 0.5 },
{ key: 'colonization_difficulty_gaseous', value: 0.5 },
```

- [ ] **Step 6: Remove maxPlanetsPerPlayer config**

Remove the `maxPlanetsPerPlayer` universe config entry. It is no longer used.

- [ ] **Step 7: Add colonize_supply and colonize_reinforce mission definitions**

In the mission definitions section of the seed, add:

```typescript
{ id: 'colonize_supply', label: 'Ravitaillement colonie', hint: 'Envoyez des ressources pour stabiliser votre colonie', buttonLabel: 'Ravitailler', color: '#22c55e', sortOrder: 11, dangerous: false, requiredShipRoles: null, exclusive: false, recommendedShipRoles: ['transport'], requiresPveMission: false },
{ id: 'colonize_reinforce', label: 'Renfort colonie', hint: 'Envoyez des vaisseaux pour sécuriser votre colonie', buttonLabel: 'Renforcer', color: '#3b82f6', sortOrder: 12, dangerous: false, requiredShipRoles: null, exclusive: false, recommendedShipRoles: ['combat'], requiresPveMission: false },
```

Also add `'colonize_supply'` and `'colonize_reinforce'` to the fleet mission enum in `packages/db/src/schema/fleet-events.ts`.

- [ ] **Step 8: Generate migration, apply, verify, commit**

```bash
cd packages/db && npm run db:generate && npm run db:push
npx tsc --noEmit --project packages/db/tsconfig.json
git add packages/db/
git commit -m "feat(config): add Imperial Power Center building, colonization config, and supply/reinforce missions"
```

---

## Task 3: Game engine — governance penalty calculation

**Files:**
- Create: `packages/game-engine/src/formulas/governance.ts`
- Modify: `packages/game-engine/src/index.ts`

- [ ] **Step 1: Create governance formula**

Create `packages/game-engine/src/formulas/governance.ts`:

```typescript
/**
 * Calculate governance overextend and resulting penalties.
 *
 * @param colonyCount - Total planets owned (excluding homeworld)
 * @param governanceCapacity - 1 + Imperial Power Center level
 * @param harvestPenalties - Penalty per overextend step, e.g. [0.15, 0.35, 0.60]
 * @param constructionPenalties - Penalty per overextend step, e.g. [0.15, 0.35, 0.60]
 */
export function calculateGovernancePenalty(
  colonyCount: number,
  governanceCapacity: number,
  harvestPenalties: number[],
  constructionPenalties: number[],
): { overextend: number; harvestMalus: number; constructionMalus: number } {
  const overextend = Math.max(0, colonyCount - governanceCapacity);
  if (overextend === 0) {
    return { overextend: 0, harvestMalus: 0, constructionMalus: 0 };
  }

  // Clamp to the last defined penalty step
  const step = Math.min(overextend, harvestPenalties.length) - 1;
  return {
    overextend,
    harvestMalus: harvestPenalties[step] ?? harvestPenalties[harvestPenalties.length - 1] ?? 0,
    constructionMalus: constructionPenalties[step] ?? constructionPenalties[constructionPenalties.length - 1] ?? 0,
  };
}

/**
 * Calculate colonization difficulty factor from planet type and distance.
 * Lower factor = slower passive progress.
 */
export function calculateColonizationDifficulty(
  planetClassId: string,
  homeworldSystem: number,
  targetSystem: number,
  difficultyMap: Record<string, number>,
): number {
  const typeFactor = difficultyMap[planetClassId] ?? 0.7;
  const systemDistance = Math.abs(targetSystem - homeworldSystem);
  // Distance penalty: -2% per system hop, minimum 0.3
  const distanceFactor = Math.max(0.3, 1 - systemDistance * 0.02);
  return typeFactor * distanceFactor;
}
```

- [ ] **Step 2: Export from game-engine index**

In `packages/game-engine/src/index.ts`, add:

```typescript
export * from './formulas/governance.js';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project packages/game-engine/tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add packages/game-engine/
git commit -m "feat(engine): add governance penalty and colonization difficulty formulas"
```

---

## Task 4: Colonization service

**Files:**
- Create: `apps/api/src/modules/colonization/colonization.service.ts`
- Create: `apps/api/src/modules/colonization/colonization.router.ts`

- [ ] **Step 1: Create colonization service**

Create `apps/api/src/modules/colonization/colonization.service.ts` with the factory function pattern:

```typescript
import { eq, and, lt, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { colonizationProcesses, colonizationEvents, planets } from '@exilium/db';
import type { Database } from '@exilium/db';
import type { GameConfigService } from '../admin/game-config.service.js';

export function createColonizationService(
  db: Database,
  gameConfigService: GameConfigService,
) {
  return {
    /** Get active colonization process for a planet */
    async getProcess(planetId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(
          eq(colonizationProcesses.planetId, planetId),
          eq(colonizationProcesses.status, 'active'),
        ))
        .limit(1);
      return process ?? null;
    },

    /** Get full colonization status (process + events) for frontend */
    async getStatus(userId: string, planetId: string) {
      const process = await this.getProcess(planetId);
      if (!process || process.userId !== userId) return null;

      const events = await db
        .select()
        .from(colonizationEvents)
        .where(eq(colonizationEvents.processId, process.id));

      const config = await gameConfigService.getFullConfig();
      const passiveRate = Number(config.universe.colonization_passive_rate) || 0.10;
      const effectiveRate = passiveRate * process.difficultyFactor;
      const remaining = Math.max(0, 1 - process.progress);
      const etaHours = effectiveRate > 0 ? remaining / effectiveRate : Infinity;

      return {
        ...process,
        events: events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        effectivePassiveRate: effectiveRate,
        estimatedCompletionHours: etaHours,
      };
    },

    /** Start a new colonization process */
    async startProcess(planetId: string, userId: string, originPlanetId: string, difficultyFactor: number) {
      const [process] = await db
        .insert(colonizationProcesses)
        .values({
          planetId,
          userId,
          colonyShipOriginPlanetId: originPlanetId,
          difficultyFactor,
        })
        .returning();
      return process;
    },

    /** Advance passive progress for a process */
    async tick(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, processId), eq(colonizationProcesses.status, 'active')))
        .limit(1);

      if (!process) return null;

      const config = await gameConfigService.getFullConfig();
      const passiveRate = Number(config.universe.colonization_passive_rate) || 0.10;
      const effectiveRate = passiveRate * process.difficultyFactor;

      const now = new Date();
      const elapsedHours = (now.getTime() - new Date(process.lastTickAt).getTime()) / (1000 * 60 * 60);
      const progressDelta = effectiveRate * elapsedHours;
      const newProgress = Math.min(1, process.progress + progressDelta);

      await db
        .update(colonizationProcesses)
        .set({ progress: newProgress, lastTickAt: now })
        .where(eq(colonizationProcesses.id, processId));

      return { ...process, progress: newProgress };
    },

    /** Expire overdue events and apply penalties */
    async expireEvents(processId: string) {
      const now = new Date();
      const pendingExpired = await db
        .select()
        .from(colonizationEvents)
        .where(and(
          eq(colonizationEvents.processId, processId),
          eq(colonizationEvents.status, 'pending'),
          lt(colonizationEvents.expiresAt, now),
        ));

      let totalPenalty = 0;
      for (const event of pendingExpired) {
        totalPenalty += event.penalty;
        await db
          .update(colonizationEvents)
          .set({ status: 'expired' })
          .where(eq(colonizationEvents.id, event.id));
      }

      if (totalPenalty > 0) {
        await db
          .update(colonizationProcesses)
          .set({ progress: sql`GREATEST(${colonizationProcesses.progress} - ${totalPenalty}, 0)` })
          .where(eq(colonizationProcesses.id, processId));
      }

      return totalPenalty;
    },

    /** Generate a random event if interval has elapsed */
    async maybeGenerateEvent(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, processId), eq(colonizationProcesses.status, 'active')))
        .limit(1);

      if (!process) return null;

      const config = await gameConfigService.getFullConfig();
      const interval = Number(config.universe.colonization_event_interval) || 7200;
      const now = new Date();
      const elapsed = (now.getTime() - new Date(process.lastEventAt).getTime()) / 1000;

      if (elapsed < interval) return null;

      const deadlineMin = Number(config.universe.colonization_event_deadline_min) || 14400;
      const deadlineMax = Number(config.universe.colonization_event_deadline_max) || 21600;
      const deadline = deadlineMin + Math.random() * (deadlineMax - deadlineMin);

      const eventType = Math.random() < 0.5 ? 'raid' : 'shortage';
      const penalty = eventType === 'raid'
        ? Number(config.universe.colonization_event_raid_penalty) || 0.12
        : Number(config.universe.colonization_event_shortage_penalty) || 0.12;
      const resolveBonus = Number(config.universe.colonization_event_resolve_bonus) || 0.04;

      const [event] = await db
        .insert(colonizationEvents)
        .values({
          processId,
          eventType: eventType as 'raid' | 'shortage',
          penalty,
          resolveBonus,
          expiresAt: new Date(now.getTime() + deadline * 1000),
        })
        .returning();

      await db
        .update(colonizationProcesses)
        .set({ lastEventAt: now })
        .where(eq(colonizationProcesses.id, processId));

      return event;
    },

    /** Resolve a pending event */
    async resolveEvent(eventId: string, userId: string) {
      const [event] = await db
        .select()
        .from(colonizationEvents)
        .where(and(eq(colonizationEvents.id, eventId), eq(colonizationEvents.status, 'pending')))
        .limit(1);

      if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Événement non trouvé ou déjà résolu' });

      // Verify ownership
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(and(eq(colonizationProcesses.id, event.processId), eq(colonizationProcesses.userId, userId)))
        .limit(1);

      if (!process) throw new TRPCError({ code: 'FORBIDDEN' });

      const now = new Date();
      await db
        .update(colonizationEvents)
        .set({ status: 'resolved', resolvedAt: now })
        .where(eq(colonizationEvents.id, eventId));

      // Apply resolve bonus
      await db
        .update(colonizationProcesses)
        .set({ progress: sql`LEAST(${colonizationProcesses.progress} + ${event.resolveBonus}, 1)` })
        .where(eq(colonizationProcesses.id, process.id));

      return { resolved: true, bonus: event.resolveBonus };
    },

    /** Apply a mission boost to progress */
    async applyBoost(processId: string, boostAmount: number) {
      await db
        .update(colonizationProcesses)
        .set({ progress: sql`LEAST(${colonizationProcesses.progress} + ${boostAmount}, 1)` })
        .where(eq(colonizationProcesses.id, processId));
    },

    /** Local action: consolidate colony */
    async consolidate(userId: string, planetId: string) {
      const process = await this.getProcess(planetId);
      if (!process || process.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aucune colonisation en cours' });
      }

      const config = await gameConfigService.getFullConfig();
      const boost = Number(config.universe.colonization_consolidate_boost) || 0.09;
      // Cooldown check: consolidate_cooldown is stored as metadata on the process
      // For simplicity, use lastTickAt comparison — but a dedicated column would be cleaner
      // TODO during implementation: add consolidateAvailableAt column or use planet resources check

      await this.applyBoost(process.id, boost);
      return { boosted: true, amount: boost };
    },

    /** Finalize a completed colonization */
    async finalize(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(eq(colonizationProcesses.id, processId))
        .limit(1);

      if (!process) return;

      await db
        .update(colonizationProcesses)
        .set({ status: 'completed' })
        .where(eq(colonizationProcesses.id, processId));

      // Planet becomes active
      await db
        .update(planets)
        .set({ status: 'active' })
        .where(eq(planets.id, process.planetId));
    },

    /** Fail a colonization — delete planet, return colony ship */
    async fail(processId: string) {
      const [process] = await db
        .select()
        .from(colonizationProcesses)
        .where(eq(colonizationProcesses.id, processId))
        .limit(1);

      if (!process) return null;

      await db
        .update(colonizationProcesses)
        .set({ status: 'failed' })
        .where(eq(colonizationProcesses.id, processId));

      // Delete the planet (cascade deletes planetShips, planetDefenses, planetBiomes, etc.)
      await db
        .delete(planets)
        .where(eq(planets.id, process.planetId));

      // Return colony ship origin planet ID for fleet scheduling
      return { originPlanetId: process.colonyShipOriginPlanetId, userId: process.userId };
    },

    /** Get governance info for a user (for Empire page) */
    async getGovernanceInfo(userId: string) {
      // Count colonies (exclude homeworld = first planet created, or planet with smallest sortOrder)
      const userPlanets = await db
        .select({ id: planets.id, status: planets.status })
        .from(planets)
        .where(eq(planets.userId, userId));

      const activePlanets = userPlanets.filter(p => p.status === 'active');
      // Colony count excludes the homeworld (1 planet = 0 colonies)
      const colonyCount = Math.max(0, activePlanets.length - 1);

      // Get Imperial Power Center level from homeworld
      // The homeworld is the first planet (sortOrder 0)
      const config = await gameConfigService.getFullConfig();
      const { planetBuildings } = await import('@exilium/db');
      const { eq: eq2, and: and2 } = await import('drizzle-orm');

      const allBuildings = await db
        .select()
        .from(planetBuildings)
        .where(eq2(planetBuildings.buildingId, 'imperialPowerCenter'));

      // Find the one on this user's planets
      const userPlanetIds = new Set(userPlanets.map(p => p.id));
      const ipc = allBuildings.find(b => userPlanetIds.has(b.planetId));
      const ipcLevel = ipc?.level ?? 0;

      const capacity = 1 + ipcLevel;
      const harvestPenalties = (config.universe.governance_penalty_harvest as number[]) ?? [0.15, 0.35, 0.60];
      const constructionPenalties = (config.universe.governance_penalty_construction as number[]) ?? [0.15, 0.35, 0.60];

      const { calculateGovernancePenalty } = await import('@exilium/game-engine');
      const penalty = calculateGovernancePenalty(colonyCount, capacity, harvestPenalties, constructionPenalties);

      return {
        colonyCount,
        capacity,
        ipcLevel,
        ...penalty,
      };
    },
  };
}
```

- [ ] **Step 2: Create colonization router**

Create `apps/api/src/modules/colonization/colonization.router.ts`:

```typescript
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createColonizationService } from './colonization.service.js';

export function createColonizationRouter(colonizationService: ReturnType<typeof createColonizationService>) {
  return router({
    status: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return colonizationService.getStatus(ctx.userId!, input.planetId);
      }),

    governance: protectedProcedure
      .query(async ({ ctx }) => {
        return colonizationService.getGovernanceInfo(ctx.userId!);
      }),

    consolidate: protectedProcedure
      .input(z.object({ planetId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return colonizationService.consolidate(ctx.userId!, input.planetId);
      }),

    resolveEvent: protectedProcedure
      .input(z.object({ eventId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return colonizationService.resolveEvent(input.eventId, ctx.userId!);
      }),
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/colonization/
git commit -m "feat(api): add colonization service and router"
```

---

## Task 5: Colonization worker

**Files:**
- Create: `apps/api/src/workers/colonization.worker.ts`
- Modify: `apps/api/src/queues/queues.ts`

- [ ] **Step 1: Add colonization queue**

In `apps/api/src/queues/queues.ts`, add:

```typescript
export const colonizationQueue = new Queue('colonization', { connection, defaultJobOptions });
```

- [ ] **Step 2: Create colonization worker**

Create `apps/api/src/workers/colonization.worker.ts`:

```typescript
import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { Database } from '@exilium/db';
import { colonizationProcesses, fleetEvents, planets } from '@exilium/db';
import { eq } from 'drizzle-orm';
import { publishNotification } from '../modules/notification/notification.publisher.js';
import { env } from '../config/env.js';
import type { createColonizationService } from '../modules/colonization/colonization.service.js';
import type { Queue } from 'bullmq';

export function startColonizationWorker(
  db: Database,
  redis: Redis,
  colonizationService: ReturnType<typeof createColonizationService>,
  fleetQueue: Queue,
) {
  // Repeatable job: tick all active processes every 5 minutes
  const { colonizationQueue } = require('../queues/queues.js');
  colonizationQueue.add('tick-all', {}, {
    repeat: { every: 5 * 60 * 1000 },
    jobId: 'colonization-tick-all',
  });

  const worker = new Worker(
    'colonization',
    async (job) => {
      if (job.name !== 'tick-all') return;

      const activeProcesses = await db
        .select()
        .from(colonizationProcesses)
        .where(eq(colonizationProcesses.status, 'active'));

      for (const process of activeProcesses) {
        try {
          // 1. Expire overdue events
          const penalty = await colonizationService.expireEvents(process.id);

          // 2. Advance passive progress
          const updated = await colonizationService.tick(process.id);
          if (!updated) continue;

          // 3. Maybe generate new event
          const newEvent = await colonizationService.maybeGenerateEvent(process.id);
          if (newEvent) {
            publishNotification(redis, process.userId, {
              type: 'colonization-event',
              payload: {
                planetId: process.planetId,
                eventType: newEvent.eventType,
                expiresAt: newEvent.expiresAt,
              },
            });
          }

          // 4. Check completion
          // Re-read progress after tick + possible penalty
          const [fresh] = await db
            .select()
            .from(colonizationProcesses)
            .where(eq(colonizationProcesses.id, process.id));

          if (!fresh || fresh.status !== 'active') continue;

          if (fresh.progress >= 1) {
            await colonizationService.finalize(process.id);
            publishNotification(redis, process.userId, {
              type: 'colonization-complete',
              payload: { planetId: process.planetId },
            });
          } else if (fresh.progress <= 0) {
            const result = await colonizationService.fail(process.id);
            if (result) {
              // Schedule colony ship return to origin
              const config = await (await import('../modules/admin/game-config.service.js')).createGameConfigService(db).getFullConfig();
              const colonyShipDef = Object.values(config.ships).find((s: any) => s.role === 'colonization');
              if (colonyShipDef && result.originPlanetId) {
                // Create a return fleet event for the colony ship
                const [originPlanet] = await db.select().from(planets).where(eq(planets.id, result.originPlanetId)).limit(1);
                if (originPlanet) {
                  await db.insert(fleetEvents).values({
                    userId: result.userId,
                    originPlanetId: result.originPlanetId,
                    targetGalaxy: originPlanet.galaxy,
                    targetSystem: originPlanet.system,
                    targetPosition: originPlanet.position,
                    mission: 'transport',
                    phase: 'return',
                    status: 'active',
                    departureTime: new Date(),
                    arrivalTime: new Date(Date.now() + 60_000), // 1 min symbolic return
                    ships: { [colonyShipDef.id]: 1 },
                  });
                  // Schedule fleet arrival
                  await fleetQueue.add('return', { fleetEventId: 'auto-return' }, { delay: 60_000 });
                }
              }

              publishNotification(redis, result.userId, {
                type: 'colonization-failed',
                payload: { originPlanetId: result.originPlanetId },
              });
            }
          }
        } catch (err) {
          console.error(`[colonization] Error processing ${process.id}:`, err);
        }
      }
    },
    {
      connection: { url: env.REDIS_URL },
      concurrency: 1, // Sequential — no need for parallel processing
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[colonization] Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/colonization.worker.ts apps/api/src/queues/queues.ts
git commit -m "feat(api): add colonization worker with repeatable tick job"
```

---

## Task 6: Wire up colonization service, router, and worker in app-router

**Files:**
- Modify: `apps/api/src/trpc/app-router.ts`
- Modify: `apps/api/src/index.ts` (or wherever workers are started)

- [ ] **Step 1: Wire service and router in app-router.ts**

Read the current `app-router.ts` to find the exact insertion points. Add:

```typescript
import { createColonizationService } from '../modules/colonization/colonization.service.js';
import { createColonizationRouter } from '../modules/colonization/colonization.router.js';
```

In the service instantiation section:
```typescript
const colonizationService = createColonizationService(db, gameConfigService);
```

In the router composition:
```typescript
colonization: createColonizationRouter(colonizationService),
```

Pass `colonizationService` to the fleet service if needed for supply/reinforce handlers.

- [ ] **Step 2: Start colonization worker**

In the server startup file (find where `startBuildCompletionWorker` and `startFleetWorker` are called), add:

```typescript
import { startColonizationWorker } from './workers/colonization.worker.js';

startColonizationWorker(db, redis, colonizationService, fleetQueue);
```

- [ ] **Step 3: Verify TypeScript compiles and commit**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json
git add apps/api/
git commit -m "feat(api): wire colonization service, router, and worker into app"
```

---

## Task 7: Modify colonize handler to create process instead of instant planet

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/colonize.handler.ts`

- [ ] **Step 1: Refactor processArrival**

The handler currently creates a fully active planet. Modify it to:

1. Remove the `maxPlanetsPerPlayer` check (no hard limit).
2. Create the planet with `status: 'colonizing'` instead of default `'active'`.
3. After creating the planet, call `colonizationService.startProcess()` instead of immediately consuming the colony ship.
4. The colony ship is NOT consumed on arrival — it's consumed on finalization (100%).
5. Calculate difficulty factor using `calculateColonizationDifficulty()` from game-engine.
6. Keep all biome logic as-is (biomes created but active only for discovered ones).

Key changes to the INSERT:
```typescript
const [newPlanet] = await ctx.db
  .insert(planets)
  .values({
    // ... same as before ...
    status: 'colonizing',  // <-- NEW
  })
  .returning();
```

After planet creation, before the report:
```typescript
// Start colonization process
const { calculateColonizationDifficulty } = await import('@exilium/game-engine');
const [homeworld] = await ctx.db.select().from(planets)
  .where(and(eq(planets.userId, fleetEvent.userId), eq(planets.sortOrder, 0)))
  .limit(1);

const difficultyMap: Record<string, number> = {};
for (const key of Object.keys(config.universe)) {
  if (key.startsWith('colonization_difficulty_')) {
    difficultyMap[key.replace('colonization_difficulty_', '')] = Number(config.universe[key]);
  }
}
const difficulty = calculateColonizationDifficulty(
  planetTypeForPos?.id ?? 'temperate',
  homeworld?.system ?? fleetEvent.targetSystem,
  fleetEvent.targetSystem,
  difficultyMap,
);

await ctx.colonizationService.startProcess(
  newPlanet.id,
  fleetEvent.userId,
  fleetEvent.originPlanetId,
  difficulty,
);
```

The report result changes to `{ success: true, colonizing: true, ... }`.

The colony ship is NOT consumed and does NOT return — it stays conceptually "on site". The fleet event completes with no return fleet.

- [ ] **Step 2: Add colonizationService to MissionHandlerContext**

In `apps/api/src/modules/fleet/fleet.types.ts`, add `colonizationService` to the `MissionHandlerContext` interface and pass it through from `app-router.ts`.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json
git add apps/api/
git commit -m "feat(api): colonize handler creates colonizing planet with stabilization process"
```

---

## Task 8: Supply and reinforce fleet handlers

**Files:**
- Create: `apps/api/src/modules/fleet/handlers/colonize-supply.handler.ts`
- Create: `apps/api/src/modules/fleet/handlers/colonize-reinforce.handler.ts`
- Modify: `apps/api/src/modules/fleet/fleet.service.ts` (register handlers)

- [ ] **Step 1: Create supply handler**

Create `apps/api/src/modules/fleet/handlers/colonize-supply.handler.ts`:

```typescript
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, colonizationProcesses, colonizationEvents } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';

export class ColonizeSupplyHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    // Verify target is a colonizing planet owned by the user
    const [planet] = await ctx.db.select().from(planets)
      .where(and(
        eq(planets.galaxy, input.targetGalaxy),
        eq(planets.system, input.targetSystem),
        eq(planets.position, input.targetPosition),
        eq(planets.userId, ctx.userId!),
        eq(planets.status, 'colonizing'),
      ))
      .limit(1);

    if (!planet) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune colonisation en cours à cette position' });
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const config = await ctx.gameConfigService.getFullConfig();
    const boost = Number(config.universe.colonization_supply_boost) || 0.18;

    // Find the colonization process
    const [process] = await ctx.db.select().from(colonizationProcesses)
      .where(and(
        eq(colonizationProcesses.userId, fleetEvent.userId),
        eq(colonizationProcesses.status, 'active'),
      ));

    if (process) {
      await ctx.colonizationService.applyBoost(process.id, boost);

      // Auto-resolve any pending shortage event
      const pendingShortage = await ctx.db.select().from(colonizationEvents)
        .where(and(
          eq(colonizationEvents.processId, process.id),
          eq(colonizationEvents.status, 'pending'),
          eq(colonizationEvents.eventType, 'shortage'),
        ))
        .limit(1);

      if (pendingShortage[0]) {
        await ctx.colonizationService.resolveEvent(pendingShortage[0].id, fleetEvent.userId);
      }
    }

    // Transfer cargo to the colonizing planet
    const minerai = Number(fleetEvent.mineraiCargo);
    const silicium = Number(fleetEvent.siliciumCargo);
    const hydrogene = Number(fleetEvent.hydrogeneCargo);

    return {
      scheduleReturn: true,
      cargo: { minerai: 0, silicium: 0, hydrogene: 0 }, // Resources stay on planet
    };
  }
}
```

- [ ] **Step 2: Create reinforce handler**

Create `apps/api/src/modules/fleet/handlers/colonize-reinforce.handler.ts` following the same pattern but:
- Boost uses `colonization_reinforce_boost`
- Auto-resolves `'raid'` events instead of `'shortage'`
- Ships return after delivery (no cargo transfer)

- [ ] **Step 3: Register handlers in fleet service**

In `fleet.service.ts`, find where mission handlers are registered (the handlers map) and add:

```typescript
'colonize_supply': new ColonizeSupplyHandler(),
'colonize_reinforce': new ColonizeReinforceHandler(),
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json
git add apps/api/
git commit -m "feat(api): add colonize_supply and colonize_reinforce fleet handlers"
```

---

## Task 9: Governance penalty integration in resource and building services

**Files:**
- Modify: `apps/api/src/modules/resource/resource.service.ts`
- Modify: `apps/api/src/modules/building/building.service.ts`

- [ ] **Step 1: Inject governance penalty into resource production**

In `resource.service.ts`, in the `materializeResources` method, after computing `talentCtx` and before calling `calculateResources`, add governance penalty for non-homeworld planets:

```typescript
// Governance penalty (non-homeworld only)
if (planet.sortOrder !== 0) {
  const { calculateGovernancePenalty } = await import('@exilium/game-engine');
  const userPlanets = await db.select({ id: planets.id, status: planets.status })
    .from(planets).where(eq(planets.userId, userId));
  const colonyCount = Math.max(0, userPlanets.filter(p => p.status === 'active').length - 1);

  const { planetBuildings: pb } = await import('@exilium/db');
  const [ipc] = await db.select().from(pb)
    .where(and(eq(pb.buildingId, 'imperialPowerCenter')));
  // Filter to this user's planets
  const ipcOnUserPlanet = ipc && userPlanets.some(p => p.id === ipc.planetId) ? ipc : null;
  const capacity = 1 + (ipcOnUserPlanet?.level ?? 0);

  const harvestPenalties = (config.universe.governance_penalty_harvest as number[]) ?? [0.15, 0.35, 0.60];
  const constructionPenalties = (config.universe.governance_penalty_construction as number[]) ?? [0.15, 0.35, 0.60];
  const penalty = calculateGovernancePenalty(colonyCount, capacity, harvestPenalties, constructionPenalties);

  if (penalty.harvestMalus > 0) {
    talentCtx['governance_harvest_malus'] = -(penalty.harvestMalus);
  }
}
```

Then in `calculateProductionRates` (game engine), the malus applies via `talentCtx` keys that reduce `production_minerai`, `production_silicium`, `production_hydrogene`. The cleanest approach: apply the malus to all three production keys in talentCtx:

```typescript
if (penalty.harvestMalus > 0) {
  for (const key of ['production_minerai', 'production_silicium', 'production_hydrogene']) {
    talentCtx[key] = (talentCtx[key] ?? 0) - penalty.harvestMalus;
  }
}
```

- [ ] **Step 2: Inject governance penalty into building time**

In `building.service.ts`, in the `listBuildings` and `startUpgrade` methods, after computing building time, multiply by governance construction penalty for non-homeworld planets.

Find the line where `buildingTime()` is called and add:

```typescript
// Governance construction penalty
let governanceTimeMult = 1;
if (planet.sortOrder !== 0) {
  // ... same governance calculation as resource service ...
  governanceTimeMult = 1 + penalty.constructionMalus;
}
const time = Math.max(1, Math.floor(buildingTime(def, nextLevel, bonusMultiplier * talentTimeMultiplier, phaseMap) * governanceTimeMult));
```

Apply the same pattern to research time and shipyard time in their respective services.

- [ ] **Step 3: Extract governance helper to avoid duplication**

Create a shared helper `apps/api/src/lib/governance.ts` that both services can call:

```typescript
import { eq, and } from 'drizzle-orm';
import { planets, planetBuildings } from '@exilium/db';
import { calculateGovernancePenalty } from '@exilium/game-engine';
import type { Database } from '@exilium/db';

export async function getGovernancePenalty(
  db: Database,
  userId: string,
  planetSortOrder: number,
  config: { universe: Record<string, unknown> },
) {
  if (planetSortOrder === 0) {
    return { overextend: 0, harvestMalus: 0, constructionMalus: 0 };
  }

  const userPlanets = await db.select({ id: planets.id, status: planets.status })
    .from(planets).where(eq(planets.userId, userId));
  const colonyCount = Math.max(0, userPlanets.filter(p => p.status === 'active').length - 1);

  const allIpc = await db.select().from(planetBuildings)
    .where(eq(planetBuildings.buildingId, 'imperialPowerCenter'));
  const userPlanetIds = new Set(userPlanets.map(p => p.id));
  const ipc = allIpc.find(b => userPlanetIds.has(b.planetId));
  const capacity = 1 + (ipc?.level ?? 0);

  const harvestPenalties = (config.universe.governance_penalty_harvest as number[]) ?? [0.15, 0.35, 0.60];
  const constructionPenalties = (config.universe.governance_penalty_construction as number[]) ?? [0.15, 0.35, 0.60];

  return calculateGovernancePenalty(colonyCount, capacity, harvestPenalties, constructionPenalties);
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json
git add apps/api/
git commit -m "feat(api): integrate governance penalties into resource production and building time"
```

---

## Task 10: Frontend — Colonization page

**Files:**
- Create: `apps/web/src/pages/Colonization.tsx`
- Modify: `apps/web/src/pages/Overview.tsx` (redirect when colonizing)
- Modify: Router config (add route)

- [ ] **Step 1: Create Colonization page**

Create `apps/web/src/pages/Colonization.tsx` with:
- Progress bar (0-100%) with percentage and estimated time
- Active events list with countdown timers and resolve buttons
- Action buttons: "Ravitaillement" (links to fleet send), "Renfort militaire" (links to fleet send), "Consolider" (local mutation)
- Event history (resolved/expired)
- Visual styling consistent with other game pages (glass-card, proper colors)

The page queries `trpc.colonization.status` with the current planetId from outlet context.

- [ ] **Step 2: Redirect from Overview when colonizing**

In `Overview.tsx`, add at the top of the component:

```typescript
const { data: colonizationStatus } = trpc.colonization.status.useQuery(
  { planetId: planetId! },
  { enabled: !!planetId },
);

if (colonizationStatus) {
  return <Colonization planetId={planetId!} status={colonizationStatus} />;
}
```

Or use a route-level redirect based on planet status from the planet list query.

- [ ] **Step 3: Add tRPC types to frontend**

Ensure the `colonization` router is included in the AppRouter type export so the frontend tRPC client picks up the types.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
git add apps/web/
git commit -m "feat(web): add colonization page with progress bar, events, and actions"
```

---

## Task 11: Frontend — Empire governance indicator

**Files:**
- Modify: `apps/web/src/components/empire/EmpireKpiBar.tsx`
- Modify: `apps/web/src/pages/Empire.tsx`

- [ ] **Step 1: Add governance query to Empire page**

In `Empire.tsx`, add:

```typescript
const { data: governance } = trpc.colonization.governance.useQuery();
```

Pass `governance` to `EmpireKpiBar`.

- [ ] **Step 2: Add governance indicator to KPI bar**

In `EmpireKpiBar.tsx`, add a governance pill showing "Gouvernance X/Y" with color coding:
- Green: `colonyCount <= capacity`
- Orange: `colonyCount === capacity`
- Red: `colonyCount > capacity` with penalty tooltip

- [ ] **Step 3: Show colonizing planets as distinct cards in Empire**

In the planet list, planets with `status === 'colonizing'` should render as a simplified card showing the colonization progress bar instead of full resource/activity info.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
git add apps/web/
git commit -m "feat(web): add governance indicator to Empire page"
```

---

## Task 12: Frontend — Galaxy view colonizing state

**Files:**
- Modify: `apps/web/src/components/galaxy/GalaxySystemView/DetailPanel/ModePlanet.tsx`
- Modify: Galaxy system view (slot rendering)

- [ ] **Step 1: Colonizing visual in galaxy**

In the galaxy system view, positions with a colonizing planet should show a distinct visual (pulsing ring, different color, "Colonisation en cours" label).

- [ ] **Step 2: Detail panel for colonizing position**

When clicking a colonizing position, the detail panel shows:
- Planet name and type
- Colonization progress bar
- Number of pending events
- "Voir la colonisation" button linking to the planet's overview (which shows the Colonization page)

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
git add apps/web/
git commit -m "feat(web): show colonizing state in galaxy view"
```

---

## Task 13: Migration for existing players

**Files:**
- Create: `packages/db/src/scripts/migrate-colonization.ts`

- [ ] **Step 1: Write migration script**

For existing players who already have colonies:
1. All existing planets get `status = 'active'` (already default).
2. For each user, count colonies (total planets - 1 for homeworld).
3. Insert `imperialPowerCenter` building at `level = colonyCount` on the homeworld.
4. This ensures zero overextend for existing players.

```typescript
// For each user with > 1 planet:
//   Find homeworld (sortOrder = 0)
//   Insert planetBuildings row: { planetId: homeworld.id, buildingId: 'imperialPowerCenter', level: colonyCount }
```

- [ ] **Step 2: Test locally and commit**

```bash
git add packages/db/src/scripts/
git commit -m "feat(db): migration script to give existing players matching Imperial Power Center level"
```

---

## Task 14: Exclude colonizing planets from resource ticks and building

**Files:**
- Modify: `apps/api/src/modules/resource/resource.service.ts`
- Modify: `apps/api/src/modules/building/building.service.ts`
- Modify: `apps/api/src/modules/shipyard/shipyard.service.ts`
- Modify: `apps/api/src/modules/research/research.service.ts`

- [ ] **Step 1: Guard resource service**

In `materializeResources`, after fetching the planet, add:

```typescript
if (planet.status === 'colonizing') {
  // No resource production on colonizing planets
  return { ...planet, rates: null };
}
```

- [ ] **Step 2: Guard building/shipyard/research services**

In `startUpgrade`, `startBuild`, etc., add validation:

```typescript
if (planet.status === 'colonizing') {
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Construction impossible pendant la colonisation' });
}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit --project apps/api/tsconfig.json
git add apps/api/
git commit -m "feat(api): block building, research, and production on colonizing planets"
```

---

## Task Dependency Graph

```
Task 1 (schema) ──┬── Task 2 (config) ──── Task 7 (colonize handler)
                   │                    ├── Task 8 (supply/reinforce)
                   │                    └── Task 13 (migration)
                   │
                   ├── Task 3 (engine) ─── Task 9 (governance integration)
                   │
                   ├── Task 4 (service) ─┬─ Task 5 (worker)
                   │                     └─ Task 6 (wiring)
                   │
                   └── Task 14 (guards)

Tasks 10, 11, 12 (frontend) depend on Tasks 4 + 6 being complete.
```

Tasks 3, 4, and 14 can run in parallel after Task 1.
Tasks 10, 11, 12 can run in parallel after Task 6.
