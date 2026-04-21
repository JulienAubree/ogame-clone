import type { ReactNode } from 'react';
import { CoordsLink } from '@/components/common/CoordsLink';
import { PlanetDot } from '@/components/galaxy/PlanetDot';
import { cn } from '@/lib/utils';

type HeroStatus = 'success' | 'warning' | 'danger' | 'neutral';

interface ReportHeroProps {
  coords: { galaxy: number; system: number; position: number };
  title: string;
  statusLabel: string;
  status: HeroStatus;
  planetClassId?: string;
  icon?: ReactNode;
  lore?: string;
}

const STATUS_STYLES: Record<HeroStatus, { gradient: string; accent: string; border: string }> = {
  success: {
    gradient: 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.18) 0%, rgba(15, 23, 42, 0.95) 70%)',
    accent: 'text-emerald-300',
    border: 'border-emerald-500/30',
  },
  warning: {
    gradient: 'radial-gradient(ellipse at center, rgba(245, 158, 11, 0.18) 0%, rgba(15, 23, 42, 0.95) 70%)',
    accent: 'text-amber-300',
    border: 'border-amber-500/30',
  },
  danger: {
    gradient: 'radial-gradient(ellipse at center, rgba(244, 63, 94, 0.18) 0%, rgba(15, 23, 42, 0.95) 70%)',
    accent: 'text-rose-300',
    border: 'border-rose-500/30',
  },
  neutral: {
    gradient: 'radial-gradient(ellipse at center, rgba(100, 116, 139, 0.18) 0%, rgba(15, 23, 42, 0.95) 70%)',
    accent: 'text-slate-300',
    border: 'border-slate-500/30',
  },
};

export function ReportHero({ coords, title, statusLabel, status, planetClassId, icon, lore }: ReportHeroProps) {
  const styles = STATUS_STYLES[status];
  return (
    <div
      className={cn('rounded-lg border p-4 flex items-center gap-4', styles.border)}
      style={{ background: styles.gradient }}
    >
      <div className="shrink-0 w-[72px] h-[72px] flex items-center justify-center">
        {planetClassId ? <PlanetDot planetClassId={planetClassId} size={72} /> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-[10px] uppercase tracking-[0.15em] font-medium', styles.accent)}>
          {statusLabel}
        </div>
        <h2 className="text-lg font-bold text-foreground mt-1 truncate">{title}</h2>
        <div className="text-[11px] font-mono text-muted-foreground mt-1">
          <CoordsLink galaxy={coords.galaxy} system={coords.system} position={coords.position} />
        </div>
        {lore && (
          <p className="text-xs italic text-muted-foreground/90 mt-2 leading-relaxed">{lore}</p>
        )}
      </div>
    </div>
  );
}
