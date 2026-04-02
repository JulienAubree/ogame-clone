import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { trpc } from '@/trpc';
import { MessageSquare } from 'lucide-react';

const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function Changelog() {
  const navigate = useNavigate();
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const currentCursor = cursors[cursors.length - 1];

  const { data, isFetching } = trpc.changelog.list.useQuery(
    { cursor: currentCursor },
    { placeholderData: (prev: any) => prev },
  );

  const [allItems, setAllItems] = useState<any[]>([]);

  useEffect(() => {
    if (data?.items) {
      if (cursors.length === 1) {
        setAllItems(data.items);
      } else {
        setAllItems((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = data.items.filter((i: any) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [data?.items, cursors.length]);

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-4xl mx-auto">
      <PageHeader title="Nouveautes" />

      <div className="space-y-2">
        {allItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/changelog/${item.id}`)}
            className="glass-card p-4 w-full text-left space-y-2 hover:bg-accent/10 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.createdAt)}</span>
            </div>
            <p className="text-xs text-foreground/70 line-clamp-3">
              {item.content?.replace(/^###\s+/gm, '').replace(/^-\s+/gm, '• ').replace(/\*\*(.+?)\*\*/g, '$1').slice(0, 200)}...
            </p>
            {item.commentCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{item.commentCount}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {allItems.length === 0 && !isFetching && (
        <p className="text-sm text-muted-foreground text-center py-8">Aucune nouveaute pour le moment</p>
      )}

      {data?.nextCursor && (
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => setCursors((prev) => [...prev, data.nextCursor!])}
          >
            Charger plus
          </Button>
        </div>
      )}

      {isFetching && (
        <div className="text-center text-xs text-muted-foreground py-2">Chargement...</div>
      )}
    </div>
  );
}
