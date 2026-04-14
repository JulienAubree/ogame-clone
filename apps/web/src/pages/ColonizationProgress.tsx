import { useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { Timer } from '@/components/common/Timer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Shield, Package, Wrench, AlertTriangle, Clock, CheckCircle2, XCircle, Send } from 'lucide-react';

// ── Event helpers ──

function eventLabel(type: 'raid' | 'shortage') {
  return type === 'raid' ? 'Raid hostile' : 'Penurie de materiaux';
}

function EventIcon({ type, className }: { type: 'raid' | 'shortage'; className?: string }) {
  return type === 'raid'
    ? <Shield className={className} />
    : <Package className={className} />;
}

function urgencyClass(expiresAt: Date | string): string {
  const hoursLeft = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursLeft < 1) return 'border-red-500';
  if (hoursLeft < 2) return 'border-orange-500';
  return 'border-primary/40';
}

function statusIcon(status: 'pending' | 'resolved' | 'expired') {
  if (status === 'resolved') return <CheckCircle2 className="w-4 h-4 text-green-400" />;
  if (status === 'expired') return <XCircle className="w-4 h-4 text-red-400" />;
  return <Clock className="w-4 h-4 text-yellow-400" />;
}

function statusLabel(status: 'pending' | 'resolved' | 'expired') {
  if (status === 'resolved') return 'Resolu';
  if (status === 'expired') return 'Expire';
  return 'En attente';
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

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title="Colonisation en cours" />
        <div className="glass-card rounded-xl p-6 animate-pulse">
          <div className="h-6 w-48 bg-muted rounded mb-4" />
          <div className="h-4 w-full bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!status) return null;

  const progressPct = Math.round(status.progress * 100);
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

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Colonisation en cours"
        description={planet ? `${planet.name} [${planet.galaxy}:${planet.system}:${planet.position}]` : undefined}
      />

      {/* ════ PROGRESS ════ */}
      <section className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">Progression de la colonisation</h3>
          <span className="text-2xl font-bold text-primary">{progressPct}%</span>
        </div>

        <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-4 rounded-full bg-gradient-to-r from-primary to-green-500 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Taux passif : {passiveRatePct}%/h</span>
          <span>Estimation : {etaDisplay} restantes</span>
        </div>
      </section>

      {/* ════ ACTIVE EVENTS ════ */}
      {pendingEvents.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            Evenements en cours
          </h3>

          {pendingEvents.map((event) => (
            <div
              key={event.id}
              className={cn(
                'glass-card rounded-xl p-4 border-l-4 flex flex-col sm:flex-row sm:items-center gap-3',
                urgencyClass(event.expiresAt),
              )}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <EventIcon type={event.eventType} className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm">{eventLabel(event.eventType)}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Penalite : -{Math.round(event.penalty * 100)}%</span>
                    <span className="text-white/20">|</span>
                    <span>Bonus resolution : +{Math.round(event.resolveBonus * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <Timer endTime={new Date(event.expiresAt)} className="text-right" />
                <Button
                  size="sm"
                  onClick={() => {
                    const mission = event.eventType === 'raid' ? 'colonize_reinforce' : 'colonize_supply';
                    navigate(fleetSendUrl(mission));
                  }}
                >
                  Resoudre
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ════ ACTIONS ════ */}
      <section className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="retro"
            onClick={() => consolidateMutation.mutate({ planetId: planetId! })}
            disabled={consolidateMutation.isPending}
          >
            <Wrench className="w-4 h-4 mr-2" />
            Consolider la colonie
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(fleetSendUrl('colonize_supply'))}
          >
            <Package className="w-4 h-4 mr-2" />
            Envoyer un ravitaillement
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(fleetSendUrl('colonize_reinforce'))}
          >
            <Send className="w-4 h-4 mr-2" />
            Envoyer des renforts
          </Button>
        </div>
      </section>

      {/* ════ EVENT HISTORY ════ */}
      {pastEvents.length > 0 && (
        <section className="glass-card rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">Historique des evenements</h3>

          <div className="divide-y divide-white/5">
            {pastEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-3 py-2.5">
                <EventIcon type={event.eventType} className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{eventLabel(event.eventType)}</p>
                </div>
                <div className="flex items-center gap-2 text-xs flex-shrink-0">
                  {statusIcon(event.status)}
                  <span className={cn(
                    event.status === 'resolved' && 'text-green-400',
                    event.status === 'expired' && 'text-red-400',
                  )}>
                    {statusLabel(event.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
