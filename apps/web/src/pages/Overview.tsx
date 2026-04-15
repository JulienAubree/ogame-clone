import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
import { OverviewSkeleton } from '@/components/common/PageSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryError } from '@/components/common/QueryError';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { eventTypeColor, formatEventText, formatRelativeTime, groupEvents } from '@/lib/game-events';
import { getPlanetImageUrl, getFlagshipImageUrl } from '@/lib/assets';
import { getUnitName } from '@/lib/entity-names';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import ColonizationProgress from './ColonizationProgress';
import {
  HistoryIcon,
  MovementsIcon,
  MissionsIcon,
  FleetIcon,
  DefenseIcon,
  OverviewIcon,
  MoreIcon,
  BuildingsIcon,
  ResearchIcon,
  ShipyardIcon,
  GalaxyIcon,
  FlagshipIcon,
} from '@/lib/icons';

// ── Rarity / biome constants ──

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',    // gray
  uncommon: '#22c55e',  // green
  rare: '#3b82f6',      // blue
  epic: '#a855f7',      // purple
  legendary: '#eab308', // gold
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  epic: 'Epique',
  legendary: 'Legendaire',
};

const STAT_LABELS: Record<string, string> = {
  production_minerai: 'Production minerai',
  production_silicium: 'Production silicium',
  production_hydrogene: 'Production hydrogene',
  energy_production: 'Production energie',
  storage_minerai: 'Stockage minerai',
  storage_silicium: 'Stockage silicium',
  storage_hydrogene: 'Stockage hydrogene',
};

// ── Biome badge with hover popover ──

function BiomeBadge({ biome, size = 'sm' }: { biome: any; size?: 'sm' | 'xs' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const color = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-[11px]';
  const dotSize = 'w-1.5 h-1.5';
  const padding = size === 'xs' ? 'px-1.5 py-px' : 'px-2 py-0.5';

  const handleEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 224; // w-56 = 14rem = 224px
      const viewportWidth = window.innerWidth;
      // Default: align left edge with badge; flip right if it would overflow
      let left = rect.left;
      if (left + popoverWidth > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - popoverWidth - 8);
      }
      setCoords({ top: rect.bottom + 6, left });
    }
    setIsOpen(true);
  };

  const handleLeave = () => {
    setIsOpen(false);
    setCoords(null);
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className={`inline-flex items-center gap-1 rounded-full ${padding} ${textSize} font-medium border cursor-default transition-colors`}
        style={{
          color,
          borderColor: `${color}${isOpen ? '55' : '33'}`,
          backgroundColor: `${color}${isOpen ? '25' : '15'}`,
        }}
      >
        <span
          className={`${dotSize} rounded-full`}
          style={{ backgroundColor: color }}
        />
        {biome.name}
      </span>
      {isOpen && coords && createPortal(
        <div
          className="fixed w-56 rounded-lg border border-border bg-popover p-3 shadow-xl pointer-events-none"
          style={{ top: coords.top, left: coords.left, zIndex: 9999 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold" style={{ color }}>{biome.name}</span>
          </div>
          <span
            className="inline-block rounded-full px-1.5 py-px text-[10px] font-medium mb-2"
            style={{ color, backgroundColor: `${color}20` }}
          >
            {RARITY_LABELS[biome.rarity] ?? biome.rarity}
          </span>
          {biome.description && (
            <p className="text-xs text-muted-foreground mb-2 italic">{biome.description}</p>
          )}
          {biome.effects && biome.effects.length > 0 && (
            <div className="space-y-1">
              {biome.effects.map((e: any, i: number) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{STAT_LABELS[e.stat] ?? e.stat}</span>
                  <span className={e.modifier > 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                    {e.modifier > 0 ? '+' : ''}{Math.round(e.modifier * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Circular gauge (inline, used only here) ──

function ResourceGauge({ current, capacity, rate, label, color, protectedAmount }: {
  current: number;
  capacity: number;
  rate: number;
  label: string;
  color: string;
  protectedAmount?: number;
}) {
  const pct = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="text-center">
      <div className="relative w-[66px] h-[66px] flex items-center justify-center mx-auto">
        <svg className="absolute top-0 left-0 -rotate-90" width={66} height={66}>
          <circle cx={33} cy={33} r={radius} fill="none" stroke={color} strokeWidth={3} opacity={0.2} />
          <circle
            cx={33} cy={33} r={radius} fill="none" stroke={color} strokeWidth={3}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          />
          {protectedAmount != null && protectedAmount > 0 && (() => {
            const protPct = Math.min(100, (protectedAmount / capacity) * 100);
            const protOffset = circumference - (protPct / 100) * circumference;
            return (
              <circle
                cx={33} cy={33} r={radius} fill="none" stroke="#22c55e" strokeWidth={2}
                strokeDasharray={circumference} strokeDashoffset={protOffset}
                strokeLinecap="round" opacity={0.4}
              />
            );
          })()}
        </svg>
        <span className="text-xs font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="text-[10px] mt-1 font-medium" style={{ color }}>{label}</div>
      <div className="text-[10px] text-muted-foreground">+{Math.floor(rate).toLocaleString('fr-FR')}/h</div>
      {protectedAmount != null && protectedAmount > 0 && (
        <div className="text-[9px] text-green-500/70 flex items-center justify-center gap-0.5">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          {Math.floor(protectedAmount).toLocaleString('fr-FR')}
        </div>
      )}
    </div>
  );
}

// ── Production & Storage card (isolated to avoid re-rendering the whole page every second) ──

function ProductionStorageCard({ planetId }: { planetId: string }) {
  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
    resourceData
      ? {
          minerai: resourceData.minerai,
          silicium: resourceData.silicium,
          hydrogene: resourceData.hydrogene,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          mineraiPerHour: resourceData.rates.mineraiPerHour,
          siliciumPerHour: resourceData.rates.siliciumPerHour,
          hydrogenePerHour: resourceData.rates.hydrogenePerHour,
          storageMineraiCapacity: resourceData.rates.storageMineraiCapacity,
          storageSiliciumCapacity: resourceData.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: resourceData.rates.storageHydrogeneCapacity,
        }
      : undefined,
  );

  return (
    <section className="glass-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        Production & Stockage
      </h2>
      <div className="flex justify-around py-2">
        <ResourceGauge
          current={resources?.minerai ?? 0}
          capacity={resourceData?.rates.storageMineraiCapacity ?? 1}
          rate={resourceData?.rates.mineraiPerHour ?? 0}
          label="Minerai"
          color="#fb923c"
          protectedAmount={resourceData?.protectedMinerai}
        />
        <ResourceGauge
          current={resources?.silicium ?? 0}
          capacity={resourceData?.rates.storageSiliciumCapacity ?? 1}
          rate={resourceData?.rates.siliciumPerHour ?? 0}
          label="Silicium"
          color="#34d399"
          protectedAmount={resourceData?.protectedSilicium}
        />
        <ResourceGauge
          current={resources?.hydrogene ?? 0}
          capacity={resourceData?.rates.storageHydrogeneCapacity ?? 1}
          rate={resourceData?.rates.hydrogenePerHour ?? 0}
          label="Hydrogene"
          color="#60a5fa"
          protectedAmount={resourceData?.protectedHydrogene}
        />
      </div>
    </section>
  );
}

// ── Quick action button ──

function QuickAction({ icon: Icon, label, to }: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  to: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/50 text-sm text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <Icon width={16} height={16} className="opacity-70" />
      {label}
    </button>
  );
}

export default function Overview() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const utils = trpc.useUtils();

  const { data: gameConfig } = useGameConfig();
  const { data: planets, isLoading, isError, refetch } = trpc.planet.list.useQuery();

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: techsData } = trpc.research.list.useQuery();
  const techs = techsData?.items;

  const { data: queue } = trpc.shipyard.queue.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: defenses } = trpc.shipyard.defenses.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: allMovements } = trpc.fleet.movements.useQuery();
  const { data: inboundFleets } = trpc.fleet.inbound.useQuery();
  const { data: recentEvents } = trpc.gameEvent.byPlanet.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: flagship } = trpc.flagship.get.useQuery();

  const { data: colonizationStatus } = trpc.colonization.status.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const renameMutation = trpc.planet.rename.useMutation({
    onSuccess: () => {
      utils.planet.list.invalidate();
      setIsRenaming(false);
    },
  });

  // If planet is being colonized, show colonization page instead
  if (colonizationStatus) {
    return <ColonizationProgress />;
  }

  if (isLoading) {
    return <OverviewSkeleton />;
  }

  if (isError && !planets) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader title="Vue d'ensemble" />
        <QueryError error={{ message: 'Impossible de charger vos planetes.' }} retry={() => refetch()} />
      </div>
    );
  }

  const planet = planets?.find((p) => p.id === planetId) ?? planets?.[0];
  if (!planet) {
    return (
      <div className="p-4">
        <EmptyState title="Aucune planete trouvee" description="Aucune planete n'est associee a votre compte." />
      </div>
    );
  }

  const [showPlanetDetail, setShowPlanetDetail] = useState(false);

  const activeBuilding = buildings?.find((b) => b.isUpgrading);
  const activeResearch = techs?.find((t) => t.isResearching);
  const activeQueue = queue?.filter((q) => q.endTime) ?? [];
  const hasActivity = activeBuilding || activeResearch || activeQueue.length > 0;

  const fleetMovements = allMovements?.filter(
    (m) => m.originPlanetId === planet.id,
  );

  // Own fleets heading to this planet from other planets (outbound only)
  const ownInbound = allMovements?.filter(
    (m) =>
      m.phase === 'outbound' &&
      m.originPlanetId !== planet.id &&
      m.targetGalaxy === planet.galaxy &&
      m.targetSystem === planet.system &&
      m.targetPosition === planet.position,
  );

  const planetInbound = inboundFleets?.filter(
    (f) => f.targetGalaxy === planet.galaxy && f.targetSystem === planet.system && f.targetPosition === planet.position,
  );

  const stationaryShips = ships?.filter((s) => s.count > 0) ?? [];
  const stationaryDefenses = defenses?.filter((d) => d.count > 0) ?? [];

  // Aggregate biome bonuses for inline display
  const biomeBonuses: Record<string, number> = {};
  for (const biome of ((planet as any).biomes ?? []) as Array<{ id: string; effects?: Array<{ stat: string; modifier: number }> }>) {
    const configBiome = gameConfig?.biomes?.find((b: any) => b.id === biome.id);
    for (const e of (configBiome?.effects ?? biome.effects ?? []) as Array<{ stat: string; modifier: number }>) {
      if (typeof e.modifier === 'number') biomeBonuses[e.stat] = (biomeBonuses[e.stat] ?? 0) + e.modifier;
    }
  }
  const hasBiomeBonuses = Object.keys(biomeBonuses).length > 0;

  return (
    <div className="space-y-3 p-4 lg:p-6">
      {/* ════ COMPACT HERO ════ */}
      <div className="relative overflow-hidden rounded-2xl -mx-4 -mt-4 lg:mx-0 lg:mt-0">
        <div className="absolute inset-0">
          {planet.planetClassId && planet.planetImageIndex != null ? (
            <img
              src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex)}
              alt=""
              className="h-full w-full object-cover opacity-30 blur-sm scale-110"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        </div>

        <div className="relative px-4 pt-5 pb-4 lg:px-6 lg:pt-6 lg:pb-5">
          <div className="flex items-center gap-4">
            {/* Planet thumbnail — clickable for detail */}
            <button type="button" onClick={() => setShowPlanetDetail(true)} className="shrink-0 cursor-pointer group">
              {planet.planetClassId && planet.planetImageIndex != null ? (
                <img
                  src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
                  alt={planet.name}
                  className="h-14 w-14 lg:h-16 lg:w-16 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-primary/10 transition-all group-hover:ring-2 group-hover:ring-primary/40"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary/30 bg-card text-xl font-bold text-primary shadow-lg transition-all group-hover:ring-2 group-hover:ring-primary/40">
                  {planet.name.charAt(0)}
                </div>
              )}
            </button>

            {/* Title + info */}
            <div className="flex-1 min-w-0">
              {isRenaming ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newName.trim()) {
                      renameMutation.mutate({ planetId: planet.id, name: newName.trim() });
                    }
                  }}
                >
                  <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} className="h-7 text-sm" />
                  <Button type="submit" size="sm" disabled={renameMutation.isPending}>OK</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setIsRenaming(false)}>X</Button>
                </form>
              ) : (
                <h1
                  className={`text-lg lg:text-xl font-bold text-foreground truncate ${!planet.renamed ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                  onClick={!planet.renamed ? () => { setNewName(planet.name); setIsRenaming(true); } : undefined}
                  title={!planet.renamed ? 'Cliquer pour renommer' : undefined}
                >
                  {planet.name}
                  {flagship?.planetId === planet.id && (
                    <FlagshipIcon width={16} height={16} className="inline-block ml-1.5 text-energy align-text-bottom" />
                  )}
                </h1>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>[{planet.galaxy}:{planet.system}:{planet.position}]</span>
                <span className="text-border">|</span>
                <span>{planet.diameter.toLocaleString('fr-FR')} km</span>
                <span className="text-border">|</span>
                <span>{planet.minTemp}&deg;C a {planet.maxTemp}&deg;C</span>
              </div>
            </div>

            {/* Biome bonus summary (desktop only) */}
            {hasBiomeBonuses && (
              <div className="hidden lg:flex flex-wrap gap-1.5 shrink-0 max-w-xs justify-end">
                {Object.entries(biomeBonuses).sort(([,a],[,b]) => b - a).slice(0, 4).map(([stat, mod]) => (
                  <span key={stat} className="text-[10px] rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-emerald-400">
                    {mod > 0 ? '+' : ''}{Math.round(mod * 100)}% {(STAT_LABELS[stat] ?? stat).replace('Production ', '').replace('Stockage ', 'Stock. ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Biomes (mobile) */}
          {(planet as any).biomes && (planet as any).biomes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 lg:hidden">
              {(planet as any).biomes.map((biome: any) => (
                <BiomeBadge key={biome.id} biome={biome} size="xs" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════ DASHBOARD GRID ════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

        {/* ── Production & Stockage (takes full width on mobile, 1 col on desktop) ── */}
        <div className="md:col-span-2 lg:col-span-1">
          {planetId && <ProductionStorageCard planetId={planetId} />}
        </div>

        {/* ── Activites en cours ── */}
        <div className="flex flex-col gap-3">

          {/* Activites en cours */}
          {hasActivity && (
            <section className="glass-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <HistoryIcon width={16} height={16} className="opacity-70" />
                Activites en cours
              </h2>
              <div className="space-y-2">
                {activeBuilding && activeBuilding.upgradeEndTime && (
                  <div
                    className="flex gap-2 p-1.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate('/buildings')}
                  >
                    <GameImage category="buildings" id={activeBuilding.id} size="icon" alt={activeBuilding.name} className="w-7 h-7 rounded-md flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground font-medium">{activeBuilding.name}</span>
                        <span className="text-muted-foreground">Niv. {activeBuilding.currentLevel + 1}</span>
                      </div>
                      <Timer
                        endTime={new Date(activeBuilding.upgradeEndTime)}
                        totalDuration={activeBuilding.nextLevelTime}
                        className="text-[10px] text-muted-foreground"
                        onComplete={() => {
                          utils.building.list.invalidate({ planetId: planetId! });
                          utils.resource.production.invalidate({ planetId: planetId! });
                        }}
                      />
                    </div>
                  </div>
                )}

                {activeResearch && activeResearch.researchEndTime && (
                  <div
                    className="flex gap-2 p-1.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate('/research')}
                  >
                    <GameImage category="research" id={activeResearch.id} size="icon" alt={activeResearch.name} className="w-7 h-7 rounded-md flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground font-medium">{activeResearch.name}</span>
                        <span className="text-muted-foreground">Niv. {activeResearch.currentLevel + 1}</span>
                      </div>
                      <Timer
                        endTime={new Date(activeResearch.researchEndTime)}
                        totalDuration={activeResearch.nextLevelTime}
                        className="text-[10px] text-muted-foreground"
                        onComplete={() => {
                          utils.research.list.invalidate();
                        }}
                      />
                    </div>
                  </div>
                )}

                {activeQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-2 p-1.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate('/shipyard')}
                  >
                    <GameImage category={item.type === 'defense' ? 'defenses' : 'ships'} id={item.itemId} size="icon" alt={getUnitName(item.itemId, gameConfig)} className="w-7 h-7 rounded-md flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground font-medium">{getUnitName(item.itemId, gameConfig)}</span>
                        <span className="text-muted-foreground">x{item.quantity - (item.completedCount ?? 0)}</span>
                      </div>
                      {item.status === 'active' && item.endTime ? (
                        <Timer
                          endTime={new Date(item.endTime)}
                          totalDuration={Math.floor((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 1000)}
                          className="text-[10px] text-muted-foreground"
                          onComplete={() => {
                            utils.shipyard.queue.invalidate({ planetId: planetId! });
                            utils.shipyard.ships.invalidate({ planetId: planetId! });
                          }}
                        />
                      ) : (
                        <div className="text-[10px] text-muted-foreground">En attente</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Mouvements de flotte */}
          {fleetMovements && fleetMovements.length > 0 && (
            <section className="glass-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <MovementsIcon width={16} height={16} className="opacity-70" />
                Mouvements de flotte
              </h2>
              <div className="space-y-1.5">
                {fleetMovements.map((event) => {
                  const isReturn = event.phase === 'return';
                  const ships = event.ships as Record<string, number>;
                  const shipCount = Object.values(ships).reduce((sum, n) => sum + n, 0);
                  const missionLabel = gameConfig?.missions[event.mission]?.label ?? event.mission;
                  const targetCoords = `[${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}]`;
                  const originCoords = planet ? `[${planet.galaxy}:${planet.system}:${planet.position}]` : '';

                  const hex = gameConfig?.missions[event.mission]?.color ?? '#3b82f6';

                  const dep = new Date(event.departureTime).getTime();
                  const arr = new Date(event.arrivalTime).getTime();
                  const total = arr - dep;
                  const progress = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - dep) / total) * 100)) : 100;

                  const hasCargo = Number(event.mineraiCargo) > 0 || Number(event.siliciumCargo) > 0 || Number(event.hydrogeneCargo) > 0;

                  return (
                    <div
                      key={event.id}
                      className="px-2.5 py-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors space-y-1.5"
                      onClick={() => navigate('/fleet/movements')}
                    >
                      {/* Line 1: Mission + Phase + Timer */}
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: hex, boxShadow: `0 0 6px ${hex}60` }}
                        />
                        <span className="text-sm font-medium text-foreground">{missionLabel}</span>
                        <span className="text-[10px] text-muted-foreground/70">{gameConfig?.labels[`phase.${event.phase}`] ?? event.phase}</span>
                        <div className="ml-auto flex-shrink-0">
                          <Timer
                            endTime={new Date(event.arrivalTime)}
                            onComplete={() => utils.fleet.movements.invalidate()}
                          />
                        </div>
                      </div>
                      {/* Line 2: Route + ship count */}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-4">
                        <span className="truncate">
                          {isReturn ? `${targetCoords} → ${planet?.name ?? ''} ${originCoords}` : `${planet?.name ?? ''} ${originCoords} → ${targetCoords}`}
                        </span>
                        <span className="text-muted-foreground/30 flex-shrink-0">·</span>
                        <span className="flex-shrink-0">{shipCount} vsx</span>
                        {hasCargo && (
                          <>
                            <span className="text-muted-foreground/30 flex-shrink-0">·</span>
                            <span className="flex-shrink-0 text-amber-400/70">cargo</span>
                          </>
                        )}
                      </div>
                      {/* Mini progress bar */}
                      <div className="h-0.5 rounded-full bg-white/[0.04] overflow-hidden ml-4">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${progress}%`, background: hex }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Mes flottes en approche (own inbound from other planets) */}
          {ownInbound && ownInbound.length > 0 && (
            <section className="glass-card p-4 ring-1 ring-emerald-500/10">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400">Flottes en approche</span>
                <span className="text-[10px] text-emerald-400/60 ml-auto">{ownInbound.length}</span>
              </h2>
              <div className="space-y-1.5">
                {ownInbound.map((event) => {
                  const ships = event.ships as Record<string, number>;
                  const shipCount = Object.values(ships).reduce((sum, n) => sum + n, 0);
                  const missionLabel = gameConfig?.missions[event.mission]?.label ?? event.mission;
                  const hex = gameConfig?.missions[event.mission]?.color ?? '#10b981';

                  const originPl = planets?.find((p) => p.id === event.originPlanetId);
                  const originName = originPl?.name ?? 'Planète';
                  const originCoords = originPl
                    ? `[${originPl.galaxy}:${originPl.system}:${originPl.position}]`
                    : '';

                  const hasCargo =
                    Number(event.mineraiCargo) > 0 ||
                    Number(event.siliciumCargo) > 0 ||
                    Number(event.hydrogeneCargo) > 0;

                  const dep = new Date(event.departureTime).getTime();
                  const arr = new Date(event.arrivalTime).getTime();
                  const total = arr - dep;
                  const progress =
                    total > 0
                      ? Math.min(100, Math.max(0, ((Date.now() - dep) / total) * 100))
                      : 100;

                  return (
                    <div
                      key={event.id}
                      className="px-2.5 py-2 rounded-md cursor-pointer hover:bg-emerald-500/5 transition-colors space-y-1.5"
                      onClick={() => navigate('/fleet/movements')}
                    >
                      {/* Line 1: Mission + Phase + Timer */}
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: hex, boxShadow: `0 0 6px ${hex}60` }}
                        />
                        <span className="text-sm font-medium text-foreground">{missionLabel}</span>
                        <span className="text-[10px] text-muted-foreground/70">
                          {gameConfig?.labels[`phase.${event.phase}`] ?? event.phase}
                        </span>
                        <div className="ml-auto flex-shrink-0">
                          <Timer
                            endTime={new Date(event.arrivalTime)}
                            onComplete={() => utils.fleet.movements.invalidate()}
                          />
                        </div>
                      </div>
                      {/* Line 2: Route + ship count */}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-4">
                        <span className="truncate">
                          {originName} {originCoords} → ici
                        </span>
                        <span className="text-muted-foreground/30 flex-shrink-0">·</span>
                        <span className="flex-shrink-0">{shipCount} vsx</span>
                        {hasCargo && (
                          <>
                            <span className="text-muted-foreground/30 flex-shrink-0">·</span>
                            <span className="flex-shrink-0 text-amber-400/70">cargo</span>
                          </>
                        )}
                      </div>
                      {/* Mini progress bar */}
                      <div className="h-0.5 rounded-full bg-white/[0.04] overflow-hidden ml-4">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${progress}%`, background: hex }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Flottes entrantes */}
          {planetInbound && planetInbound.length > 0 && (() => {
            const hostileInbound = planetInbound.filter((e) => (e as any).hostile);
            const peacefulInbound = planetInbound.filter((e) => !(e as any).hostile);
            return (
            <>
              {/* Hostile inbound — alert banner */}
              {hostileInbound.length > 0 && (
                <section
                  className="relative overflow-hidden rounded-xl border border-red-500/40 cursor-pointer hover:border-red-500/60 transition-colors"
                  style={{ background: 'linear-gradient(135deg, rgba(127,29,29,0.5) 0%, rgba(69,10,10,0.6) 50%, rgba(127,29,29,0.4) 100%)' }}
                  onClick={() => navigate('/fleet/movements')}
                >
                  {/* Animated scan line */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(239,68,68,0.08) 50%, transparent 100%)',
                      animation: 'scan 3s ease-in-out infinite',
                    }}
                  />
                  <style>{`@keyframes scan { 0%,100% { transform: translateX(-100%); } 50% { transform: translateX(100%); } }`}</style>

                  {/* Top red accent bar */}
                  <div className="h-1 w-full bg-gradient-to-r from-red-600 via-red-500 to-red-600" />

                  <div className="px-4 py-3 space-y-2.5 relative">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                          <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-40" />
                        </div>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </div>
                      <span className="text-red-400 font-bold text-sm uppercase tracking-wider">
                        Attaque imminente
                      </span>
                      <span className="text-red-400/60 text-[10px] font-semibold ml-auto">
                        {hostileInbound.length} flotte{hostileInbound.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Fleet entries */}
                    {hostileInbound.map((event) => {
                      const tier = (event as any).detectionTier ?? 0;
                      const ships = event.ships as Record<string, number>;
                      const shipCount = tier >= 3
                        ? Object.values(ships).reduce((sum, n) => sum + n, 0)
                        : tier >= 2 ? ((event as any).shipCount ?? 0) : 0;
                      const hasOrigin = tier >= 1;
                      const hasSender = tier >= 4;

                      const dep = new Date(event.departureTime).getTime();
                      const arr = new Date(event.arrivalTime).getTime();
                      const total = arr - dep;
                      const progress = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - dep) / total) * 100)) : 100;

                      return (
                        <div key={event.id} className="space-y-1.5 border-t border-red-500/20 pt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-red-300">
                              {hasSender ? (
                                <>
                                  {event.allianceTag && <span className="text-red-400 mr-1">[{event.allianceTag}]</span>}
                                  {event.senderUsername}
                                </>
                              ) : (
                                <span className="italic text-red-400/50">Attaquant inconnu</span>
                              )}
                            </span>
                            <div className="ml-auto">
                              <Timer
                                endTime={new Date(event.arrivalTime)}
                                onComplete={() => utils.fleet.inbound.invalidate()}
                                className="!text-red-400 font-bold"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-red-300/60">
                            <span>{hasOrigin ? `[${event.originGalaxy}:${event.originSystem}:${event.originPosition}]` : '???'} → ici</span>
                            {shipCount > 0 && (
                              <>
                                <span className="text-red-500/30">·</span>
                                <span>{shipCount} vaisseaux</span>
                              </>
                            )}
                          </div>
                          <div className="h-1 rounded-full bg-red-950/60 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Peaceful inbound */}
              {peacefulInbound.length > 0 && (
                <section className="glass-card p-4 ring-1 ring-yellow-500/10">
                  <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-yellow-400">Flottes entrantes</span>
                    <span className="text-[10px] text-yellow-400/60 ml-auto">{peacefulInbound.length}</span>
                  </h2>
                  <div className="space-y-1.5">
                    {peacefulInbound.map((event) => {
                      const ships = event.ships as Record<string, number>;
                      const shipCount = Object.values(ships).reduce((sum, n) => sum + n, 0);
                      const missionLabel = gameConfig?.missions[event.mission]?.label ?? event.mission;
                      const hex = gameConfig?.missions[event.mission]?.color ?? '#eab308';

                      const originCoords = `[${event.originGalaxy}:${event.originSystem}:${event.originPosition}]`;
                      const hasCargo = Number(event.mineraiCargo) > 0 || Number(event.siliciumCargo) > 0 || Number(event.hydrogeneCargo) > 0;

                      const dep = new Date(event.departureTime).getTime();
                      const arr = new Date(event.arrivalTime).getTime();
                      const total = arr - dep;
                      const progress = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - dep) / total) * 100)) : 100;

                      return (
                        <div
                          key={event.id}
                          className="px-2.5 py-2 rounded-md cursor-pointer hover:bg-yellow-500/5 transition-colors space-y-1.5"
                          onClick={() => navigate('/fleet/movements')}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: hex, boxShadow: `0 0 6px ${hex}60` }}
                            />
                            <span className="text-sm font-medium text-foreground">{missionLabel}</span>
                            <span className="text-[10px] text-muted-foreground/70">
                              {event.allianceTag && <span className="text-yellow-400 font-semibold mr-1">[{event.allianceTag}]</span>}
                              {event.senderUsername}
                            </span>
                            <div className="ml-auto flex-shrink-0">
                              <Timer
                                endTime={new Date(event.arrivalTime)}
                                onComplete={() => utils.fleet.inbound.invalidate()}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-4">
                            <span className="truncate">
                              {event.originPlanetName ?? 'Planète'} {originCoords} → ici
                            </span>
                            <span className="text-muted-foreground/30 flex-shrink-0">·</span>
                            <span className="flex-shrink-0">{shipCount} vsx</span>
                            {hasCargo && (
                              <>
                                <span className="text-muted-foreground/30 flex-shrink-0">·</span>
                                <span className="flex-shrink-0 text-amber-400/70">cargo</span>
                              </>
                            )}
                          </div>
                          <div className="h-0.5 rounded-full bg-white/[0.04] overflow-hidden ml-4">
                            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: hex }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
            );
          })()}

          {/* Evenements recents */}
          <section className="glass-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <MissionsIcon width={16} height={16} className="opacity-70" />
              Evenements recents
            </h2>
            {recentEvents && recentEvents.length > 0 ? (
              <div className="space-y-0.5">
                {groupEvents(recentEvents).map((event) => (
                  <div key={event.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${eventTypeColor(event.type)}`} />
                      <span className="text-muted-foreground">{formatEventText(event, { missions: gameConfig?.missions })}</span>
                    </div>
                    <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">{formatRelativeTime(event.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun evenement recent</p>
            )}
          </section>

          {/* Flotte stationnee */}
          {stationaryShips.length > 0 && (
            <section className="glass-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <FleetIcon width={16} height={16} className="opacity-70" />
                Flotte stationnee
              </h2>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {stationaryShips.map((ship) => (
                  <div key={ship.id} className="flex justify-between px-2 py-1.5 rounded bg-muted/30">
                    <span className="text-muted-foreground">{ship.name}</span>
                    <span className="text-foreground font-semibold">{ship.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Defenses planetaires */}
          {stationaryDefenses.length > 0 && (
            <section className="glass-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <DefenseIcon width={16} height={16} className="opacity-70" />
                Defenses planetaires
              </h2>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {stationaryDefenses.map((def) => (
                  <div key={def.id} className="flex justify-between px-2 py-1.5 rounded bg-muted/30">
                    <span className="text-muted-foreground">{def.name}</span>
                    <span className="text-foreground font-semibold">{def.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Colonne 3: Flotte + Flagship + Quick nav ── */}
        <div className="flex flex-col gap-3">

          {/* Vaisseau amiral */}
          {flagship && (
            <section
              className="glass-card p-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => navigate('/flagship')}
            >
              <div className="flex items-center gap-3">
                {flagship.flagshipImageIndex ? (
                  <img
                    src={getFlagshipImageUrl(flagship.hullId ?? 'industrial', flagship.flagshipImageIndex, 'icon')}
                    alt={flagship.name}
                    className="w-9 h-9 rounded-lg object-cover border border-white/10 flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-white/10 flex items-center justify-center text-[10px] font-bold text-primary/30 flex-shrink-0">VA</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{flagship.name}</div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${flagship.status === 'active' ? 'bg-emerald-400' : flagship.status === 'in_mission' ? 'bg-blue-400' : 'bg-red-400'}`} />
                    <span className={flagship.status === 'active' ? 'text-emerald-400' : flagship.status === 'in_mission' ? 'text-blue-400' : 'text-red-400'}>
                      {flagship.status === 'active' ? 'Operationnel' : flagship.status === 'in_mission' ? 'En mission' : 'Incapacite'}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Quick nav */}
          <section className="glass-card p-3">
            <div className="grid grid-cols-3 gap-1.5">
              <QuickAction icon={BuildingsIcon} label="Batiments" to="/buildings" />
              <QuickAction icon={ResearchIcon} label="Recherche" to="/research" />
              <QuickAction icon={ShipyardIcon} label="Chantier" to="/shipyard" />
              <QuickAction icon={DefenseIcon} label="Defense" to="/defense" />
              <QuickAction icon={FleetIcon} label="Flotte" to="/fleet" />
              <QuickAction icon={GalaxyIcon} label="Galaxie" to="/galaxy" />
            </div>
          </section>
        </div>
      </div>

      {/* ════ PLANET DETAIL OVERLAY ════ */}
      <EntityDetailOverlay
        open={showPlanetDetail}
        onClose={() => setShowPlanetDetail(false)}
        title={planet.name}
      >
        <PlanetDetailContent planet={planet} resourceData={resourceData} gameConfig={gameConfig} />
      </EntityDetailOverlay>
    </div>
  );
}

// ── Planet detail content (shown in overlay on planet click) ──

function PlanetDetailContent({ planet, resourceData, gameConfig }: {
  planet: any;
  resourceData: any;
  gameConfig: any;
}) {
  const biomes = (planet.biomes ?? []) as Array<{
    id: string; name: string; rarity: string;
    effects?: Array<{ stat: string; modifier: number }>;
  }>;

  // Aggregate all biome bonuses
  const aggregatedBonuses: Record<string, number> = {};
  for (const biome of biomes) {
    const configBiome = gameConfig?.biomes?.find((b: any) => b.id === biome.id);
    const effects = (configBiome?.effects ?? biome.effects ?? []) as Array<{ stat: string; modifier: number }>;
    for (const e of effects) {
      if (typeof e.modifier === 'number') {
        aggregatedBonuses[e.stat] = (aggregatedBonuses[e.stat] ?? 0) + e.modifier;
      }
    }
  }

  const planetTypeName = gameConfig?.planetTypes?.find((t: any) => t.id === planet.planetClassId)?.name ?? planet.planetClassId;

  return (
    <>
      {/* Hero image */}
      <div className="relative -mx-5 -mt-5 h-[200px] overflow-hidden">
        {planet.planetClassId && planet.planetImageIndex != null ? (
          <img
            src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex)}
            alt={planet.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{planet.name}</h3>
            <p className="text-xs text-white/70">[{planet.galaxy}:{planet.system}:{planet.position}]</p>
          </div>
          <span className="text-xs font-medium text-white/80 bg-white/10 rounded-full px-2.5 py-0.5 backdrop-blur-sm">
            {planetTypeName}
          </span>
        </div>
      </div>

      {/* Characteristics */}
      <div className="mt-4">
        <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-2">
          Caracteristiques
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/30 bg-card/50 px-3 py-2">
            <div className="text-[10px] text-muted-foreground">Diametre</div>
            <div className="text-sm font-bold text-foreground">{planet.diameter.toLocaleString('fr-FR')} km</div>
          </div>
          <div className="rounded-lg border border-border/30 bg-card/50 px-3 py-2">
            <div className="text-[10px] text-muted-foreground">Temperature</div>
            <div className="text-sm font-bold text-foreground">{planet.minTemp}&deg;C a {planet.maxTemp}&deg;C</div>
          </div>
          {resourceData && (
            <>
              <div className="rounded-lg border border-border/30 bg-card/50 px-3 py-2">
                <div className="text-[10px] text-muted-foreground">Energie</div>
                <div className="text-sm font-bold">
                  <span className={(resourceData.rates?.energyProduced ?? 0) >= (resourceData.rates?.energyConsumed ?? 0) ? 'text-emerald-400' : 'text-red-400'}>
                    {resourceData.rates?.energyProduced ?? 0} / {resourceData.rates?.energyConsumed ?? 0}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-border/30 bg-card/50 px-3 py-2">
                <div className="text-[10px] text-muted-foreground">Production totale</div>
                <div className="text-sm font-bold text-foreground">
                  {((resourceData.rates?.mineraiPerHour ?? 0) + (resourceData.rates?.siliciumPerHour ?? 0) + (resourceData.rates?.hydrogenePerHour ?? 0)).toLocaleString('fr-FR')}/h
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Biomes with full effects */}
      {biomes.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-2">
            Biomes actifs ({biomes.length})
          </div>
          <div className="space-y-2">
            {biomes.map((biome) => {
              const color = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
              const configBiome = gameConfig?.biomes?.find((b: any) => b.id === biome.id);
              const effects = (configBiome?.effects ?? biome.effects ?? []) as Array<{ stat: string; modifier: number }>;
              return (
                <div
                  key={biome.id}
                  className="rounded-lg px-3 py-2"
                  style={{ backgroundColor: `${color}10`, borderLeft: `3px solid ${color}` }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm font-semibold" style={{ color }}>{biome.name}</span>
                    <span className="text-[10px] rounded-full px-1.5 py-px font-medium" style={{ color, backgroundColor: `${color}20` }}>
                      {RARITY_LABELS[biome.rarity] ?? biome.rarity}
                    </span>
                  </div>
                  {effects.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 ml-4 text-xs">
                      {effects.map((e: any, i: number) => (
                        <span key={i}>
                          <span className={e.modifier > 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                            {e.modifier > 0 ? '+' : ''}{Math.round(e.modifier * 100)}%
                          </span>{' '}
                          <span className="text-muted-foreground">{STAT_LABELS[e.stat] ?? e.stat}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aggregated bonuses */}
      {Object.keys(aggregatedBonuses).length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-2">
            Bonus cumules des biomes
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
              {Object.entries(aggregatedBonuses)
                .sort(([, a], [, b]) => b - a)
                .map(([stat, modifier]) => (
                  <div key={stat} className="flex justify-between">
                    <span className="text-muted-foreground">{STAT_LABELS[stat] ?? stat}</span>
                    <span className={modifier > 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                      {modifier > 0 ? '+' : ''}{Math.round(modifier * 100)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
