# Entity Cards Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign building list cards (vertical layout) and detail panel (hero image, effets actifs, production table) — Phase 1: buildings only.

**Architecture:** Two files modified: `Buildings.tsx` (desktop card grid becomes vertical cards) and `BuildingDetailContent.tsx` (complete rewrite of detail content). No backend changes. No mobile layout changes.

**Tech Stack:** React, TypeScript, Tailwind CSS, tRPC, `@ogame-clone/game-engine` formulas.

**Spec:** `docs/superpowers/specs/2026-03-19-entity-cards-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/pages/Buildings.tsx` | Modify | Desktop card grid: vertical layout, new stat line, duration display. Pass `buildings` to detail panel. |
| `apps/web/src/components/entity-details/BuildingDetailContent.tsx` | Rewrite | Hero image, flavor text, effets actifs, contextual production table, prerequisites. |

---

## Chunk 1: Task 1 — Vertical Card Layout

### Task 1: Redesign desktop building cards to vertical layout

**Files:**
- Modify: `apps/web/src/pages/Buildings.tsx:300-410` (desktop grid section)

**Context:**
- The desktop grid is inside `{!isCollapsed && ( ... )}`, in the `<div className="hidden lg:grid ...">` block (line ~301).
- Mobile layout (`<div className="space-y-1 lg:hidden">`, lines ~217-298) stays unchanged.
- `getProductionStats()` (lines 36-93) already computes production/energy stats per building. It returns `{ current, next, delta, label, unit, color, energyCurrent?, energyNext?, energyDelta? }`. Returns `null` for utility buildings.
- `getResourceGlowClass()` (lines 95-111) maps building IDs to hover glow CSS classes.
- Existing imports already include: `GameImage`, `ResourceCost`, `Button`, `Timer`, `formatDuration`, `cn`.
- The `buildings` array items have shape: `{ id, name, description, currentLevel, nextLevelCost: { minerai, silicium, hydrogene }, nextLevelTime, prerequisites: { buildingId, level }[], isUpgrading, upgradeEndTime }`.

- [ ] **Step 1: Change the desktop grid class to responsive auto-fill**

In `Buildings.tsx`, replace the desktop grid container (line ~301):

```tsx
// BEFORE:
<div className="hidden lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4">

// AFTER:
<div className="hidden lg:grid lg:gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
```

- [ ] **Step 2: Replace horizontal card layout with vertical card layout**

Replace the entire desktop card `<button>` element (lines ~321-407) with:

```tsx
<button
  key={building.id}
  onClick={() => setDetailId(building.id)}
  className={cn(
    'retro-card text-left cursor-pointer overflow-hidden flex flex-col',
    getResourceGlowClass(building.id),
    !prereqsMet && 'opacity-50',
  )}
>
  {/* Image area with gradient background */}
  <div className="relative h-[130px] bg-gradient-to-br from-[#0f3460] via-[#16213e] to-[#1a1a2e] flex items-center justify-center">
    <GameImage
      category="buildings"
      id={building.id}
      size="thumb"
      alt={building.name}
      className="h-20 w-20 rounded-xl object-cover"
    />
    <span className="absolute top-2 right-2 bg-emerald-700 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
      Niv. {building.currentLevel}
    </span>
  </div>

  {/* Info area */}
  <div className="p-3 flex flex-col flex-1 gap-1.5">
    <div className="text-[13px] font-semibold text-foreground truncate">
      {building.name}
    </div>

    {/* Contextual stat line */}
    {stats && building.currentLevel > 0 && (
      <div className="text-xs text-muted-foreground font-mono">
        {stats.label === 'Capacité'
          ? `capacité ${stats.current.toLocaleString('fr-FR')}`
          : `+${stats.current.toLocaleString('fr-FR')}${stats.unit}`}
      </div>
    )}

    {/* Spacer to push cost/button to bottom */}
    <div className="flex-1" />

    {building.isUpgrading && building.upgradeEndTime ? (
      <Timer
        endTime={new Date(building.upgradeEndTime)}
        totalDuration={building.nextLevelTime}
        onComplete={() => {
          utils.building.list.invalidate({ planetId: planetId! });
          utils.resource.production.invalidate({ planetId: planetId! });
        }}
      />
    ) : (
      <>
        <ResourceCost
          minerai={building.nextLevelCost.minerai}
          silicium={building.nextLevelCost.silicium}
          hydrogene={building.nextLevelCost.hydrogene}
          currentMinerai={resources.minerai}
          currentSilicium={resources.silicium}
          currentHydrogene={resources.hydrogene}
        />
        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {formatDuration(building.nextLevelTime)}
        </div>
        {!prereqsMet ? (
          <div className="text-[10px] text-destructive">
            Prérequis manquants
          </div>
        ) : (
          <Button
            variant="retro"
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              upgradeMutation.mutate({
                planetId: planetId!,
                buildingId: building.id as any,
              });
            }}
            disabled={
              !canAfford ||
              isAnyUpgrading ||
              upgradeMutation.isPending
            }
          >
            Améliorer
          </Button>
        )}
      </>
    )}
  </div>
</button>
```

Note: the `prereqsMet` and `canAfford` variables are already computed before this JSX (same as current code, lines ~303-311). The `stats` variable is already computed via `getProductionStats()` (lines ~313-318).

- [ ] **Step 3: Verify visually**

Run: `cd apps/web && npm run dev`

Open the buildings page on desktop. Verify:
- Cards display in a responsive grid (3-4 columns depending on screen width)
- Each card has: gradient image area with centered illustration, level badge top-right, name, stat line (for production buildings), cost (green/red), duration with clock icon, "Améliorer" button full-width
- Utility buildings (chantier, labo, etc.) have no stat line
- Upgrading building shows timer instead of cost/button
- Buildings with unmet prerequisites show reduced opacity + "Prérequis manquants"
- Mobile layout is unchanged (compact horizontal list)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Buildings.tsx
git commit -m "feat: redesign building cards to vertical layout with hero image"
```

---

## Chunk 2: Task 2 — Detail Panel Redesign

### Task 2: Rewrite BuildingDetailContent with hero image, effets actifs, and production table

**Files:**
- Modify: `apps/web/src/pages/Buildings.tsx:422-445` (props passed to BuildingDetailContent)
- Rewrite: `apps/web/src/components/entity-details/BuildingDetailContent.tsx`

**Context:**
- `BuildingDetailContent` is rendered inside `EntityDetailOverlay` which wraps children in `<div className="p-5 space-y-5">`. The hero image needs `-mx-5 -mt-5` to go edge-to-edge.
- `useGameConfig()` returns the full game config including `bonuses: BonusConfig[]` where `BonusConfig = { id, sourceType, sourceId, stat, percentPerLevel, category }`.
- Bonuses with `stat === 'building_time'` apply to all buildings. Currently only `robotics` has this stat (`percentPerLevel: -15`).
- Production formulas are in `@ogame-clone/game-engine`: `mineraiProduction(level, productionFactor)`, `siliciumProduction(level, productionFactor)`, `hydrogeneProduction(level, maxTemp, productionFactor)`, `solarPlantEnergy(level)`, `mineraiMineEnergy(level)`, `siliciumMineEnergy(level)`, `hydrogeneSynthEnergy(level)`, `storageCapacity(level)`. All return positive numbers. Energy consumption should be displayed with `-` prefix.
- The `buildings` list (from `trpc.building.list`) provides: `{ id, name, currentLevel, ... }` for every building on the planet. Needed to resolve bonus source levels ("Usine de robots niv. 5") and prerequisite completion status.
- Prerequisites come from `gameConfig.buildings[id].prerequisites: { buildingId, level }[]`.

- [ ] **Step 1: Update Buildings.tsx to pass `buildings` array to BuildingDetailContent**

In `Buildings.tsx`, update the `BuildingDetailContent` usage (lines ~422-445). Replace:

```tsx
{detailId && (
  <BuildingDetailContent
    buildingId={detailId}
    planetContext={
      resourceData
        ? {
            maxTemp: resourceData.maxTemp,
            productionFactor: resourceData.rates.productionFactor,
          }
        : undefined
    }
    runtimeData={
      detailBuilding
        ? {
            currentLevel: detailBuilding.currentLevel,
            nextLevelCost: detailBuilding.nextLevelCost,
            nextLevelTime: detailBuilding.nextLevelTime,
            isUpgrading: detailBuilding.isUpgrading,
            upgradeEndTime: detailBuilding.upgradeEndTime,
          }
        : undefined
    }
  />
)}
```

With:

```tsx
{detailId && buildings && (
  <BuildingDetailContent
    buildingId={detailId}
    buildings={buildings}
    planetContext={
      resourceData
        ? {
            maxTemp: resourceData.maxTemp,
            productionFactor: resourceData.rates.productionFactor,
          }
        : undefined
    }
  />
)}
```

Also remove the now-unused `detailBuilding` variable (line ~180):
```tsx
// DELETE this line:
const detailBuilding = detailId ? buildings.find((b) => b.id === detailId) : undefined;
```

- [ ] **Step 2: Rewrite BuildingDetailContent.tsx**

Complete rewrite of the file. The new component receives `buildingId`, `buildings` (full list), and `planetContext`.

```tsx
import { useMemo } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import {
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
} from '@ogame-clone/game-engine';

interface BuildingListItem {
  id: string;
  name: string;
  currentLevel: number;
}

interface PlanetContext {
  maxTemp: number;
  productionFactor: number;
}

interface Props {
  buildingId: string;
  buildings: BuildingListItem[];
  planetContext?: PlanetContext;
}

// ---------------------------------------------------------------------------
// Contextual table computation
// ---------------------------------------------------------------------------

type TableType = 'mine' | 'solar' | 'storage';

interface MineRow { level: number; production: number; gain: number | null; energy: number }
interface SolarRow { level: number; production: number; gain: number | null }
interface StorageRow { level: number; capacity: number; gain: number | null }

type TableData =
  | { type: 'mine'; title: string; rows: MineRow[] }
  | { type: 'solar'; title: string; rows: SolarRow[] }
  | { type: 'storage'; title: string; rows: StorageRow[] };

function getContextualTable(
  buildingId: string,
  currentLevel: number,
  maxTemp: number,
  productionFactor: number,
): TableData | null {
  const pf = productionFactor;
  const levels = Array.from({ length: 6 }, (_, i) => currentLevel + i);

  const makeMineRows = (
    prodFn: (level: number) => number,
    energyFn: (level: number) => number,
  ): MineRow[] =>
    levels.map((level, i) => ({
      level,
      production: prodFn(level),
      gain: i === 0 ? null : prodFn(level) - prodFn(level - 1),
      energy: -energyFn(level),
    }));

  switch (buildingId) {
    case 'mineraiMine':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows((l) => mineraiProduction(l, pf), mineraiMineEnergy),
      };
    case 'siliciumMine':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows((l) => siliciumProduction(l, pf), siliciumMineEnergy),
      };
    case 'hydrogeneSynth':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows((l) => hydrogeneProduction(l, maxTemp, pf), hydrogeneSynthEnergy),
      };
    case 'solarPlant':
      return {
        type: 'solar',
        title: 'Production d\'énergie',
        rows: levels.map((level, i) => ({
          level,
          production: solarPlantEnergy(level),
          gain: i === 0 ? null : solarPlantEnergy(level) - solarPlantEnergy(level - 1),
        })),
      };
    case 'storageMinerai':
    case 'storageSilicium':
    case 'storageHydrogene':
      return {
        type: 'storage',
        title: 'Capacité de stockage',
        rows: levels.map((level, i) => ({
          level,
          capacity: storageCapacity(level),
          gain: i === 0 ? null : storageCapacity(level) - storageCapacity(level - 1),
        })),
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Format helper
// ---------------------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString('fr-FR');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuildingDetailContent({ buildingId, buildings, planetContext }: Props) {
  const { data: gameConfig } = useGameConfig();

  const building = buildings.find((b) => b.id === buildingId);
  const currentLevel = building?.currentLevel ?? 0;
  const configDef = gameConfig?.buildings[buildingId];
  const name = configDef?.name ?? buildingId;
  const flavorText = configDef?.flavorText ?? '';
  const prerequisites = configDef?.prerequisites ?? [];

  // Active effects: bonuses with stat === 'building_time'
  const activeEffects = useMemo(() => {
    if (!gameConfig) return [];
    return gameConfig.bonuses
      .filter((b) => b.stat === 'building_time')
      .map((b) => {
        const sourceName =
          b.sourceType === 'building'
            ? gameConfig.buildings[b.sourceId]?.name ?? b.sourceId
            : gameConfig.research?.[b.sourceId]?.name ?? b.sourceId;
        const playerLevel =
          buildings.find((bld) => bld.id === b.sourceId)?.currentLevel ?? 0;
        return {
          sourceId: b.sourceId,
          sourceType: b.sourceType,
          sourceName,
          playerLevel,
          percentPerLevel: b.percentPerLevel,
        };
      });
  }, [gameConfig, buildings]);

  // Contextual table
  const tableData = useMemo(
    () =>
      getContextualTable(
        buildingId,
        currentLevel,
        planetContext?.maxTemp ?? 50,
        planetContext?.productionFactor ?? 1,
      ),
    [buildingId, currentLevel, planetContext],
  );

  return (
    <>
      {/* 1. Hero image */}
      <div className="relative -mx-5 -mt-5 h-[200px] bg-gradient-to-br from-[#0f3460] via-[#16213e] to-[#1a1a2e] flex items-center justify-center">
        <GameImage
          category="buildings"
          id={buildingId}
          size="full"
          alt={name}
          className="h-[120px] w-[120px] rounded-2xl object-cover"
        />
        <span className="absolute bottom-3 right-3 bg-emerald-700 text-white text-xs font-bold px-3 py-1 rounded-full">
          Niveau {currentLevel}
        </span>
      </div>

      {/* 2. Name */}
      <h3 className="text-lg font-semibold text-white">{name}</h3>

      {/* 3. Flavor text */}
      {flavorText && (
        <p className="text-xs italic text-[#888] leading-relaxed">{flavorText}</p>
      )}

      {/* 4. Effets actifs */}
      {activeEffects.length > 0 && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
            Effets actifs
          </div>
          {activeEffects.map((effect) => (
            <div key={effect.sourceId} className="flex items-center gap-2.5">
              <GameImage
                category={effect.sourceType === 'building' ? 'buildings' : 'research'}
                id={effect.sourceId}
                size="icon"
                alt={effect.sourceName}
                className="h-7 w-7 rounded-md"
              />
              <div>
                <div className="text-[11px] text-slate-200">
                  {effect.sourceName}{' '}
                  <span className="text-slate-500">niv. {effect.playerLevel}</span>
                </div>
                <div className="text-[10px] text-emerald-500">
                  {effect.percentPerLevel}% par niveau
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Contextual table */}
      {tableData && (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            {tableData.title}
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="px-2 py-1.5 border-b border-[#1e293b]">Niveau</th>
                {tableData.type === 'mine' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-amber-500">
                      Production/h
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-emerald-500">
                      Gain
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-yellow-400">
                      Énergie
                    </th>
                  </>
                )}
                {tableData.type === 'solar' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-yellow-400">
                      Production
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-emerald-500">
                      Gain
                    </th>
                  </>
                )}
                {tableData.type === 'storage' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right">
                      Capacité
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-emerald-500">
                      Gain
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {tableData.type === 'mine' &&
                (tableData as { rows: MineRow[] }).rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i === 0 ? 'bg-[#1e293b]' : i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right">{fmt(row.production)}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-500">
                      {row.gain != null ? `+${fmt(row.gain)}` : '\u2014'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-red-500">{fmt(row.energy)}</td>
                  </tr>
                ))}
              {tableData.type === 'solar' &&
                (tableData as { rows: SolarRow[] }).rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i === 0 ? 'bg-[#1e293b]' : i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right">{fmt(row.production)}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-500">
                      {row.gain != null ? `+${fmt(row.gain)}` : '\u2014'}
                    </td>
                  </tr>
                ))}
              {tableData.type === 'storage' &&
                (tableData as { rows: StorageRow[] }).rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i === 0 ? 'bg-[#1e293b]' : i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right">{fmt(row.capacity)}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-500">
                      {row.gain != null ? `+${fmt(row.gain)}` : '\u2014'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. Prerequisites */}
      {prerequisites.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            Prérequis
          </div>
          <div className="space-y-1">
            {prerequisites.map((p) => {
              const met = (buildings.find((b) => b.id === p.buildingId)?.currentLevel ?? 0) >= p.level;
              const prereqName = gameConfig?.buildings[p.buildingId]?.name ?? p.buildingId;
              return (
                <div
                  key={p.buildingId}
                  className={`text-[11px] flex items-center gap-1.5 ${met ? 'text-emerald-500' : 'text-red-500'}`}
                >
                  {met ? '\u2713' : '\u2717'} {prereqName} niveau {p.level}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify visually**

Run: `cd apps/web && npm run dev`

Open any building's detail panel. Verify:
- Hero image area stretches full-width with gradient background, large centered illustration, level badge bottom-right
- Building name displayed at 18px below the hero
- Flavor text in italic gray (if present)
- "Effets actifs" block shows building_time bonuses (e.g., "Usine de robots niv. X — -15% par niveau"). Hidden if no bonuses apply.
- For mines: table shows 6 rows (current to +5) with Production/h, Gain, and Energy columns. Current level row is highlighted with green level number and `◄` marker.
- For solar plant: table shows Production and Gain columns (no energy)
- For storage: table shows Capacité and Gain columns
- For utility buildings (shipyard, lab, etc.): no table shown
- Prerequisites show green checkmarks (met) or red crosses (unmet)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Buildings.tsx apps/web/src/components/entity-details/BuildingDetailContent.tsx
git commit -m "feat: redesign building detail panel with hero image, effets actifs and production table"
```
