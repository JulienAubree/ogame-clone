import { cn } from '@/lib/utils';
import type { RoundResult } from './types';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface CombatTimelineProps {
  rounds: RoundResult[];
  selectedRound: number;
  onSelectRound: (round: number) => void;
  totalRounds: number;
}

export function CombatTimeline({
  rounds,
  selectedRound,
  onSelectRound,
  totalRounds,
}: CombatTimelineProps) {
  // Round labels: 0 = "Init", 1..N = "R1".., N+1 = "Fin"
  const labels: { index: number; label: string }[] = [];
  for (let i = 0; i <= totalRounds; i++) {
    labels.push({ index: i, label: i === 0 ? 'Init' : `R${i}` });
  }
  labels.push({ index: totalRounds + 1, label: 'Fin' });

  // Selected round stats
  const roundData = selectedRound > 0 ? rounds[selectedRound - 1] : undefined;
  const stats = roundData?.attackerStats && roundData?.defenderStats
    ? {
        shots:
          Object.values(roundData.attackerShips).reduce((a, b) => a + b, 0) +
          Object.values(roundData.defenderShips).reduce((a, b) => a + b, 0),
        shield: roundData.attackerStats.shieldAbsorbed + roundData.defenderStats.shieldAbsorbed,
        armor: roundData.attackerStats.armorBlocked + roundData.defenderStats.armorBlocked,
        attackerLost: Object.values(roundData.attackerStats.damageDealtByCategory).reduce(
          (a, b) => a + b,
          0,
        ),
        defenderLost: Object.values(roundData.defenderStats.damageDealtByCategory).reduce(
          (a, b) => a + b,
          0,
        ),
      }
    : null;

  return (
    <div className="glass-card p-3 space-y-3">
      {/* Round buttons */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {labels.map(({ index, label }) => (
          <button
            key={index}
            type="button"
            onClick={() => onSelectRound(index)}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
              selectedRound === index
                ? 'bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.4)]'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Round summary stats */}
      {selectedRound === totalRounds + 1 ? (
        <div className="text-xs text-muted-foreground text-center">
          Bilan de fin de combat
        </div>
      ) : selectedRound === 0 ? (
        <div className="text-xs text-muted-foreground text-center">
          Deploiement initial des forces
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Bouclier
            </div>
            <div className="text-sm font-bold text-cyan-400">{fmt(stats.shield)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Armure
            </div>
            <div className="text-sm font-bold text-amber-400">{fmt(stats.armor)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Degats att.
            </div>
            <div className="text-sm font-bold text-blue-400">{fmt(stats.attackerLost)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Degats def.
            </div>
            <div className="text-sm font-bold text-rose-400">{fmt(stats.defenderLost)}</div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground text-center">
          Aucune donnee pour ce round
        </div>
      )}
    </div>
  );
}
