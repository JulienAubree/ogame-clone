# Guide de Combat Spatial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible combat explainer on the Missions page and a full combat guide page with beginner/technical tabs, animated replays, and an interactive simulator.

**Architecture:** Frontend-only feature. A collapsible card in `Missions.tsx`, a new `/guide/combat` route with tabbed page, and reusable combat visualization components. All combat simulation runs client-side using the existing `packages/game-engine` (already a dependency of `apps/web`). A shared helper builds `CombatInput` from `gameConfig`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, `@ogame-clone/game-engine` (simulateCombat, computeUnitFP, computeFleetFP), React Router v7, useGameConfig hook.

**Spec:** `docs/superpowers/specs/2026-03-27-combat-guide-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/web/src/lib/combat-helpers.ts` | Build `CombatInput` from `gameConfig` data — shared by Replay + Simulator |
| `apps/web/src/pages/Missions.tsx` | Add collapsible combat explainer card in pirate section |
| `apps/web/src/pages/CombatGuide.tsx` | Page with tabs (beginner / technical), educational content, formulas, tables |
| `apps/web/src/components/combat-guide/RoundDisplay.tsx` | Animated round-by-round combat result display (shared) |
| `apps/web/src/components/combat-guide/CombatReplay.tsx` | Pre-configured combat scenarios with auto-play |
| `apps/web/src/components/combat-guide/FleetComposer.tsx` | Fleet/defense selection panel for the simulator |
| `apps/web/src/components/combat-guide/CombatSimulator.tsx` | Configurable combat simulator with FP display |
| `apps/web/src/router.tsx` | Add `/guide/combat` route |

---

### Task 1: Combat helpers — buildCombatInput

**Files:**
- Create: `apps/web/src/lib/combat-helpers.ts`

This helper transforms `gameConfig` data into a `CombatInput` ready for `simulateCombat()`. Both CombatReplay and CombatSimulator will use it.

- [ ] **Step 1: Create the helper file**

```typescript
// apps/web/src/lib/combat-helpers.ts
import type {
  CombatInput,
  CombatConfig,
  CombatMultipliers,
  ShipCombatConfig,
  ShipCategory,
} from '@ogame-clone/game-engine';

/** Combat categories — mirrors apps/api/src/modules/fleet/handlers/attack.handler.ts */
const COMBAT_CATEGORIES: ShipCategory[] = [
  { id: 'light', name: 'Léger', targetable: true, targetOrder: 1 },
  { id: 'medium', name: 'Moyen', targetable: true, targetOrder: 2 },
  { id: 'heavy', name: 'Lourd', targetable: true, targetOrder: 3 },
  { id: 'support', name: 'Support', targetable: false, targetOrder: 4 },
];

const NEUTRAL_MULTIPLIERS: CombatMultipliers = { weapons: 1, shielding: 1, armor: 1 };

interface ShipConfigLike {
  weapons: number;
  shield: number;
  hull: number;
  baseArmor: number;
  shotCount: number;
  combatCategoryId: string | null;
  cost?: { minerai: number; silicium: number };
  costMinerai?: number;
  costSilicium?: number;
}

interface GameConfigLike {
  ships: Record<string, ShipConfigLike>;
  defenses: Record<string, ShipConfigLike>;
  universe: Record<string, unknown>;
}

export function buildShipCombatConfigs(
  gameConfig: GameConfigLike,
): Record<string, ShipCombatConfig> {
  const configs: Record<string, ShipCombatConfig> = {};
  for (const [id, ship] of Object.entries(gameConfig.ships)) {
    configs[id] = {
      shipType: id,
      categoryId: ship.combatCategoryId ?? 'support',
      baseShield: ship.shield,
      baseArmor: ship.baseArmor,
      baseHull: ship.hull,
      baseWeaponDamage: ship.weapons,
      baseShotCount: ship.shotCount,
    };
  }
  for (const [id, def] of Object.entries(gameConfig.defenses)) {
    configs[id] = {
      shipType: id,
      categoryId: def.combatCategoryId ?? 'heavy',
      baseShield: def.shield,
      baseArmor: def.baseArmor,
      baseHull: def.hull,
      baseWeaponDamage: def.weapons,
      baseShotCount: def.shotCount,
    };
  }
  return configs;
}

export function buildCombatConfig(gameConfig: GameConfigLike): CombatConfig {
  const u = gameConfig.universe;
  return {
    maxRounds: Number(u['combat_max_rounds']) || 4,
    debrisRatio: Number(u['combat_debris_ratio']) || 0.3,
    defenseRepairRate: Number(u['combat_defense_repair_rate']) || 0.7,
    pillageRatio: Number(u['combat_pillage_ratio']) || 0.33,
    minDamagePerHit: Number(u['combat_min_damage_per_hit']) || 1,
    researchBonusPerLevel: Number(u['combat_research_bonus_per_level']) || 0.1,
    categories: COMBAT_CATEGORIES,
  };
}

function getShipCosts(
  gameConfig: GameConfigLike,
): Record<string, { minerai: number; silicium: number }> {
  const costs: Record<string, { minerai: number; silicium: number }> = {};
  for (const [id, ship] of Object.entries(gameConfig.ships)) {
    costs[id] = {
      minerai: ship.cost?.minerai ?? ship.costMinerai ?? 0,
      silicium: ship.cost?.silicium ?? ship.costSilicium ?? 0,
    };
  }
  for (const [id, def] of Object.entries(gameConfig.defenses)) {
    costs[id] = {
      minerai: def.cost?.minerai ?? def.costMinerai ?? 0,
      silicium: def.cost?.silicium ?? def.costSilicium ?? 0,
    };
  }
  return costs;
}

/**
 * Build a complete CombatInput from gameConfig and fleet compositions.
 * Uses neutral multipliers (1/1/1) and 'light' as default target priority.
 */
export function buildCombatInput(
  attackerFleet: Record<string, number>,
  defenderFleet: Record<string, number>,
  gameConfig: GameConfigLike,
  rngSeed?: number,
): CombatInput {
  const shipConfigs = buildShipCombatConfigs(gameConfig);
  const shipCosts = getShipCosts(gameConfig);
  const shipIds = new Set(Object.keys(gameConfig.ships));
  const defenseIds = new Set(Object.keys(gameConfig.defenses));

  return {
    attackerFleet,
    defenderFleet,
    defenderDefenses: {},
    attackerMultipliers: NEUTRAL_MULTIPLIERS,
    defenderMultipliers: NEUTRAL_MULTIPLIERS,
    attackerTargetPriority: 'light',
    defenderTargetPriority: 'light',
    combatConfig: buildCombatConfig(gameConfig),
    shipConfigs,
    shipCosts,
    shipIds,
    defenseIds,
    rngSeed,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to `combat-helpers.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/combat-helpers.ts
git commit -m "feat(web): add combat-helpers to build CombatInput from gameConfig"
```

---

### Task 2: Collapsible combat encart on Missions page

**Files:**
- Modify: `apps/web/src/pages/Missions.tsx:171-183`

**Spec reference:** Section 1 — Encart dépliable

- [ ] **Step 1: Add useState import and state**

In `apps/web/src/pages/Missions.tsx`, add `useState` to the React import if not present, and add the Link import from react-router (already imported). Inside the `Missions` component, after the existing state/hooks, add:

```typescript
const [combatInfoOpen, setCombatInfoOpen] = useState(false);
```

- [ ] **Step 2: Add the collapsible encart**

In `apps/web/src/pages/Missions.tsx`, insert the encart between the pirate section title (the `<div className="flex items-center gap-2">` with "Repaires pirates") and the pirate mission cards. Specifically, right after line 183 (`</div>` closing the title flex), insert:

```tsx
        {/* Combat info encart */}
        <div className="glass-card border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setCombatInfoOpen(!combatInfoOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="text-xs text-muted-foreground">
              Le <span className="text-rose-300 font-semibold">Facteur de Puissance (FP)</span> mesure la force d&apos;une flotte.
            </span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-muted-foreground/60 ml-auto shrink-0 transition-transform ${combatInfoOpen ? 'rotate-180' : ''}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {combatInfoOpen && (
            <div className="space-y-2 pt-1 text-xs text-muted-foreground">
              <p>
                Plus le FP est élevé, plus la flotte est puissante. Comparez votre FP à celui des pirates avant d&apos;attaquer.
              </p>
              <p>
                Le combat se déroule en <span className="text-foreground">4 rounds maximum</span>. Chaque round, vos vaisseaux tirent simultanément sur les ennemis et vice-versa. Les <span className="text-foreground">boucliers</span> absorbent les dégâts en premier puis se régénèrent à chaque round. Les dégâts sur la <span className="text-foreground">coque</span> sont permanents.
              </p>
              <Link
                to="/guide/combat"
                className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 font-medium"
              >
                Guide complet du combat spatial
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
```

- [ ] **Step 3: Add `useState` import if missing**

Check the import line at top of `Missions.tsx`. If `useState` is not imported from `react`, add it:

```typescript
import { useState } from 'react';
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/Missions.tsx
git commit -m "feat(web): add collapsible combat explainer in pirate section"
```

---

### Task 3: Route and CombatGuide page shell with tabs

**Files:**
- Create: `apps/web/src/pages/CombatGuide.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Create CombatGuide page with tab switching**

```typescript
// apps/web/src/pages/CombatGuide.tsx
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';

const TABS = [
  { id: 'beginner', label: 'Comprendre le combat' },
  { id: 'reference', label: 'Référence technique' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function CombatGuide() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? 'beginner';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams(tab === 'beginner' ? {} : { tab });
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Guide de combat spatial" />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'beginner' ? <BeginnerTab /> : <ReferenceTab />}
    </div>
  );
}

function BeginnerTab() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Contenu débutant — à venir.</p>
    </div>
  );
}

function ReferenceTab() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Référence technique — à venir.</p>
    </div>
  );
}
```

- [ ] **Step 2: Add route in router.tsx**

In `apps/web/src/router.tsx`, add the route inside the `children` array of the authenticated layout (after the `history` route entry at ~line 165):

```typescript
      {
        path: 'guide/combat',
        lazy: lazyLoad(() => import('./pages/CombatGuide')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/CombatGuide.tsx apps/web/src/router.tsx
git commit -m "feat(web): add /guide/combat route with tabbed page shell"
```

---

### Task 4: RoundDisplay component

**Files:**
- Create: `apps/web/src/components/combat-guide/RoundDisplay.tsx`

Shared component displaying combat results round by round with animations. Used by both CombatReplay and CombatSimulator.

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/components/combat-guide/RoundDisplay.tsx
import { useState, useEffect, useCallback } from 'react';
import type { CombatResult, RoundResult } from '@ogame-clone/game-engine';
import { getUnitName } from '@/lib/entity-names';
import { useGameConfig } from '@/hooks/useGameConfig';

interface RoundDisplayProps {
  result: CombatResult;
  /** Initial fleet counts before combat (for hull bar %) */
  initialAttacker: Record<string, number>;
  initialDefender: Record<string, number>;
  /** Auto-advance rounds with this delay (ms). 0 = manual. */
  autoPlayDelay?: number;
  /** Called when animation finishes all rounds */
  onComplete?: () => void;
}

export function RoundDisplay({
  result,
  initialAttacker,
  initialDefender,
  autoPlayDelay = 1500,
  onComplete,
}: RoundDisplayProps) {
  const { data: gameConfig } = useGameConfig();
  const [displayedRound, setDisplayedRound] = useState(0); // 0 = initial state
  const totalRounds = result.rounds.length;

  const reset = useCallback(() => setDisplayedRound(0), []);

  useEffect(() => {
    if (autoPlayDelay <= 0 || displayedRound > totalRounds) return;
    if (displayedRound === totalRounds) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(() => setDisplayedRound((r) => r + 1), autoPlayDelay);
    return () => clearTimeout(timer);
  }, [displayedRound, totalRounds, autoPlayDelay, onComplete]);

  // Current state to display
  const attackerShips =
    displayedRound === 0 ? initialAttacker : result.rounds[displayedRound - 1].attackerShips;
  const defenderShips =
    displayedRound === 0 ? initialDefender : result.rounds[displayedRound - 1].defenderShips;

  const allAttackerTypes = Object.keys(initialAttacker);
  const allDefenderTypes = Object.keys(initialDefender);

  const isFinished = displayedRound >= totalRounds;

  return (
    <div className="space-y-3">
      {/* Round indicator */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {displayedRound === 0
            ? 'Déploiement'
            : isFinished
              ? `Round ${totalRounds}/${totalRounds} — Terminé`
              : `Round ${displayedRound}/${totalRounds}`}
        </span>
        {isFinished && (
          <span
            className={`font-bold ${
              result.outcome === 'attacker'
                ? 'text-green-400'
                : result.outcome === 'defender'
                  ? 'text-red-400'
                  : 'text-yellow-400'
            }`}
          >
            {result.outcome === 'attacker'
              ? 'Victoire attaquant'
              : result.outcome === 'defender'
                ? 'Victoire défenseur'
                : 'Match nul'}
          </span>
        )}
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-4">
        <FleetColumn
          title="Attaquant"
          types={allAttackerTypes}
          initial={initialAttacker}
          current={attackerShips}
          gameConfig={gameConfig}
          color="text-blue-400"
          barColor="bg-blue-500"
        />
        <FleetColumn
          title="Défenseur"
          types={allDefenderTypes}
          initial={initialDefender}
          current={defenderShips}
          gameConfig={gameConfig}
          color="text-rose-400"
          barColor="bg-rose-500"
        />
      </div>

      {/* Manual controls if no auto-play */}
      {autoPlayDelay === 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={displayedRound === 0}
            onClick={() => setDisplayedRound((r) => Math.max(0, r - 1))}
          >
            ← Précédent
          </button>
          <button
            type="button"
            className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={isFinished}
            onClick={() => setDisplayedRound((r) => r + 1)}
          >
            Suivant →
          </button>
          <button
            type="button"
            className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={reset}
          >
            Réinitialiser
          </button>
        </div>
      )}

      {/* Losses summary when finished */}
      {isFinished && (
        <div className="grid grid-cols-2 gap-4 text-xs">
          <LossesSummary label="Pertes attaquant" losses={result.attackerLosses} gameConfig={gameConfig} />
          <LossesSummary label="Pertes défenseur" losses={result.defenderLosses} gameConfig={gameConfig} />
        </div>
      )}

      {/* Debris */}
      {isFinished && (result.debris.minerai > 0 || result.debris.silicium > 0) && (
        <div className="text-xs text-muted-foreground">
          Débris : {result.debris.minerai > 0 && <span className="text-minerai">M: {result.debris.minerai.toLocaleString('fr-FR')}</span>}
          {result.debris.minerai > 0 && result.debris.silicium > 0 && ' · '}
          {result.debris.silicium > 0 && <span className="text-silicium">S: {result.debris.silicium.toLocaleString('fr-FR')}</span>}
        </div>
      )}
    </div>
  );
}

function FleetColumn({
  title,
  types,
  initial,
  current,
  gameConfig,
  color,
  barColor,
}: {
  title: string;
  types: string[];
  initial: Record<string, number>;
  current: Record<string, number>;
  gameConfig: any;
  color: string;
  barColor: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{title}</h4>
      {types.map((type) => {
        const init = initial[type] ?? 0;
        const curr = current[type] ?? 0;
        const pct = init > 0 ? (curr / init) * 100 : 0;
        return (
          <div key={type} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className={curr === 0 ? 'text-muted-foreground/40 line-through' : 'text-foreground'}>
                {getUnitName(type, gameConfig)}
              </span>
              <span className={curr === 0 ? 'text-muted-foreground/40' : 'text-muted-foreground'}>
                {curr}/{init}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LossesSummary({
  label,
  losses,
  gameConfig,
}: {
  label: string;
  losses: Record<string, number>;
  gameConfig: any;
}) {
  const entries = Object.entries(losses).filter(([, n]) => n > 0);
  if (entries.length === 0) return <div className="text-xs text-muted-foreground">{label} : aucune</div>;
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label} :</span>{' '}
      {entries.map(([type, count], i) => (
        <span key={type}>
          {i > 0 && ', '}
          {count}× {getUnitName(type, gameConfig)}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/combat-guide/RoundDisplay.tsx
git commit -m "feat(web): add RoundDisplay component for animated combat results"
```

---

### Task 5: CombatReplay component

**Files:**
- Create: `apps/web/src/components/combat-guide/CombatReplay.tsx`

Pre-configured combat scenarios with auto-play animation.

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/components/combat-guide/CombatReplay.tsx
import { useState, useMemo } from 'react';
import { simulateCombat } from '@ogame-clone/game-engine';
import { useGameConfig } from '@/hooks/useGameConfig';
import { buildCombatInput } from '@/lib/combat-helpers';
import { RoundDisplay } from './RoundDisplay';

interface Scenario {
  id: string;
  label: string;
  description: string;
  attacker: Record<string, number>;
  defender: Record<string, number>;
  seed: number;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'balanced',
    label: 'Combat équilibré',
    description: '5 intercepteurs contre 5 intercepteurs — un duel classique à forces égales.',
    attacker: { interceptor: 5 },
    defender: { interceptor: 5 },
    seed: 42,
  },
  {
    id: 'numbers',
    label: 'Supériorité numérique',
    description: "10 intercepteurs contre 3 frégates — la quantité l'emporte-t-elle sur la qualité ?",
    attacker: { interceptor: 10 },
    defender: { frigate: 3 },
    seed: 123,
  },
  {
    id: 'shotcount',
    label: 'ShotCount en action',
    description: '8 intercepteurs (3 tirs/round) contre 2 croiseurs (1 tir/round) — les tirs multiples font la différence.',
    attacker: { interceptor: 8 },
    defender: { cruiser: 2 },
    seed: 777,
  },
];

export function CombatReplay() {
  const { data: gameConfig } = useGameConfig();
  const [selectedId, setSelectedId] = useState<string>(SCENARIOS[0].id);
  const [playing, setPlaying] = useState(false);
  const [key, setKey] = useState(0); // force remount to replay

  const scenario = SCENARIOS.find((s) => s.id === selectedId) ?? SCENARIOS[0];

  const result = useMemo(() => {
    if (!gameConfig) return null;
    const input = buildCombatInput(scenario.attacker, scenario.defender, gameConfig, scenario.seed);
    return simulateCombat(input);
  }, [gameConfig, scenario]);

  if (!gameConfig || !result) return null;

  return (
    <div className="glass-card p-4 space-y-4">
      <h4 className="text-sm font-semibold">Exemples de combat</h4>

      {/* Scenario selector */}
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setSelectedId(s.id);
              setPlaying(false);
              setKey((k) => k + 1);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selectedId === s.id
                ? 'border-rose-500/40 bg-rose-500/20 text-rose-300'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground">{scenario.description}</p>

      {/* Play / Replay button */}
      {!playing ? (
        <button
          type="button"
          onClick={() => {
            setPlaying(true);
            setKey((k) => k + 1);
          }}
          className="rounded bg-rose-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-700 transition-colors"
        >
          Lancer le combat
        </button>
      ) : (
        <RoundDisplay
          key={key}
          result={result}
          initialAttacker={scenario.attacker}
          initialDefender={scenario.defender}
          autoPlayDelay={1500}
          onComplete={() => {}}
        />
      )}

      {/* Replay button after animation */}
      {playing && (
        <button
          type="button"
          onClick={() => {
            setKey((k) => k + 1);
          }}
          className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Rejouer
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/combat-guide/CombatReplay.tsx
git commit -m "feat(web): add CombatReplay with pre-configured animated scenarios"
```

---

### Task 6: FleetComposer component

**Files:**
- Create: `apps/web/src/components/combat-guide/FleetComposer.tsx`

Fleet/defense selection panel used by the simulator.

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/components/combat-guide/FleetComposer.tsx
import { useState } from 'react';
import { computeFleetFP, type FPConfig } from '@ogame-clone/game-engine';
import { buildShipCombatConfigs } from '@/lib/combat-helpers';
import { getUnitName } from '@/lib/entity-names';
import { useGameConfig } from '@/hooks/useGameConfig';

interface FleetComposerProps {
  fleet: Record<string, number>;
  onChange: (fleet: Record<string, number>) => void;
  label: string;
  color: string;
}

export function FleetComposer({ fleet, onChange, label, color }: FleetComposerProps) {
  const { data: gameConfig } = useGameConfig();
  const [selectedType, setSelectedType] = useState('');
  const [count, setCount] = useState(1);

  if (!gameConfig) return null;

  // All combat units (ships + defenses that have weapons > 0)
  const availableUnits = [
    ...Object.entries(gameConfig.ships)
      .filter(([, s]) => s.weapons > 0)
      .map(([id]) => ({ id, group: 'Vaisseaux' })),
    ...Object.entries(gameConfig.defenses)
      .filter(([, d]) => d.weapons > 0)
      .map(([id]) => ({ id, group: 'Défenses' })),
  ];

  const fpConfig: FPConfig = {
    shotcountExponent: Number(gameConfig.universe?.fp_shotcount_exponent ?? 1.5),
    divisor: Number(gameConfig.universe?.fp_divisor ?? 100),
  };

  const shipCombatConfigs = buildShipCombatConfigs(gameConfig);
  const shipStats: Record<string, { weapons: number; shotCount: number; shield: number; hull: number }> = {};
  for (const [id, cfg] of Object.entries(shipCombatConfigs)) {
    shipStats[id] = {
      weapons: cfg.baseWeaponDamage,
      shotCount: cfg.baseShotCount,
      shield: cfg.baseShield,
      hull: cfg.baseHull,
    };
  }

  const totalFP = computeFleetFP(fleet, shipStats, fpConfig);

  const addUnit = () => {
    if (!selectedType || count <= 0) return;
    const updated = { ...fleet, [selectedType]: (fleet[selectedType] ?? 0) + count };
    onChange(updated);
    setCount(1);
  };

  const removeUnit = (id: string) => {
    const updated = { ...fleet };
    delete updated[id];
    onChange(updated);
  };

  const fleetEntries = Object.entries(fleet).filter(([, n]) => n > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</h4>
        <span className="text-xs font-bold text-foreground">{totalFP} FP</span>
      </div>

      {/* Add unit row */}
      <div className="flex gap-2">
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">Sélectionner...</option>
          {availableUnits.map(({ id, group }) => (
            <option key={id} value={id}>
              [{group === 'Vaisseaux' ? 'V' : 'D'}] {getUnitName(id, gameConfig)}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={9999}
          value={count}
          onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-16 rounded border border-border bg-background px-2 py-1 text-xs text-center"
        />
        <button
          type="button"
          onClick={addUnit}
          disabled={!selectedType}
          className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          +
        </button>
      </div>

      {/* Fleet list */}
      {fleetEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">Aucune unité ajoutée.</p>
      ) : (
        <div className="space-y-1">
          {fleetEntries.map(([id, n]) => (
            <div key={id} className="flex items-center justify-between text-xs">
              <span>
                {n}× {getUnitName(id, gameConfig)}
              </span>
              <button
                type="button"
                onClick={() => removeUnit(id)}
                className="text-muted-foreground/60 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/combat-guide/FleetComposer.tsx
git commit -m "feat(web): add FleetComposer component for combat simulator"
```

---

### Task 7: CombatSimulator component

**Files:**
- Create: `apps/web/src/components/combat-guide/CombatSimulator.tsx`

- [ ] **Step 1: Create the component**

```typescript
// apps/web/src/components/combat-guide/CombatSimulator.tsx
import { useState, useMemo } from 'react';
import { simulateCombat, type CombatResult } from '@ogame-clone/game-engine';
import { useGameConfig } from '@/hooks/useGameConfig';
import { buildCombatInput } from '@/lib/combat-helpers';
import { FleetComposer } from './FleetComposer';
import { RoundDisplay } from './RoundDisplay';

export function CombatSimulator() {
  const { data: gameConfig } = useGameConfig();
  const [attackerFleet, setAttackerFleet] = useState<Record<string, number>>({});
  const [defenderFleet, setDefenderFleet] = useState<Record<string, number>>({});
  const [result, setResult] = useState<CombatResult | null>(null);
  const [simKey, setSimKey] = useState(0);
  const [snapshotAttacker, setSnapshotAttacker] = useState<Record<string, number>>({});
  const [snapshotDefender, setSnapshotDefender] = useState<Record<string, number>>({});

  const canSimulate =
    Object.values(attackerFleet).some((n) => n > 0) &&
    Object.values(defenderFleet).some((n) => n > 0);

  const runSimulation = () => {
    if (!gameConfig || !canSimulate) return;
    const input = buildCombatInput(attackerFleet, defenderFleet, gameConfig);
    const combatResult = simulateCombat(input);
    setSnapshotAttacker({ ...attackerFleet });
    setSnapshotDefender({ ...defenderFleet });
    setResult(combatResult);
    setSimKey((k) => k + 1);
  };

  const reset = () => {
    setAttackerFleet({});
    setDefenderFleet({});
    setResult(null);
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Simulateur de combat</h4>
        {(Object.keys(attackerFleet).length > 0 || Object.keys(defenderFleet).length > 0) && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Fleet composers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FleetComposer
          fleet={attackerFleet}
          onChange={setAttackerFleet}
          label="Ta flotte"
          color="text-blue-400"
        />
        <FleetComposer
          fleet={defenderFleet}
          onChange={setDefenderFleet}
          label="Flotte ennemie"
          color="text-rose-400"
        />
      </div>

      {/* Simulate button */}
      <button
        type="button"
        onClick={runSimulation}
        disabled={!canSimulate}
        className="w-full rounded bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Simuler le combat
      </button>

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className="h-px bg-border" />
          <RoundDisplay
            key={simKey}
            result={result}
            initialAttacker={snapshotAttacker}
            initialDefender={snapshotDefender}
            autoPlayDelay={0}
          />

          {/* Detailed stats */}
          <div className="h-px bg-border" />
          <div className="grid grid-cols-2 gap-4 text-xs">
            <StatsPanel label="Stats attaquant" stats={result.attackerStats} color="text-blue-400" />
            <StatsPanel label="Stats défenseur" stats={result.defenderStats} color="text-rose-400" />
          </div>
        </div>
      )}
    </div>
  );
}

function StatsPanel({
  label,
  stats,
  color,
}: {
  label: string;
  stats: { shieldAbsorbed: number; armorBlocked: number; overkillWasted: number };
  color: string;
}) {
  const fmt = (n: number) => n.toLocaleString('fr-FR');
  return (
    <div className="space-y-1">
      <span className={`text-xs font-semibold ${color}`}>{label}</span>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>Bouclier absorbé : {fmt(stats.shieldAbsorbed)}</div>
        <div>Armure bloquée : {fmt(stats.armorBlocked)}</div>
        <div>Overkill gaspillé : {fmt(stats.overkillWasted)}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/combat-guide/CombatSimulator.tsx
git commit -m "feat(web): add CombatSimulator with fleet composers and detailed stats"
```

---

### Task 8: Beginner tab content

**Files:**
- Modify: `apps/web/src/pages/CombatGuide.tsx`

Replace the `BeginnerTab` placeholder with full educational content + CombatReplay integration.

- [ ] **Step 1: Replace BeginnerTab function**

In `apps/web/src/pages/CombatGuide.tsx`, add the import at the top:

```typescript
import { CombatReplay } from '@/components/combat-guide/CombatReplay';
```

Then replace the `BeginnerTab` function with:

```tsx
function BeginnerTab() {
  return (
    <div className="space-y-6">
      {/* Section 1: FP */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">C'est quoi le FP ?</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Le <span className="text-foreground font-semibold">Facteur de Puissance (FP)</span> est la note de puissance d'une flotte.
            Il combine la puissance de feu et la résistance de chaque vaisseau en un seul chiffre.
          </p>
          <p>
            Plus le FP est élevé, plus la flotte est redoutable.
            Par exemple, un <span className="text-foreground">intercepteur</span> vaut environ <span className="text-foreground">4 FP</span>,
            tandis qu'un <span className="text-foreground">cuirassé</span> en vaut <span className="text-foreground">98 FP</span>.
          </p>
          <p>
            Avant d'attaquer des pirates, comparez votre FP au leur — c'est le meilleur indicateur
            de vos chances de victoire.
          </p>
        </div>
      </section>

      {/* Section 2: Stats */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Les stats d'un vaisseau</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Chaque vaisseau a 5 statistiques de combat :</p>
          <ul className="space-y-1.5 list-none">
            <li>
              <span className="text-foreground font-semibold">Armes</span> — les dégâts infligés par tir.
              Un croiseur (45) frappe bien plus fort qu'un intercepteur (4).
            </li>
            <li>
              <span className="text-foreground font-semibold">Nombre de tirs (ShotCount)</span> — combien de fois le vaisseau tire par round.
              L'intercepteur tire <span className="text-foreground">3 fois</span> par round, le croiseur seulement <span className="text-foreground">1 fois</span>.
            </li>
            <li>
              <span className="text-foreground font-semibold">Bouclier</span> — absorbe les dégâts en premier.
              Se <span className="text-foreground">régénère à 100%</span> à chaque round.
            </li>
            <li>
              <span className="text-foreground font-semibold">Armure</span> — réduction fixe de dégâts.
              Quand un tir perce le bouclier, l'armure réduit les dégâts restants. Permanente.
            </li>
            <li>
              <span className="text-foreground font-semibold">Coque</span> — les points de vie du vaisseau.
              Quand la coque tombe à 0, le vaisseau est <span className="text-red-400">détruit</span>. Pas de régénération.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 3: Combat flow */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Comment se déroule un combat</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Un combat se déroule en <span className="text-foreground font-semibold">4 rounds maximum</span>.
            Il s'arrête plus tôt si un camp est entièrement détruit.
          </p>
          <p>
            Les deux camps tirent <span className="text-foreground">simultanément</span> — même si un vaisseau est détruit dans le round,
            il a quand même le temps de tirer. C'est un échange de tirs, pas un tour par tour.
          </p>
        </div>
      </section>

      {/* Section 4: Round detail */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Un round en détail</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Chaque round se déroule en 3 phases :</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>
              <span className="text-foreground">Phase de tir attaquant</span> — chaque vaisseau attaquant tire
              (nombre de tirs = son ShotCount) sur une cible aléatoire parmi les défenseurs.
            </li>
            <li>
              <span className="text-foreground">Phase de tir défenseur</span> — chaque défenseur tire de la même façon
              sur les attaquants.
            </li>
            <li>
              <span className="text-foreground">Régénération des boucliers</span> — tous les survivants récupèrent
              100% de leur bouclier.
            </li>
          </ol>
          <p>
            Les dégâts infligés à la coque sont <span className="text-foreground">permanents</span>.
            Round après round, les vaisseaux s'affaiblissent jusqu'à la destruction.
          </p>
        </div>
      </section>

      {/* Section 5: Targeting */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Ciblage</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Les vaisseaux ont un <span className="text-foreground">ordre de ciblage prioritaire</span> :
            d'abord les unités <span className="text-foreground">légères</span> (intercepteurs),
            puis les <span className="text-foreground">moyennes</span> (frégates),
            puis les <span className="text-foreground">lourdes</span> (croiseurs, cuirassés).
          </p>
          <p>
            Les vaisseaux de <span className="text-foreground">support</span> (cargos, recycleurs)
            ne sont ciblés <span className="text-foreground">qu'en dernier recours</span>, quand il ne reste plus de combattants.
          </p>
          <p>
            Au sein d'une catégorie, la cible est choisie au hasard.
          </p>
        </div>
      </section>

      {/* Section 6: After combat */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Après le combat</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <ul className="space-y-1.5 list-disc list-inside">
            <li>
              <span className="text-foreground">Débris</span> — 30% du coût des vaisseaux détruits
              (des deux camps) forment un champ de débris en minerai et silicium,
              récupérable par un recycleur. Les défenses ne génèrent pas de débris.
            </li>
            <li>
              <span className="text-foreground">Réparation des défenses</span> — chaque défense détruite
              a 70% de chance d'être automatiquement réparée après le combat.
              Les vaisseaux détruits sont perdus définitivement.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 7: Animated replay */}
      <section>
        <CombatReplay />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/CombatGuide.tsx
git commit -m "feat(web): add beginner tab content with educational sections and replay"
```

---

### Task 9: Technical tab content

**Files:**
- Modify: `apps/web/src/pages/CombatGuide.tsx`

Replace the `ReferenceTab` placeholder with formulas, tables, and the CombatSimulator.

- [ ] **Step 1: Add imports**

At the top of `apps/web/src/pages/CombatGuide.tsx`, add:

```typescript
import { computeUnitFP, type FPConfig, type UnitCombatStats } from '@ogame-clone/game-engine';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName, getDefenseName } from '@/lib/entity-names';
import { CombatSimulator } from '@/components/combat-guide/CombatSimulator';
```

Note: `useGameConfig` may already be used by the `BeginnerTab` — if not, add it. The `ReferenceTab` needs it to build ship/defense tables.

- [ ] **Step 2: Replace ReferenceTab function**

```tsx
function ReferenceTab() {
  const { data: gameConfig } = useGameConfig();

  if (!gameConfig) return null;

  const fpConfig: FPConfig = {
    shotcountExponent: Number(gameConfig.universe?.fp_shotcount_exponent ?? 1.5),
    divisor: Number(gameConfig.universe?.fp_divisor ?? 100),
  };

  const maxRounds = Number(gameConfig.universe?.combat_max_rounds ?? 4);
  const debrisRatio = Number(gameConfig.universe?.combat_debris_ratio ?? 0.3);
  const defenseRepairRate = Number(gameConfig.universe?.combat_defense_repair_rate ?? 0.7);
  const minDamage = Number(gameConfig.universe?.combat_min_damage_per_hit ?? 1);

  // Build ship rows sorted by FP desc
  const shipRows = Object.entries(gameConfig.ships)
    .filter(([, s]) => s.weapons > 0)
    .map(([id, s]) => {
      const stats: UnitCombatStats = { weapons: s.weapons, shotCount: s.shotCount, shield: s.shield, hull: s.hull };
      return { id, name: getShipName(id, gameConfig), ...s, fp: computeUnitFP(stats, fpConfig), category: s.combatCategoryId ?? '—' };
    })
    .sort((a, b) => b.fp - a.fp);

  // Build defense rows sorted by FP desc
  const defenseRows = Object.entries(gameConfig.defenses)
    .filter(([, d]) => d.weapons > 0)
    .map(([id, d]) => {
      const stats: UnitCombatStats = { weapons: d.weapons, shotCount: d.shotCount, shield: d.shield, hull: d.hull };
      return { id, name: getDefenseName(id, gameConfig), ...d, fp: computeUnitFP(stats, fpConfig), category: d.combatCategoryId ?? '—' };
    })
    .sort((a, b) => b.fp - a.fp);

  return (
    <div className="space-y-6">
      {/* Formule FP */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Formule du Facteur de Puissance</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <code className="block rounded bg-muted/50 p-3 text-foreground">
            FP = Math.round((armes × shotCount<sup>{fpConfig.shotcountExponent}</sup>) × (bouclier + coque) / {fpConfig.divisor})
          </code>
          <p>
            FP d'une flotte = somme de (FP unitaire × quantité) pour chaque type de vaisseau.
          </p>
          <div className="flex gap-4">
            <div>
              <span className="text-muted-foreground">Exposant shotCount :</span>{' '}
              <span className="text-foreground font-mono">{fpConfig.shotcountExponent}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Diviseur :</span>{' '}
              <span className="text-foreground font-mono">{fpConfig.divisor}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Formules de combat */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Formules de combat</h3>
        <div className="text-xs text-muted-foreground space-y-3">
          <div>
            <p className="font-medium text-foreground mb-1">Stats effectives (avec recherche)</p>
            <code className="block rounded bg-muted/50 p-2 text-foreground">
              armes_eff = armes_base × multiplicateur_armes<br />
              bouclier_eff = bouclier_base × multiplicateur_bouclier<br />
              coque_eff = coque_base × multiplicateur_blindage
            </code>
            <p className="mt-1">L'armure n'est pas affectée par la recherche (réduction plate fixe).</p>
          </div>

          <div>
            <p className="font-medium text-foreground mb-1">Dégâts par tir</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Si <code className="text-foreground">bouclier ≥ dégâts</code> → le bouclier absorbe tout, 0 dégâts à la coque.</li>
              <li>Sinon, <code className="text-foreground">surplus = dégâts − bouclier</code></li>
              <li>Dégâts coque = <code className="text-foreground">max(surplus − armure, {minDamage})</code> — minimum {minDamage} dégât garanti si le bouclier est percé.</li>
              <li>Destruction si <code className="text-foreground">coque ≤ 0</code>.</li>
            </ol>
          </div>

          <div>
            <p className="font-medium text-foreground mb-1">Paramètres de combat</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span>Rounds maximum :</span><span className="text-foreground font-mono">{maxRounds}</span>
              <span>Ratio débris :</span><span className="text-foreground font-mono">{(debrisRatio * 100).toFixed(0)}%</span>
              <span>Réparation défenses :</span><span className="text-foreground font-mono">{(defenseRepairRate * 100).toFixed(0)}%</span>
              <span>Dégât minimum :</span><span className="text-foreground font-mono">{minDamage}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Targeting */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Priorité de ciblage</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-1 pr-4 text-foreground">Catégorie</th>
                  <th className="py-1 pr-4 text-foreground">Ordre</th>
                  <th className="py-1 text-foreground">Ciblable</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50"><td className="py-1 pr-4">Léger</td><td className="py-1 pr-4">1 (priorité)</td><td className="py-1">Oui</td></tr>
                <tr className="border-b border-border/50"><td className="py-1 pr-4">Moyen</td><td className="py-1 pr-4">2</td><td className="py-1">Oui</td></tr>
                <tr className="border-b border-border/50"><td className="py-1 pr-4">Lourd</td><td className="py-1 pr-4">3</td><td className="py-1">Oui</td></tr>
                <tr><td className="py-1 pr-4">Support</td><td className="py-1 pr-4">4 (dernier)</td><td className="py-1">Non (dernier recours)</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            L'algorithme cible d'abord la catégorie prioritaire, puis les catégories ciblables par ordre croissant.
            Les unités de support ne sont ciblées que s'il n'y a plus de combattants.
          </p>
        </div>
      </section>

      {/* Ship table */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Table des vaisseaux</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 pr-3">Vaisseau</th>
                <th className="py-1.5 pr-3 text-right">Armes</th>
                <th className="py-1.5 pr-3 text-right">Tirs</th>
                <th className="py-1.5 pr-3 text-right">Bouclier</th>
                <th className="py-1.5 pr-3 text-right">Armure</th>
                <th className="py-1.5 pr-3 text-right">Coque</th>
                <th className="py-1.5 pr-3">Cat.</th>
                <th className="py-1.5 text-right font-semibold text-foreground">FP</th>
              </tr>
            </thead>
            <tbody>
              {shipRows.map((row) => (
                <tr key={row.id} className="border-b border-border/30">
                  <td className="py-1.5 pr-3 text-foreground">{row.name}</td>
                  <td className="py-1.5 pr-3 text-right">{row.weapons}</td>
                  <td className="py-1.5 pr-3 text-right">{row.shotCount}</td>
                  <td className="py-1.5 pr-3 text-right">{row.shield}</td>
                  <td className="py-1.5 pr-3 text-right">{row.baseArmor}</td>
                  <td className="py-1.5 pr-3 text-right">{row.hull}</td>
                  <td className="py-1.5 pr-3">{row.category}</td>
                  <td className="py-1.5 text-right font-bold text-foreground">{row.fp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Defense table */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Table des défenses</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 pr-3">Défense</th>
                <th className="py-1.5 pr-3 text-right">Armes</th>
                <th className="py-1.5 pr-3 text-right">Tirs</th>
                <th className="py-1.5 pr-3 text-right">Bouclier</th>
                <th className="py-1.5 pr-3 text-right">Armure</th>
                <th className="py-1.5 pr-3 text-right">Coque</th>
                <th className="py-1.5 pr-3">Cat.</th>
                <th className="py-1.5 text-right font-semibold text-foreground">FP</th>
              </tr>
            </thead>
            <tbody>
              {defenseRows.map((row) => (
                <tr key={row.id} className="border-b border-border/30">
                  <td className="py-1.5 pr-3 text-foreground">{row.name}</td>
                  <td className="py-1.5 pr-3 text-right">{row.weapons}</td>
                  <td className="py-1.5 pr-3 text-right">{row.shotCount}</td>
                  <td className="py-1.5 pr-3 text-right">{row.shield}</td>
                  <td className="py-1.5 pr-3 text-right">{row.baseArmor}</td>
                  <td className="py-1.5 pr-3 text-right">{row.hull}</td>
                  <td className="py-1.5 pr-3">{row.category}</td>
                  <td className="py-1.5 text-right font-bold text-foreground">{row.fp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Debris & repair */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Débris et réparation</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <div>
            <p className="font-medium text-foreground mb-1">Champ de débris</p>
            <code className="block rounded bg-muted/50 p-2 text-foreground">
              débris_minerai = floor(coût_minerai_total × {debrisRatio})<br />
              débris_silicium = floor(coût_silicium_total × {debrisRatio})
            </code>
            <p className="mt-1">
              Seuls les <span className="text-foreground">vaisseaux détruits</span> (des deux camps) génèrent des débris.
              Les défenses ne contribuent pas au champ de débris.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Réparation des défenses</p>
            <p>
              Chaque défense détruite a <span className="text-foreground">{(defenseRepairRate * 100).toFixed(0)}%</span> de
              chance d'être automatiquement restaurée après le combat. Les vaisseaux ne sont jamais réparés.
            </p>
          </div>
        </div>
      </section>

      {/* Simulator */}
      <section>
        <CombatSimulator />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/CombatGuide.tsx
git commit -m "feat(web): add technical reference tab with formulas, tables, and simulator"
```

---

## Self-Review

**Spec coverage:**
- Section 1 (Encart dépliable) → Task 2
- Section 2 (Page guide: route, tabs, beginner content, reference content) → Tasks 3, 8, 9
- Section 3 (CombatReplay) → Task 5
- Section 3 (CombatSimulator + FleetComposer) → Tasks 6, 7
- Section 3 (RoundDisplay) → Task 4
- Section 4 (Files) → All covered
- Section 5 (Dependencies) → No new deps needed, all already available

**Placeholder scan:** No TBD/TODO found.

**Type consistency:**
- `buildCombatInput` — defined in Task 1, used in Tasks 5 and 7
- `buildShipCombatConfigs` — defined in Task 1, used in Task 6
- `RoundDisplay` — defined in Task 4, used in Tasks 5 and 7
- `FleetComposer` — defined in Task 6, used in Task 7
- `CombatReplay` — defined in Task 5, used in Task 8
- `CombatSimulator` — defined in Task 7, used in Task 9
- All prop interfaces match between definition and usage
