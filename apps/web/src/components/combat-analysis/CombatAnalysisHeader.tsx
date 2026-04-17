import { Link } from 'react-router';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface CombatAnalysisHeaderProps {
  reportId: string;
  coordinates?: { galaxy: number; system: number; position: number };
  outcome: 'attacker' | 'defender' | 'draw';
  perspective?: 'attacker' | 'defender';
  attackerFP?: number;
  defenderFP?: number;
  attackerUsername?: string;
  defenderUsername?: string;
}

export function CombatAnalysisHeader({
  reportId,
  coordinates,
  outcome,
  perspective,
  attackerFP,
  defenderFP,
  attackerUsername,
  defenderUsername,
}: CombatAnalysisHeaderProps) {
  const isPlayerVictory =
    outcome === 'draw'
      ? null
      : perspective === 'defender'
        ? outcome === 'defender'
        : outcome === 'attacker';

  const outcomeLabel =
    isPlayerVictory === null ? 'Match nul' : isPlayerVictory ? 'Victoire' : 'Defaite';
  const outcomeColor =
    isPlayerVictory === null
      ? 'text-amber-400'
      : isPlayerVictory
        ? 'text-emerald-400'
        : 'text-red-400';

  const totalFP = (attackerFP ?? 0) + (defenderFP ?? 0);
  const attackerPct = totalFP > 0 ? ((attackerFP ?? 0) / totalFP) * 100 : 50;

  return (
    <div className="space-y-3">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Link
          to={`/reports/${reportId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Rapport
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-foreground">Analyse de combat</h1>
          {coordinates && (
            <div className="text-xs text-muted-foreground mt-1">
              [{coordinates.galaxy}:{coordinates.system}:{coordinates.position}]
            </div>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${outcomeColor} bg-white/5`}>
          {outcomeLabel}
        </span>
      </div>

      {/* FP comparison */}
      {attackerFP != null && defenderFP != null && (
        <div className="glass-card p-3">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-blue-400 font-semibold">
              {attackerUsername ?? 'Attaquant'} : {fmt(attackerFP)} FP
            </span>
            <span className="text-rose-400 font-semibold">
              {defenderUsername ?? 'Defenseur'} : {fmt(defenderFP)} FP
            </span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 transition-all" style={{ width: `${attackerPct}%` }} />
            <div className="bg-rose-500 transition-all" style={{ width: `${100 - attackerPct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
