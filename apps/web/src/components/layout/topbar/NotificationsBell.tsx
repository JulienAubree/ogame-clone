import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/trpc';
import { usePlanetStore } from '@/stores/planet.store';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { eventTypeColor, formatEventText, formatRelativeTime, eventNavigationTarget, groupEvents } from '@/lib/game-events';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();

  useOutsideClick(ref, open, () => setOpen(false));

  const { data: eventUnreadCount } = trpc.gameEvent.unreadCount.useQuery();
  const { data: recentEvents } = trpc.gameEvent.recent.useQuery();
  const markAllRead = trpc.gameEvent.markAllRead.useMutation({
    onSuccess: () => {
      utils.gameEvent.unreadCount.invalidate();
      utils.gameEvent.recent.invalidate();
    },
  });

  const handleOpen = () => {
    const newOpen = !open;
    setOpen(newOpen);
    if (newOpen) markAllRead.mutate();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative rounded-lg p-2 lg:p-2.5 text-muted-foreground touch-feedback hover:bg-accent hover:text-foreground"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {(eventUnreadCount?.count ?? 0) > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {eventUnreadCount!.count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-2 left-2 top-12 z-50 mt-1 sm:absolute sm:left-auto sm:top-full sm:right-0 sm:w-80 rounded-md border border-white/10 bg-card/95 backdrop-blur-lg shadow-lg animate-slide-up">
          <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Notifications</span>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {recentEvents && recentEvents.length > 0 ? (
              groupEvents(recentEvents).map((event) => (
                <button
                  key={event.id}
                  onClick={() => {
                    if (event.planetId) usePlanetStore.getState().setActivePlanet(event.planetId);
                    navigate(eventNavigationTarget(event.type, event.payload));
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-3 text-left text-sm touch-feedback hover:bg-accent',
                    !event.read && 'bg-primary/5 font-medium',
                  )}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventTypeColor(event.type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{formatEventText(event, { includePlanet: true, missions: gameConfig?.missions })}</p>
                    <span className="text-xs text-muted-foreground/60">{formatRelativeTime(event.createdAt)}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">Aucune notification</p>
            )}
          </div>
          <div className="border-t border-border/30 px-3 py-2">
            <button
              onClick={() => { navigate('/history'); setOpen(false); }}
              className="text-xs text-primary hover:underline"
            >
              Voir l&apos;historique complet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
