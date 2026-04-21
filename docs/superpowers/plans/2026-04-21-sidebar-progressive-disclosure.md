# Sidebar Progressive Disclosure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dévoiler progressivement les items de la sidebar en fonction de la progression du tutoriel et du nombre de colonies, avec animation + badge "Nouveau" au déblocage.

**Architecture:** Fonction pure `getVisibleSidebarItems` dans `@exilium/game-engine` (testée unitairement avec vitest). Hook React `useSidebarNewItems` pour diff + persistance localStorage du "déjà vu". Intégration dans `Sidebar.tsx` : filtrage des items + headers, animation fade-in + glow, pastille "Nouveau" jusqu'au 1er clic. Aucune migration — la visibilité dérive de l'état courant, les joueurs existants voient tout ce qui leur correspond immédiatement.

**Tech Stack:** TypeScript, React 19, vitest, TailwindCSS, tRPC (queries existantes `tutorial.getCurrent` et `planet.list`), localStorage.

**Parallel execution:** Task 1 et Task 2 sont indépendantes → dispatchables en parallèle. Task 3 dépend des deux. Task 4 est finale.

---

## Spec de référence

`docs/superpowers/specs/2026-04-21-sidebar-progressive-disclosure-design.md`

## Mapping final (source de vérité)

| Path | Condition |
|---|---|
| `/` | Toujours |
| `/buildings` | Toujours |
| `/energy` | Toujours |
| `/messages` | Toujours |
| `/changelog` | Toujours |
| `/feedback` | Toujours |
| `/research` | `chapterOrder >= 2` |
| `/shipyard` | `chapterOrder >= 2` |
| `/flagship` | `chapterOrder >= 3` |
| `/galaxy` | `chapterOrder >= 3` |
| `/fleet` | `chapterOrder >= 3` |
| `/missions` | `chapterOrder >= 3` |
| `/command-center` | `chapterOrder >= 4` |
| `/defense` | `chapterOrder >= 4` |
| `/market` | `isComplete` |
| `/alliance` | `isComplete` |
| `/ranking` | `isComplete` |
| `/alliance-ranking` | `isComplete` |
| `/empire` | `isComplete && colonyCount >= 2` |

---

### Task 1: Pure visibility module in game-engine

**Files:**
- Create: `packages/game-engine/src/sidebar-visibility.ts`
- Create: `packages/game-engine/src/sidebar-visibility.test.ts`
- Modify: `packages/game-engine/src/index.ts` (add export)

- [ ] **Step 1.1: Write failing tests**

Create `packages/game-engine/src/sidebar-visibility.test.ts` with this full content:

```ts
import { describe, it, expect } from 'vitest';
import { getVisibleSidebarPaths, ALWAYS_VISIBLE_PATHS } from './sidebar-visibility.js';

describe('getVisibleSidebarPaths', () => {
  it('new player (chapter 1, tutorial not complete, 1 colony): only always-visible', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 1, isComplete: false, colonyCount: 1 });
    expect(visible).toEqual(new Set(ALWAYS_VISIBLE_PATHS));
    expect(visible.has('/')).toBe(true);
    expect(visible.has('/buildings')).toBe(true);
    expect(visible.has('/energy')).toBe(true);
    expect(visible.has('/messages')).toBe(true);
    expect(visible.has('/changelog')).toBe(true);
    expect(visible.has('/feedback')).toBe(true);
    expect(visible.has('/research')).toBe(false);
    expect(visible.has('/shipyard')).toBe(false);
    expect(visible.size).toBe(6);
  });

  it('chapter 2: adds research and shipyard', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 2, isComplete: false, colonyCount: 1 });
    expect(visible.has('/research')).toBe(true);
    expect(visible.has('/shipyard')).toBe(true);
    expect(visible.has('/flagship')).toBe(false);
    expect(visible.has('/galaxy')).toBe(false);
  });

  it('chapter 3: adds flagship, galaxy, fleet, missions', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 3, isComplete: false, colonyCount: 1 });
    expect(visible.has('/flagship')).toBe(true);
    expect(visible.has('/galaxy')).toBe(true);
    expect(visible.has('/fleet')).toBe(true);
    expect(visible.has('/missions')).toBe(true);
    expect(visible.has('/command-center')).toBe(false);
    expect(visible.has('/defense')).toBe(false);
  });

  it('chapter 4: adds command-center and defense', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 4, isComplete: false, colonyCount: 1 });
    expect(visible.has('/command-center')).toBe(true);
    expect(visible.has('/defense')).toBe(true);
    expect(visible.has('/market')).toBe(false);
    expect(visible.has('/alliance')).toBe(false);
    expect(visible.has('/empire')).toBe(false);
  });

  it('tutorial complete with 1 colony: adds market, alliance, ranking, alliance-ranking but NOT empire', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 4, isComplete: true, colonyCount: 1 });
    expect(visible.has('/market')).toBe(true);
    expect(visible.has('/alliance')).toBe(true);
    expect(visible.has('/ranking')).toBe(true);
    expect(visible.has('/alliance-ranking')).toBe(true);
    expect(visible.has('/empire')).toBe(false);
  });

  it('tutorial complete with 2 colonies: adds empire', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 4, isComplete: true, colonyCount: 2 });
    expect(visible.has('/empire')).toBe(true);
  });

  it('tutorial NOT complete but 2 colonies: empire still hidden', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 3, isComplete: false, colonyCount: 2 });
    expect(visible.has('/empire')).toBe(false);
  });

  it('fully unlocked state: all 19 items visible', () => {
    const visible = getVisibleSidebarPaths({ chapterOrder: 4, isComplete: true, colonyCount: 2 });
    expect(visible.size).toBe(19);
  });
});
```

- [ ] **Step 1.2: Run tests to verify failure**

Run from repo root:
```bash
pnpm --filter @exilium/game-engine test
```
Expected: FAIL — cannot resolve `./sidebar-visibility.js`.

- [ ] **Step 1.3: Implement the module**

Create `packages/game-engine/src/sidebar-visibility.ts` with this full content:

```ts
export type SidebarContext = {
  /** Order of current tutorial chapter (1 to 4). If tutorial is complete, pass 4. */
  chapterOrder: number;
  /** True when tutorial progress has isComplete. */
  isComplete: boolean;
  /** Number of colonies owned by the player. */
  colonyCount: number;
};

export type SidebarVisibilityRule = (ctx: SidebarContext) => boolean;

const always: SidebarVisibilityRule = () => true;
const atChapter = (n: number): SidebarVisibilityRule => (ctx) => ctx.chapterOrder >= n;
const afterTutorial: SidebarVisibilityRule = (ctx) => ctx.isComplete;
const afterTutorialWithColonies = (min: number): SidebarVisibilityRule =>
  (ctx) => ctx.isComplete && ctx.colonyCount >= min;

/** Source of truth: path → visibility rule. Order reflects the sidebar layout. */
export const SIDEBAR_VISIBILITY_RULES: Record<string, SidebarVisibilityRule> = {
  '/empire': afterTutorialWithColonies(2),
  '/research': atChapter(2),
  '/flagship': atChapter(3),
  '/': always,
  '/energy': always,
  '/buildings': always,
  '/shipyard': atChapter(2),
  '/command-center': atChapter(4),
  '/defense': atChapter(4),
  '/galaxy': atChapter(3),
  '/fleet': atChapter(3),
  '/missions': atChapter(3),
  '/market': afterTutorial,
  '/messages': always,
  '/alliance': afterTutorial,
  '/ranking': afterTutorial,
  '/alliance-ranking': afterTutorial,
  '/changelog': always,
  '/feedback': always,
};

export const ALWAYS_VISIBLE_PATHS: readonly string[] = Object.entries(SIDEBAR_VISIBILITY_RULES)
  .filter(([, rule]) => rule === always)
  .map(([path]) => path);

export function getVisibleSidebarPaths(ctx: SidebarContext): Set<string> {
  const visible = new Set<string>();
  for (const [path, rule] of Object.entries(SIDEBAR_VISIBILITY_RULES)) {
    if (rule(ctx)) visible.add(path);
  }
  return visible;
}
```

- [ ] **Step 1.4: Add export to index**

Modify `packages/game-engine/src/index.ts` — append at the end:

```ts
export * from './sidebar-visibility.js';
```

- [ ] **Step 1.5: Run tests to verify pass**

```bash
pnpm --filter @exilium/game-engine test
```
Expected: All `sidebar-visibility` tests PASS (8 tests).

- [ ] **Step 1.6: Typecheck**

```bash
pnpm --filter @exilium/game-engine typecheck
```
Expected: no errors.

- [ ] **Step 1.7: Commit**

```bash
git add packages/game-engine/src/sidebar-visibility.ts packages/game-engine/src/sidebar-visibility.test.ts packages/game-engine/src/index.ts
git commit -m "feat(game-engine): sidebar visibility rules"
git push
```

---

### Task 2: useSidebarNewItems hook

**Files:**
- Create: `apps/web/src/components/layout/useSidebarNewItems.ts`

No test framework in `apps/web` — validation is manual via the browser during Task 4.

- [ ] **Step 2.1: Implement the hook**

Create `apps/web/src/components/layout/useSidebarNewItems.ts` with this full content:

```ts
import { useEffect, useRef, useState, useCallback } from 'react';

const STORAGE_KEY = 'exilium.sidebar.seenItems';

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // quota exceeded or unavailable — silent fallback
  }
}

/**
 * Tracks which sidebar items have already been seen (clicked) by the user.
 * Items that become visible and are not yet in the seen-set are returned as "new"
 * (they get the badge + animation). The caller must call markSeen(path) when
 * the user clicks the item.
 *
 * First-ever mount initializes seenItems with the currently visible set — so
 * existing players don't get a flood of "new" badges on already-used items.
 */
export function useSidebarNewItems(visiblePaths: Set<string>): {
  newPaths: Set<string>;
  markSeen: (path: string) => void;
} {
  const [seen, setSeen] = useState<Set<string>>(() => readSeen());
  const initialized = useRef(false);
  const prevVisibleRef = useRef<Set<string>>(new Set());

  // First mount: if localStorage has no entry yet, initialize with currently visible paths
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      const initial = new Set(visiblePaths);
      writeSeen(initial);
      setSeen(initial);
    }
    prevVisibleRef.current = new Set(visiblePaths);
  }, [visiblePaths]);

  // Track previously visible set to detect new arrivals on each render
  useEffect(() => {
    prevVisibleRef.current = new Set(visiblePaths);
  });

  const markSeen = useCallback((path: string) => {
    setSeen((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      writeSeen(next);
      return next;
    });
  }, []);

  const newPaths = new Set<string>();
  for (const path of visiblePaths) {
    if (!seen.has(path)) newPaths.add(path);
  }

  return { newPaths, markSeen };
}
```

- [ ] **Step 2.2: Typecheck**

```bash
pnpm --filter @exilium/web typecheck
```
Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add apps/web/src/components/layout/useSidebarNewItems.ts
git commit -m "feat(web): useSidebarNewItems hook for new-item badges"
git push
```

---

### Task 3: Sidebar integration + animation + badge

**Files:**
- Modify: `apps/web/src/components/layout/Sidebar.tsx`

Depends on: Task 1 (exports `getVisibleSidebarPaths`) and Task 2 (exports `useSidebarNewItems`).

- [ ] **Step 3.1: Rewrite Sidebar.tsx**

Replace the full content of `apps/web/src/components/layout/Sidebar.tsx` with:

```tsx
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { MessageSquarePlus } from 'lucide-react';
import { getVisibleSidebarPaths } from '@exilium/game-engine';
import { trpc } from '@/lib/trpc';
import { useSidebarNewItems } from './useSidebarNewItems';
import {
  OverviewIcon,
  ResourcesIcon,
  BuildingsIcon,
  ResearchIcon,
  ShipyardIcon,
  CommandCenterIcon,
  DefenseIcon,
  FleetIcon,
  FlagshipIcon,
  GalaxyIcon,
  MarketIcon,
  MissionsIcon,
  MessagesIcon,
  RankingIcon,
  AllianceIcon,
  AllianceRankingIcon,
  EmpireIcon,
  HistoryIcon,
} from '@/lib/icons';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Empire',
    items: [
      { label: 'Empire', path: '/empire', icon: EmpireIcon },
      { label: 'Recherche', path: '/research', icon: ResearchIcon },
      { label: 'Vaisseau amiral', path: '/flagship', icon: FlagshipIcon },
    ],
  },
  {
    title: 'Planète',
    items: [
      { label: "Vue d'ensemble", path: '/', icon: OverviewIcon },
      { label: 'Énergie', path: '/energy', icon: ResourcesIcon },
      { label: 'Bâtiments', path: '/buildings', icon: BuildingsIcon },
    ],
  },
  {
    title: 'Production',
    items: [
      { label: 'Chantier spatial', path: '/shipyard', icon: ShipyardIcon },
      { label: 'Centre de commandement', path: '/command-center', icon: CommandCenterIcon },
      { label: 'Défense', path: '/defense', icon: DefenseIcon },
    ],
  },
  {
    title: 'Espace',
    items: [
      { label: 'Galaxie', path: '/galaxy', icon: GalaxyIcon },
      { label: 'Flotte', path: '/fleet', icon: FleetIcon },
      { label: 'Missions', path: '/missions', icon: MissionsIcon },
      { label: 'Marché', path: '/market', icon: MarketIcon },
    ],
  },
  {
    title: 'Communauté',
    items: [
      { label: 'Messages', path: '/messages', icon: MessagesIcon },
      { label: 'Alliance', path: '/alliance', icon: AllianceIcon },
      { label: 'Classement', path: '/ranking', icon: RankingIcon },
      { label: 'Classement Alliances', path: '/alliance-ranking', icon: AllianceRankingIcon },
    ],
  },
  {
    title: 'Développement',
    items: [
      { label: 'Nouveautés', path: '/changelog', icon: HistoryIcon },
      { label: 'Feedback', path: '/feedback', icon: MessageSquarePlus as any },
    ],
  },
];

export function Sidebar() {
  const { data: tutorialData } = trpc.tutorial.getCurrent.useQuery();
  const { data: planets } = trpc.planet.list.useQuery();

  const chapterOrder = tutorialData?.chapter?.order ?? (tutorialData?.isComplete ? 4 : 1);
  const isComplete = tutorialData?.isComplete ?? false;
  const colonyCount = planets?.length ?? 1;

  const visiblePaths = getVisibleSidebarPaths({ chapterOrder, isComplete, colonyCount });
  const { newPaths, markSeen } = useSidebarNewItems(visiblePaths);

  const renderedSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => visiblePaths.has(item.path)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-56 lg:flex-col bg-card/80 backdrop-blur-md border-r border-white/10">
      <div className="flex h-14 items-center border-b border-border/50 px-4">
        <span className="text-lg font-bold text-primary glow-silicium">Exilium</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {renderedSections.map((section, idx) => (
          <div key={section.title} className="sidebar-section-fade-in">
            {idx > 0 && <div className="mx-3 my-2 border-t border-border/30" />}
            <p className="mb-1 px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isNew = newPaths.has(item.path);
                return (
                  <li key={item.path} className={isNew ? 'sidebar-item-new' : undefined}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => markSeen(item.path)}
                      className={({ isActive }) =>
                        cn(
                          'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'border-l-2 border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )
                      }
                    >
                      <item.icon width={18} height={18} />
                      <span>{item.label}</span>
                      {isNew && (
                        <span
                          aria-label="Nouveau"
                          className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_currentColor]"
                        />
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3.2: Add CSS animations**

Locate the global stylesheet that holds existing keyframes / utility layers. Check (in order): `apps/web/src/index.css`, `apps/web/src/App.css`, `apps/web/src/styles/*.css`.

Run:
```bash
grep -rn "glow-silicium\|@keyframes" apps/web/src --include="*.css"
```

Append the following rules at the end of the file that contains `glow-silicium` (same file as existing keyframes — so the animation utilities live together):

```css
@keyframes sidebar-item-new-in {
  0% {
    opacity: 0;
    transform: translateX(-6px);
    filter: drop-shadow(0 0 0 rgba(186, 146, 255, 0));
  }
  60% {
    filter: drop-shadow(0 0 4px rgba(186, 146, 255, 0.6));
  }
  100% {
    opacity: 1;
    transform: translateX(0);
    filter: drop-shadow(0 0 0 rgba(186, 146, 255, 0));
  }
}

.sidebar-item-new {
  animation: sidebar-item-new-in 600ms ease-out;
}

@keyframes sidebar-section-fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.sidebar-section-fade-in {
  animation: sidebar-section-fade-in 400ms ease-out;
}
```

**Note on animation scope:** because the CSS class is applied whenever the item is "new" (not just at first appearance), it animates again on every re-render while the badge is visible. This is acceptable for MVP — the item stops being "new" on first click. If this becomes visually noisy, move the animation trigger to a `useEffect` that adds a transient class.

- [ ] **Step 3.3: Typecheck + build**

```bash
pnpm --filter @exilium/web typecheck
```
Expected: no errors.

- [ ] **Step 3.4: Commit**

```bash
git add apps/web/src/components/layout/Sidebar.tsx apps/web/src/index.css
git commit -m "feat(web): progressive sidebar disclosure with new-item badge"
git push
```

(Adjust the CSS path in the `git add` command to the actual file modified in Step 3.2.)

---

### Task 4: Manual browser validation

**Files:** none modified — this is a QA pass.

- [ ] **Step 4.1: Start dev server**

```bash
pnpm dev
```
Wait for the web server URL in the output (usually `http://localhost:5173`).

- [ ] **Step 4.2: Validate new-player view**

In DevTools console, clear the seen-items storage and simulate chapter 1:

```js
localStorage.removeItem('exilium.sidebar.seenItems');
```

Reload. For a user whose tutorial state returns `chapter.order = 1` and `isComplete = false`:
- Sidebar shows only: **Planète** (Vue d'ensemble, Énergie, Bâtiments), **Communauté** (Messages), **Développement** (Nouveautés, Feedback).
- No `Empire`, `Production`, `Espace` sections.
- 6 items total.

If no test user exists at chapter 1, use DB / tRPC devtools to temporarily force the state, or observe the behavior in whichever state is available and verify the filtered counts match the mapping table.

- [ ] **Step 4.3: Validate progression**

Progress the tutorial (or manipulate state) to chapters 2, 3, 4 in turn. Confirm after each chapter transition:
- The new items defined in the mapping table appear.
- Each newly-appearing item has the small colored dot badge.
- A fade-in animation plays on the newly-appearing item/section.
- Clicking a new item removes the dot immediately.
- After reload, clicked items no longer show the dot (persistence works).

- [ ] **Step 4.4: Validate existing-player non-regression**

On an account whose tutorial is complete with ≥ 2 colonies:
- All 19 items visible.
- **No** new-item badges shown (localStorage was seeded on first mount with the full current visible set).

- [ ] **Step 4.5: Validate empire trigger**

For an account with tutorial complete and exactly 1 colony:
- `/empire` is hidden.
- Create / acquire a 2nd colony, refetch `planet.list`.
- `/empire` appears with badge + animation.

- [ ] **Step 4.6: Final commit (if any fix needed)**

If any validation fix was required, commit with a clear message and push.

---

## Self-Review Notes

- **Spec coverage**: all 19 items, auto-hide of sections, animation + badge, localStorage persistence, existing-player non-regression (seed seenItems on first mount) — all covered.
- **Placeholder scan**: no TBD / TODO / "appropriate error handling" in any step.
- **Type consistency**: `getVisibleSidebarPaths` / `SidebarContext` / `useSidebarNewItems({ newPaths, markSeen })` — identical names across Tasks 1, 2, 3.
- **Known ambiguity**: the exact global CSS file holding `glow-silicium` — Task 3 Step 3.2 instructs to grep for it before editing, so the engineer resolves it in-place.
