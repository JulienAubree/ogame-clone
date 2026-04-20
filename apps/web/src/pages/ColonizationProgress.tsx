import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getPlanetImageUrl } from '@/lib/assets';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName } from '@/lib/entity-names';

// ── Countdown hook ──

function useCountdown(target: Date): string {
  const compute = useCallback(() => {
    const diff = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [target]);
  const [display, setDisplay] = useState(compute);
  useEffect(() => {
    const id = setInterval(() => setDisplay(compute()), 1000);
    return () => clearInterval(id);
  }, [compute]);
  return display;
}

// ── Inline SVG Icons ──

function IconRocket({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function IconCheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconPackage({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconAlertTriangle({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconTruck({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function IconAnchor({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="22" x2="12" y2="8" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
    </svg>
  );
}

function IconCrosshair({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  );
}

function IconInfo({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function IconChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={cn('transition-transform', open && 'rotate-180', className)}
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Expandable explainer ──

function ExpandableInfo({
  label,
  accent,
  children,
}: {
  label: string;
  accent: 'amber' | 'emerald' | 'blue' | 'red' | 'muted';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const colorMap = {
    amber: 'text-amber-300 hover:text-amber-200 border-amber-500/30 bg-amber-500/5',
    emerald: 'text-emerald-300 hover:text-emerald-200 border-emerald-500/30 bg-emerald-500/5',
    blue: 'text-blue-300 hover:text-blue-200 border-blue-500/30 bg-blue-500/5',
    red: 'text-red-300 hover:text-red-200 border-red-500/30 bg-red-500/5',
    muted: 'text-muted-foreground hover:text-foreground border-border/30 bg-card/40',
  };
  const btnColor = {
    amber: 'text-amber-400/70 hover:text-amber-300',
    emerald: 'text-emerald-400/70 hover:text-emerald-300',
    blue: 'text-blue-400/70 hover:text-blue-300',
    red: 'text-red-400/70 hover:text-red-300',
    muted: 'text-muted-foreground/70 hover:text-foreground',
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          btnColor[accent],
        )}
      >
        <IconInfo className="h-3 w-3" />
        <span>{label}</span>
        <IconChevron open={open} />
      </button>
      {open && (
        <div className={cn('mt-2 rounded-lg border p-3 text-[11px] leading-relaxed space-y-2', colorMap[accent])}>
          {children}
        </div>
      )}
    </>
  );
}

// ── Convoy countdown component ──

function ConvoyCountdown({ arrivalTime }: { arrivalTime: string }) {
  const display = useCountdown(new Date(arrivalTime));
  const hoursLeft = (new Date(arrivalTime).getTime() - Date.now()) / (1000 * 60 * 60);
  return (
    <span className={cn(
      'font-mono text-sm tabular-nums font-bold',
      hoursLeft < 0.25 ? 'text-emerald-300' : 'text-emerald-400',
    )}>
      {display}
    </span>
  );
}

// ── Raid countdown component ──

function RaidCountdown({ arrivalTime }: { arrivalTime: string }) {
  const display = useCountdown(new Date(arrivalTime));
  const hoursLeft = (new Date(arrivalTime).getTime() - Date.now()) / (1000 * 60 * 60);
  return (
    <span className={cn(
      'font-mono text-sm tabular-nums font-bold',
      hoursLeft < 0.5 ? 'text-red-400 animate-pulse' : hoursLeft < 1 ? 'text-red-400' : hoursLeft < 2 ? 'text-orange-400' : 'text-amber-400',
    )}>
      {display}
    </span>
  );
}

// ── Convoy bonus countdown (compact mm:ss or h:mm) ──

function BonusCountdown({ target }: { target: Date }) {
  const display = useCountdown(target);
  return <span className="font-mono tabular-nums">{display}</span>;
}

// ── Deadline countdown (grace period / outpost timeout) ──

function DeadlineCountdown({ target, tone }: { target: Date; tone: 'warn' | 'info' }) {
  const display = useCountdown(target);
  const hoursLeft = (target.getTime() - Date.now()) / (1000 * 60 * 60);
  const urgent = hoursLeft < 4;
  const colorClass = tone === 'warn'
    ? urgent ? 'text-red-400' : hoursLeft < 12 ? 'text-orange-400' : 'text-amber-400'
    : hoursLeft < 0.25 ? 'text-orange-400' : 'text-emerald-400';
  return (
    <span className={cn('font-mono text-sm tabular-nums font-bold', colorClass)}>
      {display}
    </span>
  );
}

// ── Format helpers ──

function formatHoursMinutes(hours: number): string {
  if (hours >= 24) return `${Math.floor(hours / 24)}j ${Math.floor(hours % 24)}h`;
  if (hours >= 1) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}min`;
  return `${Math.round(hours * 60)}min`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR');
}

// ── Main component ──

export default function ColonizationProgress() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();

  const { data: planets } = trpc.planet.list.useQuery();
  const planet = planets?.find((p) => p.id === planetId);

  const { data: status, isLoading } = trpc.colonization.status.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId, refetchInterval: 30_000 },
  );

  const { data: inboundFleets } = trpc.fleet.inbound.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const completeMutation = trpc.colonization.complete.useMutation({
    onSuccess: () => {
      utils.colonization.status.invalidate({ planetId: planetId! });
      utils.planet.list.invalidate();
      utils.planet.empire.invalidate();
    },
  });

  // Filter inbound hostile fleets targeting this planet (pirate raids)
  const planetRaids = useMemo(() => {
    if (!inboundFleets || !planet) return [];
    return inboundFleets.filter((f: any) =>
      f.hostile &&
      f.targetGalaxy === planet.galaxy &&
      f.targetSystem === planet.system &&
      f.targetPosition === planet.position &&
      (f.mission === 'colonization_raid' || f.mission === 'pirate' || f.mission === 'attack'),
    );
  }, [inboundFleets, planet]);

  // Friendly inbound convoys targeting this planet (supply + reinforcements)
  const planetConvoys = useMemo(() => {
    if (!inboundFleets || !planet) return [];
    return inboundFleets.filter((f: any) =>
      !f.hostile &&
      f.targetGalaxy === planet.galaxy &&
      f.targetSystem === planet.system &&
      f.targetPosition === planet.position &&
      (f.mission === 'transport' || f.mission === 'colonize_supply' || f.mission === 'colonize_reinforce'),
    );
  }, [inboundFleets, planet]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (!status) return null;

  const isComplete = status.progress >= 0.995;
  const progressPct = Math.min(100, Math.round(status.progress * 100));
  const passiveRatePct = (status.effectivePassiveRate * 100).toFixed(1);
  const etaDisplay = status.estimatedCompletionHours === Infinity
    ? '---'
    : status.estimatedCompletionHours < 1
      ? `~${Math.round(status.estimatedCompletionHours * 60)}min`
      : `~${status.estimatedCompletionHours.toFixed(1)}h`;

  const coords = planet
    ? { galaxy: planet.galaxy, system: planet.system, position: planet.position }
    : null;

  function fleetSendUrl(mission: string) {
    if (!coords) return '/fleet/send';
    return `/fleet/send?mission=${mission}&galaxy=${coords.galaxy}&system=${coords.system}&position=${coords.position}`;
  }

  // ── COLONIZATION COMPLETE SCREEN ──
  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 lg:py-20 text-center">
        {/* Planet image */}
        {planet?.planetClassId && planet.planetImageIndex != null && (
          <div className="relative mb-6">
            <img
              src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'full')}
              alt={planet.name}
              className="h-40 w-40 lg:h-52 lg:w-52 rounded-full border-4 border-emerald-500/40 object-cover shadow-2xl shadow-emerald-500/30"
            />
            <div className="absolute -bottom-2 -right-2 rounded-full bg-emerald-500 p-2.5 shadow-lg">
              <IconCheckCircle className="h-6 w-6 text-white" />
            </div>
          </div>
        )}

        {/* Title */}
        <h1 className="text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-300 to-emerald-600 mb-2">
          Colonisation reussie !
        </h1>
        <p className="text-lg text-foreground font-semibold mb-1">
          {planet?.name ?? 'Colonie'} [{coords?.galaxy}:{coords?.system}:{coords?.position}]
        </p>
        <p className="text-sm text-muted-foreground mb-8 max-w-md">
          Votre colonie est stabilisee et operationnelle. Les infrastructures sont en place,
          le perimetre est securise. Un nouveau monde vous attend.
        </p>

        {/* Summary */}
        <div className="flex items-center gap-6 mb-8 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">100%</div>
            <div className="text-xs text-muted-foreground">Progression</div>
          </div>
          <div className="h-8 w-px bg-border/50" />
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">x{status.difficultyFactor.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Difficulte</div>
          </div>
          <div className="h-8 w-px bg-border/50" />
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{status.stationedFP}</div>
            <div className="text-xs text-muted-foreground">FP garnison</div>
          </div>
        </div>

        {/* CTA */}
        <Button
          size="lg"
          className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 text-base px-8"
          onClick={() => completeMutation.mutate({ planetId: planetId! })}
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? 'Finalisation...' : 'Prendre possession de la colonie'}
        </Button>
      </div>
    );
  }

  // ── Outpost not established state ──
  const outpostNotEstablished = !status.outpostEstablished;

  // ── Stock status helpers ──
  const stockStatus: 'sufficient' | 'critical' | 'stockout' =
    !status.stockSufficient
      ? 'stockout'
      : status.hoursUntilStockout !== null && status.hoursUntilStockout < 2
        ? 'critical'
        : 'sufficient';

  // Ship entries for garrison
  const garrisonShips = Object.entries(status.stationedShips).filter(([, count]) => count > 0);

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ════ HERO BANNER ════ */}
      <div className="relative overflow-hidden rounded-b-2xl lg:rounded-2xl lg:mx-6">
        {/* Planet image background */}
        <div className="absolute inset-0">
          {planet?.planetClassId && planet.planetImageIndex != null ? (
            <img
              src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'full')}
              alt=""
              className="h-full w-full object-cover opacity-40 blur-sm scale-110"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-amber-900/30 to-primary/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-12 lg:pb-8">
          <div className="flex items-start gap-5">
            {/* Planet thumbnail */}
            {planet?.planetClassId && planet.planetImageIndex != null ? (
              <div className="relative shrink-0">
                <img
                  src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
                  alt={planet.name}
                  className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-amber-500/40 object-cover shadow-lg shadow-amber-500/20"
                />
                <div className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 p-1.5 shadow-lg">
                  <IconRocket className="h-3.5 w-3.5 text-background" />
                </div>
              </div>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-500/40 bg-card text-2xl font-bold text-amber-400 shadow-lg shadow-amber-500/20">
                {planet?.name?.charAt(0) ?? '?'}
              </div>
            )}

            {/* Title + info */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  {outpostNotEstablished ? 'En attente' : 'Colonisation en cours'}
                </span>
              </div>
              <h1 className="text-xl lg:text-2xl font-bold text-foreground truncate">
                {planet?.name ?? 'Colonie'}
              </h1>
              <p className="text-sm text-muted-foreground">
                [{coords?.galaxy}:{coords?.system}:{coords?.position}]
                {' '} · Difficulte x{status.difficultyFactor.toFixed(2)}
              </p>
            </div>

            {/* Big percentage */}
            <div className="hidden sm:block text-right">
              <div className="text-4xl lg:text-5xl font-black tabular-nums text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600">
                {progressPct}%
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="relative h-5 w-full rounded-full bg-card/80 border border-border/30 overflow-hidden">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear',
                  outpostNotEstablished
                    ? 'bg-gradient-to-r from-amber-600/50 to-amber-500/30'
                    : 'bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]',
                )}
                style={{ width: outpostNotEstablished ? '0%' : `${progressPct}%` }}
              />
              {/* Shimmer effect */}
              {!outpostNotEstablished && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
                  style={{ width: `${progressPct}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite] -translate-x-full" />
                </div>
              )}
              {/* Percentage inside bar on mobile */}
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white sm:hidden drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {outpostNotEstablished ? 'En attente' : `${progressPct}%`}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              {outpostNotEstablished ? (
                <span className="text-amber-400 font-medium">En attente de l'avant-poste</span>
              ) : (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>
                    Progression : <span className="text-amber-400 font-medium">{passiveRatePct}%/h</span>
                  </span>
                  {status.totalRateBonus > 0 && (
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0 text-[10px] font-bold text-emerald-300">
                      +{Math.round(status.totalRateBonus * 100)}% bonus
                    </span>
                  )}
                  {!status.stockSufficient && (
                    <span className="text-red-400">(ralentie — rupture de stock)</span>
                  )}
                </span>
              )}
              {!outpostNotEstablished && (
                <span>Estimation : <span className="text-foreground font-medium">{etaDisplay}</span></span>
              )}
            </div>
            {!outpostNotEstablished && (
              <div className="mt-2">
                <ExpandableInfo label="Decomposition du taux" accent="amber">
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="text-muted-foreground">Taux de base</span>
                    <span className="tabular-nums font-medium">{(status.basePassiveRate * 100).toFixed(1)}%/h</span>
                    <span className="text-muted-foreground">× Difficulte</span>
                    <span className="tabular-nums font-medium">×{status.difficultyFactor.toFixed(2)}</span>
                    <span className="text-muted-foreground">× Multiplicateur stock</span>
                    <span className={cn('tabular-nums font-medium', status.stockSufficient ? 'text-emerald-300' : 'text-red-300')}>
                      ×{status.stockSufficient ? '1.00' : '0.50'}
                    </span>
                    <span className={cn('text-muted-foreground', !status.garrisonBonusActive && 'opacity-50')}>
                      {status.garrisonBonusActive ? '+ Bonus garnison' : 'Bonus garnison (>=' + status.garrisonFpThreshold + ' FP)'}
                    </span>
                    <span className={cn('tabular-nums font-medium', status.garrisonBonusActive ? 'text-emerald-300' : 'text-muted-foreground opacity-50')}>
                      {status.garrisonBonusActive ? `+${Math.round(status.garrisonBonusValue * 100)}%` : `+${Math.round(status.garrisonBonusValue * 100)}%`}
                    </span>
                    <span className={cn('text-muted-foreground', !status.convoyBonusActive && 'opacity-50')}>
                      {status.convoyBonusActive ? '+ Bonus convoi recent' : `Bonus convoi (${status.convoyWindowHours}h apres livraison)`}
                    </span>
                    <span className={cn('tabular-nums font-medium', status.convoyBonusActive ? 'text-emerald-300' : 'text-muted-foreground opacity-50')}>
                      +{Math.round(status.convoyBonusValue * 100)}%
                    </span>
                    {status.totalRateBonus > 0 && (
                      <>
                        <span className="text-muted-foreground">× Bonus total</span>
                        <span className="tabular-nums font-medium text-emerald-300">
                          ×{(1 + status.totalRateBonus).toFixed(2)}
                          {status.totalRateBonus >= status.bonusCap && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(plafond)</span>
                          )}
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground border-t border-border/30 pt-1">Taux effectif</span>
                    <span className="tabular-nums font-bold text-amber-300 border-t border-border/30 pt-1">{passiveRatePct}%/h</span>
                  </div>
                  {status.convoyBonusActive && status.convoyBonusEndsAt && (
                    <p className="text-emerald-300">
                      Bonus convoi actif encore <BonusCountdown target={new Date(status.convoyBonusEndsAt)} />. Chaque nouveau convoi remet le compteur a zero.
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    A ce rythme, {Math.round((1 - status.progress) * 100)}% restants arrivent dans ~<span className="text-foreground font-medium">{etaDisplay.replace('~', '')}</span>.
                  </p>
                  <p className="text-muted-foreground">
                    Bonus cumulables jusqu'a +{Math.round(status.bonusCap * 100)}% : stationner au moins <span className="text-foreground font-medium">{status.garrisonFpThreshold} FP</span> (+{Math.round(status.garrisonBonusValue * 100)}%) et livrer regulierement des ressources (+{Math.round(status.convoyBonusValue * 100)}% pendant {status.convoyWindowHours}h).
                  </p>
                  {!status.stockSufficient && (
                    <p className="text-red-300">
                      Stock epuise : envoyez des ressources pour retrouver le plein rendement ({(status.basePassiveRate * status.difficultyFactor * 100).toFixed(1)}%/h).
                    </p>
                  )}
                </ExpandableInfo>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 lg:px-6">
        {/* ════ OUTPOST NOT ESTABLISHED ════ */}
        {outpostNotEstablished ? (
          <section className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-900/5 p-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/20">
                <IconAnchor className="h-8 w-8 text-amber-400" />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">
                Etablissement de l'avant-poste
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Envoyez un premier convoi de ressources pour etablir l'avant-poste
                et demarrer la colonisation.
              </p>
              <div className="mt-3 flex justify-center">
                <ExpandableInfo label="Comment ca marche ?" accent="amber">
                  <p>
                    Des que le convoi livre au moins <span className="text-minerai font-medium">{formatNumber(status.outpostThresholdMinerai)} minerai</span> et{' '}
                    <span className="text-silicium font-medium">{formatNumber(status.outpostThresholdSilicium)} silicium</span>, l'avant-poste est etabli et la colonisation demarre.
                  </p>
                  <p>
                    Progression de base : <span className="font-medium text-foreground">{(status.basePassiveRate * 100).toFixed(0)}%/h</span>
                    {' '}× difficulte <span className="font-medium text-foreground">×{status.difficultyFactor.toFixed(2)}</span>
                    {' '}= <span className="font-medium text-amber-300">{(status.basePassiveRate * status.difficultyFactor * 100).toFixed(1)}%/h</span> (avec stock suffisant).
                  </p>
                  <p>
                    Temps estime jusqu'a 100% sans rupture : ~<span className="font-medium text-foreground">{formatHoursMinutes(1 / (status.basePassiveRate * status.difficultyFactor))}</span>
                    {' '}— reductible jusqu'a ~<span className="font-medium text-emerald-300">{formatHoursMinutes(1 / (status.basePassiveRate * status.difficultyFactor * (1 + status.bonusCap)))}</span> avec les bonus actifs.
                  </p>
                  <p className="text-emerald-300">
                    Bonus cumulables (plafond +{Math.round(status.bonusCap * 100)}%) : stationner au moins <span className="font-medium">{status.garrisonFpThreshold} FP</span> (+{Math.round(status.garrisonBonusValue * 100)}%) et livrer regulierement des ressources (+{Math.round(status.convoyBonusValue * 100)}% pendant {status.convoyWindowHours}h apres chaque convoi).
                  </p>
                  <p className="text-muted-foreground">
                    Apres livraison : 1h de sursis sans consommation, puis la planete consomme{' '}
                    <span className="text-minerai">{formatNumber(status.consumptionMineraiPerHour)} minerai/h</span> et{' '}
                    <span className="text-silicium">{formatNumber(status.consumptionSiliciumPerHour)} silicium/h</span>. Rupture = progression divisee par 2.
                  </p>
                </ExpandableInfo>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 text-sm">
              <span className="rounded-lg bg-card/80 border border-border/30 px-3 py-1.5 text-minerai font-medium">
                {formatNumber(status.outpostThresholdMinerai)} minerai
              </span>
              <span className="text-muted-foreground">+</span>
              <span className="rounded-lg bg-card/80 border border-border/30 px-3 py-1.5 text-silicium font-medium">
                {formatNumber(status.outpostThresholdSilicium)} silicium
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">Minimum requis pour etablir l'avant-poste</p>

            {status.outpostTimeoutAt && (
              <div className="mx-auto max-w-sm rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-left">
                  <IconAlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-[11px] text-red-300 leading-tight">
                    Sans avant-poste, la colonie sera abandonnee dans
                  </span>
                </div>
                <DeadlineCountdown target={new Date(status.outpostTimeoutAt)} tone="warn" />
              </div>
            )}

            <Button
              className="bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20"
              onClick={() => navigate(fleetSendUrl('transport'))}
            >
              <IconSend className="w-4 h-4 mr-2" />
              Envoyer un convoi
            </Button>

            {planetConvoys.length > 0 && (
              <div className="mx-auto max-w-md rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-left space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <IconTruck className="w-3.5 h-3.5" />
                    Convois en approche
                  </p>
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    {planetConvoys.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {planetConvoys.map((f: any) => {
                    const minerai = Number(f.mineraiCargo ?? 0);
                    const silicium = Number(f.siliciumCargo ?? 0);
                    const hydrogene = Number(f.hydrogeneCargo ?? 0);
                    const shipCount = Object.values(f.ships as Record<string, number>).reduce((a, b) => a + b, 0);
                    const missionLabel =
                      f.mission === 'colonize_reinforce' ? 'Renforts' :
                      f.mission === 'colonize_supply' ? 'Ravitaillement' :
                      'Transport';
                    return (
                      <div
                        key={f.id}
                        className="rounded-md bg-card/60 border border-border/20 px-2.5 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-emerald-300">{missionLabel}</span>
                            {f.originPlanetName && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                · de {f.originPlanetName}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums mt-0.5">
                            {minerai > 0 && <span className="text-minerai">{formatNumber(minerai)} minerai</span>}
                            {silicium > 0 && <span className="text-silicium">{formatNumber(silicium)} silicium</span>}
                            {hydrogene > 0 && <span className="text-hydrogene">{formatNumber(hydrogene)} hydrogène</span>}
                            {minerai === 0 && silicium === 0 && hydrogene === 0 && shipCount > 0 && (
                              <span className="text-muted-foreground">{shipCount} vaisseau{shipCount > 1 ? 'x' : ''}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <IconClock className="w-3.5 h-3.5 text-emerald-400/60" />
                          <ConvoyCountdown arrivalTime={f.arrivalTime} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mx-auto max-w-md rounded-lg border border-border/30 bg-card/40 p-3 text-left space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Phases de la colonisation
              </p>
              <ol className="text-[11px] text-muted-foreground leading-relaxed space-y-1 list-decimal list-inside">
                <li>Livrer les ressources minimales pour etablir l'avant-poste.</li>
                <li>Sursis d'installation : pas de consommation pendant la 1re heure.</li>
                <li>Progression passive, consommation active, raids possibles.</li>
                <li>A 100 %, prendre possession de la colonie.</li>
              </ol>
            </div>
          </section>
        ) : (
          <>
            {/* ════ GRACE PERIOD BANNER ════ */}
            {status.inGracePeriod && status.gracePeriodEndsAt && (
              <section className="rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-sky-900/5 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 border border-sky-500/20 shrink-0">
                    <IconClock className="h-4 w-4 text-sky-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sky-300">Sursis d'installation</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Pas de consommation de ressources. Preparez vos convois.
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <DeadlineCountdown target={new Date(status.gracePeriodEndsAt)} tone="info" />
                  <p className="text-[10px] text-muted-foreground">avant consommation</p>
                </div>
              </section>
            )}

            {/* ════ LOGISTIQUE ════ */}
            <section className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-emerald-900/5 overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <IconTruck className="w-4 h-4" />
                  Logistique
                </h3>
                <div className="flex items-center gap-1.5">
                  {stockStatus === 'sufficient' && (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-[11px] text-emerald-400 font-medium">Stock suffisant</span>
                    </>
                  )}
                  {stockStatus === 'critical' && (
                    <>
                      <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                      <span className="text-[11px] text-orange-400 font-medium">Stock critique — moins de 2h</span>
                    </>
                  )}
                  {stockStatus === 'stockout' && (
                    <>
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[11px] text-red-400 font-medium">Rupture de stock — progression ralentie</span>
                    </>
                  )}
                </div>
              </div>

              <div className="px-4 pb-2">
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Envoyez des ressources pour prolonger l'autonomie et eviter la rupture de stock
                  {!status.stockSufficient && <span className="text-red-300 font-medium"> (progression actuellement divisee par 2)</span>}.
                </p>
                {status.convoyBonusActive && status.convoyBonusEndsAt ? (
                  <p className="mt-1 text-[11px] text-emerald-300">
                    Convoi recent actif : <span className="font-bold">+{Math.round(status.convoyBonusValue * 100)}%</span> de taux encore <BonusCountdown target={new Date(status.convoyBonusEndsAt)} />.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Chaque livraison declenche <span className="text-emerald-300 font-medium">+{Math.round(status.convoyBonusValue * 100)}% de taux pendant {status.convoyWindowHours}h</span>.
                  </p>
                )}
                <div className="mt-1.5">
                  <ExpandableInfo label="Impact d'un convoi" accent="emerald">
                    <p>
                      Consommation : <span className="text-minerai font-medium">{formatNumber(status.consumptionMineraiPerHour)} minerai/h</span> +{' '}
                      <span className="text-silicium font-medium">{formatNumber(status.consumptionSiliciumPerHour)} silicium/h</span>.
                    </p>
                    <p className="text-emerald-300">
                      Bonus convoi : chaque livraison (meme symbolique) accorde <span className="font-bold">+{Math.round(status.convoyBonusValue * 100)}% de taux pendant {status.convoyWindowHours}h</span>. Le compteur se remet a zero a chaque nouveau convoi — enchainez les livraisons pour maintenir le bonus en continu.
                    </p>
                    <div className="rounded-md bg-card/60 border border-border/20 p-2 space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prolongation d'autonomie</p>
                      <p>
                        1 000 minerai = +<span className="text-foreground font-medium">{formatHoursMinutes(1000 / Math.max(1, status.consumptionMineraiPerHour))}</span>
                      </p>
                      <p>
                        10 000 minerai = +<span className="text-foreground font-medium">{formatHoursMinutes(10000 / Math.max(1, status.consumptionMineraiPerHour))}</span>
                      </p>
                      <p>
                        1 000 silicium = +<span className="text-foreground font-medium">{formatHoursMinutes(1000 / Math.max(1, status.consumptionSiliciumPerHour))}</span>
                      </p>
                    </div>
                    <p className="text-muted-foreground">
                      Rupture = taux divise par 2 (vous perdez environ {((status.basePassiveRate * status.difficultyFactor * 0.5) * 100).toFixed(1)}%/h).
                      L'autonomie la plus courte des deux ressources fait foi.
                    </p>
                  </ExpandableInfo>
                </div>
              </div>

              <div className="px-4 space-y-3 pb-3">
                {/* Minerai */}
                <div className="rounded-lg bg-card/60 border border-border/20 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-minerai">Minerai</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-bold text-foreground tabular-nums">{formatNumber(Math.floor(status.currentMinerai))}</span>
                      <span className="text-red-400 tabular-nums">-{formatNumber(status.consumptionMineraiPerHour)}/h</span>
                    </div>
                  </div>
                </div>

                {/* Silicium */}
                <div className="rounded-lg bg-card/60 border border-border/20 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-silicium">Silicium</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-bold text-foreground tabular-nums">{formatNumber(Math.floor(status.currentSilicium))}</span>
                      <span className="text-red-400 tabular-nums">-{formatNumber(status.consumptionSiliciumPerHour)}/h</span>
                    </div>
                  </div>
                </div>

                {/* Stockout ETA */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <IconClock className="w-3.5 h-3.5" />
                    <span>Autonomie restante</span>
                  </div>
                  <span className={cn(
                    'font-medium tabular-nums',
                    status.hoursUntilStockout === null
                      ? 'text-emerald-400'
                      : status.hoursUntilStockout < 2
                        ? 'text-red-400'
                        : status.hoursUntilStockout < 6
                          ? 'text-orange-400'
                          : 'text-emerald-400',
                  )}>
                    {status.hoursUntilStockout === null
                      ? 'Illimite'
                      : formatHoursMinutes(status.hoursUntilStockout)}
                  </span>
                </div>
              </div>

              <div className="border-t border-emerald-500/10 px-4 py-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => navigate(fleetSendUrl('transport'))}
                >
                  <IconPackage className="w-4 h-4 mr-2" />
                  Envoyer des ressources
                </Button>
              </div>
            </section>

            {/* ════ GARNISON ════ */}
            <section className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-900/5 overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <IconShield className="w-4 h-4" />
                  Garnison
                </h3>
                <span className="text-xs font-bold text-blue-400 tabular-nums">
                  {formatNumber(status.stationedFP)} FP
                </span>
              </div>

              <div className="px-4 pb-2">
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Les vaisseaux stationnes defendent la colonie contre les raids pirates qui peuvent survenir pendant la colonisation.
                </p>
                {status.garrisonBonusActive ? (
                  <p className="mt-1 text-[11px] text-emerald-300">
                    Bonus garnison actif : <span className="font-bold">+{Math.round(status.garrisonBonusValue * 100)}%</span> de taux tant que la garnison reste au-dessus de {status.garrisonFpThreshold} FP.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Atteignez <span className="text-blue-300 font-medium">{status.garrisonFpThreshold} FP</span> stationnes pour debloquer <span className="text-emerald-300 font-medium">+{Math.round(status.garrisonBonusValue * 100)}% de taux</span> en continu.
                    {status.stationedFP > 0 && (
                      <span className="text-muted-foreground"> (actuellement {formatNumber(status.stationedFP)} FP)</span>
                    )}
                  </p>
                )}
                <div className="mt-1.5">
                  <ExpandableInfo label="Role de la garnison" accent="blue">
                    <p>
                      Votre garnison actuelle : <span className="text-blue-300 font-medium">{formatNumber(status.stationedFP)} FP</span>.
                      Elle intercepte les raids pirates a leur arrivee.
                    </p>
                    <p className="text-emerald-300">
                      Bonus garnison : avec au moins <span className="font-bold">{status.garrisonFpThreshold} FP stationnes</span>, la colonisation gagne <span className="font-bold">+{Math.round(status.garrisonBonusValue * 100)}% de taux</span> en permanence. Cumulable avec le bonus convoi (plafond +{Math.round(status.bonusCap * 100)}%).
                    </p>
                    <p>
                      La taille des raids croit avec le niveau IPC (actuellement <span className="text-foreground font-medium">niv. {status.ipcLevel}</span>) et, dans une moindre mesure, avec votre garnison elle-meme. Maintenez un FP suffisant pour vaincre les raids sans surdimensionner.
                    </p>
                    <p className="text-muted-foreground">
                      Conseil : envoyez des renforts des que vous voyez des menaces en approche. Sans garnison, les raids detruisent vos stocks et peuvent ralentir la colonisation.
                    </p>
                  </ExpandableInfo>
                </div>
              </div>

              <div className="px-4 pb-3">
                {garrisonShips.length > 0 ? (
                  <div className="space-y-1.5">
                    {garrisonShips.map(([shipId, count]) => (
                      <div
                        key={shipId}
                        className="flex items-center justify-between rounded-lg bg-card/60 border border-border/20 px-3 py-2"
                      >
                        <span className="text-xs font-medium text-foreground">
                          {getShipName(shipId, gameConfig)}
                        </span>
                        <span className="text-xs font-bold text-blue-400 tabular-nums">
                          x{count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-card/40 border border-border/20 px-3 py-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      Aucun vaisseau stationné — la colonie est vulnérable aux raids
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-blue-500/10 px-4 py-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                  onClick={() => navigate(fleetSendUrl('colonize_reinforce'))}
                >
                  <IconShield className="w-4 h-4 mr-2" />
                  Envoyer des renforts
                </Button>
              </div>
            </section>

            {/* ════ MENACES ════ */}
            <section className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/5 to-red-900/5 overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
                  <IconAlertTriangle className="w-4 h-4" />
                  Menaces
                </h3>
                {planetRaids.length > 0 && (
                  <span className="rounded-full bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-400">
                    {planetRaids.length} en approche
                  </span>
                )}
              </div>

              <div className="px-4 pb-2">
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Les pirates lancent des raids a intervalles irreguliers tant que la colonisation n'est pas terminee.
                </p>
                <div className="mt-1.5">
                  <ExpandableInfo label="Comprendre les raids" accent="red">
                    <p>
                      Un raid peut survenir a tout moment apres l'etablissement de l'avant-poste. Votre niveau de detection (lie a vos batiments) determine les informations visibles : compte a rebours, composition, identite.
                    </p>
                    <p>
                      Au combat : votre garnison affronte la flotte pirate. Si elle perd, les pirates pillent vos stocks (minerai + silicium) et la progression peut etre impactee.
                    </p>
                    <p className="text-muted-foreground">
                      Defense : gardez une garnison a FP suffisant, surveillez les comptes a rebours et envoyez des renforts en avance quand une menace est detectee.
                    </p>
                  </ExpandableInfo>
                </div>
              </div>

              <div className="px-4 pb-4">
                {planetRaids.length > 0 ? (
                  <div className="space-y-2">
                    {planetRaids.map((raid: any) => {
                      const ships = raid.ships as Record<string, number>;
                      const shipEntries = Object.entries(ships).filter(([, v]) => (v as number) > 0);
                      const tier = raid.detectionTier ?? 0;

                      return (
                        <div
                          key={raid.id}
                          className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <IconCrosshair className="w-4 h-4 text-red-400" />
                              <span className="text-xs font-semibold text-red-400">
                                {tier >= 4 && raid.senderUsername
                                  ? raid.senderUsername
                                  : 'Raid pirate'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <IconClock className="w-3.5 h-3.5 text-red-400/60" />
                              <RaidCountdown arrivalTime={raid.arrivalTime} />
                            </div>
                          </div>

                          {/* Fleet composition if visible */}
                          {tier >= 3 && shipEntries.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {shipEntries.map(([shipId, count]) => (
                                <span
                                  key={shipId}
                                  className="rounded-md bg-card/80 border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {getShipName(shipId, gameConfig)} x{count as number}
                                </span>
                              ))}
                            </div>
                          )}
                          {tier >= 2 && tier < 3 && raid.shipCount != null && (
                            <p className="text-[11px] text-muted-foreground">
                              Flotte estimee : {raid.shipCount} vaisseaux
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg bg-card/40 border border-border/20 px-3 py-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      Aucune menace detectee
                    </p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
