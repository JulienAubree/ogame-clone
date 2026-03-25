import { cn } from '@/lib/utils';
import { type Mission } from '@/config/mission-config';
import { useGameConfig } from '@/hooks/useGameConfig';
import { MissionIcon } from './MissionIcon';

interface MissionSelectorProps {
  selected: Mission | null;
  onChange: (mission: Mission) => void;
  locked: boolean;
}

const SELECTABLE_MISSIONS: Mission[] = ['transport', 'station', 'spy', 'attack', 'colonize', 'recycle'];

export function MissionSelector({ selected, onChange, locked }: MissionSelectorProps) {
  const { data: gameConfig } = useGameConfig();

  // In PvE mode, include the pre-filled mission (mine/pirate) even though it's not manually selectable
  const missions = selected && !SELECTABLE_MISSIONS.includes(selected)
    ? [...SELECTABLE_MISSIONS, selected]
    : SELECTABLE_MISSIONS;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase text-muted-foreground">Mission</span>
        {locked && (
          <span className="text-xs text-yellow-500">🔒 Verrouillée pour cette mission</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {missions.map((m) => {
          const config = gameConfig?.missions[m];
          const isSelected = selected === m;
          return (
            <button
              key={m}
              onClick={() => !locked && onChange(m)}
              disabled={locked && !isSelected}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                isSelected
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                  : locked
                    ? 'bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer',
              )}
            >
              <MissionIcon mission={m} size={14} className="inline-block mr-1" />
              {isSelected && '✓ '}{config?.label ?? m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
