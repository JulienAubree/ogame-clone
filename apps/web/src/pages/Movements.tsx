import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { Timer } from '@/components/common/Timer';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName } from '@/lib/entity-names';
import { resolveBonus } from '@ogame-clone/game-engine';
import { cn } from '@/lib/utils';

// ── Mission theming ──

const MISSION_STYLE: Record<string, { border: string; text: string; hex: string }> = {
  transport: { border: 'border-l-blue-500', text: 'text-blue-400', hex: '#3b82f6' },
  station:   { border: 'border-l-emerald-500', text: 'text-emerald-400', hex: '#10b981' },
  spy:       { border: 'border-l-violet-500', text: 'text-violet-400', hex: '#8b5cf6' },
  attack:    { border: 'border-l-red-500', text: 'text-red-400', hex: '#ef4444' },
  colonize:  { border: 'border-l-orange-500', text: 'text-orange-400', hex: '#f97316' },
  mine:      { border: 'border-l-amber-500', text: 'text-amber-400', hex: '#f59e0b' },
  pirate:    { border: 'border-l-rose-600', text: 'text-rose-400', hex: '#e11d48' },
  recycle:   { border: 'border-l-cyan-500', text: 'text-cyan-400', hex: '#06b6d4' },
};

const PHASE_STYLE: Record<string, { label: string; classes: string; dot: string; pulse?: boolean }> = {
  outbound:    { label: 'En route', classes: 'text-blue-300 bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400', pulse: true },
  prospecting: { label: 'Prospection', classes: 'text-amber-300 bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400', pulse: true },
  mining:      { label: 'Extraction', classes: 'text-amber-200 bg-amber-400/10 border-amber-400/20', dot: 'bg-amber-300', pulse: true },
  return:      { label: 'Retour', classes: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
};

const fmt = (n: number) => n.toLocaleString('fr-FR');

const DRIVE_LABELS: Record<string, string> = {
  combustion: 'Combustion',
  impulse: 'Impulsion',
  hyperspaceDrive: 'Hyperespace',
};

// ── Progress hook (updates every second) ──

function useProgress(departure: string, arrival: string) {
  const [pct, setPct] = useState(() => {
    const total = new Date(arrival).getTime() - new Date(departure).getTime();
    const elapsed = Date.now() - new Date(departure).getTime();
    return total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 100;
  });

  useEffect(() => {
    const dep = new Date(departure).getTime();
    const arr = new Date(arrival).getTime();
    const tick = () => {
      const total = arr - dep;
      const elapsed = Date.now() - dep;
      setPct(total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 100);
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [departure, arrival]);

  return pct;
}

// ── Mining Phase Stepper ──

const MINE_PHASES = [
  { key: 'outbound', label: 'En route' },
  { key: 'prospecting', label: 'Prospection' },
  { key: 'mining', label: 'Extraction' },
  { key: 'return', label: 'Retour' },
  { key: 'base', label: 'Base' },
] as const;

function MiningPhaseStepper({ phase, progress, hex }: { phase: string; progress: number; hex: string }) {
  const currentIdx = MINE_PHASES.findIndex((p) => p.key === phase);

  return (
    <div className="space-y-1.5">
      {/* Step circles + connecting lines */}
      <div className="flex items-center">
        {MINE_PHASES.map((step, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          const isFuture = i > currentIdx;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Circle */}
              <div className="relative flex items-center justify-center">
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                    isDone && 'border-transparent',
                    isActive && 'border-transparent',
                    isFuture && 'border-white/10 bg-transparent',
                  )}
                  style={{
                    ...(isDone ? { background: `${hex}60` } : {}),
                    ...(isActive ? { background: hex, boxShadow: `0 0 10px ${hex}80` } : {}),
                  }}
                >
                  {isDone && (
                    <svg width="10" height="10" viewBox="0 0 10 10" className="text-white">
                      <polyline points="2,5.5 4,7.5 8,3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  )}
                </div>
              </div>

              {/* Connecting line */}
              {i < MINE_PHASES.length - 1 && (
                <div className="flex-1 h-0.5 mx-1">
                  {isDone ? (
                    <div className="h-full rounded-full" style={{ background: `${hex}60` }} />
                  ) : isActive ? (
                    <div className="h-full rounded-full overflow-hidden bg-white/[0.06]">
                      <div
                        className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                        style={{ width: `${progress}%`, background: hex }}
                      />
                    </div>
                  ) : (
                    <div className="h-full rounded-full bg-white/[0.06]" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex">
        {MINE_PHASES.map((step, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <div key={step.key} className={cn('flex-1 last:flex-none', i === MINE_PHASES.length - 1 && 'text-right')}>
              <span className={cn(
                'text-[10px]',
                isDone && 'text-muted-foreground/60',
                isActive && 'font-semibold',
                !isDone && !isActive && 'text-muted-foreground/30',
              )}
              style={isActive ? { color: hex } : {}}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ── Movement Card ──

interface MovementEvent {
  id: string;
  originPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  mission: string;
  phase: string;
  departureTime: string;
  arrivalTime: string;
  mineraiCargo: string | number;
  siliciumCargo: string | number;
  hydrogeneCargo: string | number;
  ships: unknown;
}

function MovementCard({
  event,
  originPlanet,
  gameConfig,
  researchLevels,
  onRecall,
  recallingId,
  onTimerComplete,
}: {
  event: MovementEvent;
  originPlanet?: { name: string; galaxy: number; system: number; position: number };
  gameConfig: any;
  researchLevels: Record<string, number>;
  onRecall: (id: string) => void;
  recallingId: string | null;
  onTimerComplete: () => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const progress = useProgress(event.departureTime, event.arrivalTime);
  const ships = event.ships as Record<string, number>;
  const shipEntries = Object.entries(ships).filter(([, v]) => v > 0);
  const shipCount = shipEntries.reduce((sum, [, n]) => sum + n, 0);

  const targetCoords = `[${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}]`;
  const originCoords = originPlanet
    ? `[${originPlanet.galaxy}:${originPlanet.system}:${originPlanet.position}]`
    : '';
  const originLabel = originPlanet?.name ?? 'Planete';

  const canRecall = ['outbound', 'prospecting', 'mining'].includes(event.phase);
  const isReturn = event.phase === 'return';

  const mStyle = MISSION_STYLE[event.mission] ?? MISSION_STYLE.transport;
  const pStyle = PHASE_STYLE[event.phase] ?? PHASE_STYLE.outbound;
  const missionLabel = gameConfig?.missions?.[event.mission]?.label ?? event.mission;

  const minerai = Number(event.mineraiCargo);
  const silicium = Number(event.siliciumCargo);
  const hydrogene = Number(event.hydrogeneCargo);
  const hasCargo = minerai > 0 || silicium > 0 || hydrogene > 0;
  const totalCargo = minerai + silicium + hydrogene;

  const fromLabel = isReturn ? targetCoords : `${originLabel} ${originCoords}`;
  const toLabel = isReturn ? `${originLabel} ${originCoords}` : targetCoords;

  // Ship stats for expanded panel
  const shipStats = gameConfig?.ships as Record<string, {
    baseSpeed: number; cargoCapacity: number; fuelConsumption: number;
    driveType: string; miningExtraction: number; weapons: number; shield: number; armor: number;
  }> | undefined;

  // Cargo capacity of the fleet
  const fleetCargoCapacity = shipEntries.reduce((sum, [id, count]) => {
    return sum + (shipStats?.[id]?.cargoCapacity ?? 0) * count;
  }, 0);

  // Effective speed per ship (with research bonuses)
  const effectiveSpeeds = useMemo(() => {
    const speeds: Record<string, number> = {};
    if (!shipStats || !gameConfig?.bonuses) return speeds;
    for (const [id] of shipEntries) {
      const stats = shipStats[id];
      if (stats) {
        const multiplier = resolveBonus('ship_speed', stats.driveType, researchLevels, gameConfig.bonuses);
        speeds[id] = Math.floor(stats.baseSpeed * multiplier);
      }
    }
    return speeds;
  }, [shipEntries, shipStats, researchLevels, gameConfig?.bonuses]);

  // Slowest speed (determines fleet speed)
  const slowestSpeed = shipEntries.reduce((min, [id]) => {
    const spd = effectiveSpeeds[id] ?? shipStats?.[id]?.baseSpeed ?? Infinity;
    return Math.min(min, spd);
  }, Infinity);

  return (
    <div className={cn('glass-card border-l-4 overflow-hidden', mStyle.border)}>
      {/* Clickable summary */}
      <div
        className="relative p-4 space-y-3 cursor-pointer select-none"
        style={{ background: `linear-gradient(135deg, ${mStyle.hex}08 0%, transparent 50%)` }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Header: Mission + Phase + Timer */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={cn('text-base font-bold tracking-tight', mStyle.text)}>
              {missionLabel}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
              pStyle.classes,
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', pStyle.dot, pStyle.pulse && 'animate-pulse')} />
              {pStyle.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Timer
              endTime={new Date(event.arrivalTime)}
              onComplete={onTimerComplete}
            />
            <svg
              width="12" height="12" viewBox="0 0 12 12"
              className={cn('text-muted-foreground/40 transition-transform duration-200', expanded && 'rotate-180')}
            >
              <polyline points="2,4 6,8 10,4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Route */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-foreground font-medium truncate">{fromLabel}</span>
          <svg width="24" height="10" viewBox="0 0 24 10" className="flex-shrink-0 opacity-40">
            <line x1="0" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
            <polyline points="15,2 19,5 15,8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-foreground font-medium truncate">{toLabel}</span>
        </div>

        {/* Mining stepper (4 phases) */}
        {event.mission === 'mine' ? (
          <MiningPhaseStepper phase={event.phase} progress={progress} hex={mStyle.hex} />
        ) : (
          /* Standard progress bar */
          <div className="relative h-1.5">
            <div className="absolute inset-0 rounded-full bg-white/[0.04]" />
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${mStyle.hex}30, ${mStyle.hex})`,
              }}
            />
            {progress > 0 && progress < 100 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full transition-[left] duration-1000 ease-linear"
                style={{
                  left: `calc(${progress}% - 5px)`,
                  background: mStyle.hex,
                  boxShadow: `0 0 10px ${mStyle.hex}90, 0 0 3px ${mStyle.hex}`,
                }}
              />
            )}
          </div>
        )}

        {/* Ships (summary) */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {shipEntries.map(([id, count]) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[11px]"
            >
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

        {/* Cargo (summary) */}
        {hasCargo && (
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
            <span className="text-muted-foreground/30 text-[10px]">
              ({fmt(totalCargo)} total)
            </span>
          </div>
        )}
      </div>

      {/* ── Expanded detail panel ── */}
      <div className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-in-out',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}>
        <div className="overflow-hidden">
          <div className="border-t border-white/[0.06] px-4 py-3 space-y-4 text-xs">

            {/* Horaires */}
            <div>
              <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold mb-1.5">
                Horaires
              </div>
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
            </div>

            {/* Detail des vaisseaux */}
            {shipStats && (
              <div>
                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold mb-1.5">
                  Detail des vaisseaux
                </div>
                <div className="rounded-md border border-white/[0.06] overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground/60 border-b border-white/[0.06]">
                        <th className="text-left px-2 py-1.5 font-medium">Vaisseau</th>
                        <th className="text-right px-2 py-1.5 font-medium">Qte</th>
                        <th className="text-right px-2 py-1.5 font-medium">Vitesse</th>
                        <th className="text-right px-2 py-1.5 font-medium">Soute</th>
                        <th className="text-right px-2 py-1.5 font-medium">Propulsion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipEntries.map(([id, count], i) => {
                        const stats = shipStats[id];
                        const shipSpeed = effectiveSpeeds[id] ?? stats?.baseSpeed ?? 0;
                        const isSlowest = stats && shipSpeed === slowestSpeed && slowestSpeed < Infinity;
                        return (
                          <tr key={id} className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                            <td className="px-2 py-1.5 text-foreground">{getShipName(id, gameConfig)}</td>
                            <td className="px-2 py-1.5 text-right text-foreground font-semibold">{count}</td>
                            <td className={cn('px-2 py-1.5 text-right', isSlowest ? 'text-amber-400' : 'text-muted-foreground')}>
                              {stats ? fmt(shipSpeed) : '—'}
                              {isSlowest && shipEntries.length > 1 && (
                                <span className="ml-0.5 text-[9px] text-amber-400/60">lent</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right text-muted-foreground">
                              {stats ? fmt(stats.cargoCapacity * count) : '—'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-muted-foreground">
                              {stats ? DRIVE_LABELS[stats.driveType] ?? stats.driveType : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/[0.06] text-foreground font-semibold">
                        <td className="px-2 py-1.5">Total</td>
                        <td className="px-2 py-1.5 text-right">{shipCount}</td>
                        <td className="px-2 py-1.5 text-right text-amber-400">
                          {slowestSpeed < Infinity ? fmt(slowestSpeed) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right">{fmt(fleetCargoCapacity)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Detail du cargo */}
            {hasCargo && (
              <div>
                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold mb-1.5">
                  Cargo embarque
                </div>
                <div className="space-y-1.5">
                  {([
                    { label: 'Minerai', value: minerai, color: 'bg-minerai', textColor: 'text-minerai' },
                    { label: 'Silicium', value: silicium, color: 'bg-silicium', textColor: 'text-silicium' },
                    { label: 'Hydrogene', value: hydrogene, color: 'bg-hydrogene', textColor: 'text-hydrogene' },
                  ] as const).filter(r => r.value > 0).map((res) => {
                    const pct = fleetCargoCapacity > 0 ? (res.value / fleetCargoCapacity) * 100 : 0;
                    return (
                      <div key={res.label}>
                        <div className="flex justify-between mb-0.5">
                          <span className={cn('font-medium', res.textColor)}>{res.label}</span>
                          <span className="text-muted-foreground">{fmt(res.value)}</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                          <div className={cn('h-full rounded-full', res.color)} style={{ width: `${pct}%`, opacity: 0.7 }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between pt-1 text-muted-foreground/60">
                    <span>Utilisation soute</span>
                    <span>{fmt(totalCargo)} / {fmt(fleetCargoCapacity)} ({fleetCargoCapacity > 0 ? Math.round((totalCargo / fleetCargoCapacity) * 100) : 0}%)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Origine */}
            {originPlanet && (
              <div>
                <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold mb-1.5">
                  Origine
                </div>
                <button
                  className="text-xs text-primary hover:text-primary/80 hover:underline transition-colors cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); navigate('/overview'); }}
                >
                  {originLabel} {originCoords}
                </button>
              </div>
            )}

            {/* Recall (moved inside expanded for cleaner look) */}
            {canRecall && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50 text-xs h-7"
                  onClick={(e) => { e.stopPropagation(); onRecall(event.id); }}
                  disabled={recallingId === event.id}
                >
                  Rappeler la flotte
                </Button>
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
  const { data: planets } = trpc.planet.list.useQuery();
  const firstPlanetId = planets?.[0]?.id;
  const { data: researchList } = trpc.research.list.useQuery(
    { planetId: firstPlanetId! },
    { enabled: !!firstPlanetId },
  );
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
        <PageHeader title="Mouvements" />
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  const sorted = movements
    ? [...movements].sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime())
    : [];

  const recallingEvent = recallConfirm ? sorted.find((m) => m.id === recallConfirm) : null;
  const recallingLabel = recallingEvent
    ? (gameConfig?.missions[recallingEvent.mission]?.label ?? recallingEvent.mission)
    : '';
  const recallingCoords = recallingEvent
    ? `[${recallingEvent.targetGalaxy}:${recallingEvent.targetSystem}:${recallingEvent.targetPosition}]`
    : '';

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Mouvements" />

      {sorted.length === 0 ? (
        <EmptyState
          title="Aucun mouvement en cours"
          description="Envoyez une flotte depuis la page Flotte pour voir vos mouvements ici."
        />
      ) : (
        <div className="space-y-4 lg:max-w-4xl lg:mx-auto">
          <div className="text-xs text-muted-foreground/60">
            {sorted.length} mouvement{sorted.length > 1 ? 's' : ''} en cours
          </div>

          {sorted.map((event) => {
            const origin = planets?.find((p) => p.id === event.originPlanetId);
            return (
              <MovementCard
                key={event.id}
                event={event as unknown as MovementEvent}
                originPlanet={origin ? { name: origin.name, galaxy: origin.galaxy, system: origin.system, position: origin.position } : undefined}
                gameConfig={gameConfig}
                researchLevels={researchLevels}
                onRecall={setRecallConfirm}
                recallingId={recallConfirm}
                onTimerComplete={() => utils.fleet.movements.invalidate()}
              />
            );
          })}
        </div>
      )}

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
