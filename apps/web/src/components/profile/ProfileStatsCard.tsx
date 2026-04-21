import type { ReactNode } from 'react';

interface ProfileStatsCardProps {
  rank: number | null;
  totalPoints: number;
  planetCount: number;
  allianceName: string | null;
}

function MedalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <circle cx="12" cy="14" r="6" />
      <path d="M8.5 8 L6 2 L10 2 L12 6 L14 2 L18 2 L15.5 8" />
    </svg>
  );
}

function CrystalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3 L19 10 L12 21 L5 10 Z" />
      <path d="M5 10 H19" />
      <path d="M12 3 L9 10 L12 21" />
      <path d="M12 3 L15 10" />
    </svg>
  );
}

function PlanetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="6" />
      <ellipse cx="12" cy="12" rx="11" ry="3.5" transform="rotate(-20 12 12)" />
    </svg>
  );
}

function BannerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M6 3 H18 V18 L12 15 L6 18 Z" />
      <path d="M10 8 H14" />
    </svg>
  );
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
          icon={<MedalIcon />}
          iconColorClass="text-amber-400"
          value={rank != null ? `#${rank}` : '—'}
          label="Rang"
        />
        <StatCell
          icon={<CrystalIcon />}
          iconColorClass="text-cyan-400"
          value={totalPoints.toLocaleString('fr-FR')}
          label="Points"
        />
        <StatCell
          icon={<PlanetIcon />}
          iconColorClass="text-blue-400"
          value={planetCount.toLocaleString('fr-FR')}
          label="Planètes"
        />
        <StatCell
          icon={<BannerIcon />}
          iconColorClass="text-amber-400"
          value={allianceName ?? '—'}
          label="Alliance"
        />
      </div>
    </div>
  );
}
