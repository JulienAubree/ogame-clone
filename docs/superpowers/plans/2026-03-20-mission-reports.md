# Mission Reports (Minage) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate structured mining mission reports stored in a dedicated table, exposed via tRPC endpoints, and displayed in a new `/reports` page linked from the messaging system.

**Architecture:** New `mission_reports` table with typed columns + JSONB `result` field. Report created in `mine.handler.ts` at mine completion. New `report` tRPC module (service + router). New `/reports` frontend page. Fix `messageService` injection in workers.

**Tech Stack:** Drizzle ORM, tRPC, React, Tailwind, BullMQ workers

**Spec:** `docs/superpowers/specs/2026-03-20-mission-reports-design.md`

---

## File Structure

| File | Role |
|------|------|
| `packages/db/src/schema/mission-reports.ts` | NEW — Drizzle schema for `mission_reports` table |
| `packages/db/src/schema/index.ts` | MODIFY — export new schema |
| `apps/api/src/modules/report/report.service.ts` | NEW — CRUD service for reports |
| `apps/api/src/modules/report/report.router.ts` | NEW — tRPC endpoints (list, detail, byMessage, delete) |
| `apps/api/src/trpc/app-router.ts` | MODIFY — register report router |
| `apps/api/src/modules/fleet/fleet.types.ts` | MODIFY — add `reportService` to `MissionHandlerContext` |
| `apps/api/src/modules/fleet/fleet.service.ts` | MODIFY — accept and propagate `reportService` |
| `apps/api/src/modules/fleet/handlers/mine.handler.ts` | MODIFY — create report after extraction |
| `apps/api/src/workers/fleet-arrival.worker.ts` | MODIFY — fix messageService + inject reportService |
| `apps/api/src/workers/fleet-return.worker.ts` | MODIFY — fix messageService injection |
| `apps/web/src/router.tsx` | MODIFY — add `/reports` route |
| `apps/web/src/pages/Reports.tsx` | NEW — reports list + detail page |
| `apps/web/src/pages/Messages.tsx` | MODIFY — add "Voir le rapport" button on mission messages |
| `apps/web/src/components/layout/Sidebar.tsx` | MODIFY — add Rapports link |
| `apps/web/src/components/layout/BottomTabBar.tsx` | MODIFY — add Rapports link |
| `apps/web/src/lib/icons.tsx` | MODIFY — add ReportsIcon |

---

### Task 1: Schema Drizzle `mission_reports`

**Files:**
- Create: `packages/db/src/schema/mission-reports.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// packages/db/src/schema/mission-reports.ts
import { pgTable, uuid, varchar, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { fleetEvents, fleetMissionEnum } from './fleet-events.js';
import { pveMissions } from './pve-missions.js';
import { messages } from './messages.js';

export const missionReports = pgTable('mission_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fleetEventId: uuid('fleet_event_id').references(() => fleetEvents.id, { onDelete: 'set null' }),
  pveMissionId: uuid('pve_mission_id').references(() => pveMissions.id, { onDelete: 'set null' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
  missionType: fleetMissionEnum('mission_type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  coordinates: jsonb('coordinates').notNull(),       // { galaxy, system, position }
  originCoordinates: jsonb('origin_coordinates'),     // { galaxy, system, position, planetName }
  fleet: jsonb('fleet').notNull(),                    // { ships: Record<string, number>, totalCargo: number }
  departureTime: timestamp('departure_time', { withTimezone: true }).notNull(),
  completionTime: timestamp('completion_time', { withTimezone: true }).notNull(),
  result: jsonb('result').notNull(),                  // variable per missionType
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('mission_reports_user_created_idx').on(table.userId, table.createdAt),
  index('mission_reports_message_idx').on(table.messageId),
]);
```

- [ ] **Step 2: Export from index**

In `packages/db/src/schema/index.ts`, add:
```typescript
export * from './mission-reports.js';
```

- [ ] **Step 3: Generate and run migration**

```bash
cd /Users/julienaubree/_projet/ogame-clone/packages/db && pnpm db:generate
```

Verify a new SQL file appears in `drizzle/` with `CREATE TABLE mission_reports`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/mission-reports.ts packages/db/src/schema/index.ts packages/db/drizzle/
git commit -m "feat: add mission_reports table schema and migration"
```

---

### Task 2: Fix `messageService` injection in workers

**Files:**
- Modify: `apps/api/src/workers/fleet-arrival.worker.ts`
- Modify: `apps/api/src/workers/fleet-return.worker.ts`

- [ ] **Step 1: Fix fleet-arrival.worker.ts**

Move Redis creation before `createFleetService` and inject `messageService`:

```typescript
// fleet-arrival.worker.ts — add import at top
import { createMessageService } from '../modules/message/message.service.js';
```

Then reorder the service creation section (lines ~15-22):

```typescript
export function startFleetArrivalWorker(db: ReturnType<typeof createDb>) {
  const redis = new Redis(env.REDIS_URL);  // MOVED UP
  const resourceService = createResourceService(db);
  const gameConfigService = createGameConfigService(db);
  const asteroidBeltService = createAsteroidBeltService(db);
  const pirateService = createPirateService(db, gameConfigService);
  const pveService = createPveService(db, asteroidBeltService, pirateService);
  const messageService = createMessageService(db, redis);  // NEW
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed, messageService, gameConfigService, pveService, asteroidBeltService, pirateService);
  // remove the old `const redis = new Redis(env.REDIS_URL);` line that was below
```

- [ ] **Step 2: Fix fleet-return.worker.ts**

Same pattern — move Redis up, inject messageService:

```typescript
// fleet-return.worker.ts — add import at top
import { createMessageService } from '../modules/message/message.service.js';
```

```typescript
export function startFleetReturnWorker(db: ReturnType<typeof createDb>) {
  const redis = new Redis(env.REDIS_URL);  // MOVED UP
  const resourceService = createResourceService(db);
  const gameConfigService = createGameConfigService(db);
  const asteroidBeltService = createAsteroidBeltService(db);
  const pirateService = createPirateService(db, gameConfigService);
  const pveService = createPveService(db, asteroidBeltService, pirateService);
  const messageService = createMessageService(db, redis);  // NEW
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed, messageService, gameConfigService, pveService, asteroidBeltService, pirateService);
  // remove old `const redis = new Redis(env.REDIS_URL);` line
  // KEEP `const tutorialService = createTutorialService(db, pveService);` in its current position (after pveService)
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/fleet-arrival.worker.ts apps/api/src/workers/fleet-return.worker.ts
git commit -m "fix: inject messageService into fleet workers (was undefined)"
```

---

### Task 3: Report service

**Files:**
- Create: `apps/api/src/modules/report/report.service.ts`

- [ ] **Step 1: Create report service**

```typescript
// apps/api/src/modules/report/report.service.ts
import { eq, and, desc, lt, inArray, sql } from 'drizzle-orm';
import { missionReports } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

export function createReportService(db: Database) {
  return {
    async create(data: {
      userId: string;
      fleetEventId?: string;
      pveMissionId?: string;
      messageId?: string;
      missionType: string;
      title: string;
      coordinates: { galaxy: number; system: number; position: number };
      originCoordinates?: { galaxy: number; system: number; position: number; planetName: string };
      fleet: { ships: Record<string, number>; totalCargo: number };
      departureTime: Date;
      completionTime: Date;
      result: Record<string, unknown>;
    }) {
      const [report] = await db
        .insert(missionReports)
        .values({
          userId: data.userId,
          fleetEventId: data.fleetEventId ?? null,
          pveMissionId: data.pveMissionId ?? null,
          messageId: data.messageId ?? null,
          missionType: data.missionType as typeof missionReports.$inferInsert.missionType,
          title: data.title,
          coordinates: data.coordinates,
          originCoordinates: data.originCoordinates ?? null,
          fleet: data.fleet,
          departureTime: data.departureTime,
          completionTime: data.completionTime,
          result: data.result,
        })
        .returning();
      return report;
    },

    async list(userId: string, options?: { cursor?: string; limit?: number; missionTypes?: string[] }) {
      const limit = options?.limit ?? 20;
      const conditions = [eq(missionReports.userId, userId)];

      if (options?.cursor) {
        const [cursorReport] = await db
          .select({ createdAt: missionReports.createdAt })
          .from(missionReports)
          .where(eq(missionReports.id, options.cursor))
          .limit(1);
        if (cursorReport) {
          conditions.push(lt(missionReports.createdAt, cursorReport.createdAt));
        }
      }

      if (options?.missionTypes && options.missionTypes.length > 0) {
        conditions.push(
          inArray(missionReports.missionType, options.missionTypes as [string, ...string[]]),
        );
      }

      const reports = await db
        .select()
        .from(missionReports)
        .where(and(...conditions))
        .orderBy(desc(missionReports.createdAt))
        .limit(limit + 1);

      const hasMore = reports.length > limit;
      const results = hasMore ? reports.slice(0, limit) : reports;
      const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

      return { reports: results, nextCursor };
    },

    async getById(userId: string, reportId: string) {
      const [report] = await db
        .select()
        .from(missionReports)
        .where(and(eq(missionReports.id, reportId), eq(missionReports.userId, userId)))
        .limit(1);

      if (report && !report.read) {
        await db
          .update(missionReports)
          .set({ read: true })
          .where(eq(missionReports.id, reportId));
      }

      return report ?? null;
    },

    async getByMessageId(userId: string, messageId: string) {
      const [report] = await db
        .select()
        .from(missionReports)
        .where(and(eq(missionReports.messageId, messageId), eq(missionReports.userId, userId)))
        .limit(1);
      return report ?? null;
    },

    async deleteReport(userId: string, reportId: string) {
      await db
        .delete(missionReports)
        .where(and(eq(missionReports.id, reportId), eq(missionReports.userId, userId)));
      return { success: true };
    },

    async countUnread(userId: string) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(missionReports)
        .where(and(eq(missionReports.userId, userId), eq(missionReports.read, false)));
      return result?.count ?? 0;
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/report/report.service.ts
git commit -m "feat: add report service with CRUD operations"
```

---

### Task 4: Report tRPC router

**Files:**
- Create: `apps/api/src/modules/report/report.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Create report router**

```typescript
// apps/api/src/modules/report/report.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createReportService } from './report.service.js';

const missionTypeEnum = z.enum(['mine', 'transport', 'spy', 'attack', 'pirate', 'colonize', 'recycle', 'station']);

export function createReportRouter(reportService: ReturnType<typeof createReportService>) {
  return router({
    list: protectedProcedure
      .input(z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        missionTypes: z.array(missionTypeEnum).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return reportService.list(ctx.userId!, {
          cursor: input?.cursor,
          limit: input?.limit,
          missionTypes: input?.missionTypes,
        });
      }),

    detail: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return reportService.getById(ctx.userId!, input.id);
      }),

    byMessage: protectedProcedure
      .input(z.object({ messageId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        return reportService.getByMessageId(ctx.userId!, input.messageId);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        return reportService.deleteReport(ctx.userId!, input.id);
      }),

    unreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        const count = await reportService.countUnread(ctx.userId!);
        return { count };
      }),
  });
}
```

- [ ] **Step 2: Register in app-router.ts**

In `apps/api/src/trpc/app-router.ts`:

Add imports:
```typescript
import { createReportService } from '../modules/report/report.service.js';
import { createReportRouter } from '../modules/report/report.router.js';
```

After `const tutorialService = ...` (line 61), add:
```typescript
  const reportService = createReportService(db);
```

After `const tutorialRouter = ...` (line 78), add:
```typescript
  const reportRouter = createReportRouter(reportService);
```

In the `return router({...})` block, after `tutorial: tutorialRouter,` add:
```typescript
    report: reportRouter,
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/report/report.router.ts apps/api/src/trpc/app-router.ts
git commit -m "feat: add report tRPC router with list, detail, byMessage, delete endpoints"
```

---

### Task 5: Inject `reportService` into fleet handler context

**Files:**
- Modify: `apps/api/src/modules/fleet/fleet.types.ts`
- Modify: `apps/api/src/modules/fleet/fleet.service.ts`
- Modify: `apps/api/src/workers/fleet-arrival.worker.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Add reportService to MissionHandlerContext**

In `apps/api/src/modules/fleet/fleet.types.ts`, add import:
```typescript
import type { createReportService } from '../report/report.service.js';
```

Add to `MissionHandlerContext` interface (after `messageService?` line 66):
```typescript
  reportService?: ReturnType<typeof createReportService>;
```

- [ ] **Step 2: Accept reportService in createFleetService**

In `apps/api/src/modules/fleet/fleet.service.ts`, add import:
```typescript
import type { createReportService } from '../report/report.service.js';
```

Add parameter after `pirateService` (line 35):
```typescript
  reportService?: ReturnType<typeof createReportService>,
```

Add to `handlerCtx` object (after `pirateService,` line 55):
```typescript
    reportService,
```

- [ ] **Step 3: Inject in fleet-arrival.worker.ts**

In `fleet-arrival.worker.ts`, add import:
```typescript
import { createReportService } from '../modules/report/report.service.js';
```

After `const messageService = createMessageService(db, redis);` add:
```typescript
  const reportService = createReportService(db);
```

Pass to `createFleetService` as last argument:
```typescript
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed, messageService, gameConfigService, pveService, asteroidBeltService, pirateService, reportService);
```

- [ ] **Step 4: Inject in app-router.ts**

In `apps/api/src/trpc/app-router.ts`, update the `createFleetService` call (line 57) to pass `reportService` as last argument:
```typescript
  const fleetService = createFleetService(db, resourceService, fleetArrivalQueue, fleetReturnQueue, UNIVERSE_CONFIG.speed, messageService, gameConfigService, pveService, asteroidBeltService, pirateService, reportService);
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/fleet/fleet.types.ts apps/api/src/modules/fleet/fleet.service.ts apps/api/src/workers/fleet-arrival.worker.ts apps/api/src/trpc/app-router.ts
git commit -m "feat: inject reportService into fleet handler context"
```

---

### Task 6: Create mining report in mine.handler.ts

**Files:**
- Modify: `apps/api/src/modules/fleet/handlers/mine.handler.ts`

- [ ] **Step 1: Add planet import for origin coordinates**

In `mine.handler.ts` line 3, add `planets` to the existing `@ogame-clone/db` import:
```typescript
import { fleetEvents, pveMissions, asteroidDeposits, userResearch, planets } from '@ogame-clone/db';
```

- [ ] **Step 2: Modify processMineDone to create the report**

Replace the system message + return section (from line 178 to end of `processMineDone`). The new code goes after line 176 (`await ctx.pveService.completeMission(mission.id);`):

```typescript
    // Build report data
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const meta = fleetEvent.metadata as { originalDepartureTime?: string } | null;
    const originalDeparture = meta?.originalDepartureTime ? new Date(meta.originalDepartureTime) : fleetEvent.departureTime;
    const totalDuration = formatDuration(Date.now() - originalDeparture.getTime());

    // Fetch origin planet for coordinates
    const [originPlanet] = await ctx.db.select({
      galaxy: planets.galaxy,
      system: planets.system,
      position: planets.position,
      name: planets.name,
    }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);

    // Collect technologies that influenced the result
    // Note: `config` is already available in scope (fetched at line ~131 for shipStatsMap)
    const technologies: Array<{ name: string; level: number | null; bonusType: string; description: string }> = [];
    if (refiningLevel > 0) {
      technologies.push({
        name: 'deepSpaceRefining',
        level: refiningLevel,
        bonusType: 'slag_reduction',
        description: `Scories reduites a ${Math.round(slagRate * 100)}%`,
      });
    }
    // researchLevels: rebuild from `research` already in scope (line ~139)
    const researchLevels: Record<string, number> = {};
    if (research) {
      for (const [key, value] of Object.entries(research)) {
        if (key !== 'userId' && typeof value === 'number') researchLevels[key] = value;
      }
    }
    const durationBonus = resolveBonus('mining_duration', null, researchLevels, config.bonuses);
    if (durationBonus < 1) {
      technologies.push({
        name: 'mining_duration',
        level: null,
        bonusType: 'duration_reduction',
        description: `Duree de minage -${Math.round((1 - durationBonus) * 100)}%`,
      });
    }

    // Create system message
    let messageId: string | undefined;
    if (ctx.messageService) {
      const parts = [`Extraction terminee en ${coords}\n`];
      parts.push(`Duree totale : ${totalDuration}`);
      const resLines: string[] = [];
      if (cargo.minerai > 0) resLines.push(`Minerai: +${cargo.minerai.toLocaleString('fr-FR')}`);
      if (cargo.silicium > 0) resLines.push(`Silicium: +${cargo.silicium.toLocaleString('fr-FR')}`);
      if (cargo.hydrogene > 0) resLines.push(`Hydrogene: +${cargo.hydrogene.toLocaleString('fr-FR')}`);
      parts.push(resLines.join(' | '));
      if (slagRate > 0) {
        parts.push(`Pertes (scories) : ${Math.round(slagRate * 100)}%`);
      }
      const msg = await ctx.messageService.createSystemMessage(
        fleetEvent.userId,
        'mission',
        `Extraction terminee ${coords}`,
        parts.join('\n'),
      );
      messageId = msg.id;
    }

    // Create mission report
    // Note: `shipStatsMap` is already available in scope (line ~131: buildShipStatsMap(config))
    if (ctx.reportService) {
      await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        pveMissionId: pveMissionId ?? undefined,
        messageId,
        missionType: 'mine',
        title: `Rapport de minage ${coords}`,
        coordinates: {
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
        },
        originCoordinates: originPlanet ? {
          galaxy: originPlanet.galaxy,
          system: originPlanet.system,
          position: originPlanet.position,
          planetName: originPlanet.name,
        } : undefined,
        fleet: {
          ships: ships,
          totalCargo: totalCargoCapacity(ships, shipStatsMap),
        },
        departureTime: originalDeparture,
        completionTime: new Date(),
        result: {
          rewards: cargo,
          slagRate,
          technologies,
        },
      });
    }

    return {
      scheduleReturn: true,
      cargo,
    };
```

**Variables already in scope from existing extraction logic (do NOT re-declare):**
- `config` (line ~131: `await ctx.gameConfigService.getFullConfig()`)
- `shipStatsMap` (line ~131: `buildShipStatsMap(config)`)
- `research` and `refiningLevel` (lines ~139-141)
- `slagRate` (line ~141)
- `cargo` (line ~164-168)
- `ships` (line ~114)

**Imports already available:** `resolveBonus`, `totalCargoCapacity`, `buildShipStatsMap` (line 4), `formatDuration` (line 7). Only `planets` needs to be added (Step 1).

- [ ] **Step 3: Verify build**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/fleet/handlers/mine.handler.ts
git commit -m "feat: create mining mission report with technologies and origin coordinates"
```

---

### Task 7: Frontend — ReportsIcon + route + navigation

**Files:**
- Modify: `apps/web/src/lib/icons.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/components/layout/BottomTabBar.tsx`

- [ ] **Step 1: Add ReportsIcon to icons.tsx**

Open `apps/web/src/lib/icons.tsx` and add a `ReportsIcon` export. Use the same pattern as the other icons (SVG component). A clipboard/document icon fits:

```typescript
export function ReportsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 13H8" />
      <path d="M16 13h-2" />
      <path d="M10 17H8" />
      <path d="M16 17h-2" />
    </svg>
  );
}
```

- [ ] **Step 2: Add route in router.tsx**

In `apps/web/src/router.tsx`, add after the `messages` route (line 101-102):
```typescript
      {
        path: 'reports',
        lazy: () => import('./pages/Reports').then((m) => ({ Component: m.default })),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
```

- [ ] **Step 3: Add to Sidebar**

In `apps/web/src/components/layout/Sidebar.tsx`, add `ReportsIcon` to imports:
```typescript
import { ..., ReportsIcon } from '@/lib/icons';
```

In the Social section items array (after `Messages` line 57):
```typescript
      { label: 'Rapports', path: '/reports', icon: ReportsIcon },
```

- [ ] **Step 4: Add to BottomTabBar**

In `apps/web/src/components/layout/BottomTabBar.tsx`, add to the `TAB_GROUPS.social` array (line 29):
```typescript
  social: ['/messages', '/reports', '/alliance', '/ranking', '/alliance-ranking'],
```

Add to `SHEET_ITEMS.social` array (after Messages line 49):
```typescript
    { label: 'Rapports', path: '/reports', icon: ReportsIcon },
```

Add `ReportsIcon` to the imports from `@/lib/icons`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/icons.tsx apps/web/src/router.tsx apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/layout/BottomTabBar.tsx
git commit -m "feat: add reports route, icon, and navigation links"
```

---

### Task 8: Frontend — Reports page (list + detail)

**Files:**
- Create: `apps/web/src/pages/Reports.tsx`

- [ ] **Step 1: Create the Reports page**

Create `apps/web/src/pages/Reports.tsx`. Follow the same patterns as `Messages.tsx` (responsive 2-3 column layout) and `History.tsx` (cursor-based infinite scroll, filter pills).

Key structure:
- Left panel: list of report cards with filters (pills by `missionType`)
- Right panel: selected report detail
- Mobile: single column, tap a report to show detail

Uses the **same manual cursor accumulation pattern as `History.tsx`** (NOT `useInfiniteQuery` which is not used in this project):

```typescript
// apps/web/src/pages/Reports.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

const MISSION_TYPE_LABELS: Record<string, string> = {
  mine: 'Minage',
  transport: 'Transport',
  spy: 'Espionnage',
  attack: 'Attaque',
  pirate: 'Pirate',
  colonize: 'Colonisation',
  recycle: 'Recyclage',
  station: 'Stationnement',
};

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function formatCoords(coords: { galaxy: number; system: number; position: number }) {
  return `[${coords.galaxy}:${coords.system}:${coords.position}]`;
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const loaderRef = useRef<HTMLDivElement>(null);
  const lastAppendedCursorRef = useRef<string | undefined>(undefined);

  const currentCursor = cursors[cursors.length - 1];

  const { data, isFetching } = trpc.report.list.useQuery(
    { cursor: currentCursor, limit: 20, missionTypes: typeFilter.length > 0 ? typeFilter as any : undefined },
    { placeholderData: (prev: any) => prev },
  );

  // Accumulate reports from all pages (same pattern as History.tsx)
  const pages = useRef<Map<string | undefined, any[]>>(new Map());
  if (data && data.reports.length > 0) {
    pages.current.set(currentCursor, data.reports);
  }

  // Reset on filter change
  const handleFilterChange = (type: string) => {
    setTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    pages.current.clear();
    setCursors([undefined]);
    lastAppendedCursorRef.current = undefined;
  };

  // Load more
  const handleLoadMore = useCallback(() => {
    if (data?.nextCursor && !isFetching && lastAppendedCursorRef.current !== data.nextCursor) {
      lastAppendedCursorRef.current = data.nextCursor;
      setCursors((prev) => [...prev, data.nextCursor]);
    }
  }, [data?.nextCursor, isFetching]);

  // Infinite scroll observer
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore(); },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  const allReports = Array.from(pages.current.values()).flat();
  const hasMore = !!data?.nextCursor;

  const { data: selectedReport } = trpc.report.detail.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId },
  );

  const utils = trpc.useUtils();
  const deleteMutation = trpc.report.delete.useMutation({
    onSuccess: () => {
      pages.current.clear();
      setCursors([undefined]);
      lastAppendedCursorRef.current = undefined;
      utils.report.list.invalidate();
      setSearchParams({});
    },
  });

  // Auto-select first report on desktop
  useEffect(() => {
    if (!selectedId && allReports.length > 0 && window.innerWidth >= 768) {
      setSearchParams({ id: allReports[0].id });
    }
  }, [allReports.length]);

  const selectReport = (id: string) => setSearchParams({ id });

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Rapports de mission" description="Consultez les resultats de vos missions" />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 px-4 py-2">
        {Object.entries(MISSION_TYPE_LABELS).map(([type, label]) => (
          <button
            key={type}
            onClick={() => handleFilterChange(type)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              typeFilter.includes(type)
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-card/60 text-muted-foreground border border-white/10 hover:bg-accent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Report list */}
        <div className={cn(
          'flex flex-col overflow-y-auto border-r border-white/10',
          selectedId ? 'hidden md:flex md:w-1/3 lg:w-1/4' : 'w-full',
        )}>
          {isFetching && allReports.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">Chargement...</div>
          )}
          {!isFetching && allReports.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">Aucun rapport</div>
          )}
          {allReports.map((report) => (
            <button
              key={report.id}
              onClick={() => selectReport(report.id)}
              className={cn(
                'flex flex-col gap-1 border-b border-white/5 p-3 text-left transition-colors',
                report.id === selectedId
                  ? 'bg-primary/10 border-l-2 border-l-primary'
                  : 'hover:bg-accent/50',
                !report.read && 'font-semibold',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-primary/80">
                  {MISSION_TYPE_LABELS[report.missionType] ?? report.missionType}
                </span>
                {!report.read && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              <span className="text-sm truncate">{report.title}</span>
              <span className="text-xs text-muted-foreground">{formatDate(report.createdAt)}</span>
            </button>
          ))}
          {hasMore && (
            <div ref={loaderRef} className="flex justify-center p-4">
              {isFetching && <span className="text-xs text-muted-foreground">Chargement...</span>}
            </div>
          )}
        </div>

        {/* Report detail */}
        {selectedId && selectedReport ? (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
            {/* Back button (mobile) */}
            <button
              onClick={() => setSearchParams({})}
              className="mb-4 text-sm text-primary hover:underline md:hidden"
            >
              Retour a la liste
            </button>

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-lg font-bold">{selectedReport.title}</h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{MISSION_TYPE_LABELS[selectedReport.missionType]}</span>
                <span>Cible : {formatCoords(selectedReport.coordinates as any)}</span>
                {selectedReport.originCoordinates && (
                  <span>Origine : {(selectedReport.originCoordinates as any).planetName} {formatCoords(selectedReport.originCoordinates as any)}</span>
                )}
                <span>Envoi : {formatDate(selectedReport.departureTime)}</span>
                <span>Fin : {formatDate(selectedReport.completionTime)}</span>
              </div>
            </div>

            {/* Fleet */}
            <section className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Flotte</h3>
              <div className="glass-card p-4">
                <div className="flex flex-wrap gap-3">
                  {Object.entries((selectedReport.fleet as any).ships).map(([ship, count]) => (
                    <div key={ship} className="flex items-center gap-1 text-sm">
                      <span className="text-foreground">{String(count)}x</span>
                      <span className="text-muted-foreground">{ship}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Capacite cargo : {((selectedReport.fleet as any).totalCargo ?? 0).toLocaleString('fr-FR')}
                </div>
              </div>
            </section>

            {/* Results (mine-specific) */}
            {selectedReport.missionType === 'mine' && (() => {
              const result = selectedReport.result as any;
              return (
                <>
                  <section className="mb-6">
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Ressources extraites</h3>
                    <div className="glass-card p-4">
                      <div className="flex flex-wrap gap-4">
                        {Object.entries(result.rewards ?? {}).map(([resource, amount]) => (
                          <div key={resource} className="flex items-center gap-2">
                            <span className={cn('text-lg font-bold', RESOURCE_COLORS[resource])}>
                              +{(amount as number).toLocaleString('fr-FR')}
                            </span>
                            <span className="text-sm text-muted-foreground capitalize">{resource}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Slag */}
                  <section className="mb-6">
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Scories</h3>
                    <div className="glass-card p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500/70"
                            style={{ width: `${Math.round((result.slagRate ?? 0) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-amber-400">
                          {Math.round((result.slagRate ?? 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Technologies */}
                  {result.technologies?.length > 0 && (
                    <section className="mb-6">
                      <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Technologies</h3>
                      <div className="glass-card p-4">
                        <ul className="space-y-2">
                          {result.technologies.map((tech: any, i: number) => (
                            <li key={i} className="flex items-center justify-between text-sm">
                              <span className="text-foreground">
                                {tech.name === 'deepSpaceRefining' ? 'Raffinage spatial profond' : 'Bonus de minage'}
                                {tech.level != null && <span className="text-primary ml-1">Niv. {tech.level}</span>}
                              </span>
                              <span className="text-muted-foreground">{tech.description}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </section>
                  )}
                </>
              );
            })()}

            {/* Delete */}
            <div className="mt-auto pt-4">
              <button
                onClick={() => deleteMutation.mutate({ id: selectedReport.id })}
                className="text-xs text-destructive hover:underline"
              >
                Supprimer ce rapport
              </button>
            </div>
          </div>
        ) : !selectedId ? (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Selectionnez un rapport
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Reports.tsx
git commit -m "feat: add Reports page with list, detail, and filtering"
```

---

### Task 9: Frontend — Link reports from Messages page

**Files:**
- Modify: `apps/web/src/pages/Messages.tsx`

- [ ] **Step 1: Add "Voir le rapport" button to mission messages**

In `Messages.tsx`, there are two places where message detail is rendered:

1. **Desktop detail panel** (around line 310, after `detail.body` display)
2. **Mobile overlay** (around line 507, after `detail.body` display)

The variable is `detail`, not `msg`. Add the `ReportLink` after the body in both locations:

```tsx
{detail.type === 'mission' && (
  <ReportLink messageId={detail.id} />
)}
```

Add `useNavigate` to the existing `react-router` import if not already present. Then add the `ReportLink` component inside the file:

```tsx
function ReportLink({ messageId }: { messageId: string }) {
  const navigate = useNavigate();
  const { data: report } = trpc.report.byMessage.useQuery({ messageId });

  if (!report) return null;

  return (
    <button
      onClick={() => navigate(`/reports?id=${report.id}`)}
      className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
    >
      Voir le rapport detaille
    </button>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Messages.tsx
git commit -m "feat: add 'Voir le rapport' link on mission messages"
```

---

### Task 10: Run migration on VPS and verify end-to-end

- [ ] **Step 1: Push all changes**

```bash
cd /Users/julienaubree/_projet/ogame-clone && git push
```

- [ ] **Step 2: Deploy and run migration on VPS**

SSH into VPS and run:
```bash
cd /opt/ogame-clone && bash deploy.sh
```

The deploy script should handle `pnpm db:migrate` as part of the deployment. If not, run manually:
```bash
cd /opt/ogame-clone && pnpm --filter @ogame-clone/db db:migrate
```

- [ ] **Step 3: Verify end-to-end**

1. Send a mining fleet to an asteroid belt
2. Wait for the mission to complete
3. Check that a system message appears in Messages (type "mission")
4. Check that a report appears in the new `/reports` page
5. Click "Voir le rapport detaille" on the message to verify navigation
6. Verify the report shows: title, coordinates, fleet, resources, slag rate, technologies
