import { useState, useRef, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FeedbackCard } from '@/components/feedback/FeedbackCard';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { trpc } from '@/trpc';
import { cn } from '@/lib/utils';
import { Plus, Search, MessageSquarePlus } from 'lucide-react';

const TYPE_FILTERS = [
  { label: 'Tous', value: undefined },
  { label: '🐛 Bugs', value: 'bug' as const },
  { label: '💡 Idées', value: 'idea' as const },
  { label: '💬 Feedbacks', value: 'feedback' as const },
];

const SORT_OPTIONS = [
  { label: 'Récents', value: 'recent' as const },
  { label: 'Populaires', value: 'popular' as const },
];

export default function Feedback() {
  const [tab, setTab] = useState<'active' | 'resolved'>('active');
  const [typeFilter, setTypeFilter] = useState<'bug' | 'idea' | 'feedback' | undefined>();
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  const currentCursor = cursors[cursors.length - 1];
  const loaderRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = trpc.feedback.list.useQuery(
    {
      type: typeFilter,
      sort,
      cursor: currentCursor,
      ...(tab === 'active' ? { excludeResolved: true } : { status: 'resolved' }),
    },
    { placeholderData: (prev: any) => prev },
  );

  const [allItems, setAllItems] = useState<any[]>([]);

  useEffect(() => {
    if (data?.items) {
      if (cursors.length === 1) {
        setAllItems(data.items);
      } else {
        setAllItems(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const newItems = data.items.filter(i => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [data?.items, cursors.length]);

  function resetList() {
    setCursors([undefined]);
    setAllItems([]);
  }

  const loadMore = useCallback(() => {
    if (data?.nextCursor && !isFetching) {
      setCursors(prev => [...prev, data.nextCursor]);
    }
  }, [data?.nextCursor, isFetching]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const filteredItems = search
    ? allItems.filter(i => i.title.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Feedback"
        description="Signalez des bugs, proposez des idées, partagez vos retours"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Soumettre
          </Button>
        }
      />

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => { setTab('active'); resetList(); }}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'active' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Actifs
        </button>
        <button
          onClick={() => { setTab('resolved'); resetList(); }}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'resolved' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Resolus
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => { setTypeFilter(f.value); resetList(); }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                typeFilter === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => { setSort(s.value); resetList(); }}
              className={cn(
                'text-xs font-medium transition-colors',
                sort === s.value ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {filteredItems.map((item) => (
          <FeedbackCard key={item.id} feedback={item} />
        ))}
      </div>

      {filteredItems.length === 0 && !isFetching && (
        <EmptyState
          icon={<MessageSquarePlus className="w-12 h-12" />}
          title="Aucun feedback"
          description="Soyez le premier à soumettre un retour !"
          action={{ label: 'Soumettre', onClick: () => setFormOpen(true) }}
        />
      )}

      <div ref={loaderRef} className="h-4" />
      {isFetching && (
        <div className="text-center text-xs text-muted-foreground py-2">Chargement...</div>
      )}

      <FeedbackForm open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
