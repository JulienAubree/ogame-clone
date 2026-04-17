import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FleetSidebar } from './FleetSidebar';
import { UnitDetailPanel } from './UnitDetailPanel';
import type { DetailedCombatLog, RoundResult, UnitTypeHP } from './types';

interface CombatAnalysisLayoutProps {
  selectedRound: number;
  selectedUnitType: string | null;
  selectedSide: 'attacker' | 'defender';
  expandedUnitId: string | null;
  onSelectUnit: (unitType: string, side: 'attacker' | 'defender') => void;
  onExpandUnit: (unitId: string | null) => void;
  roundResult: RoundResult | undefined;
  detailedLog: DetailedCombatLog | null | undefined;
  attackerFleet: Record<string, number>;
  defenderFleet: Record<string, number>;
  initialAttackerFleet: Record<string, number>;
  initialDefenderFleet: Record<string, number>;
  gameConfig: any;
}

export function CombatAnalysisLayout({
  selectedRound,
  selectedUnitType,
  selectedSide,
  expandedUnitId,
  onSelectUnit,
  onExpandUnit,
  roundResult,
  detailedLog,
  attackerFleet,
  defenderFleet,
  initialAttackerFleet,
  initialDefenderFleet,
  gameConfig,
}: CombatAnalysisLayoutProps) {
  const [mobileTab, setMobileTab] = useState<'attacker' | 'defender'>('attacker');

  const attackerHPByType: Record<string, UnitTypeHP> | undefined =
    roundResult?.attackerHPByType;
  const defenderHPByType: Record<string, UnitTypeHP> | undefined =
    roundResult?.defenderHPByType;

  const initialFleet =
    selectedSide === 'attacker' ? initialAttackerFleet : initialDefenderFleet;

  return (
    <div>
      {/* Mobile: tabs for attacker/defender */}
      <div className="lg:hidden flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setMobileTab('attacker')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
            mobileTab === 'attacker'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-white/5 text-muted-foreground',
          )}
        >
          Attaquant
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('defender')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
            mobileTab === 'defender'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'bg-white/5 text-muted-foreground',
          )}
        >
          Defenseur
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_180px] gap-3 lg:gap-4">
        {/* Left sidebar - attacker */}
        <FleetSidebar
          side="attacker"
          fleet={attackerFleet}
          initialFleet={initialAttackerFleet}
          selectedUnitType={selectedUnitType}
          selectedSide={selectedSide}
          onSelectUnit={onSelectUnit}
          hpByType={attackerHPByType}
          gameConfig={gameConfig}
          hidden={mobileTab !== 'attacker'}
        />

        {/* Center - detail panel */}
        <UnitDetailPanel
          selectedUnitType={selectedUnitType}
          selectedSide={selectedSide}
          selectedRound={selectedRound}
          detailedLog={detailedLog}
          roundResult={roundResult}
          initialFleet={initialFleet}
          gameConfig={gameConfig}
          expandedUnitId={expandedUnitId}
          onExpandUnit={onExpandUnit}
        />

        {/* Right sidebar - defender */}
        <FleetSidebar
          side="defender"
          fleet={defenderFleet}
          initialFleet={initialDefenderFleet}
          selectedUnitType={selectedUnitType}
          selectedSide={selectedSide}
          onSelectUnit={onSelectUnit}
          hpByType={defenderHPByType}
          gameConfig={gameConfig}
          hidden={mobileTab !== 'defender'}
        />
      </div>
    </div>
  );
}
