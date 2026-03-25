# Fleet UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the fleet UI into a dashboard hub with focused sub-pages (stationed, send, movements), ship category grouping, images, and a generic breadcrumb component.

**Architecture:** Replace flat `/fleet` and `/movements` routes with nested `/fleet/*` routes. Create a central dashboard page at `/fleet` that summarizes stationed ships and active movements, linking to dedicated sub-pages. Extract shared components (HostileAlertBanner, ShipCategoryGrid, Breadcrumb) for reuse.

**Tech Stack:** React 19, React Router 7, tRPC, Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-25-fleet-redesign-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/web/src/components/common/Breadcrumb.tsx` | Generic breadcrumb navigation, reusable site-wide |
| `apps/web/src/components/fleet/HostileAlertBanner.tsx` | Full-width hostile fleet alert banner with pulsing dot |
| `apps/web/src/components/fleet/ShipCategoryGrid.tsx` | Ship grid grouped by category (Combat/Transport/Utilitaire) with GameImage |
| `apps/web/src/components/fleet/MovementCardCompact.tsx` | Compact movement card for dashboard (SVG icons, progress bar, mini ship thumbnails) |
| `apps/web/src/components/fleet/MissionIcon.tsx` | SVG icon + color mapping per mission type |
| `apps/web/src/pages/FleetDashboard.tsx` | Dashboard hub page at `/fleet` |
| `apps/web/src/pages/StationedFleet.tsx` | Stationed fleet inventory at `/fleet/stationed` |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/src/router.tsx` | Restructure `/fleet` as parent route with children: index (dashboard), `send`, `stationed`, `movements` |
| `apps/web/src/components/layout/Sidebar.tsx` | Remove "Mouvements" entry, keep single "Flotte" entry pointing to `/fleet` |
| `apps/web/src/components/layout/BottomTabBar.tsx` | Update galaxie sheet: remove "Mouvements", rename "Envoyer une flotte" to "Flotte", update paths |
| `apps/web/src/pages/Fleet.tsx` | Add Breadcrumb, add GameImage to FleetComposition, add category grouping |
| `apps/web/src/pages/Movements.tsx` | Add Breadcrumb, use HostileAlertBanner, add ship images to movement cards |
| `apps/web/src/components/fleet/MissionSelector.tsx` | Add SVG mission icons + help text under each button |
| `apps/web/src/components/fleet/FleetComposition.tsx` | Add GameImage per ship row, group by ship category |
| `apps/web/src/lib/icons.tsx` | Add any missing mission-specific SVG icons if needed |

---

## Task 1: Generic Breadcrumb Component

**Files:**
- Create: `apps/web/src/components/common/Breadcrumb.tsx`

- [ ] **Step 1: Create the Breadcrumb component**

```tsx
// apps/web/src/components/common/Breadcrumb.tsx
import { Link } from 'react-router';

interface BreadcrumbSegment {
  label: string;
  path: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <nav className="mb-3 text-xs text-muted-foreground">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <span key={segment.path}>
            {index > 0 && <span className="mx-1.5">&gt;</span>}
            {isLast ? (
              <span className="text-foreground">{segment.label}</span>
            ) : (
              <Link to={segment.path} className="text-primary hover:underline">
                {segment.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Verify it renders**

Start the dev server if not running: `cd apps/web && npm run dev`
Temporarily import and render `<Breadcrumb segments={[{ label: 'Flotte', path: '/fleet' }, { label: 'Test', path: '/fleet/test' }]} />` in any existing page to confirm it renders correctly. Remove after verification.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/Breadcrumb.tsx
git commit -m "feat: add generic Breadcrumb component"
```

---

## Task 2: MissionIcon Component

**Files:**
- Create: `apps/web/src/components/fleet/MissionIcon.tsx`

- [ ] **Step 1: Create mission icon mapping component**

This component maps each mission type to a consistent SVG icon and color. It centralizes the mission visual identity for reuse across dashboard, movements, and send pages.

```tsx
// apps/web/src/components/fleet/MissionIcon.tsx
import { type Mission } from '@/config/mission-config';

const MISSION_COLORS: Record<Mission, string> = {
  transport: '#3b82f6',
  attack: '#e74c3c',
  spy: '#8b5cf6',
  mine: '#2ecc71',
  colonize: '#14b8a6',
  recycle: '#e67e22',
  station: '#64748b',
  pirate: '#f43f5e',
  trade: '#f59e0b',
};

// SVG path data for each mission icon (24x24 viewBox)
const MISSION_PATHS: Record<Mission, string[]> = {
  transport: [
    'M1 3h15v13H1z', 'M16 8h4l3 3v5h-7V8z',
    'M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    'M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  ],
  attack: [
    'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z',
    'M22 12h-4', 'M6 12H2', 'M12 6V2', 'M12 22v-4',
  ],
  spy: [
    'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z',
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  ],
  mine: [
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  ],
  colonize: [
    'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M9 22V12h6v10',
  ],
  recycle: [
    'M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5',
    'M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12',
    'M14 16l-3 3 3 3', 'M8.293 13.596 7.196 9.5 3.1 10.598',
    'M9.344 5.811l1.093-1.892A1.83 1.83 0 0 1 12 3a1.784 1.784 0 0 1 1.563.91l3.974 6.876',
    'M18.536 10.786l2.096 1.21', 'M12.5 7.5 16 5l-1 3.5',
  ],
  station: [
    'M12 2L2 19h20L12 2z', 'M12 9v4',
  ],
  pirate: [
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
    'M4 2v15', 'M20 2v17.5',
    'M4 7h8a4 4 0 0 1 0 8H4',
  ],
  trade: [
    'M3 21h18', 'M3 7v1a3 3 0 0 0 6 0V7', 'M9 7v1a3 3 0 0 0 6 0V7',
    'M15 7v1a3 3 0 0 0 6 0V7', 'M3 7l2-4h14l2 4',
    'M5 21V10', 'M19 21V10',
  ],
};

interface MissionIconProps {
  mission: Mission;
  size?: number;
  className?: string;
}

export function MissionIcon({ mission, size = 16, className }: MissionIconProps) {
  const color = MISSION_COLORS[mission];
  const paths = MISSION_PATHS[mission];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function getMissionColor(mission: Mission): string {
  return MISSION_COLORS[mission];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/fleet/MissionIcon.tsx
git commit -m "feat: add MissionIcon component with color mapping for all mission types"
```

---

## Task 3: HostileAlertBanner Component

**Files:**
- Create: `apps/web/src/components/fleet/HostileAlertBanner.tsx`

- [ ] **Step 1: Create the HostileAlertBanner component**

This component is used on both the FleetDashboard and Movements pages. It takes the inbound hostile fleets data and renders a full-width red alert banner with pulsing dot, per-attack details, and a link to movements.

```tsx
// apps/web/src/components/fleet/HostileAlertBanner.tsx
import { Link } from 'react-router';
import { Timer } from '@/components/common/Timer';

interface InboundFleet {
  id: string;
  arrivalTime: string; // ISO string — convert to Date for Timer
  targetPlanetName?: string;
  mission: string;
}

interface HostileAlertBannerProps {
  hostileFleets: InboundFleet[];
  /** If true, hides the "Voir details" link (used on the movements page itself) */
  hideLink?: boolean;
}

export function HostileAlertBanner({ hostileFleets, hideLink }: HostileAlertBannerProps) {
  if (hostileFleets.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/40 bg-gradient-to-r from-destructive/10 to-destructive/5 p-3 md:p-4">
      {/* Pulsing dot */}
      <div className="relative h-3 w-3 flex-shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-destructive opacity-40" />
        <span className="absolute inset-0.5 rounded-full bg-destructive" />
      </div>

      {/* Warning icon */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--destructive))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-destructive">
          {hostileFleets.length} flotte{hostileFleets.length > 1 ? 's' : ''} hostile{hostileFleets.length > 1 ? 's' : ''} en approche
        </div>
        <div className="mt-0.5 text-xs text-destructive/70 space-x-3">
          {hostileFleets.slice(0, 3).map((fleet) => (
            <span key={fleet.id}>
              {fleet.targetPlanetName ?? 'Planete'} — <Timer endTime={new Date(fleet.arrivalTime)} className="font-semibold text-destructive" />
            </span>
          ))}
        </div>
      </div>

      {/* Link to movements */}
      {!hideLink && (
        <Link
          to="/fleet/movements"
          className="flex-shrink-0 rounded-md border border-destructive/40 bg-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/30 transition-colors"
        >
          Voir details &rarr;
        </Link>
      )}
    </div>
  );
}
```

The `Timer` component at `apps/web/src/components/common/Timer.tsx` accepts `endTime: Date` (not a string). Always convert ISO strings to `Date` objects: `endTime={new Date(fleet.arrivalTime)}`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/fleet/HostileAlertBanner.tsx
git commit -m "feat: add HostileAlertBanner component with pulsing dot and per-attack details"
```

---

## Task 4: ShipCategoryGrid Component

**Files:**
- Create: `apps/web/src/components/fleet/ShipCategoryGrid.tsx`

- [ ] **Step 1: Create the ShipCategoryGrid component**

This shared component renders ships grouped by category (Combat/Transport/Utilitaire) in a visual grid with GameImage. It's used on the dashboard (compact), stationed page (full), and send form (with inputs).

```tsx
// apps/web/src/components/fleet/ShipCategoryGrid.tsx
import { GameImage } from '@/components/common/GameImage';
import { useGameConfig } from '@/hooks/useGameConfig';

const CATEGORY_STYLES: Record<string, { color: string; label: string }> = {
  ship_combat: { color: 'text-red-400', label: 'Combat' },
  ship_transport: { color: 'text-blue-400', label: 'Transport' },
  ship_utilitaire: { color: 'text-emerald-400', label: 'Utilitaire' },
};

const CATEGORY_ICONS: Record<string, string[]> = {
  ship_combat: [
    'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z',
    'M22 12h-4', 'M6 12H2', 'M12 6V2', 'M12 22v-4',
  ],
  ship_transport: [
    'M1 3h15v13H1z', 'M16 8h4l3 3v5h-7V8z',
    'M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    'M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  ],
  ship_utilitaire: [
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  ],
};

interface ShipData {
  id: string;
  name: string;
  count: number;
  categoryId?: string;
}

interface ShipCategoryGridProps {
  ships: ShipData[];
  /** Image size class, e.g. "h-12 w-12" for dashboard or "h-16 w-16" for stationed */
  imageSize?: string;
  /** If true, hide ships with count 0 */
  hideEmpty?: boolean;
  /** Render custom content below each ship image (e.g., checkbox, input) */
  renderActions?: (ship: ShipData) => React.ReactNode;
  /** Click handler for a ship card */
  onShipClick?: (shipId: string) => void;
}

export function ShipCategoryGrid({
  ships,
  imageSize = 'h-12 w-12',
  hideEmpty = true,
  renderActions,
  onShipClick,
}: ShipCategoryGridProps) {
  const { data: gameConfig } = useGameConfig();

  // Group ships by category using game config
  const categories = (gameConfig?.categories ?? [])
    .filter((c) => c.entityType === 'ship')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Build a map of shipId -> categoryId from game config ship data
  const shipCategoryMap: Record<string, string> = {};
  if (gameConfig?.ships) {
    for (const [shipId, shipDef] of Object.entries(gameConfig.ships)) {
      shipCategoryMap[shipId] = (shipDef as any).categoryId ?? 'ship_utilitaire';
    }
  }

  const grouped = new Map<string, ShipData[]>();
  for (const cat of categories) {
    grouped.set(cat.id, []);
  }
  for (const ship of ships) {
    if (hideEmpty && ship.count === 0) continue;
    const catId = ship.categoryId ?? shipCategoryMap[ship.id] ?? 'ship_utilitaire';
    const list = grouped.get(catId);
    if (list) list.push(ship);
  }

  return (
    <div className="space-y-3">
      {categories.map((cat) => {
        const catShips = grouped.get(cat.id) ?? [];
        if (catShips.length === 0) return null;
        const style = CATEGORY_STYLES[cat.id] ?? { color: 'text-muted-foreground', label: cat.name };
        const iconPaths = CATEGORY_ICONS[cat.id];

        return (
          <div key={cat.id}>
            <div className="mb-1.5 flex items-center gap-1.5">
              {iconPaths && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={style.color}>
                  {iconPaths.map((d, i) => <path key={i} d={d} />)}
                </svg>
              )}
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${style.color}`}>
                {style.label}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-3">
              {catShips.map((ship) => (
                <button
                  key={ship.id}
                  type="button"
                  onClick={() => onShipClick?.(ship.id)}
                  className="flex flex-col items-center rounded-md border border-border bg-card/50 p-2 text-center transition-colors hover:bg-accent/50"
                >
                  <GameImage category="ships" id={ship.id} size="thumb" alt={ship.name} className={`${imageSize} rounded`} />
                  <span className="mt-1 text-[10px] leading-tight text-muted-foreground">{ship.name}</span>
                  <span className="text-sm font-bold text-primary">x{ship.count}</span>
                  {renderActions?.(ship)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Note: The `gameConfig.ships` object structure needs verification — check if `categoryId` is directly accessible or nested. The `shipCategoryMap` construction may need adjusting based on the actual shape returned by `useGameConfig()`. Read `apps/web/src/hooks/useGameConfig.ts` and the tRPC procedure it calls to confirm.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/fleet/ShipCategoryGrid.tsx
git commit -m "feat: add ShipCategoryGrid component with category grouping and GameImage"
```

---

## Task 5: MovementCardCompact Component

**Files:**
- Create: `apps/web/src/components/fleet/MovementCardCompact.tsx`

- [ ] **Step 1: Create the compact movement card for the dashboard**

This is a simplified version of the MovementCard used in Movements.tsx. It shows: mission icon, mission name, phase badge, countdown, route, mini ship thumbnails, and a progress bar (or mining stepper). Refer to the existing `Movements.tsx` (lines ~200-500) for the data shape and the `MISSION_STYLE`/`PHASE_STYLE` constants.

```tsx
// apps/web/src/components/fleet/MovementCardCompact.tsx
import { MissionIcon, getMissionColor } from './MissionIcon';
import { GameImage } from '@/components/common/GameImage';
import { Timer } from '@/components/common/Timer';
import { type Mission } from '@/config/mission-config';

interface CompactMovement {
  id: string;
  mission: Mission;
  phase: string;
  arrivalTime: string;
  originPlanetName?: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  ships: Record<string, number>;
}

interface MovementCardCompactProps {
  movement: CompactMovement;
  shipNames: Record<string, string>;
}

const PHASE_LABELS: Record<string, string> = {
  outbound: 'Aller',
  return: 'Retour',
  prospecting: 'Prospec.',
  mining: 'Extraction',
};

export function MovementCardCompact({ movement, shipNames }: MovementCardCompactProps) {
  const color = getMissionColor(movement.mission);
  const phaseLabel = PHASE_LABELS[movement.phase] ?? movement.phase;
  const shipEntries = Object.entries(movement.ships).filter(([, count]) => count > 0);

  return (
    <div
      className="rounded-md border border-border bg-card/50 p-3"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      {/* Header: mission icon + name + phase + timer */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <MissionIcon mission={movement.mission} size={16} />
          <span className="text-sm font-semibold" style={{ color }}>{movement.mission}</span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {phaseLabel}
          </span>
        </div>
        <Timer endTime={new Date(movement.arrivalTime)} className="text-sm font-bold tabular-nums text-orange-400" />
      </div>

      {/* Route + mini ship thumbnails */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {movement.originPlanetName ?? 'Origine'} &rarr; [{movement.targetGalaxy}:{movement.targetSystem}:{movement.targetPosition}]
        </span>
        <div className="flex items-center gap-1">
          {shipEntries.slice(0, 3).map(([shipId, count]) => (
            <div key={shipId} className="flex items-center gap-0.5">
              <GameImage category="ships" id={shipId} size="icon" alt={shipNames[shipId] ?? shipId} className="h-5 w-5 rounded-sm" />
              <span className="text-[10px] text-muted-foreground">x{count}</span>
            </div>
          ))}
          {shipEntries.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{shipEntries.length - 3}</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {movement.mission === 'mine' ? (
        <MiningStepperCompact phase={movement.phase} color={color} />
      ) : (
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ backgroundColor: color, width: '50%' }} />
        </div>
      )}
    </div>
  );
}

function MiningStepperCompact({ phase, color }: { phase: string; color: string }) {
  const steps = ['outbound', 'prospecting', 'mining', 'return'];
  const currentIdx = steps.indexOf(phase);

  return (
    <div className="mt-2">
      <div className="flex items-center">
        {steps.map((step, i) => (
          <div key={step} className="flex flex-1 items-center">
            <div
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: i <= currentIdx ? color : 'hsl(var(--muted))',
                border: i === currentIdx ? '2px solid white' : 'none',
              }}
            />
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5" style={{ backgroundColor: i < currentIdx ? color : 'hsl(var(--muted))' }} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-0.5 text-[8px] text-muted-foreground">
        {steps.map((step) => (
          <span key={step} style={step === phase ? { color, fontWeight: 600 } : undefined}>
            {PHASE_LABELS[step]}
          </span>
        ))}
      </div>
    </div>
  );
}
```

Note: The progress bar width is set to a fixed 50% as placeholder. The real implementation should compute progress from `departureTime` and `arrivalTime` using the same formula as the existing `useProgress()` hook in Movements.tsx. Find and reuse that hook, or extract it into a shared location.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/fleet/MovementCardCompact.tsx
git commit -m "feat: add MovementCardCompact with mission icons and mining stepper"
```

---

## Task 6: Route Restructuring & Navigation Updates

**Files:**
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/components/layout/BottomTabBar.tsx`

- [ ] **Step 1: Update the router**

In `apps/web/src/router.tsx`, replace the existing `fleet` and `movements` routes with flat sibling routes under the `fleet/` prefix. We use flat routes (not nested with a parent) because the `Layout` component passes `context={{ planetId }}` to its `<Outlet>`, and a pathless parent route would break `useOutletContext()` in child pages.

Replace:
```tsx
{
  path: 'fleet',
  lazy: lazyLoad(() => import('./pages/Fleet')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
```
and:
```tsx
{
  path: 'movements',
  lazy: lazyLoad(() => import('./pages/Movements')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
```

With these 4 flat routes (all direct children of the Layout route):
```tsx
{
  path: 'fleet',
  lazy: lazyLoad(() => import('./pages/FleetDashboard')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
{
  path: 'fleet/send',
  lazy: lazyLoad(() => import('./pages/Fleet')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
{
  path: 'fleet/stationed',
  lazy: lazyLoad(() => import('./pages/StationedFleet')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
{
  path: 'fleet/movements',
  lazy: lazyLoad(() => import('./pages/Movements')),
  errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
},
```

Also remove the standalone `movements` route entry (the one at path `'movements'` around line 114-117).

**Important:** All 4 routes are direct children of the Layout route, so `useOutletContext<{ planetId }>()` continues to work in all pages.

- [ ] **Step 2: Update Sidebar**

In `apps/web/src/components/layout/Sidebar.tsx`, remove the "Mouvements" entry from the `Galaxie` section (line 56). The "Flotte" entry at `/fleet` already points to the new dashboard.

Remove this line:
```tsx
{ label: 'Mouvements', path: '/movements', icon: MovementsIcon },
```

Also remove the `MovementsIcon` import if it's no longer used elsewhere in this file.

- [ ] **Step 3: Update BottomTabBar**

In `apps/web/src/components/layout/BottomTabBar.tsx`:

1. Update `TAB_GROUPS.galaxie` (line 32): replace `'/fleet', '/missions', '/movements'` with `'/fleet', '/missions'` (movements is now under /fleet/movements and `/fleet` startsWith will catch it).

2. Update `SHEET_ITEMS.galaxie` (lines 48-53):
   - Change "Envoyer une flotte" to "Flotte" with path `/fleet`
   - Remove the "Mouvements" entry

Replace:
```tsx
galaxie: [
  { label: 'Vue galaxie', path: '/galaxy', icon: GalaxyIcon },
  { label: 'Envoyer une flotte', path: '/fleet', icon: FleetIcon },
  { label: 'Missions', path: '/missions', icon: MissionsIcon },
  { label: 'Mouvements', path: '/movements', icon: MovementsIcon },
],
```
With:
```tsx
galaxie: [
  { label: 'Vue galaxie', path: '/galaxy', icon: GalaxyIcon },
  { label: 'Flotte', path: '/fleet', icon: FleetIcon },
  { label: 'Missions', path: '/missions', icon: MissionsIcon },
],
```

Remove `MovementsIcon` from imports if no longer used.

- [ ] **Step 4: Update internal links**

Search the codebase for any links pointing to `/movements` or `/fleet` that need updating:

```bash
cd /Users/julienaubree/_projet/ogame-clone && grep -rn '"/movements"' apps/web/src/ --include='*.tsx' --include='*.ts'
grep -rn 'to="/fleet"' apps/web/src/ --include='*.tsx' --include='*.ts'
grep -rn "navigate('/fleet')" apps/web/src/ --include='*.tsx' --include='*.ts'
grep -rn "navigate('/movements')" apps/web/src/ --include='*.tsx' --include='*.ts'
```

Update any found references:
- `/movements` → `/fleet/movements`
- `navigate('/fleet')` used for sending fleet → `navigate('/fleet/send')` (check context — if it's navigating to the send form, update to `/fleet/send`)

- [ ] **Step 5: Verify routing works**

Navigate to `/fleet` in the browser — it should show a blank page (FleetDashboard not created yet, that's ok). Verify `/fleet/send` loads the existing Fleet.tsx form. Verify sidebar shows single "Flotte" entry.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/router.tsx apps/web/src/components/layout/Sidebar.tsx apps/web/src/components/layout/BottomTabBar.tsx
# Also add any files with updated internal links
git commit -m "feat: restructure fleet routes under /fleet/* and update navigation"
```

---

## Task 7: FleetDashboard Page

**Files:**
- Create: `apps/web/src/pages/FleetDashboard.tsx`

- [ ] **Step 1: Create the dashboard page**

This is the main hub at `/fleet`. It queries all the data needed and assembles the sub-components: HostileAlertBanner, slots badge, PvE badge, CTA, ShipCategoryGrid (left), MovementCardCompact list (right).

```tsx
// apps/web/src/pages/FleetDashboard.tsx
import { Link, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { HostileAlertBanner } from '@/components/fleet/HostileAlertBanner';
import { ShipCategoryGrid } from '@/components/fleet/ShipCategoryGrid';
import { MovementCardCompact } from '@/components/fleet/MovementCardCompact';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';

export default function FleetDashboard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();

  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  // fleet.slots, fleet.movements, fleet.inbound take NO input — they use ctx.userId from auth
  const { data: slots } = trpc.fleet.slots.useQuery();
  const { data: movements } = trpc.fleet.movements.useQuery();
  const { data: inbound } = trpc.fleet.inbound.useQuery();
  const { data: planets } = trpc.planet.list.useQuery();

  // Derive data
  const hostileFleets = (inbound ?? [])
    .filter((f: any) => f.mission === 'attack')
    .map((f: any) => ({
      id: f.id,
      arrivalTime: f.arrivalTime,
      targetPlanetName: planets?.find((p: any) => p.id === f.targetPlanetId)?.name,
      mission: f.mission,
    }));

  const shipList = (ships ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    count: s.count,
    categoryId: s.categoryId,
  }));

  const shipNames: Record<string, string> = {};
  for (const s of ships ?? []) {
    shipNames[(s as any).id] = (s as any).name;
  }

  const recentMovements = (movements ?? [])
    .sort((a: any, b: any) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Flotte"
        actions={
          <Link to="/fleet/send">
            <Button>Envoyer une flotte &rarr;</Button>
          </Link>
        }
      />

      {/* Hostile alert banner */}
      <HostileAlertBanner hostileFleets={hostileFleets} />

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        {slots && (
          <div className="rounded-md border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Slots:</span>{' '}
            <span className="font-semibold text-primary">{slots.current} / {slots.max}</span>
          </div>
        )}
        <Link to="/missions" className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-emerald-400 font-semibold hover:bg-accent/50 transition-colors">
          Missions PvE &rarr;
        </Link>
      </div>

      {/* Two columns */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        {/* Left: Stationed fleet */}
        <div className="rounded-lg border border-border bg-card/80">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-sm font-semibold text-yellow-400">Flotte stationnee</span>
            <Link to="/fleet/stationed" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Voir tout &rarr;
            </Link>
          </div>
          <div className="p-3">
            <ShipCategoryGrid ships={shipList} imageSize="h-11 w-11" />
          </div>
        </div>

        {/* Right: Active movements */}
        <div className="rounded-lg border border-border bg-card/80">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="text-sm font-semibold text-yellow-400">
              Mouvements actifs ({movements?.length ?? 0})
            </span>
            <Link to="/fleet/movements" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Voir tout &rarr;
            </Link>
          </div>
          <div className="space-y-2 p-3">
            {recentMovements.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">Aucun mouvement en cours</p>
            ) : (
              recentMovements.map((m: any) => (
                <MovementCardCompact
                  key={m.id}
                  movement={m}
                  shipNames={shipNames}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Note: The `any` casts are placeholders — replace with proper types inferred from `RouterOutput` (tRPC utility types) once the exact shapes are confirmed. `fleet.movements` and `fleet.inbound` take no input (use `ctx.userId`). `shipyard.ships` requires `{ planetId }`. Check `apps/api/src/modules/fleet/fleet.router.ts` for exact return shapes.

- [ ] **Step 2: Verify the dashboard renders**

Navigate to `/fleet` in the browser. It should show the page header, status badges, and the two-column layout. If there are type errors or missing data, fix them now.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/FleetDashboard.tsx
git commit -m "feat: add FleetDashboard page with ship grid and movement summary"
```

---

## Task 8: StationedFleet Page

**Files:**
- Create: `apps/web/src/pages/StationedFleet.tsx`

- [ ] **Step 1: Create the stationed fleet page**

This page shows the full ship inventory grouped by category, with checkboxes and quantity inputs for quick-send. It uses `ShipCategoryGrid` with a custom `renderActions` for the selection UI.

```tsx
// apps/web/src/pages/StationedFleet.tsx
import { useState, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router';
import { trpc } from '@/trpc';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { PageHeader } from '@/components/common/PageHeader';
import { ShipCategoryGrid } from '@/components/fleet/ShipCategoryGrid';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { ShipDetailContent } from '@/components/entity-details/ShipDetailContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function StationedFleet() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const shipList = useMemo(() =>
    (ships ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      count: s.count,
      categoryId: s.categoryId,
    })),
    [ships],
  );

  const hasSelection = Object.values(selected).some((v) => v > 0);

  const toggleShip = (shipId: string, maxCount: number) => {
    setSelected((prev) => {
      if (prev[shipId] && prev[shipId] > 0) {
        const { [shipId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [shipId]: maxCount };
    });
  };

  const handleSend = () => {
    const params = new URLSearchParams();
    for (const [id, count] of Object.entries(selected)) {
      if (count > 0) params.set(`ship_${id}`, String(count));
    }
    navigate(`/fleet/send?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <Breadcrumb segments={[
        { label: 'Flotte', path: '/fleet' },
        { label: 'Flotte stationnee', path: '/fleet/stationed' },
      ]} />
      <PageHeader title="Flotte stationnee" />

      {shipList.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Aucun vaisseau sur cette planete.</p>
          <a href="/shipyard" className="mt-2 inline-block text-sm text-primary hover:underline">
            Construire des vaisseaux &rarr;
          </a>
        </div>
      ) : (
        <ShipCategoryGrid
          ships={shipList}
          imageSize="h-16 w-16"
          onShipClick={(id) => setDetailId(id)}
          renderActions={(ship) => (
            <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={(selected[ship.id] ?? 0) > 0}
                onChange={() => toggleShip(ship.id, ship.count)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              {(selected[ship.id] ?? 0) > 0 && (
                <Input
                  type="number"
                  min={1}
                  max={ship.count}
                  value={selected[ship.id]}
                  onChange={(e) =>
                    setSelected((prev) => ({
                      ...prev,
                      [ship.id]: Math.min(Math.max(1, Number(e.target.value) || 1), ship.count),
                    }))
                  }
                  className="h-6 w-14 text-center text-xs"
                />
              )}
            </div>
          )}
        />
      )}

      {/* Sticky send bar */}
      {hasSelection && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur-md p-3 lg:left-56">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {Object.values(selected).reduce((a, b) => a + b, 0)} vaisseaux selectionnes
            </span>
            <Button onClick={handleSend}>
              Envoyer les vaisseaux selectionnes &rarr;
            </Button>
          </div>
        </div>
      )}

      {/* Ship detail overlay */}
      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={shipList.find((s) => s.id === detailId)?.name ?? ''}
      >
        {detailId && <ShipDetailContent shipId={detailId} researchLevels={researchLevels} />}
      </EntityDetailOverlay>
    </div>
  );
}
```

`EntityDetailOverlay` requires `open: boolean`, `onClose`, and `title` props. `ShipDetailContent` requires `shipId` and `researchLevels: Record<string, number>`. Add a research query to the page (same pattern as Movements.tsx):

```tsx
const { data: planets } = trpc.planet.list.useQuery();
const firstPlanetId = planets?.[0]?.id;
const { data: researchList } = trpc.research.list.useQuery(
  { planetId: firstPlanetId! },
  { enabled: !!firstPlanetId },
);
const researchLevels = useMemo(() => {
  if (!researchList) return {};
  return Object.fromEntries(researchList.map((r) => [r.id, r.currentLevel]));
}, [researchList]);
```

- [ ] **Step 2: Verify the page renders**

Navigate to `/fleet/stationed`. It should show the breadcrumb, ship grid by category, and selection checkboxes. Test: select a ship, verify the sticky bar appears. Click "Envoyer" and verify it navigates to `/fleet/send` with ship_ query params.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/StationedFleet.tsx
git commit -m "feat: add StationedFleet page with category grid and quick-send"
```

---

## Task 9: Update Fleet.tsx (Send Form)

**Files:**
- Modify: `apps/web/src/pages/Fleet.tsx`
- Modify: `apps/web/src/components/fleet/MissionSelector.tsx`
- Modify: `apps/web/src/components/fleet/FleetComposition.tsx`

- [ ] **Step 1: Add breadcrumb to Fleet.tsx**

At the top of the Fleet.tsx return JSX, add:
```tsx
import { Breadcrumb } from '@/components/common/Breadcrumb';

// Inside the return, before the PageHeader:
<Breadcrumb segments={[
  { label: 'Flotte', path: '/fleet' },
  { label: 'Envoyer une flotte', path: '/fleet/send' },
]} />
```

- [ ] **Step 2: Read pre-selected ships from URL params**

Fleet.tsx already reads `useSearchParams()` for PvE/Trade params. Add support for `ship_` prefixed params from the stationed page:

```tsx
// After existing useSearchParams logic, add:
useEffect(() => {
  const shipParams: Record<string, number> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('ship_')) {
      const shipId = key.replace('ship_', '');
      const count = Number(value);
      if (count > 0) shipParams[shipId] = count;
    }
  }
  if (Object.keys(shipParams).length > 0) {
    setSelectedShips(shipParams);
  }
}, []); // Run once on mount
```

- [ ] **Step 3: Add MissionIcon to MissionSelector**

In `apps/web/src/components/fleet/MissionSelector.tsx`, add the mission SVG icon and a short help text per mission:

```tsx
import { MissionIcon } from './MissionIcon';

// Inside the button, add the icon before the label:
<MissionIcon mission={m} size={14} className="inline-block mr-1" />
{isSelected && '✓ '}{config?.label ?? m}

// After the button row, add the hint text when a mission is selected:
{selected && gameConfig?.missions[selected]?.hint && (
  <p className="mt-2 text-xs text-blue-400">{gameConfig.missions[selected].hint}</p>
)}
```

Note: Check if the `hint` field exists on the mission config. The current MissionSelector doesn't show it — verify in `gameConfig.missions[mission]` shape.

- [ ] **Step 4: Add GameImage to FleetComposition**

In `apps/web/src/components/fleet/FleetComposition.tsx`, add ship images to the `ShipRow` component:

```tsx
import { GameImage } from '@/components/common/GameImage';

// In ShipRow, add before the ship name span:
<GameImage category="ships" id={ship.id} size="icon" alt={ship.name} className="h-6 w-6 rounded flex-shrink-0" />
```

Also update the flex layout of ShipRow to accommodate the image:
```tsx
<div className="flex items-center justify-between rounded bg-background/50 px-3 py-1.5">
  <div className="flex items-center gap-2">
    <GameImage category="ships" id={ship.id} size="icon" alt={ship.name} className="h-6 w-6 rounded flex-shrink-0" />
    <span className={`text-sm ${disabled ? 'text-muted-foreground/40' : ''}`}>{ship.name}</span>
  </div>
  {/* ... rest of the row */}
</div>
```

- [ ] **Step 5: Update Fleet.tsx navigation links**

Any `navigate('/fleet')` in Fleet.tsx that goes back after sending should now point to `/fleet` (dashboard) or `/fleet/movements`. Check the send mutation's `onSuccess` callback.

- [ ] **Step 6: Verify the send form**

Navigate to `/fleet/send`. Verify: breadcrumb shows, mission icons appear, ship images display (as fallback letters for now), help text shows when a mission is selected. Test sending a fleet still works.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/Fleet.tsx apps/web/src/components/fleet/MissionSelector.tsx apps/web/src/components/fleet/FleetComposition.tsx
git commit -m "feat: enhance send form with breadcrumb, mission icons, and ship images"
```

---

## Task 10: Update Movements.tsx

**Files:**
- Modify: `apps/web/src/pages/Movements.tsx`

- [ ] **Step 1: Add breadcrumb**

At the top of the Movements.tsx return JSX:
```tsx
import { Breadcrumb } from '@/components/common/Breadcrumb';

// Before the PageHeader:
<Breadcrumb segments={[
  { label: 'Flotte', path: '/fleet' },
  { label: 'Mouvements', path: '/fleet/movements' },
]} />
```

- [ ] **Step 2: Integrate HostileAlertBanner**

Replace the existing hostile fleet section with the shared `HostileAlertBanner` component. Find the section that renders hostile inbound fleets (look for the detection tier cards, likely in a section labeled "Flottes entrantes" or similar).

```tsx
import { HostileAlertBanner } from '@/components/fleet/HostileAlertBanner';

// Replace the inline hostile rendering with:
<HostileAlertBanner hostileFleets={hostileFleets} hideLink />
```

Keep the existing detailed hostile fleet cards below the banner for the full detection-tier view, since this page is where the user sees all details.

- [ ] **Step 3: Add MissionIcon to movement cards**

In the existing movement card rendering within Movements.tsx, replace text-only mission labels with `MissionIcon`:

```tsx
import { MissionIcon } from '@/components/fleet/MissionIcon';

// In the movement card header, before the mission text:
<MissionIcon mission={movement.mission} size={16} />
```

- [ ] **Step 4: Add ship images to movement cards**

In the ship summary section of each movement card, add `GameImage`:

```tsx
import { GameImage } from '@/components/common/GameImage';

// In the ship list rendering:
<GameImage category="ships" id={shipId} size="icon" alt={shipName} className="h-5 w-5 rounded-sm" />
```

- [ ] **Step 5: Verify the movements page**

Navigate to `/fleet/movements`. Verify: breadcrumb shows, hostile banner appears (if there are hostile fleets), mission icons display, ship images show.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Movements.tsx
git commit -m "feat: enhance movements page with breadcrumb, hostile banner, mission icons, and ship images"
```

---

## Task 11: Fix Internal Links & Polish

**Files:**
- Various files across `apps/web/src/`

- [ ] **Step 1: Search for all stale fleet/movement links**

```bash
cd /Users/julienaubree/_projet/ogame-clone
grep -rn '"/movements"' apps/web/src/ --include='*.tsx' --include='*.ts'
grep -rn "'/movements'" apps/web/src/ --include='*.tsx' --include='*.ts'
grep -rn 'path: .*/fleet.' apps/web/src/ --include='*.tsx' --include='*.ts'
```

Update all found references:
- `"/movements"` → `"/fleet/movements"`
- Any `navigate('/fleet')` that was used for sending → `navigate('/fleet/send')`

Common locations to check:
- `apps/web/src/pages/Overview.tsx` (may link to fleet/movements)
- `apps/web/src/pages/Missions.tsx` (PvE missions link to fleet sending — update to `/fleet/send`)
- `apps/web/src/lib/game-events.ts` (notification links)
- `apps/web/src/pages/Galaxy.tsx` (attack/spy buttons may link to fleet)
- `apps/web/src/pages/Market.tsx` (trade links to fleet)

- [ ] **Step 2: Add redirect for old /movements URL**

In `router.tsx`, add a redirect so old bookmarks still work:

```tsx
{
  path: 'movements',
  element: <Navigate to="/fleet/movements" replace />,
},
```

- [ ] **Step 3: Verify all navigation paths**

Click through the app:
1. Sidebar "Flotte" → `/fleet` (dashboard)
2. Dashboard "Envoyer une flotte" → `/fleet/send`
3. Dashboard "Voir tout" (fleet) → `/fleet/stationed`
4. Dashboard "Voir tout" (mouvements) → `/fleet/movements`
5. Breadcrumb "Flotte" on any sub-page → `/fleet`
6. Mobile bottom tab "Galaxie" sheet → "Flotte" entry works
7. PvE Missions page → sending fleet still navigates correctly
8. Galaxy page attack/spy buttons → navigate to send form correctly

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: update all internal links for new fleet route structure"
```

---

## Task 12: Mobile Responsiveness

**Files:**
- Modify: `apps/web/src/pages/FleetDashboard.tsx`
- Modify: `apps/web/src/pages/StationedFleet.tsx`

- [ ] **Step 1: Verify dashboard mobile layout**

The dashboard uses `grid lg:grid-cols-[1fr_1.3fr]` which should stack on mobile. Verify on a narrow viewport (Chrome DevTools, 375px width):
- Columns stack vertically (fleet on top, movements below)
- Hostile banner text wraps properly
- Status badges wrap properly

- [ ] **Step 2: Verify stationed fleet mobile layout**

ShipCategoryGrid uses `grid-cols-3 sm:grid-cols-4 lg:grid-cols-3`. On mobile it should show 3 columns. Verify:
- Ship cards are not too cramped
- Sticky send bar is visible above the mobile tab bar (account for the 56px bottom tab)

If the sticky bar is hidden behind the tab bar, add `pb-14 lg:pb-0` padding to the page or `bottom-14 lg:bottom-0` to the sticky bar.

- [ ] **Step 3: Fix any mobile issues found**

Apply fixes directly to the relevant files.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: mobile responsiveness for fleet dashboard and stationed pages"
```

---

## Task 13: Final Verification & Cleanup

- [ ] **Step 1: Full navigation walkthrough**

Test the complete flow:
1. `/fleet` — Dashboard loads with ship grid + movements
2. `/fleet/stationed` — Ships grouped by category, selection works, send redirects
3. `/fleet/send` — Form works with pre-filled ships and without
4. `/fleet/movements` — Movements display with icons and images
5. `/movements` (old URL) — Redirects to `/fleet/movements`
6. Sidebar navigation is correct
7. Mobile bottom tab navigation is correct

- [ ] **Step 2: Remove any unused imports**

Check for `MovementsIcon` imports in Sidebar/BottomTabBar if they were removed from the menu items. Check for any other unused imports introduced during the refactor.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: cleanup unused imports after fleet redesign"
```
