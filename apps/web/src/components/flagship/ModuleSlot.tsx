import { Plus, X } from 'lucide-react';
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

const SIZE_CLASSES: Record<Props['size'], string> = {
  epic: 'h-16 w-16 sm:h-20 sm:w-20',
  rare: 'h-14 w-14 sm:h-16 sm:w-16',
  common: 'h-12 w-12 sm:h-14 sm:w-14',
};

const RARITY_DOT: Record<string, string> = {
  epic: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.5)]',
  rare: 'bg-blue-400',
  common: 'bg-gray-400',
};

export function ModuleSlot({ size, module, onClick, onUnequip }: Props) {
  const rarity = (module?.rarity ?? size) as 'epic' | 'rare' | 'common';
  const slotButton = (
    <button
      type="button"
      onClick={module && onUnequip ? onUnequip : onClick}
      className={cn(
        'group relative rounded-md border border-border/40 bg-card/50 transition-colors overflow-hidden',
        'hover:bg-card/80 hover:border-border/60',
        SIZE_CLASSES[size],
        !module && 'border-dashed',
        size === 'epic' && 'ring-1 ring-violet-500/20 shadow-sm shadow-violet-500/10',
      )}
      aria-label={module ? `${module.name} — clic pour déséquiper` : 'Clic pour équiper'}
    >
      {/* V8.7 — Image full-bleed (cohérent avec ArsenalLoadoutGrid) */}
      {module ? (
        module.image ? (
          <img
            src={`${module.image}-thumb.webp`}
            alt={module.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20 text-[10px] font-mono text-foreground/70">
            {module.name.slice(0, 3).toUpperCase()}
          </div>
        )
      ) : (
        <Plus className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground/40" />
      )}

      {/* Rarity indicator dot — top-left, z-10 pour passer au-dessus de l'image */}
      {module && (
        <span
          className={cn(
            'absolute top-1 left-1 z-10 h-1.5 w-1.5 rounded-full',
            RARITY_DOT[rarity] ?? RARITY_DOT.common,
          )}
          aria-hidden
        />
      )}

      {/* V8.4 — Unequip cross at top-right, visible on hover, z-10 au-dessus de l'image */}
      {module && onUnequip && (
        <span
          className={cn(
            'absolute top-0.5 right-0.5 z-10 h-4 w-4 rounded-full',
            'flex items-center justify-center',
            'bg-rose-500/90 text-white shadow-md',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'pointer-events-none',
          )}
          aria-hidden
        >
          <X className="h-2.5 w-2.5" />
        </span>
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
