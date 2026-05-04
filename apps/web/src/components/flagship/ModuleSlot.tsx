import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleTooltip } from './ModuleTooltip';

interface Props {
  size: 'epic' | 'rare' | 'common';
  module: {
    id: string;
    name: string;
    image: string;
    rarity: string;
    description?: string;
    kind?: string;
    effect?: unknown;
  } | null;
  onClick: () => void;
  onUnequip?: () => void;
}

const SIZE_CLASSES = {
  epic:   'h-20 w-20 border-violet-400/60 ring-2 ring-violet-500/30 shadow-lg shadow-violet-500/20',
  rare:   'h-14 w-14 border-blue-400/40',
  common: 'h-12 w-12 border-border/50',
};

const RARITY_BORDER = {
  epic:   'border-violet-400',
  rare:   'border-blue-400',
  common: 'border-gray-400',
};

export function ModuleSlot({ size, module, onClick, onUnequip }: Props) {
  const slotButton = (
    <button
      type="button"
      onClick={module && onUnequip ? onUnequip : onClick}
      className={cn(
        'relative rounded-md border-2 bg-card/40 transition-all hover:bg-card/70',
        SIZE_CLASSES[size],
        module && RARITY_BORDER[module.rarity as 'epic' | 'rare' | 'common'],
        !module && 'border-dashed',
      )}
      aria-label={module ? `${module.name} — clic pour déséquiper` : 'Clic pour équiper'}
    >
      {module ? (
        module.image ? (
          <img src={`${module.image}-thumb.webp`} alt={module.name} className="absolute inset-1 rounded object-cover" />
        ) : (
          <div className={cn('absolute inset-1 rounded flex items-center justify-center text-xs font-mono',
            size === 'epic' ? 'bg-violet-900/50 text-violet-200' :
            size === 'rare' ? 'bg-blue-900/40 text-blue-200' :
            'bg-card text-foreground/70')}>
            {module.name.slice(0, 3).toUpperCase()}
          </div>
        )
      ) : (
        <Plus className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground/50" />
      )}
    </button>
  );

  if (!module) return slotButton;

  return (
    <ModuleTooltip module={module} placement="bottom">
      {slotButton}
    </ModuleTooltip>
  );
}
