import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { CombatAnalysisHeader } from '@/components/combat-analysis/CombatAnalysisHeader';
import { CombatTimeline } from '@/components/combat-analysis/CombatTimeline';
import { CombatAnalysisLayout } from '@/components/combat-analysis/CombatAnalysisLayout';
import type { DetailedCombatLog, RoundResult } from '@/components/combat-analysis/types';

export default function CombatAnalysis() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { data: gameConfig } = useGameConfig();

  // State
  const [selectedRound, setSelectedRound] = useState(0);
  const [selectedUnitType, setSelectedUnitType] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<'attacker' | 'defender'>('attacker');
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);

  // Fetch base report data
  const { data: report, isLoading: reportLoading } = trpc.report.detail.useQuery(
    { id: reportId! },
    { enabled: !!reportId },
  );

  // Fetch detailed log (endpoint may not exist yet — cast to avoid blocking)
  const { data: detailedLogData } = (trpc.report as any).detailedLog?.useQuery?.(
    { reportId },
    { enabled: !!reportId },
  ) ?? { data: undefined };
  const detailedLog = detailedLogData as DetailedCombatLog | null | undefined;

  if (reportLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-7xl mx-auto">
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">
          Chargement de l'analyse...
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-7xl mx-auto">
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">
          Rapport introuvable.
        </div>
        <button
          type="button"
          onClick={() => navigate('/reports')}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Retour aux rapports
        </button>
      </div>
    );
  }

  const result = report.result as Record<string, any>;
  const coords = report.coordinates as { galaxy: number; system: number; position: number };
  const outcome = result.outcome as 'attacker' | 'defender' | 'draw';
  const perspective = result.perspective as 'attacker' | 'defender' | undefined;
  const rounds = (result.rounds ?? []) as RoundResult[];
  const totalRounds = rounds.length;

  const attackerFleet = (result.attackerFleet ?? {}) as Record<string, number>;
  const defenderFleet = (result.defenderFleet ?? {}) as Record<string, number>;
  const defenderDefenses = (result.defenderDefenses ?? {}) as Record<string, number>;

  // Initial fleets are the full fleet counts before any losses
  const initialAttackerFleet = attackerFleet;
  const initialDefenderFleet = { ...defenderFleet, ...defenderDefenses };

  // Current fleet counts for the selected round
  const roundResult = selectedRound > 0 ? rounds[selectedRound - 1] : undefined;
  const currentAttackerFleet = roundResult?.attackerShips ?? attackerFleet;
  const currentDefenderFleet = roundResult?.defenderShips ?? initialDefenderFleet;

  const handleSelectUnit = (unitType: string, side: 'attacker' | 'defender') => {
    setSelectedUnitType(unitType);
    setSelectedSide(side);
    setExpandedUnitId(null);
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-7xl mx-auto">
      <CombatAnalysisHeader
        reportId={reportId!}
        coordinates={coords}
        outcome={outcome}
        perspective={perspective}
        attackerFP={result.attackerFP as number | undefined}
        defenderFP={result.defenderFP as number | undefined}
        attackerUsername={result.attackerUsername as string | undefined}
        defenderUsername={result.defenderUsername as string | undefined}
      />

      <CombatTimeline
        rounds={rounds}
        selectedRound={selectedRound}
        onSelectRound={setSelectedRound}
        totalRounds={totalRounds}
      />

      <CombatAnalysisLayout
        selectedRound={selectedRound}
        selectedUnitType={selectedUnitType}
        selectedSide={selectedSide}
        expandedUnitId={expandedUnitId}
        onSelectUnit={handleSelectUnit}
        onExpandUnit={setExpandedUnitId}
        roundResult={roundResult}
        detailedLog={detailedLog}
        attackerFleet={currentAttackerFleet}
        defenderFleet={currentDefenderFleet}
        initialAttackerFleet={initialAttackerFleet}
        initialDefenderFleet={initialDefenderFleet}
        gameConfig={gameConfig}
      />
    </div>
  );
}
