# Mobile-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Exilium frontend with a mobile-first App Shell architecture (bottom tab bar, sticky resource bar, glassmorphism theme) while maintaining desktop support.

**Architecture:** Mobile-first layout with BottomTabBar + BottomSheet navigation replacing the sidebar on mobile/tablet. ResourceBar is a new sticky component. Pages use compact list views on mobile, card grids on desktop. All styles start from mobile defaults and scale up via `md:` and `lg:` Tailwind prefixes.

**Tech Stack:** React 19, Vite, Tailwind CSS 3.4, Zustand, React Router 7, tRPC

**Spec:** `docs/superpowers/specs/2026-03-16-mobile-first-redesign-design.md`

---

## Chunk 1: Foundation & Theme

### Task 1: Update CSS variables and palette

**Files:**
- Modify: `apps/web/src/styles/global.css`

- [ ] **Step 1: Update `:root` CSS variables**

Replace the existing color values with the new palette from the spec:

```css
--background: 220 55% 3%;
--foreground: 210 20% 85%;
--card: 220 50% 8%;
--card-foreground: 210 20% 85%;
--primary: 200 85% 65%;
--primary-foreground: 220 55% 3%;
--accent-glow: 195 100% 90%;
```

Keep all other variables unchanged (secondary, destructive, muted, accent, border, input, ring, popover).

- [ ] **Step 2: Update glassmorphism utility class**

Replace the existing `.glass-card` class with an updated version:

```css
.glass-card {
  @apply bg-card/80 backdrop-blur-md border border-white/10 rounded-lg shadow-lg;
  box-shadow: 0 4px 24px hsla(220, 55%, 3%, 0.5), 0 0 1px hsla(195, 100%, 90%, 0.1);
}
```

- [ ] **Step 3: Verify build compiles**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/global.css
git commit -m "style: update palette to match Exilium logo (darker bg, cyan primary)"
```

---

### Task 2: Update Tailwind config

**Files:**
- Modify: `apps/web/tailwind.config.js`

- [ ] **Step 1: Add `accentGlow` color and `slide-up-sheet` animation**

In the `extend.colors` object, add:
```js
'accent-glow': 'hsl(var(--accent-glow) / <alpha-value>)',
```

In the `extend.keyframes` object, add:
```js
'slide-up-sheet': {
  '0%': { transform: 'translateY(100%)' },
  '100%': { transform: 'translateY(0)' },
},
'slide-down-sheet': {
  '0%': { transform: 'translateY(-100%)', opacity: '0' },
  '100%': { transform: 'translateY(0)', opacity: '1' },
},
```

In the `extend.animation` object, add:
```js
'slide-up-sheet': 'slide-up-sheet 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
'slide-down-sheet': 'slide-down-sheet 0.25s ease-out',
```

Update the existing `fade-in` animation from `0.3s` to `0.2s`:
```js
'fade-in': 'fadeIn 0.2s ease-out',
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/web/tailwind.config.js
git commit -m "style: add accent-glow color, sheet animations, faster fade-in"
```

---

### Task 3: Update resource icons

**Files:**
- Modify: `apps/web/src/components/common/ResourceIcons.tsx`

- [ ] **Step 1: Replace MineraiIcon with crystal shape**

Replace the existing MineraiIcon SVG paths with a faceted crystal/diamond shape:

```tsx
export function MineraiIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L4 9l8 13 8-13-8-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 9h16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 9L12 22l3.5-13" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 2L8.5 9M12 2l3.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Replace HydrogeneIcon with water drop**

Replace the existing H2 molecule SVG with a water drop:

```tsx
export function HydrogeneIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0C19 10.5 12 2 12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9.5 16.5a3.5 3.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 3: Keep SiliciumIcon unchanged** (no action needed)

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/ResourceIcons.tsx
git commit -m "style: update minerai (crystal) and hydrogene (water drop) icons"
```

---

### Task 4: Add `MoreIcon` and number formatting utility

**Files:**
- Modify: `apps/web/src/lib/icons.tsx`
- Modify: `apps/web/src/lib/format.ts`

- [ ] **Step 1: Add `MoreIcon` to icons.tsx**

Add at the end of the file, after `AllianceRankingIcon`:

```tsx
// --- Navigation ---

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" fill="none" />
      <rect x="14" y="3" width="7" height="7" rx="1" fill="none" />
      <rect x="3" y="14" width="7" height="7" rx="1" fill="none" />
      <rect x="14" y="14" width="7" height="7" rx="1" fill="none" />
    </Icon>
  );
}
```

- [ ] **Step 2: Add `formatNumber` to format.ts**

Add this function to `apps/web/src/lib/format.ts`:

```ts
export function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString('fr-FR');
}
```

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/icons.tsx apps/web/src/lib/format.ts
git commit -m "feat: add MoreIcon for bottom tab bar and formatNumber utility"
```

---

### Task 5: Update UI store

**Files:**
- Modify: `apps/web/src/stores/ui.store.ts`

- [ ] **Step 1: Add `activeSheet` state**

Replace the entire store with:

```ts
import { create } from 'zustand';

type SheetType = 'base' | 'galaxie' | 'social' | 'plus' | null;

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  activeSheet: SheetType;
  openSheet: (sheet: Exclude<SheetType, null>) => void;
  closeSheet: () => void;
  toggleSheet: (sheet: Exclude<SheetType, null>) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  activeSheet: null,
  openSheet: (sheet) => set({ activeSheet: sheet }),
  closeSheet: () => set({ activeSheet: null }),
  toggleSheet: (sheet) => set((s) => ({ activeSheet: s.activeSheet === sheet ? null : sheet })),
}));
```

- [ ] **Step 2: Check imports of the store across the codebase**

Search for all imports of `ui.store` and verify they still work. The existing store exports `useUIStore` — check that naming is consistent. If the existing store uses a different export name, match it.

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/ui.store.ts
git commit -m "feat: add activeSheet state to UI store for bottom sheet navigation"
```

---

## Chunk 2: Core Layout Components

### Task 6: Create BottomSheet component

**Files:**
- Create: `apps/web/src/components/layout/BottomSheet.tsx`

- [ ] **Step 1: Create the BottomSheet component**

```tsx
import { useEffect, useRef } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        className="absolute bottom-14 left-0 right-0 animate-slide-up-sheet rounded-t-2xl border-t border-white/10 bg-card/95 backdrop-blur-lg p-4"
      >
        {children}
      </div>
    </div>
  );
}
```

Note: `bottom-14` positions above the BottomTabBar (h-14 = 56px).

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/BottomSheet.tsx
git commit -m "feat: create BottomSheet component for mobile navigation"
```

---

### Task 7: Create BottomTabBar component

**Files:**
- Create: `apps/web/src/components/layout/BottomTabBar.tsx`

- [ ] **Step 1: Create the navigation config and BottomTabBar**

```tsx
import { useLocation, useNavigate } from 'react-router';
import {
  OverviewIcon,
  BuildingsIcon,
  GalaxyIcon,
  AllianceIcon,
  MoreIcon,
  ResourcesIcon,
  ResearchIcon,
  ShipyardIcon,
  DefenseIcon,
  FleetIcon,
  MovementsIcon,
  MessagesIcon,
  RankingIcon,
} from '@/lib/icons';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { usePlanetStore } from '@/stores/planet.store';
import { trpc } from '@/trpc';
import { BottomSheet } from './BottomSheet';

const TAB_GROUPS = {
  accueil: ['/'],
  base: ['/resources', '/buildings', '/research', '/shipyard', '/defense'],
  galaxie: ['/galaxy', '/fleet', '/movements'],
  social: ['/messages', '/alliance', '/ranking', '/alliance-ranking'],
} as const;

type TabGroup = keyof typeof TAB_GROUPS;

const SHEET_ITEMS = {
  base: [
    { label: 'Ressources', path: '/resources', icon: ResourcesIcon },
    { label: 'Batiments', path: '/buildings', icon: BuildingsIcon },
    { label: 'Recherche', path: '/research', icon: ResearchIcon },
    { label: 'Chantier spatial', path: '/shipyard', icon: ShipyardIcon },
    { label: 'Defense', path: '/defense', icon: DefenseIcon },
  ],
  galaxie: [
    { label: 'Vue galaxie', path: '/galaxy', icon: GalaxyIcon },
    { label: 'Envoyer une flotte', path: '/fleet', icon: FleetIcon },
    { label: 'Mouvements', path: '/movements', icon: MovementsIcon },
  ],
  social: [
    { label: 'Messages', path: '/messages', icon: MessagesIcon },
    { label: 'Alliance', path: '/alliance', icon: AllianceIcon },
    { label: 'Classement', path: '/ranking', icon: RankingIcon },
  ],
} as const;

function getActiveTab(pathname: string): TabGroup | null {
  if (pathname === '/') return 'accueil';
  for (const [group, paths] of Object.entries(TAB_GROUPS)) {
    if (group === 'accueil') continue;
    if ((paths as readonly string[]).some((p) => pathname.startsWith(p))) {
      return group as TabGroup;
    }
  }
  return null;
}

export function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeSheet, toggleSheet, closeSheet } = useUIStore();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearActivePlanet = usePlanetStore((s) => s.clearActivePlanet);
  const { data: unreadCount } = trpc.message.unreadCount.useQuery();
  const activeTab = getActiveTab(location.pathname);

  const handleSheetNav = (path: string) => {
    navigate(path);
    closeSheet();
  };

  const tabs = [
    { id: 'accueil' as const, label: 'Accueil', icon: OverviewIcon, action: () => { closeSheet(); navigate('/'); } },
    { id: 'base' as const, label: 'Base', icon: BuildingsIcon, action: () => toggleSheet('base') },
    { id: 'galaxie' as const, label: 'Galaxie', icon: GalaxyIcon, action: () => toggleSheet('galaxie') },
    { id: 'social' as const, label: 'Social', icon: AllianceIcon, action: () => toggleSheet('social'), badge: unreadCount ?? 0 },
    { id: 'plus' as const, label: 'Plus', icon: MoreIcon, action: () => toggleSheet('plus') },
  ];

  return (
    <>
      {activeSheet && activeSheet !== 'plus' && (
        <BottomSheet open onClose={closeSheet}>
          <nav className="flex flex-col gap-1">
            {SHEET_ITEMS[activeSheet as keyof typeof SHEET_ITEMS]?.map((item) => (
              <button
                key={item.path}
                onClick={() => handleSheetNav(item.path)}
                className={`flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                  location.pathname === item.path
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <item.icon width={20} height={20} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </BottomSheet>
      )}

      {activeSheet === 'plus' && (
        <BottomSheet open onClose={closeSheet}>
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => { closeSheet(); clearActivePlanet(); clearAuth(); }}
              className="flex items-center gap-3 rounded-lg p-3 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <span className="text-sm font-medium">Deconnexion</span>
            </button>
          </nav>
        </BottomSheet>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-center justify-around border-t border-white/10 bg-card/95 backdrop-blur-lg lg:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab || tab.id === activeSheet;
          return (
            <button
              key={tab.id}
              onClick={tab.action}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className="relative">
                <tab.icon width={22} height={22} />
                {'badge' in tab && (tab as any).badge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                    {(tab as any).badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--accent-glow))]" />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/BottomTabBar.tsx
git commit -m "feat: create BottomTabBar with bottom sheet navigation"
```

---

### Task 8: Create ResourceBar component

**Files:**
- Create: `apps/web/src/components/layout/ResourceBar.tsx`

- [ ] **Step 1: Create the ResourceBar component**

This component reuses the same tRPC query and hook as TopBar. The query is `trpc.resource.production` and `useResourceCounter` takes a single object argument.

```tsx
import { useState } from 'react';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { formatNumber } from '@/lib/format';
import { usePlanetStore } from '@/stores/planet.store';
import { trpc } from '@/trpc';

interface ResourceBarProps {
  planetId: string | null;
}

export function ResourceBar({ planetId }: ResourceBarProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  const { data } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId, refetchInterval: 60_000 },
  );

  // useResourceCounter takes a single object matching ResourceCounterInput
  const resources = useResourceCounter(
    data
      ? {
          minerai: data.minerai,
          silicium: data.silicium,
          hydrogene: data.hydrogene,
          resourcesUpdatedAt: data.resourcesUpdatedAt,
          mineraiPerHour: data.rates.mineraiPerHour,
          siliciumPerHour: data.rates.siliciumPerHour,
          hydrogenePerHour: data.rates.hydrogenePerHour,
          storageMineraiCapacity: data.rates.storageMineraiCapacity,
          storageSiliciumCapacity: data.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: data.rates.storageHydrogeneCapacity,
        }
      : undefined,
  );

  const energyBalance = data ? data.rates.energyProduced - data.rates.energyConsumed : 0;
  const energyPercent = data
    ? data.rates.energyProduced > 0
      ? Math.min(100, Math.round((data.rates.energyProduced / Math.max(1, data.rates.energyConsumed)) * 100))
      : 0
    : 0;

  return (
    <>
      <div
        className="sticky top-12 z-30 flex h-10 items-center justify-around border-b border-white/5 bg-card/80 backdrop-blur-md px-2 lg:hidden"
        onClick={() => setDetailOpen(!detailOpen)}
      >
        <ResourceCounter icon={<MineraiIcon size={14} className="text-minerai" />} value={resources.minerai} colorClass="text-minerai" />
        <ResourceCounter icon={<SiliciumIcon size={14} className="text-silicium" />} value={resources.silicium} colorClass="text-silicium" />
        <ResourceCounter icon={<HydrogeneIcon size={14} className="text-hydrogene" />} value={resources.hydrogene} colorClass="text-hydrogene" />
        <ResourceCounter icon={<span className="text-energy text-xs">⚡</span>} value={energyPercent} colorClass="text-energy" suffix="%" />
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDetailOpen(false)}>
          <div className="absolute top-[88px] left-0 right-0 animate-slide-down-sheet border-b border-white/10 bg-card/95 backdrop-blur-lg p-4" style={{ maxHeight: '50vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="space-y-3 text-sm">
              <DetailRow label="Minerai" value={resources.minerai} perHour={data?.rates.mineraiPerHour ?? 0} capacity={data?.rates.storageMineraiCapacity ?? 0} colorClass="text-minerai" />
              <DetailRow label="Silicium" value={resources.silicium} perHour={data?.rates.siliciumPerHour ?? 0} capacity={data?.rates.storageSiliciumCapacity ?? 0} colorClass="text-silicium" />
              <DetailRow label="Hydrogene" value={resources.hydrogene} perHour={data?.rates.hydrogenePerHour ?? 0} capacity={data?.rates.storageHydrogeneCapacity ?? 0} colorClass="text-hydrogene" />
              <div className="flex items-center justify-between border-t border-white/5 pt-2">
                <span className="text-energy">Energie</span>
                <span className="text-energy tabular-nums">{data?.rates.energyProduced ?? 0} / {data?.rates.energyConsumed ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResourceCounter({ icon, value, colorClass, suffix }: { icon: React.ReactNode; value: number; colorClass: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className={`text-xs font-medium tabular-nums ${colorClass}`}>
        {formatNumber(Math.floor(value))}{suffix}
      </span>
    </div>
  );
}

function DetailRow({ label, value, perHour, capacity, colorClass }: { label: string; value: number; perHour: number; capacity: number; colorClass: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={colorClass}>{label}</span>
      <div className="flex gap-3 tabular-nums text-muted-foreground">
        <span>{formatNumber(Math.floor(value))} / {formatNumber(capacity)}</span>
        <span className="text-foreground">+{formatNumber(Math.round(perHour))}/h</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/ResourceBar.tsx
git commit -m "feat: create ResourceBar component with sticky mobile display"
```

---

### Task 9: Rewrite TopBar for mobile-first

**Files:**
- Modify: `apps/web/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Rewrite TopBar**

The TopBar keeps its existing signature `({ planetId, planets })` and is rewritten mobile-first. Key changes:

- Remove the hamburger menu button (no more sidebar on mobile)
- Remove the logout button on mobile (moved to "Plus" tab) — keep on desktop `hidden lg:flex`
- Resource badges: `hidden lg:flex` (desktop only, mobile uses the separate ResourceBar)
- Mobile: `h-12` with planet name only + messages icon
- Desktop: `h-14` with planet selector (with coordinates) + resource badges + messages icon + logout button
- Planet selector: on mobile shows name only (`lg:hidden` for coordinates), on desktop shows `name [g:s:p]`
- Planet dropdown: keep the existing dropdown (the bottom sheet variant is a future enhancement)
- Apply glassmorphism: `bg-card/80 backdrop-blur-md border-b border-white/10`
- Replace `useMediaQuery` conditionals with Tailwind responsive classes
- Keep: `trpc.resource.production` query, `useResourceCounter` hook, `trpc.message.unreadCount` query, planet selection logic, outside-click handler for dropdown
- Keep: `clearActivePlanet()` + `clearAuth()` in logout handler on desktop

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/TopBar.tsx
git commit -m "refactor: rewrite TopBar mobile-first (planet + messages only on mobile)"
```

---

### Task 10: Rewrite Layout component (App Shell)

**Files:**
- Modify: `apps/web/src/components/layout/Layout.tsx`

- [ ] **Step 1: Rewrite the Layout to implement the App Shell**

```tsx
import { useEffect } from 'react';
import { Outlet, useOutletContext } from 'react-router';
import { TopBar } from './TopBar';
import { ResourceBar } from './ResourceBar';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { Toaster } from '@/components/ui/Toaster';
import { usePlanetStore } from '@/stores/planet.store';
import { trpc } from '@/trpc';
import { useNotifications } from '@/hooks/useNotifications';

export function Layout() {
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanetId = usePlanetStore((s) => s.activePlanetId);
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);

  // Resolve planet: validate stored ID against actual list, fallback to first
  const resolvedPlanetId = planets?.find((p) => p.id === activePlanetId)
    ? activePlanetId
    : planets?.[0]?.id ?? null;

  useEffect(() => {
    if (resolvedPlanetId && resolvedPlanetId !== activePlanetId) {
      setActivePlanet(resolvedPlanetId);
    }
  }, [resolvedPlanetId, activePlanetId, setActivePlanet]);

  // Keep SSE notifications alive
  useNotifications();

  return (
    <div className="flex h-dvh flex-col bg-background bg-stars text-foreground">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex flex-1 flex-col lg:ml-56">
        <TopBar planetId={resolvedPlanetId} planets={planets ?? []} />
        <ResourceBar planetId={resolvedPlanetId} />

        {/* Page content - pb-14 for bottom tab bar on mobile */}
        <main className="flex-1 overflow-y-auto pb-14 lg:pb-0">
          <div className="mx-auto lg:max-w-6xl">
            <Outlet context={{ planetId: resolvedPlanetId }} />
          </div>
        </main>
      </div>

      {/* Mobile/tablet bottom navigation */}
      <BottomTabBar />
      <Toaster />
    </div>
  );
}

export function useLayoutContext() {
  return useOutletContext<{ planetId: string | null }>();
}
```

Key differences from the existing Layout:
- `h-dvh` instead of `h-screen` (better mobile viewport handling)
- `lg:ml-56` for sidebar offset on desktop only
- `pb-14 lg:pb-0` for bottom tab bar clearance on mobile
- Preserved: `Toaster`, `useNotifications()`, planet resolution logic with `useEffect`
- TopBar keeps its existing props signature `{ planetId, planets }`

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/Layout.tsx
git commit -m "refactor: rewrite Layout as mobile-first App Shell"
```

---

### Task 11: Rewrite Sidebar for desktop-only

**Files:**
- Modify: `apps/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar as desktop-only with new groups**

The sidebar is now `hidden lg:flex` (desktop only). It uses the same navigation groups as the BottomTabBar for consistency: Accueil, Base, Galaxie, Social.

Remove all mobile overlay logic (hamburger, backdrop, `useMediaQuery`, `closeSidebar`). The sidebar is now a simple static column on desktop.

Keep the same NavLink pattern with active state styling. Update the section groups from (Economie, Militaire, Social) to (Accueil, Base, Galaxie, Social) matching the spec.

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/Sidebar.tsx
git commit -m "refactor: rewrite Sidebar as desktop-only with new nav groups"
```

---

### Task 12: Update PageHeader and EntityDetailOverlay for mobile

**Files:**
- Modify: `apps/web/src/components/common/PageHeader.tsx`
- Modify: `apps/web/src/components/common/EntityDetailOverlay.tsx`

- [ ] **Step 1: Update PageHeader to hide description on mobile**

Add `hidden md:block` to the description element so it only shows on tablet+.

- [ ] **Step 2: Update EntityDetailOverlay to bottom sheet on mobile**

Replace the mobile full-screen overlay with a bottom sheet style:
- Mobile: `fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl animate-slide-up-sheet overflow-y-auto`
- Desktop: keep the centered modal with `max-w-2xl`
- Use Tailwind responsive classes instead of `useMediaQuery`

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/common/PageHeader.tsx apps/web/src/components/common/EntityDetailOverlay.tsx
git commit -m "refactor: mobile-first PageHeader and EntityDetailOverlay as bottom sheet"
```

---

### Task 13: Verify full layout works end-to-end

- [ ] **Step 1: Start dev server and verify**

Run: `cd /Users/julienaubree/_projet/ogame-clone && pnpm dev`

Verify in the browser:
- Mobile (375px): TopBar + ResourceBar + content + BottomTabBar visible
- Bottom tab bar navigation works (sheets open/close, navigation occurs)
- Desktop (1024px+): Sidebar + TopBar with resources visible, no bottom tab bar
- No console errors

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Commit fixes if any**

```bash
git add -u
git commit -m "fix: resolve layout integration issues"
```

---

## Chunk 3: Page Redesigns Part 1 (Overview, Resources, Buildings, Research)

### Task 14: Redesign Overview page

**Files:**
- Modify: `apps/web/src/pages/Overview.tsx`

- [ ] **Step 1: Rewrite Overview with mobile-first sections**

Implement the spec: stacked sections on mobile (planet header, activities in progress, fleet movements [new], production/h, planet info). Each section is a `glass-card`. Empty sections are hidden.

Key changes:
- Add fleet movements section (query `trpc.fleet.movements.useQuery()`)
- Use `glass-card` class on all card sections
- Mobile: single column `space-y-4 p-4`
- Desktop: `lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-6 lg:p-6`
- Sections with no data should render `null`
- Activities: link to relevant page on tap

- [ ] **Step 2: Verify build and visual check**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Overview.tsx
git commit -m "refactor: mobile-first Overview with glassmorphism cards"
```

---

### Task 15: Redesign Resources page

**Files:**
- Modify: `apps/web/src/pages/Resources.tsx`

- [ ] **Step 1: Rewrite Resources page mobile-first**

Three sections stacked vertically on mobile:
1. Production bars (storage fill + production/h)
2. Production percentage sliders (per mine)
3. Energy balance card

Mobile: `space-y-4 p-4`, full width
Desktop: `lg:grid lg:grid-cols-2 lg:gap-6 lg:p-6` (production left, energy right)

Use `glass-card` for all card sections. Keep existing tRPC queries and mutation logic for setting production percentages.

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Resources.tsx
git commit -m "refactor: mobile-first Resources page with glass cards"
```

---

### Task 16: Redesign Buildings page with categories

**Files:**
- Modify: `apps/web/src/pages/Buildings.tsx`

- [ ] **Step 1: Define building categories**

Add a categories mapping at the top of the file:

```tsx
const BUILDING_CATEGORIES = [
  { id: 'industrie', label: 'Industrie', buildingIds: ['mineraiMine', 'siliciumMine', 'hydrogeneSynth', 'solarPlant'] },
  { id: 'stockage', label: 'Stockage', buildingIds: ['storageMinerai', 'storageSilicium', 'storageHydrogene'] },
  { id: 'defense', label: 'Defense et armement', buildingIds: ['roboticsFactory', 'shipyard'] },
  { id: 'recherche', label: 'Recherche', buildingIds: ['researchLab'] },
] as const;
```

These building IDs match the actual codebase (verified from `Buildings.tsx`: `mineraiMine`, `siliciumMine`, `hydrogeneSynth`, `solarPlant`, `storageMinerai`, `storageSilicium`, `storageHydrogene`, `roboticsFactory`, `shipyard`, `researchLab`). Verify against the API response at runtime in case IDs have changed.

- [ ] **Step 2: Implement compact list view for mobile**

Mobile layout: each building is a compact row (image 32x32 + name + level badge + action button). Grouped under collapsible category headers.

Desktop: keep card grid with `lg:grid lg:grid-cols-2 xl:grid-cols-3`, grouped by category.

Tap on a row opens `EntityDetailOverlay` (now a bottom sheet on mobile) with full building details.

- [ ] **Step 3: Implement collapsible category headers**

Each category has a header with the label + a chevron icon. Tap toggles visibility. Use local state: `const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})`.

- [ ] **Step 4: Verify build**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Buildings.tsx
git commit -m "refactor: mobile-first Buildings with categories and compact list view"
```

---

### Task 17: Redesign Research page

**Files:**
- Modify: `apps/web/src/pages/Research.tsx`

- [ ] **Step 1: Rewrite Research page mobile-first**

Same pattern as Buildings but without categories (all research items in one list).

Mobile: compact list rows (image 32x32 + tech name + level badge + action button). Tap for detail overlay.
Desktop: `lg:grid lg:grid-cols-2 xl:grid-cols-3` card grid.

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/Research.tsx
git commit -m "refactor: mobile-first Research with compact list view"
```

---

## Chunk 4: Page Redesigns Part 2 (Shipyard, Defense, Galaxy, Fleet, Movements)

### Task 18: Redesign Shipyard page

**Files:**
- Modify: `apps/web/src/pages/Shipyard.tsx`

- [ ] **Step 1: Rewrite Shipyard page mobile-first**

Same compact list pattern. Show quantity owned (x12) instead of level. Action button opens quantity input. Queue at top if building.

Mobile: compact rows. Desktop: card grid.

- [ ] **Step 2: Verify build and commit**

```bash
git add apps/web/src/pages/Shipyard.tsx
git commit -m "refactor: mobile-first Shipyard with compact list view"
```

---

### Task 19: Redesign Defense page

**Files:**
- Modify: `apps/web/src/pages/Defense.tsx`

- [ ] **Step 1: Rewrite Defense page mobile-first**

Same as Shipyard: compact list with quantities, build input on action.

- [ ] **Step 2: Verify build and commit**

```bash
git add apps/web/src/pages/Defense.tsx
git commit -m "refactor: mobile-first Defense with compact list view"
```

---

### Task 20: Redesign Galaxy page

**Files:**
- Modify: `apps/web/src/pages/Galaxy.tsx`

- [ ] **Step 1: Rewrite Galaxy page mobile-first**

Mobile: vertical list of 15 positions. Each position is a compact row (position number + planet indicator + planet name + player name). Debris line shown if applicable with recycle link.

Navigation: galaxy/system steppers at top, full width on mobile. Add swipe support via `onTouchStart`/`onTouchEnd` handlers with 50px delta threshold.

Desktop: `lg:` shows full table (existing pattern).

Tap on a position opens detail panel with player info, alliance, and action buttons (spy, attack, transport).

- [ ] **Step 2: Implement touch swipe for system navigation**

```tsx
const touchStart = useRef<number | null>(null);
const handleTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
const handleTouchEnd = (e: React.TouchEvent) => {
  if (touchStart.current === null) return;
  const delta = e.changedTouches[0].clientX - touchStart.current;
  if (Math.abs(delta) > 50) {
    if (delta > 0) prevSystem();
    else nextSystem();
  }
  touchStart.current = null;
};
```

- [ ] **Step 3: Verify build and commit**

```bash
git add apps/web/src/pages/Galaxy.tsx
git commit -m "refactor: mobile-first Galaxy with list view and swipe navigation"
```

---

### Task 21: Redesign Fleet page

**Files:**
- Modify: `apps/web/src/pages/Fleet.tsx`

- [ ] **Step 1: Rewrite Fleet wizard mobile-first**

3-step wizard with each step as full-screen on mobile. Key changes:
- Step indicator (1/3, 2/3, 3/3) at top
- Back button on steps 2 and 3
- Ship selection: compact list rows with quantity inputs
- Mission selection: grid of buttons (2 columns on mobile, 3 on desktop)
- Speed slider: native range input styled for touch
- Cargo inputs: only for transport missions
- Summary card before sending

Use `space-y-4 p-4` for mobile, `lg:p-6` for desktop.

- [ ] **Step 2: Verify build and commit**

```bash
git add apps/web/src/pages/Fleet.tsx
git commit -m "refactor: mobile-first Fleet wizard with full-screen steps"
```

---

### Task 22: Redesign Movements page

**Files:**
- Modify: `apps/web/src/pages/Movements.tsx`

- [ ] **Step 1: Rewrite Movements page mobile-first**

Mobile: vertical list of fleet movements. Each entry shows direction arrow, destination coordinates, mission type, and countdown timer. Tap for detail. Recall button accessible via tap.

Desktop: table layout with columns.

- [ ] **Step 2: Verify build and commit**

```bash
git add apps/web/src/pages/Movements.tsx
git commit -m "refactor: mobile-first Movements with compact list view"
```

---

## Chunk 5: Page Redesigns Part 3 (Messages, Alliance, Rankings, Login)

### Task 23: Redesign Messages page

**Files:**
- Modify: `apps/web/src/pages/Messages.tsx`

- [ ] **Step 1: Rewrite Messages page mobile-first**

Mobile: pills/chips for mailbox selection (Received, Sent) and type filters (scrollable horizontal). Message list with unread indicators. Tap opens full-screen detail with back button.

Tablet (`md:`): 2-column layout (list | content).

Desktop (`xl:`): 3-column mail layout (mailboxes+filters | list | content). Between `lg:` and `xl:`, use 2-column layout.

- [ ] **Step 2: Verify build and commit**

```bash
git add apps/web/src/pages/Messages.tsx
git commit -m "refactor: mobile-first Messages with mailbox layout"
```

---

### Task 24: Redesign Alliance page

**Files:**
- Modify: `apps/web/src/pages/Alliance.tsx`

- [ ] **Step 1: Rewrite Alliance page mobile-first**

Mobile: tab navigation at top (Infos, Membres, Invitations, Candidatures). Each tab content uses compact lists. No-alliance state shows two action buttons (Create / Search).

Desktop: same tabs but members displayed as table.

- [ ] **Step 2: Verify build and commit**

```bash
git add apps/web/src/pages/Alliance.tsx
git commit -m "refactor: mobile-first Alliance with tab navigation"
```

---

### Task 25: Redesign Ranking pages

**Files:**
- Modify: `apps/web/src/pages/Ranking.tsx`
- Modify: `apps/web/src/pages/AllianceRanking.tsx`

- [ ] **Step 1: Rewrite Ranking page mobile-first**

Add toggle tabs at top to switch between "Joueurs" and "Alliances" (navigates between `/ranking` and `/alliance-ranking`).

Mobile: simple list (rank + name + score). Current user/alliance highlighted.
Desktop: table with additional columns.

- [ ] **Step 2: Verify build and commit**

```bash
git add apps/web/src/pages/Ranking.tsx apps/web/src/pages/AllianceRanking.tsx
git commit -m "refactor: mobile-first Rankings with toggle tabs"
```

---

### Task 26: Redesign Login/Register pages

**Files:**
- Modify: `apps/web/src/pages/Login.tsx`
- Modify: `apps/web/src/pages/Register.tsx`

- [ ] **Step 1: Rewrite Login page mobile-first**

Full screen centered. Logo Exilium at top (the logo image file). Compact form: email + password + "Se souvenir de moi" checkbox. Link to register. Background: `bg-stars` with gradient.

Desktop: form inside a `glass-card` max-w-sm centered.

- [ ] **Step 2: Rewrite Register page with same pattern**

- [ ] **Step 3: Verify build and commit**

```bash
git add apps/web/src/pages/Login.tsx apps/web/src/pages/Register.tsx
git commit -m "refactor: mobile-first Login/Register with Exilium branding"
```

---

### Task 27: Final integration test and cleanup

- [ ] **Step 1: Run full build**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm build
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/julienaubree/_projet/ogame-clone && pnpm typecheck
```

- [ ] **Step 3: Test on dev server**

```bash
pnpm dev
```

Verify every page at 375px, 768px, and 1024px+ widths:
- Overview, Resources, Buildings, Research
- Shipyard, Defense, Galaxy, Fleet, Movements
- Messages, Alliance, Ranking, AllianceRanking
- Login, Register

- [ ] **Step 4: Remove unused imports and dead code**

Check for any unused `useMediaQuery` imports in components that no longer need them (since we moved to Tailwind-only responsive). Remove any unused sidebar-related code.

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "chore: cleanup unused imports and dead code after mobile-first redesign"
```
