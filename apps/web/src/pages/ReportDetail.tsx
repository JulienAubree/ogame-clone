// apps/web/src/pages/ReportDetail.tsx
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName } from '@/lib/entity-names';
import { CombatReportDetail } from '@/components/reports/CombatReportDetail';
import { MineReportDetail } from '@/components/reports/MineReportDetail';
import { SpyReportDetail } from '@/components/reports/SpyReportDetail';
import { RecycleReportDetail } from '@/components/reports/RecycleReportDetail';
import { ExploreReportDetail } from '@/components/reports/ExploreReportDetail';
import { TradeReportDetail } from '@/components/reports/TradeReportDetail';
import { CoordsLink } from '@/components/common/CoordsLink';

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function formatCoords(coords: { galaxy: number; system: number; position: number }) {
  return `[${coords.galaxy}:${coords.system}:${coords.position}]`;
}

export default function ReportDetail() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { data: gameConfig } = useGameConfig();
  const utils = trpc.useUtils();

  const { data: report, isLoading } = trpc.report.detail.useQuery(
    { id: reportId! },
    { enabled: !!reportId },
  );

  // When report is loaded, the backend marks it as read — invalidate unread counts
  useEffect(() => {
    if (report) {
      utils.report.unreadCount.invalidate();
      utils.report.list.invalidate();
    }
  }, [report?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteMutation = trpc.report.delete.useMutation({
    onSuccess: () => {
      utils.report.list.invalidate();
      utils.report.unreadCount.invalidate();
      navigate('/reports');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Rapport" />
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Rapport" />
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">Rapport introuvable.</div>
        <Button variant="outline" size="sm" onClick={() => navigate('/reports')}>← Rapports</Button>
      </div>
    );
  }

  const result = report.result as Record<string, any>;
  const coords = report.coordinates as { galaxy: number; system: number; position: number };
  const origin = report.originCoordinates as { galaxy: number; system: number; position: number; planetName: string } | null;
  const fleet = report.fleet as { ships: Record<string, number>; totalCargo: number };
  const isCombat = report.missionType === 'attack' || report.missionType === 'pirate';

  const perspective = result.perspective as 'attacker' | 'defender' | undefined;
  const isPlayerVictory = !isCombat
    ? null
    : result.outcome === 'draw'
      ? null
      : perspective === 'defender'
        ? result.outcome === 'defender'
        : result.outcome === 'attacker'; // attacker perspective or undefined (backward compat)
  const outcomeLabel = !isCombat
    ? null
    : isPlayerVictory === null ? 'Match nul' : isPlayerVictory ? 'Victoire' : 'Défaite';
  const outcomeBg = !isCombat
    ? ''
    : isPlayerVictory === null ? 'bg-amber-500/20 text-amber-400'
    : isPlayerVictory ? 'bg-emerald-500/20 text-emerald-400'
    : 'bg-red-500/20 text-red-400';

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
          ← Rapports
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">{report.title}</h1>
          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
            <div>
              Cible : <CoordsLink galaxy={coords.galaxy} system={coords.system} position={coords.position} />
              {origin && <> — Origine : {origin.planetName} <CoordsLink galaxy={origin.galaxy} system={origin.system} position={origin.position} /></>}
            </div>
            <div>{formatDate(report.completionTime)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {outcomeLabel && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${outcomeBg}`}>
              {outcomeLabel}
            </span>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleteMutation.mutate({ id: report.id })}
            disabled={deleteMutation.isPending}
          >
            Supprimer
          </Button>
        </div>
      </div>

      {/* Scan: flagship info */}
      {report.missionType === 'scan' && result.scanner && (
        <div className="glass-card p-4 border border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-cyan-300">{result.scanner.name}</div>
              <div className="text-[11px] text-muted-foreground">
                Scan instantane (+{result.scanner.espionageBonus ?? 5} espionnage)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fleet summary (if non-empty) */}
      {Object.keys(fleet.ships).length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flotte envoyée</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(fleet.ships).map(([ship, count]) => (
              <span key={ship} className="text-sm">
                <span className="text-foreground font-medium">{String(count)}x</span>{' '}
                <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Capacité cargo : {fleet.totalCargo.toLocaleString('fr-FR')}
          </div>
        </div>
      )}

      {/* Type-specific detail */}
      {(report.missionType === 'attack' || report.missionType === 'pirate') && (
        <CombatReportDetail
          result={result}
          missionType={report.missionType as 'attack' | 'pirate'}
          gameConfig={gameConfig}
          coordinates={coords}
        />
      )}
      {report.missionType === 'mine' && (
        <MineReportDetail result={result} fleet={fleet} gameConfig={gameConfig} />
      )}
      {(report.missionType === 'spy' || report.missionType === 'scan') && (
        <SpyReportDetail result={result} gameConfig={gameConfig} coordinates={coords} />
      )}
      {report.missionType === 'recycle' && (
        <RecycleReportDetail result={result} coordinates={coords} />
      )}
      {report.missionType === 'explore' && (
        <ExploreReportDetail result={result} coordinates={coords} />
      )}
      {report.missionType === 'trade' && result.type === 'report-purchase' && (
        <TradeReportDetail result={result} />
      )}
    </div>
  );
}
