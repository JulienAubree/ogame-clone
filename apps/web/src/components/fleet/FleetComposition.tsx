import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { categorizeShip, type Mission, type ShipCategory } from '@/config/mission-config';
import { useGameConfig } from '@/hooks/useGameConfig';

const COLLAPSED_COUNT = 3;

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

function ShipRow({ ship, value, onChange, disabled }: {
  ship: Ship;
  value: number;
  onChange: (count: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded bg-background/50 px-3 py-1.5">
      <span className={`text-sm ${disabled ? 'text-muted-foreground/40' : ''}`}>{ship.name}</span>
      <div className="flex items-center gap-2">
        {!disabled && ship.count > 0 && (
          <button
            onClick={() => onChange(ship.count)}
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            MAX
          </button>
        )}
        {disabled ? (
          <span className="text-xs text-muted-foreground/40">
            {ship.count === 0 ? '0 dispo' : 'non disponible'}
          </span>
        ) : (
          <>
            <Input
              type="number"
              min={0}
              max={ship.count}
              value={value}
              onChange={(e) => onChange(Math.min(Number(e.target.value) || 0, ship.count))}
              className="h-7 w-20 text-center text-sm"
            />
            <span className="text-xs text-muted-foreground">/{ship.count}</span>
          </>
        )}
      </div>
    </div>
  );
}

function CollapsibleShipList({ ships, selectedShips, onChange, disabled }: {
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
      <div className="space-y-1">
        {visible.map((ship) => (
          <ShipRow
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
          className="mt-1 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
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
    const category = categorizeShip(ship.id, ship.count, gameConfig?.missions[mission], { isStationary: ship.isStationary });
    categorized[category].push(ship);
  }

  const sectionLabel = config?.requiredShipRoles ? '★ Requis' : '★ Recommandés';
  const showRequired = categorized.required.length > 0;

  return (
    <div className="space-y-2">
      {/* Required / Recommended */}
      {showRequired && (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3">
          <div className="mb-2 text-xs font-medium uppercase text-emerald-400">{sectionLabel}</div>
          <div className="space-y-1">
            {categorized.required.map((ship) => (
              <ShipRow
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
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Optionnels</div>
          <CollapsibleShipList
            ships={categorized.optional}
            selectedShips={selectedShips}
            onChange={onChange}
            disabled={false}
          />
        </div>
      )}

      {/* Disabled */}
      {categorized.disabled.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/50 p-3 opacity-50">
          <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Non disponibles</div>
          <CollapsibleShipList
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
