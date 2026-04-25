import { useState, useMemo } from 'react';
import { AlertTriangle, Layers, ChevronDown, Box } from 'lucide-react';
import { trpc } from '@/trpc';
import { Timer } from '@/components/common/Timer';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { GameImage } from '@/components/common/GameImage';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName } from '@/lib/entity-names';
import { cn } from '@/lib/utils';
import {
  MovementCard,
  useProgress,
  PHASE_STYLE,
  fmt,
  type MovementEvent,
} from '@/components/fleet/MovementCard';

// ── Inbound Fleet Card ──

interface InboundEvent {
  id: string;
  mission: string;
  phase: string;
  departureTime: string;
  arrivalTime: string;
  mineraiCargo: string | number;
  siliciumCargo: string | number;
  hydrogeneCargo: string | number;
  ships: unknown;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  senderUsername: string | null;
  allianceTag: string | null;
  originPlanetName: string | null;
  originGalaxy: number;
  originSystem: number;
  originPosition: number;
  hostile?: boolean;
  detectionTier?: number | null;
  shipCount?: number | null;
}

function InboundFleetCard({
  event,
  gameConfig,
  onTimerComplete,
}: {
  event: InboundEvent;
  gameConfig: any;
  onTimerComplete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const progress = useProgress(event.departureTime, event.arrivalTime);

  const isHostile = !!event.hostile;
  const tier = event.detectionTier ?? 5;

  const ships = event.ships as Record<string, number>;
  const shipEntries = Object.entries(ships).filter(([, v]) => v > 0);
  const shipCount = isHostile && tier < 3 ? (event.shipCount ?? 0) : shipEntries.reduce((sum, [, n]) => sum + n, 0);

  const missionHex = isHostile ? '#ef4444' : (gameConfig?.missions?.[event.mission]?.color ?? '#888');
  const missionLabel = isHostile && tier < 3
    ? 'Flotte hostile'
    : (gameConfig?.missions?.[event.mission]?.label ?? event.mission);
  const pStyle = PHASE_STYLE[event.phase] ?? PHASE_STYLE.outbound;
  const phaseLabel = gameConfig?.labels?.[`phase.${event.phase}`] ?? event.phase;

  const hasOrigin = !isHostile || tier >= 1;
  const originCoords = hasOrigin ? `[${event.originGalaxy}:${event.originSystem}:${event.originPosition}]` : '';
  const targetCoords = `[${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}]`;
  const isReturn = event.phase === 'return';
  const fromLabel = !hasOrigin
    ? '???'
    : isReturn
      ? targetCoords
      : `${event.originPlanetName ?? 'Planète'} ${originCoords}`;
  const toLabel = isReturn ? `${event.originPlanetName ?? 'Planète'} ${originCoords}` : targetCoords;

  const minerai = Number(event.mineraiCargo);
  const silicium = Number(event.siliciumCargo);
  const hydrogene = Number(event.hydrogeneCargo);
  const hasCargo = minerai > 0 || silicium > 0 || hydrogene > 0;

  const hasSender = !isHostile || tier >= 4;
  const hasShipDetails = !isHostile || tier >= 3;
  const hasShipCount = !isHostile || tier >= 2;

  const borderColor = isHostile ? 'border-l-red-500/70' : 'border-l-yellow-500/70';
  const ringColor = isHostile ? 'ring-red-500/10' : 'ring-yellow-500/10';
  const badgeBorder = isHostile ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400';
  const badgeLabel = isHostile ? 'Attaque détectée' : 'Entrante';
  const bgGradient = isHostile
    ? 'linear-gradient(135deg, rgba(239,68,68,0.04) 0%, rgba(239,68,68,0.02) 100%)'
    : `linear-gradient(135deg, ${missionHex}06 0%, rgba(234,179,8,0.03) 100%)`;

  return (
    <div className={cn('glass-card border-l-4 overflow-hidden ring-1', borderColor, ringColor)}>
      <div
        className="relative p-4 space-y-3 cursor-pointer select-none"
        style={{ background: bgGradient }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border', badgeBorder)}>
              {isHostile ? (
                <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" strokeWidth={2.5} />
              ) : (
                <Layers className="h-2.5 w-2.5 flex-shrink-0" strokeWidth={2.5} />
              )}
              {badgeLabel}
            </span>
            <span className="text-base font-bold tracking-tight" style={{ color: missionHex }}>
              {missionLabel}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
              pStyle.classes,
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', pStyle.dot, pStyle.pulse && 'animate-pulse')} />
              {phaseLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Timer endTime={new Date(event.arrivalTime)} onComplete={onTimerComplete} />
            <ChevronDown className={cn('h-3 w-3 text-muted-foreground/40 transition-transform duration-200', expanded && 'rotate-180')} strokeWidth={1.5} />
          </div>
        </div>

        {/* Sender */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">De :</span>
          {hasSender ? (
            <>
              {event.allianceTag && (
                <span className={cn(isHostile ? 'text-red-400' : 'text-yellow-400', 'font-semibold')}>[{event.allianceTag}]</span>
              )}
              <span className="text-foreground font-medium">{event.senderUsername ?? 'Inconnu'}</span>
            </>
          ) : (
            <span className="text-muted-foreground/50 italic">???</span>
          )}
        </div>

        {/* Route */}
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('font-medium truncate', hasOrigin ? 'text-foreground' : 'text-muted-foreground/50 italic')}>{fromLabel}</span>
          <svg width="24" height="10" viewBox="0 0 24 10" className="flex-shrink-0 opacity-40">
            <line x1="0" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
            <polyline points="15,2 19,5 15,8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-foreground font-medium truncate">{toLabel}</span>
        </div>

        {/* Progress bar */}
        <div className="relative h-1.5">
          <div className="absolute inset-0 rounded-full bg-white/[0.04]" />
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${missionHex}30, ${missionHex})`,
            }}
          />
          {progress > 0 && progress < 100 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full transition-[left] duration-1000 ease-linear"
              style={{
                left: `calc(${progress}% - 5px)`,
                background: missionHex,
                boxShadow: `0 0 10px ${missionHex}90, 0 0 3px ${missionHex}`,
              }}
            />
          )}
        </div>

        {/* Ships */}
        {hasShipDetails ? (
          <div className="flex flex-wrap gap-1.5 items-center">
            {shipEntries.map(([id, count]) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[11px]"
              >
                <GameImage category="ships" id={id} size="icon" alt={getShipName(id, gameConfig)} className="h-5 w-5 rounded-sm" />
                <span className="text-foreground font-semibold">{count}&times;</span>
                <span className="text-muted-foreground">{getShipName(id, gameConfig)}</span>
              </span>
            ))}
            {shipCount > 1 && (
              <span className="text-[10px] text-muted-foreground/50 ml-1">
                ({shipCount} vaisseaux)
              </span>
            )}
          </div>
        ) : hasShipCount ? (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground/60">Vaisseaux :</span>
            <span className="text-foreground font-semibold">{shipCount}</span>
            <span className="text-muted-foreground/40 italic text-[10px]">(composition inconnue)</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground/40 italic">Composition de la flotte inconnue</div>
        )}

        {/* Cargo */}
        {hasCargo && !isHostile && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
              Cargo
            </span>
            <div className="flex gap-3">
              {minerai > 0 && (
                <span className="text-minerai">
                  <span className="font-semibold">{fmt(minerai)}</span>
                  <span className="opacity-50 ml-0.5 text-[10px]">M</span>
                </span>
              )}
              {silicium > 0 && (
                <span className="text-silicium">
                  <span className="font-semibold">{fmt(silicium)}</span>
                  <span className="opacity-50 ml-0.5 text-[10px]">S</span>
                </span>
              )}
              {hydrogene > 0 && (
                <span className="text-hydrogene">
                  <span className="font-semibold">{fmt(hydrogene)}</span>
                  <span className="opacity-50 ml-0.5 text-[10px]">H</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expanded details */}
      <div className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-in-out',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}>
        <div className="overflow-hidden">
          <div className="border-t border-white/[0.06] px-4 py-3 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-y-1 text-muted-foreground">
              <span>Depart</span>
              <span className="text-foreground text-right">
                {new Date(event.departureTime).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span>Arrivee estimee</span>
              <span className="text-foreground text-right">
                {new Date(event.arrivalTime).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span>Progression</span>
              <span className="text-foreground text-right">{Math.round(progress)}%</span>
            </div>

            {/* Detection tier info for hostile fleets */}
            {isHostile && (
              <div className="pt-1 border-t border-white/[0.06]">
                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold mb-1.5">
                  Niveau de detection
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((t) => (
                    <div
                      key={t}
                      className={cn(
                        'h-1.5 flex-1 rounded-full',
                        t <= tier ? 'bg-red-500' : 'bg-white/[0.06]',
                      )}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground/40 mt-1">
                  {tier === 0 && 'Alerte minimale — origine et composition inconnues'}
                  {tier === 1 && 'Coordonnees d\'origine detectees'}
                  {tier === 2 && 'Nombre de vaisseaux detecte'}
                  {tier === 3 && 'Composition de la flotte detectee'}
                  {tier >= 4 && 'Detection complete — identite de l\'attaquant connue'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──

export default function Movements() {
  const utils = trpc.useUtils();
  const [recallConfirm, setRecallConfirm] = useState<string | null>(null);
  const { data: gameConfig } = useGameConfig();
  const { data: movements, isLoading } = trpc.fleet.movements.useQuery();
  const { data: inboundFleets } = trpc.fleet.inbound.useQuery();
  const { data: fleetSlots } = trpc.fleet.slots.useQuery();
  const { data: planets } = trpc.planet.list.useQuery();
  const { data: researchData } = trpc.research.list.useQuery();
  const researchList = researchData?.items;
  const researchLevels = useMemo(() => {
    if (!researchList) return {};
    return Object.fromEntries(researchList.map((r) => [r.id, r.currentLevel]));
  }, [researchList]);

  const recallMutation = trpc.fleet.recall.useMutation({
    onSuccess: () => {
      utils.fleet.movements.invalidate();
      setRecallConfirm(null);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <Breadcrumb segments={[
          { label: 'Flotte', path: '/fleet' },
          { label: 'Mouvements', path: '/fleet/movements' },
        ]} />
        <PageHeader title="Mouvements" />
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  const sorted = movements
    ? [...movements].sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime())
    : [];

  const sortedInbound = inboundFleets
    ? [...inboundFleets].sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime())
    : [];

  const hostileInboundCount = sortedInbound.filter((e) => (e as unknown as InboundEvent).hostile).length;
  const peacefulInboundCount = sortedInbound.length - hostileInboundCount;

  // Fleet stats for summary card
  const outboundCount = sorted.filter((m) => m.phase === 'outbound').length;
  const returnCount = sorted.filter((m) => m.phase === 'return').length;

  const recallingEvent = recallConfirm ? sorted.find((m) => m.id === recallConfirm) : null;
  const recallingLabel = recallingEvent
    ? (gameConfig?.missions[recallingEvent.mission]?.label ?? recallingEvent.mission)
    : '';
  const recallingCoords = recallingEvent
    ? `[${recallingEvent.targetGalaxy}:${recallingEvent.targetSystem}:${recallingEvent.targetPosition}]`
    : '';

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <Breadcrumb segments={[
        { label: 'Flotte', path: '/fleet' },
        { label: 'Mouvements', path: '/fleet/movements' },
      ]} />
      <PageHeader title="Mouvements" />

      {/* Fleet status summary */}
      {fleetSlots && (
        <div className="lg:max-w-4xl lg:mx-auto">
          <div className="glass-card p-4 space-y-3">
            {/* Slots gauge */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Box className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">Emplacements de flotte</div>
                  <div className="text-sm font-bold tabular-nums">
                    {fleetSlots.current}
                    <span className="text-muted-foreground font-normal"> / {fleetSlots.max}</span>
                    {fleetSlots.current >= fleetSlots.max && (
                      <span className="text-amber-400 text-[10px] font-semibold ml-2">COMPLET</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Breakdown pills */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {outboundCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <span className="w-1 h-1 rounded-full bg-blue-400" />
                    {outboundCount} en route
                  </span>
                )}
                {returnCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1 h-1 rounded-full bg-emerald-400" />
                    {returnCount} en retour
                  </span>
                )}
                {peacefulInboundCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                    <span className="w-1 h-1 rounded-full bg-yellow-400" />
                    {peacefulInboundCount} entrante{peacefulInboundCount > 1 ? 's' : ''}
                  </span>
                )}
                {hostileInboundCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    {hostileInboundCount} hostile{hostileInboundCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Slots progress bar */}
            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500',
                  fleetSlots.current >= fleetSlots.max ? 'bg-amber-400' : 'bg-primary',
                )}
                style={{ width: `${fleetSlots.max > 0 ? Math.min(100, (fleetSlots.current / fleetSlots.max) * 100) : 0}%` }}
              />
            </div>

            {/* Explainer */}
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
              Chaque flotte en mission occupe un emplacement jusqu&apos;a son retour.
              La <span className="text-muted-foreground/70 font-medium">Technologie Ordinateur</span> augmente
              le nombre d&apos;emplacements disponibles (+1 par niveau).
              {fleetSlots.current >= fleetSlots.max && (
                <span className="text-amber-400/70"> Tous vos emplacements sont utilisés — attendez le retour d&apos;une flotte ou améliorez votre recherche.</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Inbound fleets */}
      {sortedInbound.length > 0 && (() => {
        const hostileCount = sortedInbound.filter((e) => (e as unknown as InboundEvent).hostile).length;
        const peacefulCount = sortedInbound.length - hostileCount;
        return (
        <div className="space-y-4 lg:max-w-4xl lg:mx-auto">
          <div className="flex items-center gap-3">
            {peacefulCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs text-yellow-400/80 uppercase tracking-wider font-semibold">
                  {peacefulCount} flotte{peacefulCount > 1 ? 's' : ''} entrante{peacefulCount > 1 ? 's' : ''}
                </span>
              </div>
            )}
            {hostileCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400/80 uppercase tracking-wider font-semibold">
                  {hostileCount} attaque{hostileCount > 1 ? 's' : ''} detectee{hostileCount > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
          {sortedInbound.map((event) => (
            <InboundFleetCard
              key={event.id}
              event={event as unknown as InboundEvent}
              gameConfig={gameConfig}
              onTimerComplete={() => utils.fleet.inbound.invalidate()}
            />
          ))}
        </div>
        );
      })()}

      {/* Own movements */}
      {sorted.length === 0 && sortedInbound.length === 0 ? (
        <EmptyState
          title="Aucun mouvement en cours"
          description="Envoyez une flotte depuis la page Flotte pour voir vos mouvements ici."
        />
      ) : sorted.length > 0 ? (
        <div className="space-y-4 lg:max-w-4xl lg:mx-auto">
          <div className="text-xs text-muted-foreground/60">
            {sorted.length} mouvement{sorted.length > 1 ? 's' : ''} en cours
          </div>

          {sorted.map((event) => {
            const origin = planets?.find((p) => p.id === event.originPlanetId);
            const target = planets?.find((p) => p.galaxy === event.targetGalaxy && p.system === event.targetSystem && p.position === event.targetPosition);
            return (
              <MovementCard
                key={event.id}
                event={event as unknown as MovementEvent}
                originPlanet={origin ? { name: origin.name, galaxy: origin.galaxy, system: origin.system, position: origin.position } : undefined}
                targetPlanetName={target?.name}
                researchLevels={researchLevels}
                onRecall={setRecallConfirm}
                recallingId={recallConfirm}
                onTimerComplete={() => utils.fleet.movements.invalidate()}
              />
            );
          })}
        </div>
      ) : null}

      <ConfirmDialog
        open={!!recallConfirm}
        onConfirm={() => {
          if (recallConfirm) recallMutation.mutate({ fleetEventId: recallConfirm });
        }}
        onCancel={() => setRecallConfirm(null)}
        title="Rappeler la flotte ?"
        description={`Votre flotte en mission ${recallingLabel} vers ${recallingCoords} fera demi-tour et retournera sur sa planete d'origine.`}
        variant="destructive"
        confirmLabel="Rappeler"
      />
    </div>
  );
}
