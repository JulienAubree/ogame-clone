import { useState, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router';
import { Building2 } from 'lucide-react';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { useGameConfig } from '@/hooks/useGameConfig';
import { OverviewSkeleton } from '@/components/common/PageSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryError } from '@/components/common/QueryError';
import { getPlanetImageUrl } from '@/lib/assets';
import ColonizationProgress from './ColonizationProgress';

// Above-the-fold: imported eagerly so first paint has the hero + KPIs.
import { OverviewHero } from '@/components/overview/OverviewHero';
import { OverviewKpiBar } from '@/components/overview/OverviewKpiBar';

// Below-the-fold: split into separate chunks, fetched after the initial paint.
// Placeholder is a subtle skeleton — users rarely notice since the hero is
// already paintable while these resolve.
const OverviewActivities = lazy(() => import('@/components/overview/OverviewActivities').then((m) => ({ default: m.OverviewActivities })));
const AttackAlert = lazy(() => import('@/components/overview/AttackAlert').then((m) => ({ default: m.AttackAlert })));
const GovernanceAlert = lazy(() => import('@/components/overview/GovernanceAlert').then((m) => ({ default: m.GovernanceAlert })));
const OverviewGrid = lazy(() => import('@/components/overview/OverviewGrid').then((m) => ({ default: m.OverviewGrid })));
const OverviewEvents = lazy(() => import('@/components/overview/OverviewEvents').then((m) => ({ default: m.OverviewEvents })));

const LazySkel = () => <div className="h-20 rounded-md bg-panel-bg/40 animate-pulse" />;

// ── Rarity / biome constants (used by BiomeBadge) ──

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

interface BiomeLike {
  id?: string;
  name: string;
  rarity: string;
  description?: string;
  effects?: Array<{ stat: string; modifier: number }>;
}

function BiomeBadge({ biome, size = 'sm' }: { biome: BiomeLike; size?: 'sm' | 'xs' }) {
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
      const popoverWidth = 224;
      const viewportWidth = window.innerWidth;
      let left = rect.left;
      if (left + popoverWidth > viewportWidth - 8) {
        left = Math.max(8, viewportWidth - popoverWidth - 8);
      }
      setCoords({ top: rect.bottom + 6, left });
    }
    setIsOpen(true);
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={() => { setIsOpen(false); setCoords(null); }}
        className={`inline-flex items-center gap-1 rounded-full ${padding} ${textSize} font-medium border cursor-default transition-colors`}
        style={{
          color,
          borderColor: `${color}${isOpen ? '55' : '33'}`,
          backgroundColor: `${color}${isOpen ? '25' : '15'}`,
        }}
      >
        <span className={`${dotSize} rounded-full`} style={{ backgroundColor: color }} />
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
              {biome.effects.map((e, i) => (
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

function PlanetDetailContent({ planet, resourceData, gameConfig, governance }: { planet: any; resourceData: any; gameConfig: any; governance?: { colonyCount: number; capacity: number; overextend: number; harvestMalus: number; constructionMalus: number } | null }) {
  const biomes = (planet.biomes ?? []) as Array<{ id: string; name: string; rarity: string; effects?: Array<{ stat: string; modifier: number }> }>;

  // Aggregate all biome bonuses
  const biomeBonuses: Record<string, number> = {};
  for (const biome of biomes) {
    const configBiome = gameConfig?.biomes?.find((b: { id: string }) => b.id === biome.id);
    const effects = (configBiome?.effects ?? biome.effects ?? []) as Array<{ stat: string; modifier: number }>;
    for (const e of effects) {
      if (typeof e.modifier === 'number') biomeBonuses[e.stat] = (biomeBonuses[e.stat] ?? 0) + e.modifier;
    }
  }

  // Planet type bonuses — values are multipliers (0.8 = -20%, 1.2 = +20%)
  const planetTypeName = gameConfig?.planetTypes?.find((t: { id: string; name?: string }) => t.id === planet.planetClassId)?.name ?? planet.planetClassId;
  const typeBonus = resourceData?.planetTypeBonus as { mineraiBonus: number; siliciumBonus: number; hydrogeneBonus: number } | undefined;
  const typeBonusEntries: Array<{ stat: string; pct: number }> = [];
  if (typeBonus) {
    if (typeBonus.mineraiBonus !== 1) typeBonusEntries.push({ stat: 'production_minerai', pct: Math.round((typeBonus.mineraiBonus - 1) * 100) });
    if (typeBonus.siliciumBonus !== 1) typeBonusEntries.push({ stat: 'production_silicium', pct: Math.round((typeBonus.siliciumBonus - 1) * 100) });
    if (typeBonus.hydrogeneBonus !== 1) typeBonusEntries.push({ stat: 'production_hydrogene', pct: Math.round((typeBonus.hydrogeneBonus - 1) * 100) });
  }

  // Total cumulated bonuses (type deltas + biome deltas + governance malus)
  const totalBonuses: Record<string, number> = {};
  for (const entry of typeBonusEntries) {
    totalBonuses[entry.stat] = entry.pct / 100;
  }
  for (const [stat, mod] of Object.entries(biomeBonuses)) {
    totalBonuses[stat] = (totalBonuses[stat] ?? 0) + mod;
  }
  if (governance && governance.harvestMalus > 0) {
    for (const stat of ['production_minerai', 'production_silicium', 'production_hydrogene']) {
      totalBonuses[stat] = (totalBonuses[stat] ?? 0) - governance.harvestMalus;
    }
  }

  return (
    <>
      {/* Hero image */}
      <div className="relative -mx-5 -mt-5 h-[200px] overflow-hidden">
        {planet.planetClassId && planet.planetImageIndex != null ? (
          <img src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex)} alt={planet.name} className="w-full h-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{planet.name}</h3>
            <p className="text-xs text-white/70">[{planet.galaxy}:{planet.system}:{planet.position}]</p>
          </div>
          <span className="text-xs font-medium text-white/80 bg-white/10 rounded-full px-2.5 py-0.5 backdrop-blur-sm">{planetTypeName}</span>
        </div>
      </div>

      {/* Bonus cumules (type + biomes) — tout en haut */}
      {Object.keys(totalBonuses).length > 0 && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="text-[10px] uppercase text-primary/70 font-semibold tracking-wider mb-2">Bonus cumules (type + biomes)</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(totalBonuses).map(([stat, mod]) => (
              <span key={stat} className={`text-sm font-semibold ${mod > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {mod > 0 ? '+' : ''}{Math.round(mod * 100)}% {STAT_LABELS[stat] ?? stat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Type de planete + ses bonus */}
      <div className="mt-4">
        <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-2">Type de planète</div>
        <div className="rounded-md border border-border/30 bg-card/50 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{planetTypeName}</span>
          </div>
          {typeBonusEntries.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 mt-1.5">
              {typeBonusEntries.map((b) => (
                <span key={b.stat} className={`text-xs ${b.pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.pct > 0 ? '+' : ''}{b.pct}% {STAT_LABELS[b.stat] ?? b.stat}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Aucun bonus de type</p>
          )}
        </div>
      </div>

      {/* Gouvernance (surextension) */}
      {governance && governance.overextend > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-2">Gouvernance</div>
          <div className="rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Building2 className="h-3.5 w-3.5" stroke="#d97706" strokeWidth={2} />
              <span className="text-amber-400 font-semibold">Surextension impériale</span>
              <span className="text-amber-400/60 text-[10px] ml-auto">{governance.colonyCount}/{governance.capacity} colonies (+{governance.overextend})</span>
            </div>
            <div className="flex flex-wrap gap-x-4 ml-5">
              <span className="text-xs text-red-400">Malus récolte : -{Math.round(governance.harvestMalus * 100)}%</span>
              <span className="text-xs text-red-400">Malus construction : +{Math.round(governance.constructionMalus * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Biomes + leurs bonus */}
      <div className="mt-4">
        <div className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider mb-2">
          Biomes {biomes.length > 0 && <span className="text-muted-foreground/50">({biomes.length})</span>}
        </div>
        {biomes.length > 0 ? (
          <div className="space-y-2">
            {biomes.map((biome) => {
              const bColor = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
              const configBiome = gameConfig?.biomes?.find((b: { id: string }) => b.id === biome.id);
              const effects = (configBiome?.effects ?? biome.effects ?? []) as Array<{ stat: string; modifier: number }>;
              return (
                <div key={biome.id} className="rounded-md px-3 py-2" style={{ backgroundColor: `${bColor}10`, borderLeft: `3px solid ${bColor}` }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: bColor }} />
                    <span className="text-xs font-semibold" style={{ color: bColor }}>{biome.name}</span>
                    <span className="text-[9px] rounded-full px-1.5 py-px" style={{ color: bColor, backgroundColor: `${bColor}20` }}>
                      {RARITY_LABELS[biome.rarity] ?? biome.rarity}
                    </span>
                  </div>
                  {effects.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 mt-1 ml-4">
                      {effects.map((e, i) => (
                        <span key={i} className={`text-[10px] ${e.modifier > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {e.modifier > 0 ? '+' : ''}{Math.round(e.modifier * 100)}% {STAT_LABELS[e.stat] ?? e.stat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Aucun biome découvert</p>
        )}
      </div>
    </>
  );
}

export default function Overview() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();

  // ── All hooks MUST come before any conditional returns (React rule #310) ──

  const { data: gameConfig } = useGameConfig();
  const { data: planets, isLoading, isError, refetch } = trpc.planet.list.useQuery();

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const liveResources = useResourceCounter(
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

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: techsData } = trpc.research.list.useQuery();
  const techs = techsData?.items;

  const { data: shipyardQueue } = trpc.shipyard.queue.useQuery(
    { planetId: planetId!, facilityId: 'shipyard' },
    { enabled: !!planetId },
  );

  const { data: commandCenterQueue } = trpc.shipyard.queue.useQuery(
    { planetId: planetId!, facilityId: 'commandCenter' },
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

  const { data: governance } = trpc.colonization.governance.useQuery();

  // ── Guards — all hooks above, conditional returns only below ──

  if (isLoading || !planets) return <OverviewSkeleton />;
  if (colonizationStatus) return <ColonizationProgress />;
  if (isError) return (
    <div className="p-4 space-y-4">
      <QueryError error={{ message: 'Impossible de charger vos planètes.' }} retry={() => void refetch()} />
    </div>
  );

  const planet = planets?.find((p) => p.id === planetId) ?? planets?.[0];
  if (!planet) return (
    <div className="p-4">
      <EmptyState title="Aucune planète trouvée" description="Aucune planète n'est associée à votre compte." />
    </div>
  );

  // ── Derive data for child components ──

  const activeBuilding = buildings?.find((b) => b.isUpgrading && b.upgradeEndTime);
  const activeResearch = techs?.find((t) => t.isResearching);
  void activeResearch; // available if needed by future components

  const stationaryShips = (ships?.filter((s) => s.count > 0) ?? []) as Array<{ id: string; name: string; count: number }>;
  const stationaryDefenses = (defenses?.filter((d) => d.count > 0) ?? []) as Array<{ id: string; name: string; count: number }>;

  // Movements from/to this planet
  const outboundMovements = allMovements?.filter((m) => m.originPlanetId === planet.id) ?? [];
  const ownInbound = allMovements?.filter(
    (m) => m.phase === 'outbound' && m.originPlanetId !== planet.id &&
      m.targetGalaxy === planet.galaxy && m.targetSystem === planet.system && m.targetPosition === planet.position,
  ) ?? [];
  const planetInbound = inboundFleets?.filter(
    (f) => f.targetGalaxy === planet.galaxy && f.targetSystem === planet.system && f.targetPosition === planet.position,
  ) ?? [];
  const hostileInbound = planetInbound.filter((e) => (e as any).hostile);
  const peacefulInbound = planetInbound.filter((e) => !(e as any).hostile);

  const allMovementsForGrid = [...outboundMovements, ...ownInbound, ...peacefulInbound] as any[];

  // Governance malus for the current planet (homeworld is exempt)
  const isHomeworld = planet.planetClassId === 'homeworld';
  const effectiveGovernance = governance && governance.overextend > 0 && !isHomeworld ? governance : null;

  return (
    <div className="space-y-3">
      {/* 1. Hero */}
      <OverviewHero
        planet={planet as any}
        flagshipOnPlanet={flagship?.planetId === planet.id}
        planetTypeName={resourceData?.planetTypeName}
        planetTypeBonus={resourceData?.planetTypeBonus}
        governance={effectiveGovernance}
        allPlanets={planets.map((p) => ({
          id: p.id,
          name: p.name,
          galaxy: p.galaxy,
          system: p.system,
          position: p.position,
          planetClassId: p.planetClassId,
          status: (p as any).status,
        }))}
        renderBiomeBadge={(biome) => <BiomeBadge biome={biome} size="xs" />}
        renderPlanetDetail={(p) => <PlanetDetailContent planet={p} resourceData={resourceData} gameConfig={gameConfig} governance={effectiveGovernance} />}
      />

      {/* Content with padding */}
      <div className="space-y-3 px-4 pb-4 lg:px-6 lg:pb-6">

      {/* 2. KPI Bar */}
      <OverviewKpiBar
        resources={resourceData ? {
          minerai: resourceData.minerai,
          silicium: resourceData.silicium,
          hydrogene: resourceData.hydrogene,
          mineraiPerHour: resourceData.rates.mineraiPerHour,
          siliciumPerHour: resourceData.rates.siliciumPerHour,
          hydrogenePerHour: resourceData.rates.hydrogenePerHour,
          storageMineraiCapacity: resourceData.rates.storageMineraiCapacity,
          storageSiliciumCapacity: resourceData.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: resourceData.rates.storageHydrogeneCapacity,
          energyProduced: resourceData.rates.energyProduced,
          energyConsumed: resourceData.rates.energyConsumed,
          protectedMinerai: resourceData.protectedMinerai,
          protectedSilicium: resourceData.protectedSilicium,
          protectedHydrogene: resourceData.protectedHydrogene,
        } : undefined}
        liveResources={liveResources}
        ships={stationaryShips}
        levels={resourceData?.levels}
      />

      <Suspense fallback={<LazySkel />}>
        {/* 3. Activities */}
        <OverviewActivities
          activeBuilding={activeBuilding as any}
          shipyardQueue={(shipyardQueue ?? []) as any[]}
          commandCenterQueue={(commandCenterQueue ?? []) as any[]}
          planetId={planetId!}
          gameConfig={gameConfig}
          onBuildingComplete={() => {
            utils.building.list.invalidate({ planetId: planetId! });
            utils.resource.production.invalidate({ planetId: planetId! });
          }}
          onShipyardComplete={() => {
            utils.shipyard.queue.invalidate({ planetId: planetId!, facilityId: 'shipyard' });
            utils.shipyard.ships.invalidate({ planetId: planetId! });
          }}
          onCommandCenterComplete={() => {
            utils.shipyard.queue.invalidate({ planetId: planetId!, facilityId: 'commandCenter' });
            utils.shipyard.ships.invalidate({ planetId: planetId! });
          }}
        />

        {/* 4. Governance warning */}
        <GovernanceAlert planetClassId={planet.planetClassId} />

        {/* 5. Attack alert */}
        <AttackAlert
          hostileFleets={hostileInbound as any[]}
          onTimerComplete={() => utils.fleet.inbound.invalidate()}
        />

        {/* 6. Grid */}
        <OverviewGrid
          ships={stationaryShips}
          defenses={stationaryDefenses}
          movements={allMovementsForGrid}
          flagship={flagship as any}
          shieldLevel={buildings?.find((b) => b.id === 'planetaryShield')?.currentLevel ?? 0}
          currentPlanetId={planet.id}
          currentPlanetName={planet.name}
          currentPlanetCoords={{ galaxy: planet.galaxy, system: planet.system, position: planet.position }}
          gameConfig={gameConfig}
          onFleetTimerComplete={() => utils.fleet.movements.invalidate()}
        />

        {/* 7. Events */}
        <OverviewEvents events={(recentEvents ?? []) as any[]} gameConfig={gameConfig} />
      </Suspense>

      </div>
    </div>
  );
}
