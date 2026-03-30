import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { usePlanetStore } from '@/stores/planet.store';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon, EnergieIcon } from '@/components/common/ResourceIcons';
import { ProfileIcon, ReportsIcon, HistoryIcon } from '@/lib/icons';
import { useExilium } from '@/hooks/useExilium';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const questRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const clearActivePlanet = usePlanetStore((s) => s.clearActivePlanet);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user = useAuthStore((s) => s.user);
  const utils = trpc.useUtils();
  const { data: exiliumData } = useExilium();
  const { data: dailyQuests } = trpc.dailyQuest.getQuests.useQuery(undefined, { refetchInterval: 60_000 });
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

  // Close profile on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [profileOpen]);

  // Close quest on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (questRef.current && !questRef.current.contains(e.target as Node)) {
        setQuestOpen(false);
      }
    }
    if (questOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [questOpen]);

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
    <header className="sticky top-0 z-40 flex min-h-12 lg:min-h-14 items-center justify-between border-b border-white/10 bg-card/80 backdrop-blur-md px-4 pt-[env(safe-area-inset-top)] lg:px-6">
      <div className="flex items-center gap-4 lg:gap-6">
        {/* Planet selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm touch-feedback hover:bg-accent"
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
        {/* Exilium balance + daily quests */}
        <div className="relative" ref={questRef}>
          <button
            onClick={() => setQuestOpen(!questOpen)}
            className="relative flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted-foreground touch-feedback hover:bg-accent"
          >
            <ExiliumIcon size={14} className="text-purple-400" />
            <span className="text-sm font-medium tabular-nums text-purple-400">
              {exiliumData?.balance ?? 0}
            </span>
            {dailyQuests && dailyQuests.quests.some(q => q.status === 'pending') && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-purple-500" />
              </span>
            )}
          </button>

          {questOpen && dailyQuests && (() => {
            const now = new Date();
            const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
            const msRemaining = Math.max(0, endOfDay.getTime() - now.getTime());
            const hoursRemaining = Math.floor(msRemaining / 3600000);
            const minutesRemaining = Math.floor((msRemaining % 3600000) / 60000);

            return (
              <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-purple-500/30 bg-card/95 backdrop-blur-lg shadow-lg animate-slide-up">
                <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
                  <span className="text-xs font-semibold text-purple-400">Missions journalieres</span>
                  <span className="text-[10px] text-muted-foreground">+1 Exilium</span>
                </div>
                <div className="p-3 space-y-2">
                  {dailyQuests.quests.map(quest => (
                    <div key={quest.id} className="flex items-start gap-2">
                      <div className="mt-0.5">
                        {quest.status === 'completed' ? (
                          <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : quest.status === 'expired' ? (
                          <svg className="h-4 w-4 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        ) : (
                          <div className="h-4 w-4 rounded border border-border" />
                        )}
                      </div>
                      <div>
                        <span className={cn(
                          'text-xs font-medium',
                          quest.status === 'completed' ? 'text-emerald-400' :
                          quest.status === 'expired' ? 'text-muted-foreground/40 line-through' :
                          'text-foreground',
                        )}>
                          {quest.name}
                        </span>
                        <p className={cn('text-[10px]', quest.status === 'expired' ? 'text-muted-foreground/30' : 'text-muted-foreground')}>
                          {quest.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/30 px-3 py-1.5">
                  <span className={cn('text-[10px]', hoursRemaining < 1 ? 'text-destructive' : 'text-muted-foreground')}>
                    Expire dans {hoursRemaining}h {minutesRemaining.toString().padStart(2, '0')}m
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Messages (envelope) */}
        <button
          onClick={() => navigate('/messages')}
          className="relative rounded-lg p-2.5 text-muted-foreground touch-feedback hover:bg-accent hover:text-foreground"
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
            className="relative rounded-lg p-2.5 text-muted-foreground touch-feedback hover:bg-accent hover:text-foreground"
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
                        'flex w-full items-start gap-2 px-3 py-3 text-left text-sm touch-feedback hover:bg-accent',
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

        {/* Profile menu */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className={cn(
              'flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors lg:pr-3',
              profileOpen ? 'bg-accent' : 'hover:bg-accent',
            )}
          >
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-bold text-white',
              profileOpen && 'ring-2 ring-primary',
            )}>
              {user?.username?.slice(0, 2).toUpperCase() ?? '??'}
            </div>
            <span className="hidden text-sm font-medium lg:inline">{user?.username ?? ''}</span>
            <svg className="hidden h-3 w-3 text-muted-foreground lg:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-white/10 bg-card/95 backdrop-blur-lg shadow-lg animate-slide-up">
              <div className="p-1.5">
                <button
                  onClick={() => { navigate('/profile'); setProfileOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ProfileIcon width={16} height={16} />
                  Profil
                </button>
                <button
                  onClick={() => { navigate('/reports'); setProfileOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ReportsIcon width={16} height={16} />
                  Rapports
                </button>
                <button
                  onClick={() => { navigate('/history'); setProfileOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <HistoryIcon width={16} height={16} />
                  Historique
                </button>
              </div>
              <div className="mx-2 border-t border-white/5" />
              <div className="p-1.5">
                <button
                  onClick={() => { setProfileOpen(false); handleLogout(); }}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
