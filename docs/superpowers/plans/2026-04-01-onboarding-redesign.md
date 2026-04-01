# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the tutorial system with 4 narrative chapters (23 quests), journal-style storytelling, manual quest validation, chapter rewards (resources + units + Exilium), objective progress bars, and visual highlighting of target elements.

**Architecture:** Extend DB schema with chapters table and pendingCompletion field. Rewrite tutorial service to support manual validation flow. Replace seed data with 23 quests across 4 chapters. Redesign TutorialPanel with chapter structure, journal entries, progress bars, and "Next" button. Add useTutorialHighlight hook for visual guidance on building/research/shipyard pages.

**Tech Stack:** Drizzle ORM, tRPC, React, Tailwind CSS, Zustand

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/db/src/schema/tutorial-progress.ts` | Add `pendingCompletion` column |
| Modify | `packages/db/src/schema/tutorial-quest-definitions.ts` | Add `chapterId`, `journalEntry`, `objectiveLabel` columns |
| Create | `packages/db/src/schema/tutorial-chapters.ts` | New chapters table |
| Modify | `packages/db/src/schema/index.ts` | Export new table |
| Modify | `packages/db/src/seed-game-config.ts` | Replace 16 quests with 4 chapters + 23 quests |
| Modify | `apps/api/src/modules/tutorial/tutorial.service.ts` | Rewrite: pendingCompletion flow, chapter rewards, defense_count, currentProgress |
| Modify | `apps/api/src/modules/tutorial/tutorial.router.ts` | Add `completeQuest` mutation, enrich `getCurrent` response |
| Modify | `apps/api/src/workers/build-completion.worker.ts` | Add research_level tutorial hook |
| Modify | `apps/web/src/components/tutorial/TutorialPanel.tsx` | Full redesign: chapters, journal, progress bars, Next button |
| Create | `apps/web/src/hooks/useTutorialHighlight.ts` | Hook for visual highlighting |
| Modify | `apps/web/src/pages/Buildings.tsx` | Add tutorial highlight |
| Modify | `apps/web/src/pages/Research.tsx` | Add tutorial highlight |
| Modify | `apps/web/src/pages/Shipyard.tsx` | Add tutorial highlight |
| Modify | `apps/web/src/pages/CommandCenter.tsx` | Add tutorial highlight |
| Modify | `apps/web/src/pages/Defense.tsx` | Add tutorial highlight |

---

### Task 1: DB schema changes

**Files:**
- Modify: `packages/db/src/schema/tutorial-progress.ts`
- Modify: `packages/db/src/schema/tutorial-quest-definitions.ts`
- Create: `packages/db/src/schema/tutorial-chapters.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Add pendingCompletion to tutorial-progress.ts**

Add after `isComplete`:
```typescript
  pendingCompletion: boolean('pending_completion').notNull().default(false),
```

- [ ] **Step 2: Add new columns to tutorial-quest-definitions.ts**

Add after existing columns:
```typescript
  chapterId: varchar('chapter_id', { length: 64 }).notNull().default('chapter_1'),
  journalEntry: text('journal_entry').notNull().default(''),
  objectiveLabel: varchar('objective_label', { length: 128 }).notNull().default(''),
```

- [ ] **Step 3: Create tutorial-chapters.ts**

```typescript
import { pgTable, varchar, smallint, integer, text, jsonb } from 'drizzle-orm/pg-core';

export const tutorialChapters = pgTable('tutorial_chapters', {
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 128 }).notNull(),
  journalIntro: text('journal_intro').notNull(),
  order: smallint('chapter_order').notNull(),
  rewardMinerai: integer('reward_minerai').notNull().default(0),
  rewardSilicium: integer('reward_silicium').notNull().default(0),
  rewardHydrogene: integer('reward_hydrogene').notNull().default(0),
  rewardExilium: integer('reward_exilium').notNull().default(0),
  rewardUnits: jsonb('reward_units').notNull().default([]),
});
```

- [ ] **Step 4: Export from index.ts**

Add to `packages/db/src/schema/index.ts`:
```typescript
export * from './tutorial-chapters.js';
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/
git commit -m "feat(onboarding): add tutorial chapters table, pendingCompletion, quest metadata columns"
```

---

### Task 2: Seed data — 4 chapters + 23 quests

**Files:**
- Modify: `packages/db/src/seed-game-config.ts`

- [ ] **Step 1: Add TUTORIAL_CHAPTERS array**

Add before TUTORIAL_QUESTS:

```typescript
const TUTORIAL_CHAPTERS = [
  { id: 'chapter_1', title: "L'atterrissage", journalIntro: "Le vaisseau est en miettes. Les systemes de survie tiennent a peine. Les scanners detectent une planete habitable a proximite. C'est notre seule chance.", order: 1, rewardMinerai: 350, rewardSilicium: 200, rewardHydrogene: 75, rewardExilium: 0, rewardUnits: [] },
  { id: 'chapter_2', title: 'La colonie', journalIntro: "Les fondations sont la. On ne survivra pas longtemps en se contentant de creuser. Il est temps de penser plus grand — automatisation, recherche, construction.", order: 2, rewardMinerai: 350, rewardSilicium: 350, rewardHydrogene: 200, rewardExilium: 5, rewardUnits: [] },
  { id: 'chapter_3', title: "L'espace", journalIntro: "Le chantier spatial est operationnel. L'espace est immense, dangereux, et plein de debris. Mais c'est la que se trouvent les ressources dont on a besoin pour grandir.", order: 3, rewardMinerai: 0, rewardSilicium: 0, rewardHydrogene: 0, rewardExilium: 10, rewardUnits: [{ shipId: 'explorer', quantity: 2 }, { shipId: 'prospector', quantity: 1 }] },
  { id: 'chapter_4', title: 'La menace', journalIntro: "Jour 80 — Les capteurs longue portee ont capte des signaux non identifies. Des vaisseaux, nombreux, en patrouille. On n'est pas seuls ici. Et ils n'ont pas l'air amicaux.", order: 4, rewardMinerai: 0, rewardSilicium: 0, rewardHydrogene: 0, rewardExilium: 15, rewardUnits: [{ shipId: 'interceptor', quantity: 5 }] },
];
```

- [ ] **Step 2: Replace TUTORIAL_QUESTS with 23 quests**

Replace the entire TUTORIAL_QUESTS array with the 23 quests from the spec. Each quest now has `chapterId`, `journalEntry`, and `objectiveLabel` fields in addition to existing fields.

Note: Quest 22 uses `conditionType: 'defense_count'` with `conditionTargetId: 'lightLaser'` and `conditionTargetValue: 4`.

- [ ] **Step 3: Add chapter seeding logic**

In the seed function, add upsert for `tutorialChapters` table (same pattern as other seeds).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/seed-game-config.ts
git commit -m "feat(onboarding): seed 4 chapters and 23 quests with journal narratives"
```

---

### Task 3: Backend — Rewrite tutorial service

**Files:**
- Modify: `apps/api/src/modules/tutorial/tutorial.service.ts`

- [ ] **Step 1: Rewrite the service**

Key changes:
1. Import `tutorialChapters` and `planetDefenses` from `@exilium/db`
2. Add `defense_count` condition type to `checkCompletion()` — query `planetDefenses` for the target column
3. Remove the auto-completion while loop from `getCurrent()` — replace with single check that sets `pendingCompletion = true`
4. Modify `checkAndComplete()`: instead of completing the quest, set `pendingCompletion = true` and return without advancing
5. Add new method `completeCurrentQuest(userId)`:
   - Verify `pendingCompletion === true`
   - Award quest rewards to first planet
   - Check if this was the last quest of its chapter → award chapter rewards (resources + units via planetShips + Exilium via exiliumService.earn)
   - Advance to next quest
   - Check if new quest is already satisfied → if so, set `pendingCompletion = true` again
   - Return new state
6. Enrich `getCurrent()` response with:
   - `chapter` object (id, title, journalIntro, questCount, completedInChapter)
   - `currentProgress` (current value toward target)
   - `targetValue` (quest condition value)
   - `pendingCompletion` boolean
   - `objectiveLabel` from quest definition

The service factory needs `exiliumService` as an additional optional dependency for Exilium rewards.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/tutorial/tutorial.service.ts
git commit -m "feat(onboarding): rewrite tutorial service with pending completion, chapters, defense_count"
```

---

### Task 4: Backend — Update router + wire dependencies

**Files:**
- Modify: `apps/api/src/modules/tutorial/tutorial.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts`
- Modify: `apps/api/src/workers/build-completion.worker.ts`

- [ ] **Step 1: Add completeQuest mutation to router**

```typescript
    completeQuest: protectedProcedure
      .mutation(async ({ ctx }) => {
        return tutorialService.completeCurrentQuest(ctx.userId!);
      }),
```

- [ ] **Step 2: Pass exiliumService to tutorialService in app-router.ts**

Find `createTutorialService(db, pveService)` and add exiliumService:
```typescript
const tutorialService = createTutorialService(db, pveService, exiliumService);
```

- [ ] **Step 3: Fix research hook in build-completion.worker.ts**

Find where building completion triggers tutorial check. Add a similar block for research completion that calls `tutorialService.checkAndComplete()` with `type: 'research_level'`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/tutorial/tutorial.router.ts apps/api/src/trpc/app-router.ts apps/api/src/workers/build-completion.worker.ts
git commit -m "feat(onboarding): add completeQuest endpoint, wire exiliumService, fix research hook"
```

---

### Task 5: Frontend — useTutorialHighlight hook

**Files:**
- Create: `apps/web/src/hooks/useTutorialHighlight.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { trpc } from '@/trpc';

/**
 * Returns true if the given item should be highlighted as the current tutorial objective.
 * Usage: const highlighted = useTutorialHighlight('mineraiMine');
 */
export function useTutorialHighlight(itemId: string): boolean {
  const { data } = trpc.tutorial.getCurrent.useQuery();

  if (!data || data.isComplete || !data.quest || data.pendingCompletion) return false;

  const { condition } = data.quest;
  const highlightTypes = ['building_level', 'research_level', 'ship_count', 'defense_count'];

  if (!highlightTypes.includes(condition.type)) return false;

  return condition.targetId === itemId;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/useTutorialHighlight.ts
git commit -m "feat(onboarding): add useTutorialHighlight hook"
```

---

### Task 6: Frontend — Redesign TutorialPanel

**Files:**
- Modify: `apps/web/src/components/tutorial/TutorialPanel.tsx`

- [ ] **Step 1: Full rewrite of TutorialPanel**

The new panel displays:
1. **Minimized state**: floating badge with chapter number
2. **Chapter intro screen**: when entering a new chapter, show intro text + "Commencer" button
3. **Active quest view**:
   - Chapter header with progress bar (X/Y quests in chapter)
   - Journal entry (italic, amber left border)
   - Objective with icon + label + progress bar (current/target)
   - Rewards preview
   - Action link ("Aller aux Bâtiments →") when applicable
4. **Pending completion view**: progress bar full (green) + "Suivant →" button replaces action link
5. **Chapter completion screen**: "Chapitre terminé !" with chapter rewards recap + "Chapitre suivant" button
6. **Tutorial complete**: final message, panel disappears

The component uses `trpc.tutorial.getCurrent.useQuery()` for data and `trpc.tutorial.completeQuest.useMutation()` for the "Next" button. On mutation success, invalidate `tutorial.getCurrent` + `resource.production` + `planet.empire`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/tutorial/TutorialPanel.tsx
git commit -m "feat(onboarding): redesign TutorialPanel with chapters, journal, progress, Next button"
```

---

### Task 7: Frontend — Add highlights to game pages

**Files:**
- Modify: `apps/web/src/pages/Buildings.tsx`
- Modify: `apps/web/src/pages/Research.tsx`
- Modify: `apps/web/src/pages/Shipyard.tsx`
- Modify: `apps/web/src/pages/CommandCenter.tsx`
- Modify: `apps/web/src/pages/Defense.tsx`

- [ ] **Step 1: Add highlight to each page**

For each page, import `useTutorialHighlight` and apply a conditional class on the building/ship/defense card:

```typescript
import { useTutorialHighlight } from '@/hooks/useTutorialHighlight';
// ... in the card render:
const highlighted = useTutorialHighlight(item.id);
// ... on the card element:
className={cn(
  '...existing classes...',
  highlighted && 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10 animate-pulse',
)}
```

Add an "Objectif" badge when highlighted:
```typescript
{highlighted && (
  <span className="absolute top-2 right-2 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
    Objectif
  </span>
)}
```

Each page has a different card structure — read the file first and find the correct element to add the highlight to.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/Buildings.tsx apps/web/src/pages/Research.tsx apps/web/src/pages/Shipyard.tsx apps/web/src/pages/CommandCenter.tsx apps/web/src/pages/Defense.tsx
git commit -m "feat(onboarding): add tutorial highlight to building, research, shipyard, defense pages"
```

---

### Task 8: Cache invalidation + TypeScript verification

**Files:**
- Modify: multiple pages (Buildings, Research, Shipyard, CommandCenter, Defense, Fleet, FleetDashboard)

- [ ] **Step 1: Add tutorial.getCurrent invalidation**

In all mutation `onSuccess` callbacks that already invalidate `planet.empire`, also add:
```typescript
utils.tutorial.getCurrent.invalidate();
```

This covers: building upgrade/cancel, research start/cancel, shipyard build/cancel/reduce, defense build/cancel/reduce, fleet send/recall.

- [ ] **Step 2: Run TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
cd ../web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(onboarding): add tutorial cache invalidation across all mutation pages"
```
