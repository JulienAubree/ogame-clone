import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { GameImage } from '@/components/common/GameImage';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

type Ship = {
  id: string;
  name: string;
  count: number;
  timePerUnit: number;
  cost: { minerai: number; silicium: number; hydrogene: number };
  prerequisitesMet: boolean;
};

interface ShipMobileRowProps {
  ship: Ship;
  quantity: number;
  maxAffordable: number;
  canAfford: boolean;
  highlighted: boolean;
  buildPending: boolean;
  onQuantityChange: (value: number) => void;
  onBuild: () => void;
  onOpenDetail: () => void;
}

export function ShipMobileRow({
  ship,
  quantity,
  maxAffordable,
  canAfford,
  highlighted,
  buildPending,
  onQuantityChange,
  onBuild,
  onOpenDetail,
}: ShipMobileRowProps) {
  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className={cn(
        'relative flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50 transition-colors',
        !ship.prerequisitesMet && 'opacity-50',
        highlighted && 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10',
      )}
    >
      {highlighted && (
        <span className="absolute top-2 right-2 z-10 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
          Objectif
        </span>
      )}
      <GameImage category="ships" id={ship.id} size="icon" alt={ship.name} className="h-8 w-8 rounded" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium truncate">{ship.name}</span>
          <span className="text-xs text-muted-foreground">x{ship.count}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <ResourceCost minerai={ship.cost.minerai} silicium={ship.cost.silicium} hydrogene={ship.cost.hydrogene} />
          <span className="font-mono text-[10px] shrink-0">{formatDuration(ship.timePerUnit)}</span>
        </div>
      </div>
      {ship.prerequisitesMet && (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <QuantityStepper value={quantity} onChange={onQuantityChange} max={maxAffordable} showMax={false} />
          <Button
            size="sm"
            className="h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onBuild();
            }}
            disabled={!canAfford || buildPending}
          >
            OK
          </Button>
        </div>
      )}
    </button>
  );
}
