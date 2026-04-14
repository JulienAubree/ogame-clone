import { useState, useRef, useEffect, useMemo, useCallback, type TouchEvent } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/common/Skeleton';
import { CoordinateInput } from '@/components/common/CoordinateInput';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PlanetDot } from '@/components/galaxy/PlanetDot';
import { AsteroidBelt } from '@/components/galaxy/AsteroidBelt';
import { DebrisFieldIcon } from '@/components/galaxy/DebrisFieldIcon';
import { GalaxySystemView } from '@/components/galaxy/GalaxySystemView';
import type { DetailPanelActions, PlanetTypeMeta } from '@/components/galaxy/GalaxySystemView';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { usePlanetStore } from '@/stores/planet.store';
import { useToastStore } from '@/stores/toast.store';

// Note: these biome constants are intentionally duplicated with
// apps/web/src/components/galaxy/GalaxySystemView/DetailPanel/BiomeChips.tsx —
// the mobile list below and the desktop DetailPanel are styled independently.
const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

const STAT_LABELS: Record<string, string> = {
  production_minerai: 'Production minerai',
  production_silicium: 'Production silicium',
  production_hydrogene: 'Production hydrogène',
  energy_production: 'Production énergie',
  storage_minerai: 'Stockage minerai',
  storage_silicium: 'Stockage silicium',
  storage_hydrogene: 'Stockage hydrogène',
};

function BiomeToggle({ count, expanded, onToggle }: { count: number; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
    >
      <span>{count} biome{count > 1 ? 's' : ''}</span>
      <svg width={10} height={10} viewBox="0 0 10 10" className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
        <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function BiomeDetails({ biomes }: { biomes: any[] }) {
  return (
    <div className="space-y-1 py-1">
      {biomes.map((biome: any) => {
        const color = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
        return (
          <div key={biome.id} className="flex items-center gap-1.5 text-xs">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span style={{ color }} className="flex-shrink-0">{biome.name}</span>
            {biome.effects && biome.effects.length > 0 && (
              <span className="text-muted-foreground">
                {biome.effects.map((e: any) =>
                  `${e.modifier > 0 ? '+' : ''}${Math.round(e.modifier * 100)}% ${STAT_LABELS[e.stat] ?? e.stat}`
                ).join(', ')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Mobile-only: inline toggle + detail */
function BiomeSummary({ biomes }: { biomes: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!biomes || biomes.length === 0) return null;
  return (
    <div className="mt-1">
      <BiomeToggle count={biomes.length} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      {expanded && <BiomeDetails biomes={biomes} />}
    </div>
  );
}

export default function Galaxy() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanet = planets?.find((p) => p.id === planetId);
  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const [searchParams, setSearchParams] = useSearchParams();

  // Read g/s from URL if present (deep-link from reports, market, etc.)
  const urlGalaxy = searchParams.get('g') ? Number(searchParams.get('g')) : null;
  const urlSystem = searchParams.get('s') ? Number(searchParams.get('s')) : null;

  const [galaxy, setGalaxy] = useState(urlGalaxy ?? activePlanet?.galaxy ?? 1);
  const [system, setSystem] = useState(urlSystem ?? activePlanet?.system ?? 1);
  const [initialized, setInitialized] = useState(urlGalaxy != null);
  const setActivePlanetStore = usePlanetStore((s) => s.setActivePlanet);

  useEffect(() => {
    if (!initialized && activePlanet) {
      setGalaxy(activePlanet.galaxy);
      setSystem(activePlanet.system);
      setInitialized(true);
    }
  }, [activePlanet, initialized]);

  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const addToast = useToastStore((s) => s.addToast);

  const createReportMutation = trpc.explorationReport.create.useMutation({
    onSuccess: () => {
      addToast('Rapport cree — renseignez votre prix de vente');
      navigate('/market?view=report-my');
    },
    onError: (err) => addToast(err.message, 'error'),
  });
  const openChat = useChatStore((s) => s.openChat);
  const { data, isLoading } = trpc.galaxy.system.useQuery(
    { galaxy, system },
  );
  const { data: gameConfig } = useGameConfig();
  const { data: myAlliance } = trpc.alliance.myAlliance.useQuery();
  const { data: pveData } = trpc.pve.getMissions.useQuery();

  const colonizerShipId = useMemo(() => {
    if (!gameConfig?.ships) return null;
    const entry = Object.entries(gameConfig.ships).find(([, s]) => (s as any).role === 'colonization');
    return entry?.[0] ?? null;
  }, [gameConfig?.ships]);
  const hasColonizer = !!(colonizerShipId && ships?.find((s) => s.id === colonizerShipId && s.count > 0));

  const explorerShipId = useMemo(() => {
    if (!gameConfig?.ships) return null;
    const entry = Object.entries(gameConfig.ships).find(([, s]) => (s as any).role === 'exploration');
    return entry?.[0] ?? null;
  }, [gameConfig?.ships]);
  const hasExplorer = !!(explorerShipId && ships?.find((s) => s.id === explorerShipId && s.count > 0));

  const spyShipId = useMemo(() => {
    if (!gameConfig?.ships) return null;
    const entry = Object.entries(gameConfig.ships).find(([, s]) => (s as any).role === 'espionage');
    return entry?.[0] ?? null;
  }, [gameConfig?.ships]);
  const hasSpy = !!(spyShipId && ships?.find((s) => s.id === spyShipId && s.count > 0));

  const combatShipIds = useMemo(
    () =>
      Object.entries(gameConfig?.ships ?? {})
        .filter(([, s]) => (s as any).role === 'combat')
        .map(([id]) => id),
    [gameConfig?.ships],
  );
  const hasCombatShip = !!ships?.some((s) => combatShipIds.includes(s.id) && s.count > 0);

  const recyclerShipIds = useMemo(
    () =>
      Object.entries(gameConfig?.ships ?? {})
        .filter(([, s]) => (s as any).role === 'recycling')
        .map(([id]) => id),
    [gameConfig?.ships],
  );
  const hasRecycler = !!ships?.some((s) => recyclerShipIds.includes(s.id) && s.count > 0);

  const minerShipIds = useMemo(
    () =>
      Object.entries(gameConfig?.ships ?? {})
        .filter(([, s]) => (s as any).role === 'mining')
        .map(([id]) => id),
    [gameConfig?.ships],
  );
  const hasMiner = !!ships?.some((s) => minerShipIds.includes(s.id) && s.count > 0);

  // Map position → mission for current galaxy:system
  const missionByPosition = useMemo(() => {
    const map = new Map<number, { id: string }>();
    if (!pveData?.missions) return map;
    for (const m of pveData.missions) {
      const p = m.parameters as { galaxy?: number; system?: number; position?: number };
      if (p.galaxy === galaxy && p.system === system && p.position) {
        map.set(p.position, { id: m.id });
      }
    }
    return map;
  }, [pveData?.missions, galaxy, system]);

  // Belts as Record (not Map) for DetailPanel API
  const beltMissionsRecord = useMemo<Record<number, { id: string }>>(() => {
    const obj: Record<number, { id: string }> = {};
    missionByPosition.forEach((m, pos) => { obj[pos] = m; });
    return obj;
  }, [missionByPosition]);

  // Planet types from game config
  const planetTypesList = useMemo<PlanetTypeMeta[]>(() => {
    return (gameConfig?.planetTypes ?? []).map((t) => ({ id: t.id, name: t.name }));
  }, [gameConfig?.planetTypes]);

  // My capital position in this system, if any. The planets schema has no
  // explicit capital flag — fall back to "first owned planet in this system"
  // (listPlanets orders by sortOrder, so this is the user's primary planet).
  const myCapitalPosition = useMemo<number | null>(() => {
    if (!planets || !currentUser) return null;
    const mine = planets.find(
      (p) => p.userId === currentUser.id && p.galaxy === galaxy && p.system === system,
    );
    return mine?.position ?? null;
  }, [planets, currentUser, galaxy, system]);

  // System nav callbacks — wrap around (1 ↔ maxSystem)
  const maxSystem = Number(gameConfig?.universe?.systems) || 499;
  const handleSystemPrev = useCallback(
    () => setSystem((s) => (s <= 1 ? maxSystem : s - 1)),
    [maxSystem],
  );
  const handleSystemNext = useCallback(
    () => setSystem((s) => (s >= maxSystem ? 1 : s + 1)),
    [maxSystem],
  );

  const handleCoordinateChange = useCallback((g: number, s: number) => {
    setGalaxy(g);
    setSystem(s);
  }, []);

  // DetailPanel actions — stable memoized object.
  const detailActions = useMemo<DetailPanelActions>(() => ({
    onColonize: (position) =>
      navigate(`/fleet/send?mission=colonize&galaxy=${galaxy}&system=${system}&position=${position}`),
    onExplore: (position) =>
      navigate(`/fleet/send?mission=explore&galaxy=${galaxy}&system=${system}&position=${position}`),
    onSpy: (position) =>
      navigate(`/fleet/send?mission=spy&galaxy=${galaxy}&system=${system}&position=${position}`),
    onAttack: (position) =>
      navigate(`/fleet/send?mission=attack&galaxy=${galaxy}&system=${system}&position=${position}`),
    onMine: (position, missionId) =>
      navigate(`/fleet/send?mission=mine&galaxy=${galaxy}&system=${system}&position=${position}&pveMissionId=${missionId}`),
    onRecycle: (position) =>
      navigate(
        `/fleet/send?mission=recycle&galaxy=${galaxy}&system=${system}&position=${position}`,
      ),
    onMessage: (userId, username) => openChat(userId, username),
    onCenterCapital: () => {
      if (myCapitalPosition !== null) {
        setSearchParams((prev) => {
          const params = new URLSearchParams(prev);
          params.set('pos', String(myCapitalPosition));
          return params;
        }, { replace: true });
      }
    },
    onManagePlanet: (planetId) => {
      setActivePlanetStore(planetId);
      navigate('/');
    },
    onViewColonization: (planetId) => {
      setActivePlanetStore(planetId);
      navigate('/');
    },
    onCreateReport: (position) => {
      if (!planetId) return;
      createReportMutation.mutate({ planetId, galaxy, system, position });
    },
  }), [navigate, galaxy, system, openChat, myCapitalPosition, setSearchParams, setActivePlanetStore]);

  // Touch swipe for system navigation
  const touchStart = useRef<number | null>(null);
  const handleTouchStart = (e: TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: TouchEvent) => {
    if (touchStart.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(delta) > 50) {
      if (delta > 0) setSystem(system <= 1 ? maxSystem : system - 1);
      else setSystem(system >= maxSystem ? 1 : system + 1);
    }
    touchStart.current = null;
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      {/* Mobile header + selector (hidden on desktop — GalaxySystemView has its own) */}
      <div className="lg:hidden">
        <PageHeader title="Galaxie" />
        <div className="flex items-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSystem(system <= 1 ? maxSystem : system - 1)}
          >
            &lt;
          </Button>
          <CoordinateInput
            galaxy={galaxy}
            system={system}
            position={1}
            onChange={(c) => { setGalaxy(c.galaxy); setSystem(c.system); }}
            hidePosition
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSystem(system >= maxSystem ? 1 : system + 1)}
          >
            &gt;
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 lg:hidden">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Mobile list */}
          <div
            className="space-y-1 lg:hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {data?.slots.map((slot, i) => {
              const isBelt = slot && 'type' in slot && (slot as any).type === 'belt';
              const isEmpty = slot && 'type' in slot && (slot as any).type === 'empty';
              const isPlanet = slot && !isBelt && !isEmpty;
              const isOtherPlayer = isPlanet && (slot as any).userId && (slot as any).userId !== currentUser?.id;
              const isSameAlliance = isOtherPlayer && myAlliance && (slot as any).allianceId && (slot as any).allianceId === myAlliance.id;
              const canAttack = isOtherPlayer && !isSameAlliance;

              if (isBelt) {
                const beltMission = missionByPosition.get(i + 1);
                return (
                  <div key={i} className="group relative flex items-center gap-3 rounded-lg px-2 h-10 overflow-hidden border border-orange-500/15 bg-black/20">
                    <AsteroidBelt className="absolute inset-0 w-full h-full" />
                    <span className="relative z-10 w-6 text-center text-xs font-mono text-orange-400/70">{i + 1}</span>
                    <span className="relative z-10 flex-1 text-sm text-orange-300/80 tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Ceinture d&apos;astéroïdes</span>
                    {beltMission && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="relative z-10 text-xs h-6 px-2 border-orange-500/40 text-orange-400 hover:bg-orange-500/20 backdrop-blur-sm"
                        onClick={() => navigate(`/fleet/send?mission=mine&galaxy=${galaxy}&system=${system}&position=${i + 1}&pveMissionId=${beltMission.id}`)}
                      >
                        Miner
                      </Button>
                    )}
                  </div>
                );
              }

              if (isEmpty) {
                const emptySlot = slot as any;
                const planetTypeName = emptySlot.isDiscovered && emptySlot.planetClassId
                  ? gameConfig?.planetTypes?.find((t) => t.id === emptySlot.planetClassId)?.name ?? 'Inconnu'
                  : 'Inconnu';
                return (
                  <div key={i} className="rounded-lg p-2 hover:bg-accent/50">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-mono text-muted-foreground">{i + 1}</span>
                      <PlanetDot planetClassId={emptySlot.planetClassId} size={20} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${emptySlot.isDiscovered ? 'text-primary/70' : 'text-muted-foreground italic'}`}>
                          {planetTypeName}
                        </span>
                      </div>
                      {hasColonizer && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-6 px-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                          onClick={() => navigate(`/fleet/send?mission=colonize&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                        >
                          Coloniser
                        </Button>
                      )}
                      {hasExplorer && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-6 px-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
                          onClick={() => navigate(`/fleet/send?mission=explore&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                        >
                          Explorer
                        </Button>
                      )}
                    </div>
                    {emptySlot.biomes && emptySlot.biomes.length > 0 && (
                      <div className="pl-9">
                        <BiomeSummary biomes={emptySlot.biomes} />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  className={`rounded-lg p-2 ${!slot ? 'opacity-40' : 'hover:bg-accent/50'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-xs font-mono text-muted-foreground">{i + 1}</span>
                  {slot ? (
                    <>
                      <PlanetDot planetClassId={(slot as any).planetClassId} size={20} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{(slot as any).planetName}</span>
                        <div className="text-xs text-muted-foreground">
                          {(slot as any).planetClassId && (
                            <span className="text-primary/70 mr-1">
                              {gameConfig?.planetTypes?.find((t) => t.id === (slot as any).planetClassId)?.name ?? ''}
                            </span>
                          )}
                          {(slot as any).allianceTag && <span className="text-primary mr-1">[{(slot as any).allianceTag}]</span>}
                          {(slot as any).username}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-auto">
                        {isOtherPlayer && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-6 px-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
                              onClick={() => navigate(`/fleet/send?mission=spy&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                            >
                              Espionner
                            </Button>
                            {canAttack && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-6 px-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                onClick={() => navigate(`/fleet/send?mission=attack&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                              >
                                Attaquer
                              </Button>
                            )}
                          </>
                        )}
                        {(slot as any).debris && ((slot as any).debris.minerai > 0 || (slot as any).debris.silicium > 0) && (
                          <Link
                            to={`/fleet/send?mission=recycle&galaxy=${galaxy}&system=${system}&position=${i + 1}`}
                            className="inline-flex items-center justify-center rounded hover:bg-orange-500/10 p-0.5 cursor-pointer"
                            title={`Débris: ${(slot as any).debris.minerai.toLocaleString('fr-FR')} minerai, ${(slot as any).debris.silicium.toLocaleString('fr-FR')} silicium`}
                          >
                            <DebrisFieldIcon size={18} title="Champ de débris" />
                          </Link>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="h-5 w-5 rounded-full bg-muted/30" />
                      <span className="flex-1 text-sm text-muted-foreground">Vide</span>
                      {hasColonizer && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-6 px-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                          onClick={() => navigate(`/fleet/send?mission=colonize&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                        >
                          Coloniser
                        </Button>
                      )}
                    </>
                  )}
                  </div>
                  {isPlanet && !isOtherPlayer && (slot as any).biomes && (slot as any).biomes.length > 0 && (
                    <div className="pl-9">
                      <BiomeSummary biomes={(slot as any).biomes} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop graphical view */}
          <div className="hidden lg:block">
            <GalaxySystemView
              galaxy={galaxy}
              system={system}
              rawSlots={data?.slots ?? []}
              currentUserId={currentUser?.id ?? null}
              myAllianceId={myAlliance?.id ?? null}
              planetTypes={planetTypesList}
              hasColonizer={hasColonizer}
              hasExplorer={hasExplorer}
              hasSpy={hasSpy}
              hasCombatShip={hasCombatShip}
              hasRecycler={hasRecycler}
              hasMiner={hasMiner}
              beltMissions={beltMissionsRecord}
              myCapitalPosition={myCapitalPosition}
              onSystemPrev={handleSystemPrev}
              onSystemNext={handleSystemNext}
              onCoordinateChange={handleCoordinateChange}
              actions={detailActions}
            />
          </div>
        </>
      )}
    </div>
  );
}
