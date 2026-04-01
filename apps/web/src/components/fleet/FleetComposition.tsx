import { categorizeShip, type Mission, type ShipCategory } from '@/config/mission-config';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { getFlagshipImageUrl } from '@/lib/assets';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { cn } from '@/lib/utils';

interface Ship {
  id: string;
  name: string;
  count: number;
  isStationary?: boolean;
  role?: string | null;
  flagshipImageIndex?: number;
}

interface FleetCompositionProps {
  ships: Ship[];
  mission: Mission | null;
  selectedShips: Record<string, number>;
  onChange: (shipId: string, count: number) => void;
  onToggle: (shipId: string) => void;
}

function ShipCard({ ship, value, onChange, onToggle, disabled }: {
  ship: Ship;
  value: number;
  onChange: (count: number) => void;
  onToggle: () => void;
  disabled: boolean;
}) {
  const isSelected = !disabled && value > 0;
  const isConflict = disabled && value > 0;
  const isClickable = !disabled || isConflict;
  return (
    <div
      role={isClickable ? 'button' : undefined}
      onClick={isClickable ? onToggle : undefined}
      className={cn(
        'retro-card overflow-hidden flex flex-col',
        disabled && !isConflict && 'opacity-40',
        isClickable && 'cursor-pointer',
        isSelected && 'border-primary',
        isConflict && 'border-destructive',
      )}
    >
      <div className="relative h-24 overflow-hidden">
        {ship.id === 'flagship' && ship.flagshipImageIndex != null ? (
          <img
            src={getFlagshipImageUrl(ship.flagshipImageIndex, 'full')}
            alt={ship.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <GameImage
            category="ships"
            id={ship.id}
            size="full"
            alt={ship.name}
            className="w-full h-full object-cover"
          />
        )}
        <span className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          x{ship.count.toLocaleString()}
        </span>
        {isSelected && (
          <div className="absolute top-2 left-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md">
            <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
        {isConflict && (
          <div className="absolute top-2 left-2 h-5 w-5 rounded-full bg-destructive flex items-center justify-center shadow-md">
            <svg className="h-3 w-3 text-destructive-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[13px] font-semibold text-foreground leading-tight line-clamp-2">
          {ship.name}
        </span>
        {isConflict ? (
          <span className="text-[10px] text-destructive">x{value} — incompatible</span>
        ) : disabled ? (
          <span className="text-[10px] text-muted-foreground/60">non disponible</span>
        ) : isSelected ? (
          <QuantityStepper
            value={value}
            onChange={onChange}
            min={1}
            max={ship.count}
          />
        ) : null}
      </div>
    </div>
  );
}

function ShipCardGrid({ ships, selectedShips, onChange, onToggle, disabled }: {
  ships: Ship[];
  selectedShips: Record<string, number>;
  onChange: (shipId: string, count: number) => void;
  onToggle: (shipId: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
      {ships.map((ship) => (
        <ShipCard
          key={ship.id}
          ship={ship}
          value={selectedShips[ship.id] ?? 0}
          onChange={disabled ? () => {} : (count) => onChange(ship.id, count)}
          onToggle={() => onToggle(ship.id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

export function FleetComposition({ ships, mission, selectedShips, onChange, onToggle }: FleetCompositionProps) {
  const { data: gameConfig } = useGameConfig();

  if (!mission) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
        Sélectionnez une mission pour voir les vaisseaux disponibles
      </div>
    );
  }

  const config = gameConfig?.missions[mission];
  const categorized: Record<ShipCategory, Ship[]> = { required: [], optional: [], disabled: [] };

  for (const ship of ships) {
    if (ship.count === 0) continue;
    const category = categorizeShip(ship.id, ship.count, gameConfig?.missions[mission], { isStationary: ship.isStationary, role: ship.role });
    categorized[category].push(ship);
  }

  const sectionLabel = config?.requiredShipRoles ? '★ Requis' : '★ Recommandés';
  const showRequired = categorized.required.length > 0;

  return (
    <div className="space-y-3">
      {/* Required / Recommended */}
      {showRequired && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">{sectionLabel}</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {categorized.required.map((ship) => (
              <ShipCard
                key={ship.id}
                ship={ship}
                value={selectedShips[ship.id] ?? 0}
                onChange={(count) => onChange(ship.id, count)}
                onToggle={() => onToggle(ship.id)}
                disabled={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Optional */}
      {categorized.optional.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Optionnels</div>
          <ShipCardGrid
            ships={categorized.optional}
            selectedShips={selectedShips}
            onChange={onChange}
            onToggle={onToggle}
            disabled={false}
          />
        </div>
      )}

      {/* Disabled */}
      {categorized.disabled.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Non disponibles</div>
          <ShipCardGrid
            ships={categorized.disabled}
            selectedShips={selectedShips}
            onChange={onChange}
            onToggle={onToggle}
            disabled
          />
        </div>
      )}
    </div>
  );
}
