import { useEffect, useRef, useState } from 'react';
import type { AllianceLogCategory } from '@exilium/shared';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { ActivityFeedItem } from './ActivityFeedItem';

const ALL_CATEGORIES: { id: AllianceLogCategory; label: string }[] = [
  { id: 'military', label: 'Militaire' },
  { id: 'members', label: 'Membres' },
];

type Props = { unreadCount: number; onOpened: () => void };
export function ActivityFeed({ unreadCount, onOpened }: Props) {
  const [active, setActive] = useState<AllianceLogCategory | null>(null);

  const utils = trpc.useUtils();
  const markSeen = trpc.alliance.activityMarkSeen.useMutation({
    onSuccess: () => {
      utils.alliance.activityUnreadCount.invalidate();
      onOpened();
    },
  });

  // Push-driven: useNotifications invalidates alliance.activity on
  // `alliance-log:new` SSE events.
  const query = trpc.alliance.activity.useInfiniteQuery(
    { categories: active ? [active] : undefined, limit: 30 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const hasMarkedSeen = useRef(false);
  useEffect(() => {
    if (!query.isLoading && !hasMarkedSeen.current) {
      hasMarkedSeen.current = true;
      markSeen.mutate();
    }
    // Intentionally omit markSeen/onOpened — fire once when the initial load resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isLoading]);

  return (
    <section className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">Activité</h3>
        {unreadCount > 0 && (
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
            {unreadCount} nouveau{unreadCount > 1 ? 'x' : ''}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={active === null ? 'default' : 'outline'}
          className="rounded-full"
          onClick={() => setActive(null)}
        >
          Tous
        </Button>
        {ALL_CATEGORIES.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={active === c.id ? 'default' : 'outline'}
            className="rounded-full"
            onClick={() => setActive(c.id)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">Impossible de charger l'activité.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune activité pour le moment.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((log) => (
            <ActivityFeedItem key={log.id} log={log} />
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
          </Button>
        </div>
      )}
    </section>
  );
}
