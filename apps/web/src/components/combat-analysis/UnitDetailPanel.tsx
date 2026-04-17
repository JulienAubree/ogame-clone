import { getUnitName } from '@/lib/entity-names';
import { DamagePanel } from './DamagePanel';
import { DeathsList } from './DeathsList';
import { UnitGrid } from './UnitGrid';
import type { CombatEvent, UnitSnapshot, DetailedCombatLog, RoundResult, UnitTypeHP } from './types';

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

interface UnitDetailPanelProps {
  selectedUnitType: string | null;
  selectedSide: 'attacker' | 'defender';
  selectedRound: number;
  detailedLog: DetailedCombatLog | null | undefined;
  roundResult: RoundResult | undefined;
  initialFleet: Record<string, number>;
  gameConfig: any;
  expandedUnitId: string | null;
  onExpandUnit: (unitId: string | null) => void;
}

export function UnitDetailPanel({
  selectedUnitType,
  selectedSide,
  selectedRound,
  detailedLog,
  roundResult,
  initialFleet,
  gameConfig,
  expandedUnitId,
  onExpandUnit,
}: UnitDetailPanelProps) {
  if (!selectedUnitType) {
    return (
      <div className="glass-card flex items-center justify-center p-8 min-h-[300px]">
        <div className="text-center space-y-2">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto text-muted-foreground/40"
          >
            <path d="M21 21H4.6c-.56 0-.84 0-1.054-.109a1 1 0 0 1-.437-.437C3 20.24 3 19.96 3 19.4V3" />
            <path d="m7 14 4-4 4 4 6-6" />
          </svg>
          <p className="text-sm text-muted-foreground">
            Selectionnez un type d'unite pour voir le detail
          </p>
        </div>
      </div>
    );
  }

  const unitName = getUnitName(selectedUnitType, gameConfig);
  const initialCount = initialFleet[selectedUnitType] ?? 0;

  // Get HP data from round result
  const hpByType: Record<string, UnitTypeHP> | undefined =
    selectedSide === 'attacker'
      ? roundResult?.attackerHPByType
      : roundResult?.defenderHPByType;
  const hp = hpByType?.[selectedUnitType];

  // Get current surviving count from round result
  const currentFleet =
    selectedSide === 'attacker'
      ? roundResult?.attackerShips
      : roundResult?.defenderShips;
  const survivingCount = currentFleet?.[selectedUnitType] ?? 0;

  // Events for this round
  const events: CombatEvent[] = detailedLog?.events ?? [];

  // Compute total damage dealt and received by this unit type this round
  const roundEvents = events.filter((e) => e.round === selectedRound);
  const damageDealt = roundEvents
    .filter((e) => e.shooterType === selectedUnitType)
    .reduce((sum, e) => sum + e.damage, 0);
  const damageReceived = roundEvents
    .filter((e) => e.targetType === selectedUnitType)
    .reduce((sum, e) => sum + e.damage, 0);
  const losses = roundEvents.filter(
    (e) => e.targetType === selectedUnitType && e.targetDestroyed,
  ).length;

  // Snapshots for the selected round
  const snapshots: UnitSnapshot[] =
    detailedLog?.snapshots?.[selectedRound] ?? [];
  const sideSnapshots = snapshots.filter((s) => s.side === selectedSide);

  const roundLabel = selectedRound === 0 ? 'Deploiement' : `Round ${selectedRound}`;

  return (
    <div className="glass-card p-4 space-y-4 min-h-[300px]">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-foreground">{unitName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {survivingCount} survivants / {initialCount} engages — {roundLabel}
            </p>
          </div>
          {selectedRound > 0 && (
            <div className="flex gap-3 text-center">
              <div>
                <div className="text-lg font-bold text-emerald-400">{fmt(damageDealt)}</div>
                <div className="text-[10px] text-muted-foreground">Infliges</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-400">{fmt(damageReceived)}</div>
                <div className="text-[10px] text-muted-foreground">Subis</div>
              </div>
              {losses > 0 && (
                <div>
                  <div className="text-lg font-bold text-red-400">{losses}</div>
                  <div className="text-[10px] text-muted-foreground">Pertes</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* HP bars */}
      {hp && (
        <div className="grid grid-cols-2 gap-3">
          {/* Shield */}
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-cyan-400 font-semibold uppercase tracking-wider">
                Bouclier
              </span>
              <span className="text-muted-foreground font-mono">
                {fmt(hp.shieldRemaining)} / {fmt(hp.shieldMax)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-500/70 transition-all"
                style={{
                  width: `${hp.shieldMax > 0 ? (hp.shieldRemaining / hp.shieldMax) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          {/* Hull */}
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-orange-400 font-semibold uppercase tracking-wider">Coque</span>
              <span className="text-muted-foreground font-mono">
                {fmt(hp.hullRemaining)} / {fmt(hp.hullMax)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-orange-500/70 transition-all"
                style={{
                  width: `${hp.hullMax > 0 ? (hp.hullRemaining / hp.hullMax) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Damage panels (only for rounds > 0) */}
      {selectedRound > 0 && events.length > 0 && (
        <DamagePanel
          events={events}
          unitType={selectedUnitType}
          round={selectedRound}
          side={selectedSide}
          gameConfig={gameConfig}
        />
      )}

      {/* Deaths list */}
      {selectedRound > 0 && (
        <DeathsList
          events={events}
          unitType={selectedUnitType}
          round={selectedRound}
          gameConfig={gameConfig}
        />
      )}

      {/* Unit grid (individual units) */}
      {sideSnapshots.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Unites individuelles
          </div>
          <UnitGrid
            snapshots={sideSnapshots}
            events={events}
            unitType={selectedUnitType}
            round={selectedRound}
            expandedUnitId={expandedUnitId}
            onExpandUnit={onExpandUnit}
            gameConfig={gameConfig}
          />
        </div>
      )}
    </div>
  );
}
