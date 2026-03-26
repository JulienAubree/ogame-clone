import { useState } from 'react';
import { categorizeShip, type Mission, type ShipCategory } from '@/config/mission-config';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { cn } from '@/lib/utils';

const COLLAPSED_COUNT = 4;

interface Ship {
  id: string;
  name: string;
  count: number;
  isStationary?: boolean;
}

interface FleetCompositionProps {
  ships: Ship[];
  mission: Mission | null;
  selectedShips: Record<string, number>;
  onChange: (shipId: string, count: number) => void;
}

function ShipCard({ ship, value, onChange, disabled }: {
  ship: Ship;
  value: number;
  onChange: (count: number) => void;
  disabled: boolean;
}) {
  return (
    <div className={cn(
      'retro-card overflow-hidden flex flex-col',
      disabled && 'opacity-40',
    )}>
      <div className="relative h-[130px] overflow-hidden">
        <GameImage
          category="ships"
          id={ship.id}
          size="full"
          alt={ship.name}
          className="w-full h-full object-cover"
        />
        <span className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          x{ship.count.toLocaleString()}
        </span>
      </div>
      <div className="p-2.5 flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-foreground leading-tight line-clamp-2">
          {ship.name}
        </span>
        {disabled ? (
          <span className="text-[10px] text-muted-foreground/60">non disponible</span>
        ) : (
          <div className="flex items-center gap-1.5 w-full">
            <button
              onClick={() => onChange(ship.count)}
              className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 shrink-0"
            >
              MAX
            </button>
            <input
              type="number"
              min={0}
              max={ship.count}
              value={value}
              onChange={(e) => onChange(Math.min(Number(e.target.value) || 0, ship.count))}
              className="flex-1 min-w-0 rounded border border-border bg-background px-1 py-0.5 text-center text-xs font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CollapsibleCardGrid({ ships, selectedShips, onChange, disabled }: {
  ships: Ship[];
  selectedShips: Record<string, number>;
  onChange: (shipId: string, count: number) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? ships : ships.slice(0, COLLAPSED_COUNT);
  const hiddenCount = ships.length - COLLAPSED_COUNT;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {visible.map((ship) => (
          <ShipCard
            key={ship.id}
            ship={ship}
            value={disabled ? 0 : (selectedShips[ship.id] ?? 0)}
            onChange={disabled ? () => {} : (count) => onChange(ship.id, count)}
            disabled={disabled}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? '▲ Réduire' : `▼ Voir ${hiddenCount} de plus`}
        </button>
      )}
    </>
  );
}

export function FleetComposition({ ships, mission, selectedShips, onChange }: FleetCompositionProps) {
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
    const category = categorizeShip(ship.id, ship.count, gameConfig?.missions[mission], { isStationary: ship.isStationary });
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {categorized.required.map((ship) => (
              <ShipCard
                key={ship.id}
                ship={ship}
                value={selectedShips[ship.id] ?? 0}
                onChange={(count) => onChange(ship.id, count)}
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
          <CollapsibleCardGrid
            ships={categorized.optional}
            selectedShips={selectedShips}
            onChange={onChange}
            disabled={false}
          />
        </div>
      )}

      {/* Disabled */}
      {categorized.disabled.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Non disponibles</div>
          <CollapsibleCardGrid
            ships={categorized.disabled}
            selectedShips={selectedShips}
            onChange={onChange}
            disabled
          />
        </div>
      )}
    </div>
  );
}
