/**
 * GalaxySystemView — orchestrator for the three-zone galaxy system UI.
 *
 * Composition:
 *   [ Ribbon ] [ OrbitalCanvas ] [ DetailPanel ]
 *
 * Ownership:
 *   - Local UI state: `hoveredPosition` only.
 *   - Selection lives in the URL (`?pos=<1-16>`), derived on every render.
 *     Single source of truth → back button works, deep links work, no
 *     duplicated state between children.
 *   - Data + actions flow in from the parent (Galaxy.tsx).
 *
 * Keyboard shortcuts (ignored when focus is in an input/textarea/contenteditable):
 *   - ArrowLeft/ArrowRight : previous / next system (parent-supplied callbacks).
 *   - ArrowUp/ArrowDown    : cycle slot selection backward / forward (1..16).
 *   - Escape               : deselect (back to system mode).
 *   - Enter                : manage currently selected own planet, if any.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { useSearchParams } from 'react-router';
import { DetailPanel } from './DetailPanel';
import type {
  DetailPanelActions,
  DetailPanelContext,
  DetailSelection,
  PlanetTypeMeta,
} from './DetailPanel';
import { OrbitalCanvas } from './OrbitalCanvas';
import { Ribbon } from './Ribbon';
import { toSlotView, type SlotView } from './slotView';

const TOTAL_POSITIONS = 16;

export interface GalaxySystemViewProps {
  galaxy: number;
  system: number;
  rawSlots: unknown[];
  currentUserId: string | null;
  myAllianceId: string | null;
  planetTypes: PlanetTypeMeta[];
  hasColonizer: boolean;
  hasExplorer: boolean;
  hasSpy: boolean;
  hasCombatShip: boolean;
  hasRecycler: boolean;
  hasMiner: boolean;
  beltMissions: Record<number, { id: string }>;
  myCapitalPosition: number | null;
  onSystemPrev: () => void;
  onSystemNext: () => void;
  actions: DetailPanelActions;
}

export function GalaxySystemView(props: GalaxySystemViewProps): ReactElement {
  const {
    galaxy,
    system,
    rawSlots,
    currentUserId,
    myAllianceId,
    planetTypes,
    hasColonizer,
    hasExplorer,
    hasSpy,
    hasCombatShip,
    hasRecycler,
    hasMiner,
    beltMissions,
    myCapitalPosition,
    onSystemPrev,
    onSystemNext,
    actions,
  } = props;

  const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Selection derived from URL — stable reference when posParam is unchanged.
  const posParam = searchParams.get('pos');
  const selection = useMemo<DetailSelection>(() => {
    if (posParam == null) return { kind: 'system' };
    const parsed = parseInt(posParam, 10);
    if (!Number.isFinite(parsed)) return { kind: 'system' };
    if (parsed < 1 || parsed > TOTAL_POSITIONS) return { kind: 'system' };
    return { kind: 'slot', position: parsed };
  }, [posParam]);

  const views = useMemo<SlotView[]>(() => {
    return rawSlots.map((raw, index) =>
      toSlotView(raw, index, { currentUserId, myAllianceId }),
    );
  }, [rawSlots, currentUserId, myAllianceId]);

  const ctx = useMemo<DetailPanelContext>(
    () => ({
      galaxy,
      system,
      planetTypes,
      hasColonizer,
      hasExplorer,
      hasSpy,
      hasCombatShip,
      hasRecycler,
      hasMiner,
      beltMissions,
      myCapitalPosition,
    }),
    [
      galaxy,
      system,
      planetTypes,
      hasColonizer,
      hasExplorer,
      hasSpy,
      hasCombatShip,
      hasRecycler,
      hasMiner,
      beltMissions,
      myCapitalPosition,
    ],
  );

  // Stabilize setSelection identity so effects do not thrash when
  // setSearchParams churns (react-router v7 reallocates it on every URL
  // change — its internal useCallback depends on [navigate, searchParams]).
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;

  const setSelection = useCallback((next: DetailSelection) => {
    setSearchParamsRef.current(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next.kind === 'slot') {
          params.set('pos', String(next.position));
        } else {
          params.delete('pos');
        }
        return params;
      },
      // replace: so browser Back navigates between systems, not selections.
      { replace: true },
    );
  }, []);

  const selectPosition = useCallback(
    (position: number) => setSelection({ kind: 'slot', position }),
    [setSelection],
  );

  const selectStar = useCallback(
    () => setSelection({ kind: 'system' }),
    [setSelection],
  );

  // Reset selection when the system coordinates change — the ?pos param
  // from the previous system is no longer meaningful in the new one.
  // Skip the initial mount so deep links (?pos=N) survive.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setSelection({ kind: 'system' });
  }, [galaxy, system, setSelection]);

  // Keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault();
          onSystemPrev();
          return;
        }
        case 'ArrowRight': {
          e.preventDefault();
          onSystemNext();
          return;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const current =
            selection.kind === 'slot' ? selection.position : TOTAL_POSITIONS + 1;
          // Wrap: 1 → 16, otherwise decrement.
          const next = current <= 1 ? TOTAL_POSITIONS : current - 1;
          selectPosition(next);
          return;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const current = selection.kind === 'slot' ? selection.position : 0;
          // Wrap: 16 → 1, otherwise increment.
          const next = current >= TOTAL_POSITIONS ? 1 : current + 1;
          selectPosition(next);
          return;
        }
        case 'Escape': {
          e.preventDefault();
          selectStar();
          return;
        }
        case 'Enter': {
          if (selection.kind !== 'slot') return;
          const view = views.find((v) => v.position === selection.position);
          if (view && view.kind === 'planet' && view.relation === 'mine') {
            e.preventDefault();
            actions.onManagePlanet(view.planetId);
          }
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [
    selection,
    views,
    onSystemPrev,
    onSystemNext,
    selectPosition,
    selectStar,
    actions,
  ]);

  const selectedPosition =
    selection.kind === 'slot' ? selection.position : null;

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[480px] rounded-lg overflow-hidden border border-cyan-500/10 bg-black/40">
      <Ribbon
        views={views}
        selectedPosition={selectedPosition}
        hoveredPosition={hoveredPosition}
        onSelectPosition={selectPosition}
        onHoverPosition={setHoveredPosition}
      />
      <div className="flex-1 min-w-0 relative">
        <OrbitalCanvas
          views={views}
          galaxy={galaxy}
          system={system}
          selectedPosition={selectedPosition}
          hoveredPosition={hoveredPosition}
          onSelectPosition={selectPosition}
          onSelectStar={selectStar}
          onHoverPosition={setHoveredPosition}
        />
      </div>
      <DetailPanel
        selection={selection}
        views={views}
        ctx={ctx}
        actions={actions}
      />
    </div>
  );
}

export type { DetailPanelActions, PlanetTypeMeta } from './DetailPanel';
