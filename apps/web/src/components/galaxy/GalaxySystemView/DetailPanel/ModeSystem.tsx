/**
 * Mode A — system overview (no slot selected).
 *
 * Shows a compact stats grid computed from the slot views and a collapsed
 * legend. Offers a single CTA to recenter on the viewer's capital when they
 * have one in this system.
 */

import type { ReactElement } from 'react';
import type { SlotView } from '../slotView';
import type { DetailPanelActions, DetailPanelContext } from './types';

interface Props {
  views: SlotView[];
  ctx: DetailPanelContext;
  actions: Pick<DetailPanelActions, 'onCenterCapital'>;
}

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps): ReactElement {
  return (
    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-cyan-500/70">
        {label}
      </div>
      <div className="text-sm font-mono">{value}</div>
    </div>
  );
}

interface LegendRowProps {
  color: string;
  label: string;
}

function LegendRow({ color, label }: LegendRowProps): ReactElement {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function ModeSystem({ views, ctx, actions }: Props): ReactElement {
  const discoverable = views.filter((v) => v.kind !== 'belt').length;
  const discovered = views.filter(
    (v) => v.kind === 'planet' || v.kind === 'empty-discovered',
  ).length;
  const mine = views.filter(
    (v) => v.kind === 'planet' && v.relation === 'mine',
  ).length;
  const ally = views.filter(
    (v) => v.kind === 'planet' && v.relation === 'ally',
  ).length;
  const enemy = views.filter(
    (v) => v.kind === 'planet' && v.relation === 'enemy',
  ).length;
  const empty = views.filter((v) => v.kind === 'empty-discovered').length;
  const unknown = views.filter((v) => v.kind === 'undiscovered').length;

  return (
    <div>
      <h3 className="text-base font-semibold">
        Système [{ctx.galaxy}:{ctx.system}]
      </h3>
      <p className="text-xs text-muted-foreground">{views.length} positions</p>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <StatCard label="Découvertes" value={`${discovered}/${discoverable}`} />
        <StatCard label="Mes planètes" value={String(mine)} />
        <StatCard label="Alliées" value={String(ally)} />
        <StatCard label="Hostiles" value={String(enemy)} />
        <StatCard label="Vides" value={String(empty)} />
        <StatCard label="Inconnues" value={String(unknown)} />
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Légende
        </summary>
        <div className="mt-2 pl-2">
          <LegendRow color="#22d3ee" label="Mes planètes" />
          <LegendRow color="#3b82f6" label="Alliées" />
          <LegendRow color="#ef4444" label="Hostiles" />
          <LegendRow color="#6b7280" label="Vide (découverte)" />
          <LegendRow color="#374151" label="Inconnu" />
          <LegendRow color="#f97316" label="Ceinture d'astéroïdes" />
        </div>
      </details>

      {ctx.myCapitalPosition !== null && (
        <button
          type="button"
          className="mt-3 w-full text-xs text-cyan-400 hover:bg-cyan-500/10 rounded-md py-1.5"
          onClick={actions.onCenterCapital}
        >
          Centrer sur ma capitale
        </button>
      )}
    </div>
  );
}
