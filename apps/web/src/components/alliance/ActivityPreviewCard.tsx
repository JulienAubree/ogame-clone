import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { ActivityFeedItem } from './ActivityFeedItem';

export function ActivityPreviewCard() {
  const { data: unread } = trpc.alliance.activityUnreadCount.useQuery();
  const unreadCount = unread?.count ?? 0;

  // Push-driven: useNotifications invalidates alliance.activity on
  // `alliance-log:new` SSE events.
  const query = trpc.alliance.activity.useInfiniteQuery(
    { limit: 5 },
    { getNextPageParam: () => undefined },
  );

  const items = (query.data?.pages[0]?.items ?? []).slice(0, 5);

  return (
    <section className="glass-card flex min-w-0 flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-base font-semibold">Activité récente</h3>
          {unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
              {unreadCount}
            </span>
          )}
        </div>
        <Link to="/alliance/activite" className="shrink-0 whitespace-nowrap text-xs text-primary hover:underline">
          Voir tout →
        </Link>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pas encore d'activité.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((log) => (
            <ActivityFeedItem key={log.id} log={log} />
          ))}
        </ul>
      )}
    </section>
  );
}
