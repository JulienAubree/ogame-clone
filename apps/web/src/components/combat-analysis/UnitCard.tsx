import { XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUnitName } from '@/lib/entity-names';
import type { CombatEvent, UnitSnapshot } from './types';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface UnitCardProps {
  snapshot: UnitSnapshot;
  events: CombatEvent[];
  round: number;
  expanded: boolean;
  onToggle: () => void;
  maxHull: number;
  gameConfig: any;
}

export function UnitCard({
  snapshot,
  events,
  round,
  expanded,
  onToggle,
  maxHull,
  gameConfig,
}: UnitCardProps) {
  const hullPct = maxHull > 0 ? (snapshot.hull / maxHull) * 100 : 0;
  const hpColor =
    snapshot.destroyed
      ? 'bg-red-500/20 border-red-500/30'
      : hullPct > 75
        ? ''
        : hullPct > 50
          ? 'border-yellow-500/20'
          : hullPct > 25
            ? 'border-orange-500/20'
            : 'border-red-500/20';
  const barColor =
    hullPct > 75
      ? 'bg-emerald-500'
      : hullPct > 50
        ? 'bg-yellow-500'
        : hullPct > 25
          ? 'bg-orange-500'
          : 'bg-red-500';

  // Short display ID
  const shortId = snapshot.unitId.includes('-')
    ? snapshot.unitId.split('-').pop()?.slice(0, 4)
    : snapshot.unitId;

  // Events for this unit
  const shots = events.filter((e) => e.round === round && e.shooterId === snapshot.unitId);
  const impacts = events.filter((e) => e.round === round && e.targetId === snapshot.unitId);

  return (
    <div
      className={cn(
        'glass-card p-2 transition-all cursor-pointer',
        hpColor,
        expanded && 'col-span-2',
        snapshot.destroyed && 'opacity-70',
      )}
      onClick={onToggle}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-[11px] font-medium',
              snapshot.destroyed ? 'text-red-400 line-through' : 'text-foreground',
            )}
          >
            {getUnitName(snapshot.unitType, gameConfig)} #{shortId}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {snapshot.destroyed ? 'Detruit' : `${fmt(snapshot.hull)}/${fmt(maxHull)}`}
        </span>
      </div>

      {/* HP bar */}
      {!snapshot.destroyed && (
        <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${Math.max(hullPct, 2)}%` }}
          />
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
          {/* Shots fired */}
          <div className="space-y-1">
            <div className="text-emerald-400 font-semibold uppercase tracking-wider">
              Tirs ({shots.length})
            </div>
            {shots.length === 0 ? (
              <div className="text-muted-foreground">Aucun tir</div>
            ) : (
              shots.map((e, i) => (
                <div
                  key={`shot-${i}`}
                  className="flex items-center justify-between rounded bg-emerald-500/5 px-1.5 py-1"
                >
                  <span className="text-foreground truncate">
                    {getUnitName(e.targetType, gameConfig)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <span className="text-emerald-400 font-mono">{fmt(e.damage)}</span>
                    {e.targetDestroyed && (
                      <XCircle className="h-2.5 w-2.5 text-red-400" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Impacts received */}
          <div className="space-y-1">
            <div className="text-red-400 font-semibold uppercase tracking-wider">
              Impacts ({impacts.length})
            </div>
            {impacts.length === 0 ? (
              <div className="text-muted-foreground">Aucun impact</div>
            ) : (
              impacts.map((e, i) => (
                <div
                  key={`impact-${i}`}
                  className="flex items-center justify-between rounded bg-red-500/5 px-1.5 py-1"
                >
                  <span className="text-foreground truncate">
                    {getUnitName(e.shooterType, gameConfig)}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <span className="text-cyan-400/70 font-mono">{fmt(e.shieldAbsorbed)}</span>
                    <span className="text-orange-400/70 font-mono">{fmt(e.hullDamage)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
