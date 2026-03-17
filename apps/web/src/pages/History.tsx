import { useState, useEffect, useRef, useCallback } from 'react';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { eventTypeColor, eventTypeLabel, formatEventText, formatDateTime, groupEvents } from '@/lib/game-events';

const EVENT_TYPE_OPTIONS = [
  { value: 'building-done', label: 'Constructions' },
  { value: 'research-done', label: 'Recherches' },
  { value: 'shipyard-done', label: 'Chantier spatial' },
  { value: 'fleet-arrived', label: 'Flottes arrivées' },
  { value: 'fleet-returned', label: 'Flottes de retour' },
] as const;

type GameEventType = (typeof EVENT_TYPE_OPTIONS)[number]['value'];

export default function History() {
  const [selectedTypes, setSelectedTypes] = useState<GameEventType[]>([]);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const loaderRef = useRef<HTMLDivElement>(null);
  const lastAppendedCursorRef = useRef<string | undefined>(undefined);

  const currentCursor = cursors[cursors.length - 1];

  const { data, isFetching } = trpc.gameEvent.history.useQuery(
    { cursor: currentCursor, limit: 20, types: selectedTypes.length > 0 ? selectedTypes : undefined },
    { placeholderData: (prev: any) => prev },
  );

  // Accumulate events from all pages
  const pages = useRef<Map<string | undefined, any[]>>(new Map());

  useEffect(() => {
    if (data && data.events.length > 0) {
      pages.current.set(currentCursor, data.events);
    }
  }, [data, currentCursor]);

  // Reset on filter change
  const handleFilterChange = (type: GameEventType) => {
    setSelectedTypes((prev) =>
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

  // Flatten all pages into a single list
  const allEvents = groupEvents(Array.from(pages.current.values()).flat());
  const hasMore = !!data?.nextCursor;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Historique" />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleFilterChange(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedTypes.includes(opt.value)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div className="glass-card divide-y divide-border/30">
        {allEvents.length === 0 && !isFetching && (
          <p className="p-4 text-sm text-muted-foreground">Aucun événement</p>
        )}
        {allEvents.map((event) => (
          <div key={event.id} className="flex items-start gap-3 p-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventTypeColor(event.type)}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{eventTypeLabel(event.type)}</span>
              </div>
              <p className="text-sm">{formatEventText(event, { includePlanet: true })}</p>
            </div>
            <span className="text-xs text-muted-foreground/60 shrink-0">{formatDateTime(event.createdAt)}</span>
          </div>
        ))}
        {hasMore && (
          <div ref={loaderRef} className="flex justify-center p-4">
            {isFetching && <span className="text-xs text-muted-foreground">Chargement...</span>}
          </div>
        )}
      </div>
    </div>
  );
}
