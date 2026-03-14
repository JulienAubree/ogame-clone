# Progress Bars + Overview Activities — Design Spec

## Goal

Add visual progress bars to all timed actions (buildings, research, shipyard) and enrich the Overview page with a real-time activity dashboard showing all ongoing actions on the current planet.

## Architecture

Extend the existing `<Timer>` component with an optional progress bar. Reuse this enhanced Timer across Buildings, Research, Shipyard pages, and a new "Activities" card on the Overview page.

## 1. Timer Component Enhancement

**File:** `apps/web/src/components/common/Timer.tsx`

**Current API:**
```typescript
interface TimerProps {
  endTime: Date;
  onComplete?: () => void;
  className?: string;
}
```

**New API:**
```typescript
interface TimerProps {
  endTime: Date;
  totalDuration?: number; // seconds — when provided, renders a progress bar
  onComplete?: () => void;
  className?: string;
}
```

**Progress bar rendering:**
- Only rendered when `totalDuration` is provided
- Percentage: `(totalDuration - secondsLeft) / totalDuration * 100`
- Styled as a horizontal bar: `h-1 rounded-full bg-muted` container, `bg-primary` fill
- CSS `transition: width 1s linear` for smooth animation between ticks
- Placed below the countdown text

## 2. Buildings Page

**File:** `apps/web/src/pages/Buildings.tsx`

Currently shows `<Timer endTime={...} onComplete={...} />` when a building is upgrading.

**Change:** Pass `totalDuration={building.nextLevelTime}` to the Timer.

The building data already includes `nextLevelTime` (seconds for next level) and `upgradeEndTime` (ISO string). Both are available — no API change needed.

## 3. Research Page

**File:** `apps/web/src/pages/Research.tsx`

Same pattern as Buildings. Pass the research duration as `totalDuration` to the Timer when a research is in progress.

## 4. Shipyard Page

**File:** `apps/web/src/pages/Shipyard.tsx`

Same pattern. Pass the unit build time as `totalDuration` to the Timer for the current queue item.

## 5. Overview Activities Card

**File:** `apps/web/src/pages/Overview.tsx`

Add a new Card "Activités en cours" that aggregates all ongoing activities on the selected planet.

**Data sources (existing queries):**
- `trpc.building.list` → find item where `isUpgrading === true`
- `trpc.research.list` → find item where `isResearching === true`
- `trpc.shipyard.queue` → current queue items
- `trpc.fleet.movements` → active fleet movements (if endpoint exists)

**Display per activity:**
- Icon or label (Construction / Recherche / Chantier / Flotte)
- Name + target level/count
- `<Timer>` with `totalDuration` for progress bar + countdown
- Clicking an activity navigates to the relevant page

**Empty state:** "Aucune activité en cours" in muted text.

**Layout:** Single card, full width, stacked list of activities. Placed as the first card in the grid (most prominent position).

## 6. Resource Counters (verification only)

`useResourceCounter` already updates every second via client-side interpolation. No change needed — just verify it works correctly on the deployed version.

## Files to modify

| File | Change |
|------|--------|
| `apps/web/src/components/common/Timer.tsx` | Add `totalDuration` prop + progress bar |
| `apps/web/src/pages/Buildings.tsx` | Pass `totalDuration` to Timer |
| `apps/web/src/pages/Research.tsx` | Pass `totalDuration` to Timer |
| `apps/web/src/pages/Shipyard.tsx` | Pass `totalDuration` to Timer |
| `apps/web/src/pages/Overview.tsx` | Add Activities card with aggregated timers |

## No backend changes required

All data needed (endTime, duration) is already returned by existing API endpoints.
