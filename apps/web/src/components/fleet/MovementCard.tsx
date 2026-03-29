import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
import { getFlagshipImageUrl } from '@/lib/assets';
import { MissionIcon } from './MissionIcon';
import { Button } from '@/components/ui/button';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { getShipName } from '@/lib/entity-names';
import { resolveBonus } from '@exilium/game-engine';
import { usePlanetStore } from '@/stores/planet.store';

export const fmt = (n: number) => n.toLocaleString('fr-FR');

// ── Mission theming ──

export const MISSION_STYLE: Record<string, { border: string; text: string }> = {
  transport: { border: 'border-l-blue-500', text: 'text-blue-400' },
  station:   { border: 'border-l-emerald-500', text: 'text-emerald-400' },
  spy:       { border: 'border-l-violet-500', text: 'text-violet-400' },
  attack:    { border: 'border-l-red-500', text: 'text-red-400' },
  colonize:  { border: 'border-l-orange-500', text: 'text-orange-400' },
  mine:      { border: 'border-l-amber-500', text: 'text-amber-400' },
  pirate:    { border: 'border-l-rose-600', text: 'text-rose-400' },
  recycle:   { border: 'border-l-cyan-500', text: 'text-cyan-400' },
  trade:     { border: 'border-l-violet-400', text: 'text-violet-300' },
};

export const PHASE_STYLE: Record<string, { classes: string; dot: string; pulse?: boolean }> = {
  outbound:    { classes: 'text-blue-300 bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400', pulse: true },
  prospecting: { classes: 'text-amber-300 bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400', pulse: true },
  mining:      { classes: 'text-amber-200 bg-amber-400/10 border-amber-400/20', dot: 'bg-amber-300', pulse: true },
  return:      { classes: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
};

// ── Progress hook (updates every second) ──

export function useProgress(departure: string, arrival: string) {
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

const MINE_PHASE_KEYS = ['outbound', 'prospecting', 'mining', 'return', 'base'] as const;

export function MiningPhaseStepper({ phase, progress, hex, gameConfig }: { phase: string; progress: number; hex: string; gameConfig?: any }) {
  const currentIdx = MINE_PHASE_KEYS.indexOf(phase as any);

  return (
    <div className="space-y-1.5">
      {/* Step circles + connecting lines */}
      <div className="flex items-center">
        {MINE_PHASE_KEYS.map((key, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          const isFuture = i > currentIdx;

          return (
            <div key={key} className="flex items-center flex-1 last:flex-none">
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
              {i < MINE_PHASE_KEYS.length - 1 && (
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
        {MINE_PHASE_KEYS.map((key, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          return (
            <div key={key} className={cn('flex-1 last:flex-none', i === MINE_PHASE_KEYS.length - 1 && 'text-right')}>
              <span className={cn(
                'text-[10px]',
                isDone && 'text-muted-foreground/60',
                isActive && 'font-semibold',
                !isDone && !isActive && 'text-muted-foreground/30',
              )}
              style={isActive ? { color: hex } : {}}
              >
                {gameConfig?.labels[`phase.${key}`] ?? key}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Movement Card ──

export interface MovementEvent {
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

export function MovementCard({
  event,
  originPlanet,
  targetPlanetName,
  researchLevels,
  onRecall,
  recallingId,
  onTimerComplete,
}: {
  event: MovementEvent;
  originPlanet?: { name: string; galaxy: number; system: number; position: number };
  targetPlanetName?: string;
  researchLevels: Record<string, number>;
  onRecall?: (id: string) => void;
  recallingId?: string | null;
  onTimerComplete?: () => void;
}) {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const { data: gameConfig } = useGameConfig();
  const [expanded, setExpanded] = useState(false);
  const progress = useProgress(event.departureTime, event.arrivalTime);
  const ships = event.ships as Record<string, number>;
  const shipEntries = Object.entries(ships).filter(([, v]) => v > 0);
  const hasFlagship = !!ships['flagship'];
  const { data: flagship } = trpc.flagship.get.useQuery(undefined, { enabled: hasFlagship });
  const shipCount = shipEntries.reduce((sum, [, n]) => sum + n, 0);

  const targetCoords = `[${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}]`;
  const targetLabel = targetPlanetName ? `${targetPlanetName} ${targetCoords}` : targetCoords;
  const originCoords = originPlanet
    ? `[${originPlanet.galaxy}:${originPlanet.system}:${originPlanet.position}]`
    : '';
  const originLabel = originPlanet?.name ?? 'Planete';

  const canRecall = onRecall && ['outbound', 'prospecting', 'mining'].includes(event.phase) && event.mission !== 'trade';
  const isReturn = event.phase === 'return';

  const mStyle = MISSION_STYLE[event.mission] ?? MISSION_STYLE.transport;
  const missionHex = gameConfig?.missions?.[event.mission]?.color ?? '#888';
  const pStyle = PHASE_STYLE[event.phase] ?? PHASE_STYLE.outbound;
  const phaseLabel = gameConfig?.labels?.[`phase.${event.phase}`] ?? event.phase;
  const missionLabel = gameConfig?.missions?.[event.mission]?.label ?? event.mission;

  const minerai = Number(event.mineraiCargo);
  const silicium = Number(event.siliciumCargo);
  const hydrogene = Number(event.hydrogeneCargo);
  const hasCargo = minerai > 0 || silicium > 0 || hydrogene > 0;
  const totalCargo = minerai + silicium + hydrogene;

  const fromLabel = isReturn ? targetLabel : `${originLabel} ${originCoords}`;
  const toLabel = isReturn ? `${originLabel} ${originCoords}` : targetLabel;

  // Ship stats for expanded panel — merge flagship stats from DB
  const shipStats = useMemo(() => {
    const base = gameConfig?.ships as Record<string, {
      baseSpeed: number; cargoCapacity: number; fuelConsumption: number;
      driveType: string; miningExtraction: number; weapons: number; shield: number; armor: number;
    }> | undefined;
    if (!base) return undefined;
    if (!hasFlagship || !flagship) return base;
    return {
      ...base,
      flagship: {
        baseSpeed: flagship.baseSpeed,
        cargoCapacity: flagship.cargoCapacity,
        fuelConsumption: flagship.fuelConsumption,
        driveType: flagship.driveType,
        miningExtraction: 0,
        weapons: flagship.weapons,
        shield: flagship.shield,
        armor: flagship.baseArmor ?? 0,
      },
    };
  }, [gameConfig?.ships, hasFlagship, flagship]);

  // Ship name helper — uses flagship DB name for 'flagship', gameConfig for others
  const shipName = (id: string) => id === 'flagship' ? (flagship?.name ?? 'Vaisseau amiral') : getShipName(id, gameConfig);

  // Ship icon helper — uses personalized flagship image when available
  const ShipIcon = ({ id, className }: { id: string; className: string }) => {
    if (id === 'flagship' && flagship?.flagshipImageIndex != null) {
      return <img src={getFlagshipImageUrl(flagship.flagshipImageIndex, 'icon')} alt={shipName(id)} className={className} loading="lazy" />;
    }
    return <GameImage category="ships" id={id} size="icon" alt={shipName(id)} className={className} />;
  };

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
        style={{ background: `linear-gradient(135deg, ${missionHex}08 0%, transparent 50%)` }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Header: Mission + Phase + Timer */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <MissionIcon mission={event.mission as any} size={16} className="flex-shrink-0" />
            <span className={cn('text-base font-bold tracking-tight', mStyle.text)}>
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

        {/* Mining stepper or standard progress bar */}
        {event.mission === 'mine' ? (
          <MiningPhaseStepper phase={event.phase} progress={progress} hex={missionHex} gameConfig={gameConfig} />
        ) : (
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
        )}

        {/* Ships (summary) */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {shipEntries.map(([id, count]) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[11px]"
            >
              <ShipIcon id={id} className="h-5 w-5 rounded-sm" />
              <span className="text-foreground font-semibold">{count}&times;</span>
              <span className="text-muted-foreground">{shipName(id)}</span>
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
                            <td className="px-2 py-1.5 text-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <ShipIcon id={id} className="h-4 w-4 rounded-sm" />
                                {shipName(id)}
                              </span>
                            </td>
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
                              {stats ? gameConfig?.labels?.[`drive.${stats.driveType}`] ?? stats.driveType : '—'}
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
                  onClick={(e) => { e.stopPropagation(); setActivePlanet(event.originPlanetId); navigate('/'); }}
                >
                  {originLabel} {originCoords}
                </button>
              </div>
            )}

            {/* Recall */}
            {canRecall && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50 text-xs h-7"
                  onClick={(e) => { e.stopPropagation(); onRecall!(event.id); }}
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
