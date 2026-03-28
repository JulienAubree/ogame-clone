// apps/web/src/pages/Reports.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { ReportCard } from '@/components/reports/ReportCard';

const FILTER_OPTIONS = [
  { label: 'Tous', types: [] },
  { label: 'Combat', types: ['attack', 'pirate'] },
  { label: 'Mine', types: ['mine'] },
  { label: 'Recyclage', types: ['recycle'] },
  { label: 'Espionnage', types: ['spy'] },
];

export default function Reports() {
  const [activeFilter, setActiveFilter] = useState(0);
  const { data: gameConfig } = useGameConfig();
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const loaderRef = useRef<HTMLDivElement>(null);
  const lastAppendedCursorRef = useRef<string | undefined>(undefined);
  const utils = trpc.useUtils();

  const typeFilter = FILTER_OPTIONS[activeFilter].types;
  const currentCursor = cursors[cursors.length - 1];

  const { data, isFetching } = trpc.report.list.useQuery(
    { cursor: currentCursor, limit: 20, missionTypes: typeFilter.length > 0 ? typeFilter as any : undefined },
    { placeholderData: (prev: any) => prev },
  );

  const { data: unreadData } = trpc.report.unreadCount.useQuery();

  const markAllReadMutation = trpc.report.markAllRead.useMutation({
    onSuccess: () => {
      utils.report.list.invalidate();
      utils.report.unreadCount.invalidate();
    },
  });

  const pages = useRef<Map<string | undefined, any[]>>(new Map());
  if (data && data.reports.length > 0) {
    pages.current.set(currentCursor, data.reports);
  }

  const handleFilterChange = (index: number) => {
    setActiveFilter(index);
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
  const unreadCount = unreadData?.count ?? 0;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <PageHeader title="Rapports" />
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            Tout marquer comme lu ({unreadCount})
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option, i) => (
          <button
            key={option.label}
            type="button"
            onClick={() => handleFilterChange(i)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
              activeFilter === i
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Report list */}
      <div className="space-y-2">
        {isFetching && allReports.length === 0 && (
          <div className="glass-card p-8 text-center text-sm text-muted-foreground">Chargement...</div>
        )}
        {!isFetching && allReports.length === 0 && (
          <div className="glass-card p-8 text-center text-sm text-muted-foreground">Aucun rapport.</div>
        )}
        {allReports.map((report) => (
          <ReportCard key={report.id} report={report} gameConfig={gameConfig} />
        ))}
        {hasMore && (
          <div ref={loaderRef} className="flex justify-center py-3">
            {isFetching ? (
              <span className="text-xs text-muted-foreground">Chargement...</span>
            ) : (
              <button
                type="button"
                onClick={handleLoadMore}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Charger plus
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
