import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

const MISSION_TYPE_LABELS: Record<string, string> = {
  mine: 'Minage',
  transport: 'Transport',
  spy: 'Espionnage',
  attack: 'Attaque',
  pirate: 'Pirate',
  colonize: 'Colonisation',
  recycle: 'Recyclage',
  station: 'Stationnement',
};

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function formatCoords(coords: { galaxy: number; system: number; position: number }) {
  return `[${coords.galaxy}:${coords.system}:${coords.position}]`;
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const loaderRef = useRef<HTMLDivElement>(null);
  const lastAppendedCursorRef = useRef<string | undefined>(undefined);

  const currentCursor = cursors[cursors.length - 1];

  const { data, isFetching } = trpc.report.list.useQuery(
    { cursor: currentCursor, limit: 20, missionTypes: typeFilter.length > 0 ? typeFilter as any : undefined },
    { placeholderData: (prev: any) => prev },
  );

  const pages = useRef<Map<string | undefined, any[]>>(new Map());
  if (data && data.reports.length > 0) {
    pages.current.set(currentCursor, data.reports);
  }

  const handleFilterChange = (type: string) => {
    setTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    pages.current.clear();
    setCursors([undefined]);
    lastAppendedCursorRef.current = undefined;
  };

  const handleLoadMore = useCallback(() => {
    if (data?.nextCursor && !isFetching && lastAppendedCursorRef.current !== data.nextCursor) {
      lastAppendedCursorRef.current = data.nextCursor;
      setCursors((prev) => [...prev, data.nextCursor]);
    }
  }, [data?.nextCursor, isFetching]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore(); },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  const allReports = Array.from(pages.current.values()).flat();
  const hasMore = !!data?.nextCursor;

  const { data: selectedReport } = trpc.report.detail.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId },
  );

  const utils = trpc.useUtils();
  const deleteMutation = trpc.report.delete.useMutation({
    onSuccess: () => {
      pages.current.clear();
      setCursors([undefined]);
      lastAppendedCursorRef.current = undefined;
      utils.report.list.invalidate();
      setSearchParams({});
    },
  });

  useEffect(() => {
    if (!selectedId && allReports.length > 0 && window.innerWidth >= 1024) {
      setSearchParams({ id: allReports[0].id });
    }
  }, [allReports.length]);

  const selectReport = (id: string) => setSearchParams({ id });

  /* ---- Shared sub-components ---- */

  const filterPills = (
    <div className="flex flex-wrap gap-2">
      {Object.entries(MISSION_TYPE_LABELS).map(([type, label]) => (
        <button
          key={type}
          onClick={() => handleFilterChange(type)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
            typeFilter.includes(type)
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const reportList = (
    <section className="glass-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Rapports</h2>
      <div className="space-y-1">
        {isFetching && allReports.length === 0 && (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        )}
        {!isFetching && allReports.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun rapport.</p>
        )}
        {allReports.map((report) => (
          <button
            key={report.id}
            onClick={() => selectReport(report.id)}
            className={`w-full text-left rounded px-3 py-2 text-sm transition-colors ${
              report.id === selectedId ? 'bg-primary/10' : 'hover:bg-accent'
            } ${!report.read ? 'font-bold' : ''}`}
          >
            <div className="flex justify-between">
              <span className="truncate">{report.title}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                {new Date(report.createdAt).toLocaleDateString('fr-FR')}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {MISSION_TYPE_LABELS[report.missionType] ?? report.missionType}
            </div>
          </button>
        ))}
        {hasMore && (
          <div ref={loaderRef} className="flex justify-center py-2">
            {isFetching && <span className="text-xs text-muted-foreground">Chargement...</span>}
          </div>
        )}
      </div>
    </section>
  );

  const reportDetail = selectedId && selectedReport ? (
    <section className="glass-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-foreground">{selectedReport.title}</h2>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => deleteMutation.mutate({ id: selectedReport.id })}
          disabled={deleteMutation.isPending}
        >
          Supprimer
        </Button>
      </div>
      <div className="text-xs text-muted-foreground mb-4">
        {MISSION_TYPE_LABELS[selectedReport.missionType]} — Cible : {formatCoords(selectedReport.coordinates as any)}
        {!!(selectedReport.originCoordinates as any) && (
          <> — Origine : {(selectedReport.originCoordinates as any).planetName} {formatCoords(selectedReport.originCoordinates as any)}</>
        )}
      </div>
      <div className="text-xs text-muted-foreground mb-4">
        Envoi : {formatDate(selectedReport.departureTime)} — Fin : {formatDate(selectedReport.completionTime)}
      </div>

      <div className="space-y-4">
        {/* Fleet */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flotte</h3>
          <div className="rounded border border-border p-3">
            <div className="flex flex-wrap gap-3">
              {Object.entries((selectedReport.fleet as any).ships).map(([ship, count]) => (
                <span key={ship} className="text-sm">
                  <span className="text-foreground">{String(count)}x</span>{' '}
                  <span className="text-muted-foreground">{ship}</span>
                </span>
              ))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Capacite cargo : {((selectedReport.fleet as any).totalCargo ?? 0).toLocaleString('fr-FR')}
            </div>
          </div>
        </div>

        {/* Mine-specific results */}
        {selectedReport.missionType === 'mine' && (() => {
          const result = selectedReport.result as any;
          return (
            <>
              {/* Resources */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ressources extraites</h3>
                <div className="rounded border border-border p-3">
                  <div className="flex flex-wrap gap-4">
                    {Object.entries(result.rewards ?? {}).map(([resource, amount]) => (
                      <div key={resource} className="flex items-center gap-2">
                        <span className={cn('text-lg font-bold', RESOURCE_COLORS[resource])}>
                          +{(amount as number).toLocaleString('fr-FR')}
                        </span>
                        <span className="text-sm text-muted-foreground capitalize">{resource}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Slag */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Scories</h3>
                <div className="rounded border border-border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500/70"
                        style={{ width: `${Math.round((result.slagRate ?? 0) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-amber-400">
                      {Math.round((result.slagRate ?? 0) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Technologies */}
              {result.technologies?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Technologies</h3>
                  <div className="rounded border border-border p-3 space-y-2">
                    {result.technologies.map((tech: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">
                          {tech.name === 'deepSpaceRefining' ? 'Raffinage spatial profond' : 'Bonus de minage'}
                          {tech.level != null && <span className="text-primary ml-1">Niv. {tech.level}</span>}
                        </span>
                        <span className="text-muted-foreground">{tech.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </section>
  ) : null;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Rapports de mission" />

      {/* Filter pills */}
      {filterPills}

      {/* Main layout: mobile=stack, lg=2col */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_1.5fr]">
        {/* Report list */}
        {reportList}

        {/* Detail panel (lg+ desktop) */}
        <div className="hidden lg:block">
          {reportDetail ?? (
            <div className="glass-card p-8 text-center text-sm text-muted-foreground">
              Selectionnez un rapport pour voir les details
            </div>
          )}
        </div>
      </div>

      {/* Mobile/tablet detail overlay (below lg) */}
      {selectedId && selectedReport && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/95 overflow-y-auto p-4 animate-slide-up">
          <Button
            variant="outline"
            size="sm"
            className="mb-4"
            onClick={() => setSearchParams({})}
          >
            ← Retour
          </Button>
          {reportDetail}
        </div>
      )}
    </div>
  );
}
