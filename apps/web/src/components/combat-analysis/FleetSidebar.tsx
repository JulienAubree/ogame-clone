import { cn } from '@/lib/utils';
import { getUnitName } from '@/lib/entity-names';
import type { UnitTypeHP } from './types';

interface FleetSidebarProps {
  side: 'attacker' | 'defender';
  fleet: Record<string, number>;
  initialFleet: Record<string, number>;
  selectedUnitType: string | null;
  selectedSide: 'attacker' | 'defender';
  onSelectUnit: (unitType: string, side: 'attacker' | 'defender') => void;
  hpByType?: Record<string, UnitTypeHP>;
  gameConfig: any;
  hidden?: boolean;
}

export function FleetSidebar({
  side,
  fleet,
  initialFleet,
  selectedUnitType,
  selectedSide,
  onSelectUnit,
  hpByType,
  gameConfig,
  hidden,
}: FleetSidebarProps) {
  const isAttacker = side === 'attacker';
  const borderColor = isAttacker ? 'border-blue-500/30' : 'border-rose-500/30';
  const headerColor = isAttacker ? 'text-blue-400' : 'text-rose-400';
  const selectedBorder = 'border-orange-500';
  const label = isAttacker ? 'Attaquant' : 'Defenseur';

  // All unit types from initial fleet
  const unitTypes = Object.keys(initialFleet).filter((t) => (initialFleet[t] ?? 0) > 0);

  return (
    <div
      className={cn(
        'glass-card p-2 space-y-1 overflow-y-auto max-h-[70vh]',
        borderColor,
        hidden && 'hidden lg:block',
      )}
    >
      <div className={cn('text-[10px] font-semibold uppercase tracking-wider px-1 mb-1', headerColor)}>
        {label}
      </div>

      {unitTypes.length === 0 && (
        <div className="text-xs text-muted-foreground px-1">Aucune unite</div>
      )}

      {unitTypes.map((type) => {
        const current = fleet[type] ?? 0;
        const initial = initialFleet[type] ?? 0;
        const hp = hpByType?.[type];
        const hullPct = hp && hp.hullMax > 0 ? (hp.hullRemaining / hp.hullMax) * 100 : 100;
        const isSelected = selectedUnitType === type && selectedSide === side;

        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelectUnit(type, side)}
            className={cn(
              'w-full rounded-md p-1.5 text-left transition-all',
              'hover:bg-white/5',
              isSelected
                ? `border ${selectedBorder} bg-orange-500/5`
                : 'border border-transparent',
            )}
          >
            <div className="text-[11px] font-medium text-foreground truncate">
              {getUnitName(type, gameConfig)}
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[10px] text-muted-foreground">
                {current}/{initial}
              </span>
              {current < initial && (
                <span className="text-[10px] text-red-400">
                  -{initial - current}
                </span>
              )}
            </div>
            {/* HP bar */}
            <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  hullPct > 75
                    ? 'bg-emerald-500'
                    : hullPct > 50
                      ? 'bg-yellow-500'
                      : hullPct > 25
                        ? 'bg-orange-500'
                        : 'bg-red-500',
                  current === 0 && 'bg-red-500/30',
                )}
                style={{ width: `${current === 0 ? 0 : Math.max(hullPct, 2)}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
