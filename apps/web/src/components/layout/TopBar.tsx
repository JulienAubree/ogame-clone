import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { usePlanetStore } from '@/stores/planet.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon, EnergieIcon } from '@/components/common/ResourceIcons';
import { useGameConfig } from '@/hooks/useGameConfig';
import { eventTypeColor, formatEventText, formatRelativeTime, eventNavigationTarget, groupEvents } from '@/lib/game-events';
import { getPlanetImageUrl } from '@/lib/assets';

interface Planet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
}

function ResourceBadge({ label, value, glowClass, colorClass, icon }: {
  label: string;
  value: number;
  glowClass: string;
  colorClass: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className={colorClass}>{icon}</span>}
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', colorClass, glowClass)}>
        {value.toLocaleString('fr-FR')}
      </span>
    </div>
  );
}

export function TopBar({ planetId, planets }: { planetId: string | null; planets: Planet[] }) {
  const { data: gameConfig } = useGameConfig();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const clearActivePlanet = usePlanetStore((s) => s.clearActivePlanet);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const utils = trpc.useUtils();
  const { data: unreadCount } = trpc.message.unreadCount.useQuery();
  const { data: eventUnreadCount } = trpc.gameEvent.unreadCount.useQuery();
  const { data: recentEvents } = trpc.gameEvent.recent.useQuery();
  const markAllRead = trpc.gameEvent.markAllRead.useMutation({
    onSuccess: () => {
      utils.gameEvent.unreadCount.invalidate();
      utils.gameEvent.recent.invalidate();
    },
  });

  const { data } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId, refetchInterval: 60_000 },
  );

  const resources = useResourceCounter(
    data
      ? {
          minerai: data.minerai,
          silicium: data.silicium,
          hydrogene: data.hydrogene,
          resourcesUpdatedAt: data.resourcesUpdatedAt,
          mineraiPerHour: data.rates.mineraiPerHour,
          siliciumPerHour: data.rates.siliciumPerHour,
          hydrogenePerHour: data.rates.hydrogenePerHour,
          storageMineraiCapacity: data.rates.storageMineraiCapacity,
          storageSiliciumCapacity: data.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: data.rates.storageHydrogeneCapacity,
        }
      : undefined,
  );

  const energyBalance = data ? data.rates.energyProduced - data.rates.energyConsumed : 0;
  const activePlanet = planets.find((p) => p.id === planetId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen]);

  // Close bell on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    if (bellOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [bellOpen]);

  const handleSelectPlanet = (id: string) => {
    setActivePlanet(id);
    setDropdownOpen(false);
  };

  const handleLogout = () => {
    clearActivePlanet();
    clearAuth();
  };

  const handleBellOpen = () => {
    setBellOpen(!bellOpen);
    if (!bellOpen) {
      markAllRead.mutate();
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-12 lg:h-14 items-center justify-between border-b border-white/10 bg-card/80 backdrop-blur-md px-4 lg:px-6">
      <div className="flex items-center gap-4 lg:gap-6">
        {/* Planet selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
          >
            {activePlanet?.planetClassId && activePlanet.planetImageIndex != null ? (
              <img
                src={getPlanetImageUrl(activePlanet.planetClassId, activePlanet.planetImageIndex, 'icon')}
                alt=""
                className="w-5 h-5 rounded-full object-cover"
              />
            ) : (
              <span className="w-5 h-5 rounded-full bg-primary/30 inline-block" />
            )}
            <span className="font-medium">
              {activePlanet ? activePlanet.name : 'Planete'}
              {activePlanet && (
                <span className="hidden lg:inline"> [{activePlanet.galaxy}:{activePlanet.system}:{activePlanet.position}]</span>
              )}
            </span>
            <span className="text-xs">&#9660;</span>
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-48 rounded-md border border-white/10 bg-card/95 backdrop-blur-lg shadow-lg animate-slide-up">
              {planets.map((planet) => (
                <button
                  key={planet.id}
                  onClick={() => handleSelectPlanet(planet.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent',
                    planet.id === planetId && 'bg-primary/10 text-primary',
                  )}
                >
                  {planet.planetClassId && planet.planetImageIndex != null ? (
                    <img
                      src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'icon')}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-primary/30 inline-block" />
                  )}
                  {planet.name} [{planet.galaxy}:{planet.system}:{planet.position}]
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Resources — desktop only */}
        <div className="hidden lg:flex items-center gap-4">
          <ResourceBadge label="Minerai" value={resources.minerai} glowClass="glow-minerai" colorClass="text-minerai" icon={<MineraiIcon size={14} />} />
          <ResourceBadge label="Silicium" value={resources.silicium} glowClass="glow-silicium" colorClass="text-silicium" icon={<SiliciumIcon size={14} />} />
          <ResourceBadge label="Hydrogène" value={resources.hydrogene} glowClass="glow-hydrogene" colorClass="text-hydrogene" icon={<HydrogeneIcon size={14} />} />
          <ResourceBadge
            label="Énergie"
            value={energyBalance}
            glowClass={energyBalance >= 0 ? 'glow-energy' : ''}
            colorClass={energyBalance >= 0 ? 'text-energy' : 'text-destructive'}
            icon={<EnergieIcon size={14} />}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Messages (envelope) */}
        <button
          onClick={() => navigate('/messages')}
          className="relative rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Messages"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Notifications (bell) */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={handleBellOpen}
            className="relative rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Notifications"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {(eventUnreadCount?.count ?? 0) > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {eventUnreadCount!.count}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border border-white/10 bg-card/95 backdrop-blur-lg shadow-lg animate-slide-up">
              <div className="border-b border-border/30 px-3 py-2">
                <span className="text-xs font-semibold text-muted-foreground">Notifications</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recentEvents && recentEvents.length > 0 ? (
                  groupEvents(recentEvents).map((event) => (
                    <button
                      key={event.id}
                      onClick={() => { navigate(eventNavigationTarget(event.type, event.payload)); setBellOpen(false); }}
                      className={cn(
                        'flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                        !event.read && 'bg-primary/5 font-medium',
                      )}
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventTypeColor(event.type)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{formatEventText(event, { missions: gameConfig?.missions })}</p>
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
                  onClick={() => { navigate('/history'); setBellOpen(false); }}
                  className="text-xs text-primary hover:underline"
                >
                  Voir l'historique complet
                </button>
              </div>
            </div>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden lg:flex">
          Déconnexion
        </Button>
      </div>
    </header>
  );
}
