import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getPlanetImageUrl } from '@/lib/assets';
import { Shield, Package, Wrench, AlertTriangle, Clock, CheckCircle2, XCircle, Send, Rocket, Target } from 'lucide-react';

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

// ── Event helpers ──

function eventLabel(type: 'raid' | 'shortage') {
  return type === 'raid' ? 'Raid hostile' : 'Penurie critique';
}

function eventDescription(type: 'raid' | 'shortage') {
  return type === 'raid'
    ? 'Des pirates ont repere votre avant-poste vulnerable et lancent une offensive. Sans renforts, la colonie subira de lourds degats.'
    : 'Les stocks de materiaux sont en chute libre. Sans ravitaillement rapide, les travaux de colonisation seront suspendus.';
}

function EventIcon({ type, className }: { type: 'raid' | 'shortage'; className?: string }) {
  return type === 'raid'
    ? <Shield className={className} />
    : <Package className={className} />;
}

function EventCountdown({ expiresAt }: { expiresAt: Date | string }) {
  const display = useCountdown(new Date(expiresAt));
  const hoursLeft = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
  return (
    <span className={cn(
      'font-mono text-sm tabular-nums',
      hoursLeft < 1 ? 'text-red-400' : hoursLeft < 2 ? 'text-orange-400' : 'text-foreground',
    )}>
      {display}
    </span>
  );
}

function urgencyBorder(expiresAt: Date | string): string {
  const hoursLeft = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursLeft < 1) return 'border-red-500/60 bg-red-500/5';
  if (hoursLeft < 2) return 'border-orange-500/60 bg-orange-500/5';
  return 'border-amber-500/40 bg-amber-500/5';
}

// ── Main component ──

export default function ColonizationProgress() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: planets } = trpc.planet.list.useQuery();
  const planet = planets?.find((p) => p.id === planetId);

  const { data: status, isLoading } = trpc.colonization.status.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId, refetchInterval: 30_000 },
  );

  const consolidateMutation = trpc.colonization.consolidate.useMutation({
    onSuccess: () => utils.colonization.status.invalidate({ planetId: planetId! }),
  });

  const completeMutation = trpc.colonization.complete.useMutation({
    onSuccess: () => {
      utils.colonization.status.invalidate({ planetId: planetId! });
      utils.planet.list.invalidate();
      utils.planet.empire.invalidate();
    },
  });

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

  const pendingEvents = status.events.filter((e) => e.status === 'pending');
  const pastEvents = status.events.filter((e) => e.status !== 'pending');

  const coords = planet
    ? { galaxy: planet.galaxy, system: planet.system, position: planet.position }
    : null;

  function fleetSendUrl(mission: string) {
    if (!coords) return '/fleet/send';
    return `/fleet/send?mission=${mission}&galaxy=${coords.galaxy}&system=${coords.system}&position=${coords.position}`;
  }

  // ── COLONIZATION COMPLETE SCREEN ──
  if (isComplete) {
    const milestonesCompleted = [status.consolidateCompleted, status.supplyCompleted, status.reinforceCompleted].filter(Boolean).length;

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
              <CheckCircle2 className="h-6 w-6 text-white" />
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
            <div className="text-2xl font-bold text-emerald-400">{milestonesCompleted}/3</div>
            <div className="text-xs text-muted-foreground">Missions</div>
          </div>
          <div className="h-8 w-px bg-border/50" />
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">x{status.difficultyFactor.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Difficulte</div>
          </div>
          {(status.reinforcePassiveBonus ?? 0) > 0 && (
            <>
              <div className="h-8 w-px bg-border/50" />
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">+{((status.reinforcePassiveBonus ?? 0) * 100).toFixed(0)}%/h</div>
                <div className="text-xs text-muted-foreground">Patrouilles</div>
              </div>
            </>
          )}
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
                  <Rocket className="h-3.5 w-3.5 text-background" />
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
                  Colonisation en cours
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
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 transition-[width] duration-1000 ease-linear shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                style={{ width: `${progressPct}%` }}
              />
              {/* Shimmer effect */}
              <div
                className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
                style={{ width: `${progressPct}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite] -translate-x-full" />
              </div>
              {/* Percentage inside bar on mobile */}
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white sm:hidden drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {progressPct}%
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>
                Progression : <span className="text-amber-400 font-medium">{passiveRatePct}%/h</span>
                {(status.reinforcePassiveBonus ?? 0) > 0 && (
                  <span className="text-blue-400 ml-1">(dont +{((status.reinforcePassiveBonus ?? 0) * 100).toFixed(0)}% renforts)</span>
                )}
              </span>
              <span>Estimation : <span className="text-foreground font-medium">{etaDisplay}</span></span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 lg:px-6">
        {/* ════ ACTIVE EVENTS ════ */}
        {pendingEvents.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Alertes actives ({pendingEvents.length})
            </h3>

            {pendingEvents.map((event) => (
              <div
                key={event.id}
                className={cn(
                  'rounded-xl border-l-4 p-4 flex flex-col sm:flex-row sm:items-center gap-3',
                  urgencyBorder(event.expiresAt),
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
                    event.eventType === 'raid' ? 'bg-red-500/10' : 'bg-orange-500/10',
                  )}>
                    <EventIcon
                      type={event.eventType}
                      className={cn('w-5 h-5', event.eventType === 'raid' ? 'text-red-400' : 'text-orange-400')}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{eventLabel(event.eventType)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{eventDescription(event.eventType)}</p>
                    <div className="flex items-center gap-2 text-[10px] mt-1">
                      <span className="text-red-400">-{Math.round(event.penalty * 100)}% si ignore</span>
                      <span className="text-white/10">|</span>
                      <span className="text-emerald-400">+{Math.round(event.resolveBonus * 100)}% si resolu</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <EventCountdown expiresAt={event.expiresAt} />
                    <div className="text-[10px] text-muted-foreground">restantes</div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                    onClick={() => {
                      const mission = event.eventType === 'raid' ? 'colonize_reinforce' : 'colonize_supply';
                      navigate(fleetSendUrl(mission));
                    }}
                  >
                    <Target className="w-3.5 h-3.5 mr-1.5" />
                    Resoudre
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ════ FONDATIONS DE LA COLONIE ════ */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Fondations de la colonie
            </h3>
            <span className="text-xs text-muted-foreground">
              {[status.consolidateCompleted, status.supplyCompleted, status.reinforceCompleted].filter(Boolean).length}/3
            </span>
          </div>

          {/* Mini progress: 3 steps */}
          <div className="flex gap-1.5">
            <div className={cn('h-1.5 flex-1 rounded-full', status.consolidateCompleted ? 'bg-amber-400' : 'bg-muted')} />
            <div className={cn('h-1.5 flex-1 rounded-full', status.supplyCompleted ? 'bg-emerald-400' : 'bg-muted')} />
            <div className={cn('h-1.5 flex-1 rounded-full', status.reinforceCompleted ? 'bg-blue-400' : 'bg-muted')} />
          </div>

          {/* ── Milestone 1: Avant-poste ── */}
          {status.consolidateCompleted ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-400">Avant-poste etabli</h4>
                  <p className="text-[11px] text-muted-foreground">Les infrastructures temporaires sont deployees. Le perimetre est securise.</p>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => consolidateMutation.mutate({ planetId: planetId! })}
              disabled={consolidateMutation.isPending}
              className="w-full rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-900/10 p-4 text-left transition-all hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 shrink-0">
                  <Wrench className="h-6 w-6 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-foreground">Etablir l'avant-poste</h4>
                    <span className="text-xs font-bold text-amber-400 shrink-0">+{Math.round((status.consolidateBoost ?? 0.08) * 100)}%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Deployer les infrastructures temporaires et etablir un perimetre de securite. Les fondations de la colonie prennent forme.
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px]">
                    <span className="rounded-md bg-card/80 border border-border/30 px-2 py-0.5 text-minerai font-medium">{(status.consolidateCostMinerai ?? 2000).toLocaleString()} minerai</span>
                    <span className="rounded-md bg-card/80 border border-border/30 px-2 py-0.5 text-silicium font-medium">{(status.consolidateCostSilicium ?? 1000).toLocaleString()} silicium</span>
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* ── Milestone 2: Ravitaillement ── */}
          {status.supplyCompleted ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-400">Colonie ravitaillee</h4>
                  <p className="text-[11px] text-muted-foreground">Les materiaux ont ete livres. La construction des batiments permanents peut commencer.</p>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate(fleetSendUrl('colonize_supply'))}
              className="w-full rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-900/10 p-4 text-left transition-all hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 shrink-0">
                  <Package className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-foreground">Ravitaillement vital</h4>
                    <span className="text-xs font-bold text-emerald-400 shrink-0">+{Math.round((status.supplyBoostPerTranche ?? 0.03) * 100)}% / {(status.supplyTrancheSize ?? 2000).toLocaleString()} res.</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Les reserves de la colonie sont critiques. Un convoi de ravitaillement apportera les materiaux necessaires a la construction des premiers batiments permanents.
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px]">
                    <span className="rounded-md bg-card/80 border border-border/30 px-2 py-0.5 text-emerald-400 font-medium">+{Math.round((status.supplyBoostPerTranche ?? 0.03) * 100)}% par tranche de {(status.supplyTrancheSize ?? 2000).toLocaleString()} ressources</span>
                    <span className="text-muted-foreground">· Max +{Math.round((status.supplyMaxBoost ?? 0.15) * 100)}%</span>
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* ── Milestone 3: Securisation ── */}
          {status.reinforceCompleted ? (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-blue-400">Patrouilles en cours</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Le secteur est securise. Bonus passif actif : <span className="text-blue-400 font-medium">+{((status.reinforcePassiveBonus ?? 0) * 100).toFixed(0)}%/h</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate(fleetSendUrl('colonize_reinforce'))}
              className="w-full rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-900/10 p-4 text-left transition-all hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 shrink-0">
                  <Shield className="h-6 w-6 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-foreground">Securiser le secteur</h4>
                    <span className="text-xs font-bold text-blue-400 shrink-0">+{Math.round((status.reinforceBoostPerShip ?? 0.01) * 100)}%/h par vaisseau</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Des signaux hostiles ont ete detectes dans le secteur. L'envoi d'une escorte militaire securisera la zone durablement, accelerant l'installation en continu.
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px]">
                    <span className="rounded-md bg-card/80 border border-border/30 px-2 py-0.5 text-blue-400 font-medium">+{Math.round((status.reinforceBoostPerShip ?? 0.01) * 100)}%/h passif par vaisseau de combat</span>
                    <span className="text-muted-foreground">· Max +{Math.round((status.reinforceMaxBoost ?? 0.10) * 100)}%/h</span>
                  </div>
                </div>
              </div>
            </button>
          )}
        </section>

        {/* ════ EVENT HISTORY ════ */}
        {pastEvents.length > 0 && (
          <section className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Historique ({pastEvents.length})
            </h3>

            <div className="divide-y divide-white/5">
              {pastEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3 py-2">
                  <EventIcon type={event.eventType} className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs flex-1">{eventLabel(event.eventType)}</span>
                  <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
                    {event.status === 'resolved'
                      ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Resolu</span></>
                      : <><XCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400">Expire</span></>
                    }
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
