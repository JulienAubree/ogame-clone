export interface HullCardStyleSet {
  border: string;
  glow: string;
  badge: string;
  badgeText: string;
}

export const HULL_CARD_STYLES: Record<string, HullCardStyleSet> = {
  combat: {
    border: 'border-red-500/30',
    glow: 'shadow-[0_0_15px_-3px_rgba(239,68,68,0.15)]',
    badge: 'bg-red-500/15 border-red-500/30',
    badgeText: 'text-red-400',
  },
  industrial: {
    border: 'border-amber-500/30',
    glow: 'shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)]',
    badge: 'bg-amber-500/15 border-amber-500/30',
    badgeText: 'text-amber-400',
  },
  scientific: {
    border: 'border-cyan-500/30',
    glow: 'shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)]',
    badge: 'bg-cyan-500/15 border-cyan-500/30',
    badgeText: 'text-cyan-400',
  },
};

export function getHullCardStyles(hullId: string | null | undefined): HullCardStyleSet {
  return HULL_CARD_STYLES[hullId ?? 'industrial'] ?? HULL_CARD_STYLES.industrial;
}
