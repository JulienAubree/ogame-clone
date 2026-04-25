import { XCircle } from 'lucide-react';
import { getUnitName } from '@/lib/entity-names';
import type { CombatEvent } from './types';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface DeathsListProps {
  events: CombatEvent[];
  unitType: string;
  round: number;
  gameConfig: any;
}

export function DeathsList({ events, unitType, round, gameConfig }: DeathsListProps) {
  // Find killing blows: events where the target was destroyed this round
  const kills = events.filter(
    (e) => e.round === round && e.targetType === unitType && e.targetDestroyed,
  );

  if (kills.length === 0) return null;

  return (
    <div className="glass-card p-3 border-red-500/10">
      <div className="flex items-center gap-2 mb-2">
        <XCircle className="h-3.5 w-3.5 text-red-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
          Unites detruites ({kills.length})
        </span>
      </div>
      <div className="space-y-1.5">
        {kills.map((e, i) => (
          <div
            key={`${e.targetId}-${i}`}
            className="flex items-center justify-between text-xs rounded-md bg-red-500/5 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-red-400/70 font-mono text-[10px]">
                {e.targetId.split('-').pop()?.slice(0, 4) ?? e.targetId}
              </span>
              <span className="text-muted-foreground">par</span>
              <span className="text-foreground font-medium">
                {getUnitName(e.shooterType, gameConfig)}
              </span>
            </div>
            <span className="text-red-400 font-mono">{fmt(e.damage)} dmg</span>
          </div>
        ))}
      </div>
    </div>
  );
}
