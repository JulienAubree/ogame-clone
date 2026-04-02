// apps/web/src/components/reports/ReportCard.tsx
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';

const OUTCOME_STYLES: Record<string, string> = {
  attacker: 'bg-emerald-500/20 text-emerald-400',
  defender: 'bg-red-500/20 text-red-400',
  draw: 'bg-amber-500/20 text-amber-400',
};

const TYPE_ICONS: Record<string, string> = {
  attack: '⚔',
  pirate: '☠',
  mine: '⛏',
  spy: '👁',
  scan: '🔬',
  recycle: '♻',
};

interface ReportCardProps {
  report: {
    id: string;
    missionType: string;
    title: string;
    read: boolean;
    createdAt: string | Date;
    result: Record<string, any>;
  };
  gameConfig: any;
}

export function ReportCard({ report, gameConfig }: ReportCardProps) {
  const navigate = useNavigate();
  const result = report.result ?? {};
  const isCombat = report.missionType === 'attack' || report.missionType === 'pirate';

  const perspective = result.perspective as 'attacker' | 'defender' | undefined;
  const isPlayerVictory = !isCombat
    ? null
    : result.outcome === 'draw'
      ? null
      : perspective === 'defender'
        ? result.outcome === 'defender'
        : result.outcome === 'attacker';
  const outcomeLabel = !isCombat
    ? null
    : isPlayerVictory === null ? 'Nul' : isPlayerVictory ? 'Victoire' : 'Défaite';
  const outcomeStyle = !isCombat
    ? ''
    : isPlayerVictory === null ? OUTCOME_STYLES.draw
    : isPlayerVictory ? OUTCOME_STYLES.attacker
    : OUTCOME_STYLES.defender;

  const isMine = report.missionType === 'mine';
  const rewards = isMine ? result.rewards ?? {} : {};

  const isSpy = report.missionType === 'spy';
  const isRecycle = report.missionType === 'recycle';
  const collected = isRecycle ? result.collected ?? {} : {};

  return (
    <button
      type="button"
      onClick={() => navigate(`/reports/${report.id}`)}
      className={cn(
        'w-full text-left glass-card p-3 space-y-1.5 transition-colors hover:bg-accent/30',
        !report.read && 'border-l-2 border-l-primary',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{TYPE_ICONS[report.missionType] ?? '📋'}</span>
          <span className={cn('text-sm truncate', !report.read ? 'font-semibold text-foreground' : 'text-foreground')}>
            {report.title}
          </span>
        </div>
        {isCombat && outcomeLabel && (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', outcomeStyle)}>
            {outcomeLabel}
          </span>
        )}
        {isMine && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400">
            Terminée
          </span>
        )}
        {isRecycle && (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
            result.empty ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'
          )}>
            {result.empty ? 'Vide' : result.debrisRemaining ? 'Partiel' : 'Complet'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {isCombat && result.attackerFP != null && (
          <span>{result.attackerFP} FP vs {result.defenderFP} FP</span>
        )}
        {isCombat && result.roundCount != null && (
          <span>{result.roundCount} round{result.roundCount > 1 ? 's' : ''}</span>
        )}
        {isMine && (
          <span>
            {rewards.minerai > 0 && <span className="text-minerai">M: {rewards.minerai.toLocaleString('fr-FR')}</span>}
            {rewards.minerai > 0 && rewards.silicium > 0 && ' · '}
            {rewards.silicium > 0 && <span className="text-silicium">S: {rewards.silicium.toLocaleString('fr-FR')}</span>}
          </span>
        )}
        {isRecycle && (
          <span>
            {collected.minerai > 0 && <span className="text-minerai">M: {collected.minerai.toLocaleString('fr-FR')}</span>}
            {collected.minerai > 0 && collected.silicium > 0 && ' · '}
            {collected.silicium > 0 && <span className="text-silicium">S: {collected.silicium.toLocaleString('fr-FR')}</span>}
          </span>
        )}
        {isSpy && result.visibility && (
          <span>{Object.values(result.visibility).filter(Boolean).length}/5 sections</span>
        )}
        <span className="ml-auto">{timeAgo(report.createdAt)}</span>
      </div>
    </button>
  );
}
