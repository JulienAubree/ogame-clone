import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { trpc } from '@/trpc';
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

  // Accumulate reports from all pages (same pattern as History.tsx)
  const pages = useRef<Map<string | undefined, any[]>>(new Map());
  if (data && data.reports.length > 0) {
    pages.current.set(currentCursor, data.reports);
  }

  // Reset on filter change
  const handleFilterChange = (type: string) => {
    setTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    pages.current.clear();
    setCursors([undefined]);
    lastAppendedCursorRef.current = undefined;
  };

  // Load more
  const handleLoadMore = useCallback(() => {
    if (data?.nextCursor && !isFetching && lastAppendedCursorRef.current !== data.nextCursor) {
      lastAppendedCursorRef.current = data.nextCursor;
      setCursors((prev) => [...prev, data.nextCursor]);
    }
  }, [data?.nextCursor, isFetching]);

  // Infinite scroll observer
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

  // Auto-select first report on desktop
  useEffect(() => {
    if (!selectedId && allReports.length > 0 && window.innerWidth >= 768) {
      setSearchParams({ id: allReports[0].id });
    }
  }, [allReports.length]);

  const selectReport = (id: string) => setSearchParams({ id });

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Rapports de mission" description="Consultez les resultats de vos missions" />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 px-4 py-2">
        {Object.entries(MISSION_TYPE_LABELS).map(([type, label]) => (
          <button
            key={type}
            onClick={() => handleFilterChange(type)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              typeFilter.includes(type)
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'bg-card/60 text-muted-foreground border border-white/10 hover:bg-accent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Report list */}
        <div className={cn(
          'flex flex-col overflow-y-auto border-r border-white/10',
          selectedId ? 'hidden md:flex md:w-1/3 lg:w-1/4' : 'w-full',
        )}>
          {isFetching && allReports.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">Chargement...</div>
          )}
          {!isFetching && allReports.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">Aucun rapport</div>
          )}
          {allReports.map((report) => (
            <button
              key={report.id}
              onClick={() => selectReport(report.id)}
              className={cn(
                'flex flex-col gap-1 border-b border-white/5 p-3 text-left transition-colors',
                report.id === selectedId
                  ? 'bg-primary/10 border-l-2 border-l-primary'
                  : 'hover:bg-accent/50',
                !report.read && 'font-semibold',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-primary/80">
                  {MISSION_TYPE_LABELS[report.missionType] ?? report.missionType}
                </span>
                {!report.read && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              <span className="text-sm truncate">{report.title}</span>
              <span className="text-xs text-muted-foreground">{formatDate(report.createdAt)}</span>
            </button>
          ))}
          {hasMore && (
            <div ref={loaderRef} className="flex justify-center p-4">
              {isFetching && <span className="text-xs text-muted-foreground">Chargement...</span>}
            </div>
          )}
        </div>

        {/* Report detail */}
        {selectedId && selectedReport ? (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
            {/* Back button (mobile) */}
            <button
              onClick={() => setSearchParams({})}
              className="mb-4 text-sm text-primary hover:underline md:hidden"
            >
              ← Retour a la liste
            </button>

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-lg font-bold">{selectedReport.title}</h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{MISSION_TYPE_LABELS[selectedReport.missionType]}</span>
                <span>Cible : {formatCoords(selectedReport.coordinates as any)}</span>
                {!!(selectedReport.originCoordinates as any) && (
                  <span>Origine : {(selectedReport.originCoordinates as any).planetName} {formatCoords(selectedReport.originCoordinates as any)}</span>
                )}
                <span>Envoi : {formatDate(selectedReport.departureTime)}</span>
                <span>Fin : {formatDate(selectedReport.completionTime)}</span>
              </div>
            </div>

            {/* Fleet */}
            <section className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Flotte</h3>
              <div className="glass-card p-4">
                <div className="flex flex-wrap gap-3">
                  {Object.entries((selectedReport.fleet as any).ships).map(([ship, count]) => (
                    <div key={ship} className="flex items-center gap-1 text-sm">
                      <span className="text-foreground">{String(count)}x</span>
                      <span className="text-muted-foreground">{ship}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Capacite cargo : {((selectedReport.fleet as any).totalCargo ?? 0).toLocaleString('fr-FR')}
                </div>
              </div>
            </section>

            {/* Results (mine-specific) */}
            {selectedReport.missionType === 'mine' && (() => {
              const result = selectedReport.result as any;
              return (
                <>
                  <section className="mb-6">
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Ressources extraites</h3>
                    <div className="glass-card p-4">
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
                  </section>

                  {/* Slag */}
                  <section className="mb-6">
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Scories</h3>
                    <div className="glass-card p-4">
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
                  </section>

                  {/* Technologies */}
                  {result.technologies?.length > 0 && (
                    <section className="mb-6">
                      <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Technologies</h3>
                      <div className="glass-card p-4">
                        <ul className="space-y-2">
                          {result.technologies.map((tech: any, i: number) => (
                            <li key={i} className="flex items-center justify-between text-sm">
                              <span className="text-foreground">
                                {tech.name === 'deepSpaceRefining' ? 'Raffinage spatial profond' : 'Bonus de minage'}
                                {tech.level != null && <span className="text-primary ml-1">Niv. {tech.level}</span>}
                              </span>
                              <span className="text-muted-foreground">{tech.description}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </section>
                  )}
                </>
              );
            })()}

            {/* Delete */}
            <div className="mt-auto pt-4">
              <button
                onClick={() => deleteMutation.mutate({ id: selectedReport.id })}
                className="text-xs text-destructive hover:underline"
              >
                Supprimer ce rapport
              </button>
            </div>
          </div>
        ) : !selectedId ? (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Selectionnez un rapport
          </div>
        ) : null}
      </div>
    </div>
  );
}
