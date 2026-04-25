import type { ReactNode } from 'react';
import { Award, Gem, Globe, Flag } from 'lucide-react';

interface ProfileStatsCardProps {
  rank: number | null;
  totalPoints: number;
  planetCount: number;
  allianceName: string | null;
}

interface StatCellProps {
  icon: ReactNode;
  iconColorClass: string;
  value: string;
  label: string;
}

function StatCell({ icon, iconColorClass, value, label }: StatCellProps) {
  return (
    <div className="rounded-lg bg-accent/50 p-3 flex flex-col items-center gap-1">
      <span className={iconColorClass}>{icon}</span>
      <div className="text-lg font-bold text-foreground tabular-nums truncate max-w-full">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ProfileStatsCard({ rank, totalPoints, planetCount, allianceName }: ProfileStatsCardProps) {
  return (
    <div className="glass-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Statistiques</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell
          icon={<Award className="h-4 w-4" strokeWidth={1.8} />}
          iconColorClass="text-amber-400"
          value={rank != null ? `#${rank}` : '—'}
          label="Rang"
        />
        <StatCell
          icon={<Gem className="h-4 w-4" strokeWidth={1.8} />}
          iconColorClass="text-cyan-400"
          value={totalPoints.toLocaleString('fr-FR')}
          label="Points"
        />
        <StatCell
          icon={<Globe className="h-4 w-4" strokeWidth={1.8} />}
          iconColorClass="text-blue-400"
          value={planetCount.toLocaleString('fr-FR')}
          label="Planètes"
        />
        <StatCell
          icon={<Flag className="h-4 w-4" strokeWidth={1.8} />}
          iconColorClass="text-amber-400"
          value={allianceName ?? '—'}
          label="Alliance"
        />
      </div>
    </div>
  );
}
