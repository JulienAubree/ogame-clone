import { useState } from 'react';
import type { AllianceLogCategory } from '@exilium/shared';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { ActivityFeedItem } from './ActivityFeedItem';

const ALL_CATEGORIES: { id: AllianceLogCategory; label: string }[] = [
  { id: 'military', label: 'Militaire' },
  { id: 'members', label: 'Membres' },
];

export function ActivityFeed() {
  const [active, setActive] = useState<AllianceLogCategory | null>(null);

  const query = trpc.alliance.activity.useInfiniteQuery(
    { categories: active ? [active] : undefined, limit: 30 },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  );

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Activité</h3>
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
