/**
 * DetailPanel — right-hand contextual panel for the galaxy system view.
 *
 * Dispatches on `selection` to one of 5 modes:
 *   - system       → ModeSystem (no slot picked)
 *   - slot (belt)  → ModeBelt
 *   - slot (other) → ModePlanet (which itself handles the 3 planet-like kinds)
 *
 * Uses a React `key` on the inner wrapper so the 150ms opacity transition
 * re-runs each time the selection changes, giving a subtle fade between
 * modes without any extra state management.
 */

import type { ReactElement } from 'react';
import type { SlotView } from '../slotView';
import { ModeBelt } from './ModeBelt';
import { ModePlanet } from './ModePlanet';
import { ModeSystem } from './ModeSystem';
import type {
  DetailPanelActions,
  DetailPanelContext,
  DetailSelection,
} from './types';

interface DetailPanelProps {
  selection: DetailSelection;
  views: SlotView[];
  ctx: DetailPanelContext;
  actions: DetailPanelActions;
}

function renderBody(
  selection: DetailSelection,
  views: SlotView[],
  ctx: DetailPanelContext,
  actions: DetailPanelActions,
): ReactElement {
  if (selection.kind === 'system') {
    return <ModeSystem views={views} ctx={ctx} actions={actions} />;
  }

  const selectedView = views.find((v) => v.position === selection.position);
  if (!selectedView) {
    return <ModeSystem views={views} ctx={ctx} actions={actions} />;
  }

  if (selectedView.kind === 'belt') {
    return <ModeBelt view={selectedView} ctx={ctx} actions={actions} />;
  }

  return <ModePlanet view={selectedView} ctx={ctx} actions={actions} />;
}

export function DetailPanel({
  selection,
  views,
  ctx,
  actions,
}: DetailPanelProps): ReactElement {
  const bodyKey =
    selection.kind === 'slot' ? `slot-${selection.position}` : 'system';

  return (
    <aside className="w-[340px] flex-shrink-0 border-l border-cyan-500/10 bg-black/20 overflow-y-auto">
      <div key={bodyKey} className="p-4 transition-opacity duration-150">
        {renderBody(selection, views, ctx, actions)}
      </div>
    </aside>
  );
}

export type {
  DetailPanelActions,
  DetailPanelContext,
  DetailSelection,
  PlanetTypeMeta,
} from './types';
