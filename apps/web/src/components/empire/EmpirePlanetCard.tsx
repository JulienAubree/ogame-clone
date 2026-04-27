import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Hammer, FlaskConical, Rocket, ShieldAlert, Check, Building2, Wrench, Layers, Shield, ShieldPlus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlanetImageUrl } from '@/lib/assets';
import { usePlanetStore } from '@/stores/planet.store';
import { ShipyardIcon, FlagshipIcon } from '@/lib/icons';
import { Timer } from '@/components/common/Timer';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getBuildingName, getResearchName, getShipName, getDefenseName } from '@/lib/entity-names';
import { AbandonColonyModal, type AbandonModalPlanet } from '@/components/empire/AbandonColonyModal';
import { ShipChipPopover } from '@/components/empire/ShipChipPopover';
import { SendFleetOverlay, type SendFleetMission } from '@/components/empire/SendFleetOverlay';
import { MissionIcon } from '@/components/fleet/MissionIcon';
import type { EmpireViewMode, PlanetFleetData } from '@/components/empire/empire-types';

interface EmpirePlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  diameter: number;
  status?: string;
  minerai: number;
  silicium: number;
  hydrogene: number;
  mineraiPerHour?: number;
  siliciumPerHour?: number;
  hydrogenePerHour?: number;
  storageMineraiCapacity?: number;
  storageSiliciumCapacity?: number;
  storageHydrogeneCapacity?: number;
  energyProduced?: number;
  energyConsumed?: number;
  hasFlagship: boolean;
  activeBuild: { buildingId: string; level: number; endTime: string } | null;
  activeResearch: { researchId: string; level: number; endTime: string } | null;
  activeShipyard: { shipId: string; quantity: number; endTime: string; facilityId: string | null } | null;
  activeDefense: { defenseId: string; quantity: number; endTime: string } | null;
  outboundFleets: { count: number; earliestArrival: string } | null;
  inboundFriendlyFleets: { count: number; earliestArrival: string } | null;
  inboundAttack: { arrivalTime: string } | null;
  biomes?: { id: string; name: string; rarity: string; effects?: unknown }[];
}

function formatRate(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function EmpirePlanetCard({ planet, isFirst, allPlanets, fleet, viewMode }: { planet: EmpirePlanet; isFirst: boolean; allPlanets: AbandonModalPlanet[]; fleet?: PlanetFleetData; viewMode: EmpireViewMode }) {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const { data: gameConfig } = useGameConfig();
  const hasAttack = !!planet.inboundAttack;
  const [menuOpen, setMenuOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMission, setSendMission] = useState<SendFleetMission>('transport');

  const otherActivePlanets = allPlanets.filter((p) => p.id !== planet.id && p.status === 'active');
  const canSendFleet = otherActivePlanets.length > 0 && !!fleet && fleet.totalShips > 0;

  const openSend = (mission: SendFleetMission) => {
    setSendMission(mission);
    setSendOpen(true);
  };
  const menuRef = useRef<HTMLDivElement>(null);
  const canAbandon = planet.planetClassId !== 'homeworld' && planet.status === 'active';

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const goTo = (path: string) => {
    setActivePlanet(planet.id);
    navigate(path);
  };

  // Colonizing planets: simplified clickable card → navigates to Overview which shows ColonizationProgress
  if (planet.status === 'colonizing') {
    return (
      <button
        type="button"
        onClick={() => goTo('/')}
        className="flex flex-col rounded-xl border border-amber-500/25 bg-card/80 overflow-hidden text-left transition-colors hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5 cursor-pointer"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-3.5 pb-2.5">
          <div className="shrink-0">
            {planet.planetClassId && planet.planetImageIndex != null ? (
              <img
                src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
                alt={planet.name}
                className="h-11 w-11 rounded-full border-2 border-amber-500/30 object-cover opacity-70"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-amber-500/30 bg-muted font-semibold text-muted-foreground opacity-70">
                {planet.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {planet.name}
            </div>
            <div className="text-xs text-muted-foreground">
              [{planet.galaxy}:{planet.system}:{planet.position}] · {planet.diameter.toLocaleString('fr-FR')} km
            </div>
          </div>
          <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400">
            Colonisation
          </span>
        </div>

        {/* Colonization status */}
        <div className="px-3.5 pb-3.5">
          <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400">
            <Rocket className="h-3.5 w-3.5 shrink-0" />
            <span>Colonisation en cours — cliquez pour voir la progression</span>
          </div>
        </div>
      </button>
    );
  }

  const resources = [
    { label: 'Fe', value: planet.minerai, max: planet.storageMineraiCapacity ?? 0, rate: planet.mineraiPerHour ?? 0, color: 'text-minerai', fill: 'bg-minerai' },
    { label: 'Si', value: planet.silicium, max: planet.storageSiliciumCapacity ?? 0, rate: planet.siliciumPerHour ?? 0, color: 'text-silicium', fill: 'bg-silicium' },
    { label: 'H', value: planet.hydrogene, max: planet.storageHydrogeneCapacity ?? 0, rate: planet.hydrogenePerHour ?? 0, color: 'text-hydrogene', fill: 'bg-hydrogene' },
  ];

  const hasActivity = planet.activeBuild || planet.activeResearch || planet.activeShipyard || planet.activeDefense || planet.outboundFleets || planet.inboundFriendlyFleets || hasAttack;

  return (
    <>
    <div className={cn(
      'flex flex-col rounded-xl border bg-card/80 overflow-hidden transition-colors',
      hasAttack
        ? 'border-destructive/25 hover:border-destructive/60 hover:shadow-lg hover:shadow-destructive/10'
        : 'border-border/50 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5',
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5 pb-2.5">
        <button onClick={() => goTo('/')} className="shrink-0">
          {planet.planetClassId && planet.planetImageIndex != null ? (
            <img
              src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
              alt={planet.name}
              className={cn('h-11 w-11 rounded-full border-2 object-cover cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow', hasAttack ? 'border-destructive/40' : 'border-border/50')}
            />
          ) : (
            <div className={cn('flex h-11 w-11 items-center justify-center rounded-full border-2 bg-muted font-semibold text-muted-foreground cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow', hasAttack ? 'border-destructive/40' : 'border-border/50')}>
              {planet.name.charAt(0)}
            </div>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <button onClick={() => goTo('/')} className="truncate text-sm font-semibold text-foreground hover:text-primary transition-colors text-left">
              {planet.name}
            </button>
            {planet.hasFlagship && (
              <FlagshipIcon width={14} height={14} className="shrink-0 text-energy" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            [{planet.galaxy}:{planet.system}:{planet.position}] · {planet.diameter.toLocaleString('fr-FR')} km
          </div>
        </div>
        <span className={cn(
          'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium',
          isFirst ? 'bg-primary/15 text-primary' : 'bg-purple-500/15 text-purple-400',
        )}>
          {isFirst ? 'Capitale' : 'Colonie'}
        </span>
        {canAbandon && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <span className="text-base leading-none">{'\u22EF'}</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-md border border-white/10 bg-card/95 backdrop-blur-lg shadow-lg animate-slide-up"
              >
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setAbandonOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  Abandonner la colonie
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resource bars OR fleet chips, depending on viewMode */}
      {viewMode === 'resources' ? (
        <div className="flex flex-col gap-1.5 px-3.5 pb-2.5">
          {resources.map((r) => {
            const pct = r.max > 0 ? Math.min(100, (r.value / r.max) * 100) : 0;
            const isFull = pct > 95;
            return (
              <div key={r.label} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className={cn('text-[10px] font-bold', r.color)}>{r.label}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn('text-xs font-semibold', r.color)}>{formatRate(r.value)}</span>
                    <span className="text-[10px] text-muted-foreground">/ {formatRate(r.max)}</span>
                    <span className={cn('text-[10px]', r.color)}>+{formatRate(r.rate)}/h</span>
                  </div>
                </div>
                <div className="h-[4px] overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', r.fill, isFull && 'animate-pulse')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mx-3.5 mb-2.5 rounded-lg border border-border/30 bg-background/30 p-2">
          <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => goTo('/fleet/stationed')}
              className="flex-1 text-left uppercase tracking-wider text-muted-foreground font-semibold hover:text-foreground transition-colors"
            >
              Flotte stationnée
            </button>
            {fleet && fleet.totalShips > 0 ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <span><strong className="font-mono text-foreground">{fleet.totalShips.toLocaleString('fr-FR')}</strong> vsx</span>
                <span>FP <strong className="font-mono text-amber-400">{formatRate(fleet.totalFP)}</strong></span>
              </span>
            ) : (
              <span className="text-muted-foreground/60 italic">vide</span>
            )}
          </div>
          {fleet && fleet.ships.length > 0 ? (
            <button
              type="button"
              onClick={() => goTo('/fleet/stationed')}
              className="block w-full text-left"
            >
              <div className="grid grid-cols-3 gap-1">
                {fleet.ships.map((s) => (
                  <ShipChipPopover
                    key={s.id}
                    shipId={s.id}
                    name={s.name}
                    count={s.count}
                    cargoCapacity={s.cargoCapacity}
                    role={s.role}
                  />
                ))}
              </div>
            </button>
          ) : (
            <div className="rounded border border-dashed border-border/30 py-2 text-center text-[10px] text-muted-foreground/60">
              Aucun vaisseau stationné
            </div>
          )}
        </div>
      )}

      {/* Status badges */}
      <div className="flex flex-1 flex-wrap content-start gap-1.5 px-3.5 pb-2.5">
        {planet.activeBuild && (
          <button onClick={() => goTo('/buildings')} className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/80 transition-colors">
            <Hammer className="h-3 w-3" />
            <span>{getBuildingName(planet.activeBuild.buildingId, gameConfig)} Nv.{planet.activeBuild.level}</span>
            <Timer endTime={new Date(planet.activeBuild.endTime)} className="inline [&>span]:text-energy" />
          </button>
        )}
        {planet.activeResearch && (
          <button onClick={() => goTo('/research')} className="flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[11px] text-purple-400 hover:bg-purple-500/20 transition-colors">
            <FlaskConical className="h-3 w-3" />
            <span>{getResearchName(planet.activeResearch.researchId, gameConfig)}</span>
            <Timer endTime={new Date(planet.activeResearch.endTime)} className="inline [&>span]:text-purple-400" />
          </button>
        )}
        {planet.activeShipyard && (
          <button onClick={() => goTo(planet.activeShipyard!.facilityId === 'commandCenter' ? '/command-center' : '/shipyard')} className="flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20 transition-colors">
            <ShipyardIcon width={12} height={12} />
            <span>{getShipName(planet.activeShipyard.shipId, gameConfig)} x{planet.activeShipyard.quantity}</span>
            <Timer endTime={new Date(planet.activeShipyard.endTime)} className="inline [&>span]:text-primary" />
          </button>
        )}
        {planet.activeDefense && (
          <button onClick={() => goTo('/defense')} className="flex items-center gap-1 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-400 hover:bg-cyan-500/20 transition-colors">
            <ShieldPlus className="h-3 w-3" />
            <span>{getDefenseName(planet.activeDefense.defenseId, gameConfig)} x{planet.activeDefense.quantity}</span>
            <Timer endTime={new Date(planet.activeDefense.endTime)} className="inline [&>span]:text-cyan-400" />
          </button>
        )}
        {planet.outboundFleets && (
          <button onClick={() => goTo('/fleet/movements')} className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/80 transition-colors">
            <ArrowUpRight className="h-3 w-3" />
            <span>{planet.outboundFleets.count} sortie{planet.outboundFleets.count > 1 ? 's' : ''}</span>
            <Timer endTime={new Date(planet.outboundFleets.earliestArrival)} className="inline [&>span]:text-muted-foreground" />
          </button>
        )}
        {planet.inboundFriendlyFleets && (
          <button onClick={() => goTo('/fleet/movements')} className="flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20 transition-colors">
            <ArrowDownLeft className="h-3 w-3" />
            <span>{planet.inboundFriendlyFleets.count} arrivee{planet.inboundFriendlyFleets.count > 1 ? 's' : ''}</span>
            <Timer endTime={new Date(planet.inboundFriendlyFleets.earliestArrival)} className="inline [&>span]:text-primary" />
          </button>
        )}
        {hasAttack && (
          <button onClick={() => goTo('/fleet/movements')} className="flex items-center gap-1 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/20 transition-colors">
            <ShieldAlert className="h-3 w-3" />
            <span>Attaque</span>
            <Timer endTime={new Date(planet.inboundAttack!.arrivalTime)} className="inline [&>span]:text-destructive" />
          </button>
        )}
        {(planet.energyConsumed ?? 0) > (planet.energyProduced ?? 0) && !hasAttack && (
          <button onClick={() => goTo('/energy')} className="flex items-center gap-1 rounded-md border border-energy/20 bg-energy/10 px-2 py-1 text-[11px] text-energy hover:bg-energy/20 transition-colors">
            ⚡ Deficit energie
          </button>
        )}
        {!hasActivity && (planet.energyConsumed ?? 0) <= (planet.energyProduced ?? 0) && (
          <div className="flex items-center gap-1 rounded-md border border-green-500/20 bg-green-500/10 px-2 py-1 text-[11px] text-green-500">
            <Check className="h-3 w-3" />
            <span>Aucune activite</span>
          </div>
        )}
      </div>

      {/* Footer shortcuts — swap based on viewMode */}
      <div className="mt-auto flex border-t border-border/30">
        {viewMode === 'resources' ? (
          [
            { label: 'Bâtiments', icon: Building2, path: '/buildings' },
            { label: 'Chantier', icon: Wrench, path: '/shipyard' },
            { label: 'Flottes', icon: Layers, path: '/fleet' },
            { label: 'Défenses', icon: Shield, path: '/defense' },
          ].map((item, i, arr) => (
            <button
              key={item.path}
              onClick={() => goTo(item.path)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary',
                i < arr.length - 1 && 'border-r border-border/30',
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))
        ) : (
          <>
            <button
              onClick={() => openSend('transport')}
              disabled={!canSendFleet}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 border-r border-border/30 py-2 text-[11px] transition-colors',
                canSendFleet
                  ? 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
                  : 'text-muted-foreground/40 cursor-not-allowed',
              )}
              title={canSendFleet ? 'Envoyer une flotte en transport' : 'Aucune flotte mobilisable ou aucune autre planète'}
            >
              <MissionIcon mission="transport" size={14} />
              Transport
            </button>
            <button
              onClick={() => openSend('station')}
              disabled={!canSendFleet}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] transition-colors',
                canSendFleet
                  ? 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
                  : 'text-muted-foreground/40 cursor-not-allowed',
              )}
              title={canSendFleet ? 'Stationner une flotte sur une autre planète' : 'Aucune flotte mobilisable ou aucune autre planète'}
            >
              <MissionIcon mission="station" size={14} />
              Stationner
            </button>
          </>
        )}
      </div>
    </div>
    {canAbandon && (
      <AbandonColonyModal
        planet={planet}
        allPlanets={allPlanets}
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
      />
    )}
    {fleet && (
      <SendFleetOverlay
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        originPlanetId={planet.id}
        originName={planet.name}
        availableShips={fleet.ships}
        availablePlanets={otherActivePlanets.map((p) => ({
          id: p.id,
          name: p.name,
          galaxy: p.galaxy,
          system: p.system,
          position: p.position,
          planetClassId: p.planetClassId,
          planetImageIndex: p.planetImageIndex ?? null,
        }))}
        initialMission={sendMission}
      />
    )}
    </>
  );
}
