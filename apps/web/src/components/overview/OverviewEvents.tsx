import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { eventTypeColor, formatEventText, formatRelativeTime, groupEvents } from '@/lib/game-events';

interface GameEvent {
  id: string;
  type: string;
  createdAt: string;
  [key: string]: any;
}

interface OverviewEventsProps {
  events: GameEvent[];
  gameConfig: any;
}

export function OverviewEvents({ events, gameConfig }: OverviewEventsProps) {
  const [open, setOpen] = useState(false);

  if (events.length === 0) return null;

  const grouped = groupEvents(events);

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
          {grouped.length} evenement{grouped.length > 1 ? 's' : ''} recent{grouped.length > 1 ? 's' : ''}
        </span>
        <span className="text-muted-foreground/50">
          {open ? 'Masquer' : 'Voir'}
        </span>
      </button>

      {open && (
        <div className="border-t border-border/30 px-4 py-2">
          <div className="space-y-0.5">
            {grouped.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${eventTypeColor(event.type)}`} />
                  <span className="text-muted-foreground">{formatEventText(event, { missions: gameConfig?.missions })}</span>
                </div>
                <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">{formatRelativeTime(event.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
