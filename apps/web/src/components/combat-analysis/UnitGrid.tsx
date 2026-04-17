import { UnitCard } from './UnitCard';
import type { CombatEvent, UnitSnapshot } from './types';

interface UnitGridProps {
  snapshots: UnitSnapshot[];
  events: CombatEvent[];
  unitType: string;
  round: number;
  expandedUnitId: string | null;
  onExpandUnit: (unitId: string | null) => void;
  gameConfig: any;
}

export function UnitGrid({
  snapshots,
  events,
  unitType,
  round,
  expandedUnitId,
  onExpandUnit,
  gameConfig,
}: UnitGridProps) {
  // Filter snapshots for the selected unit type
  const typeSnapshots = snapshots.filter((s) => s.unitType === unitType);

  // Sort: surviving first (by hull desc), then destroyed
  const sorted = [...typeSnapshots].sort((a, b) => {
    if (a.destroyed !== b.destroyed) return a.destroyed ? 1 : -1;
    return b.hull - a.hull;
  });

  // Max hull for percentage calculation
  const maxHull = sorted.reduce((max, s) => Math.max(max, s.hull), 0) || 1;

  if (sorted.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        Aucune donnee unitaire disponible
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {sorted.map((snapshot) => (
        <UnitCard
          key={snapshot.unitId}
          snapshot={snapshot}
          events={events}
          round={round}
          expanded={expandedUnitId === snapshot.unitId}
          onToggle={() =>
            onExpandUnit(expandedUnitId === snapshot.unitId ? null : snapshot.unitId)
          }
          maxHull={maxHull}
          gameConfig={gameConfig}
        />
      ))}
    </div>
  );
}
