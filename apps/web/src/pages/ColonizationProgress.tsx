import { useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { Clock as IconClock } from 'lucide-react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { DeadlineCountdown } from '@/components/colonization/Countdowns';
import { ColonizationCompleteScreen } from '@/components/colonization/ColonizationCompleteScreen';
import { ColonizationHeroBanner } from '@/components/colonization/ColonizationHeroBanner';
import { OutpostNotEstablishedSection } from '@/components/colonization/OutpostNotEstablishedSection';
import { LogisticsSection } from '@/components/colonization/LogisticsSection';
import { GarrisonSection } from '@/components/colonization/GarrisonSection';
import { ThreatsSection } from '@/components/colonization/ThreatsSection';
import type { InboundFleet } from '@/components/colonization/types';

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
  const planetRaids = useMemo<InboundFleet[]>(() => {
    if (!inboundFleets || !planet) return [];
    return (inboundFleets as InboundFleet[]).filter((f) =>
      f.hostile &&
      f.targetGalaxy === planet.galaxy &&
      f.targetSystem === planet.system &&
      f.targetPosition === planet.position &&
      (f.mission === 'colonization_raid' || f.mission === 'pirate' || f.mission === 'attack'),
    );
  }, [inboundFleets, planet]);

  // Friendly inbound convoys targeting this planet (supply + reinforcements)
  const planetConvoys = useMemo<InboundFleet[]>(() => {
    if (!inboundFleets || !planet) return [];
    return (inboundFleets as InboundFleet[]).filter((f) =>
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
      <ColonizationCompleteScreen
        status={status}
        planet={planet}
        coords={coords}
        onComplete={() => completeMutation.mutate({ planetId: planetId! })}
        isPending={completeMutation.isPending}
      />
    );
  }

  // ── Outpost not established state ──
  const outpostNotEstablished = !status.outpostEstablished;

  return (
    <div className="space-y-4 lg:space-y-6">
      <ColonizationHeroBanner
        status={status}
        planet={planet}
        coords={coords}
        outpostNotEstablished={outpostNotEstablished}
        progressPct={progressPct}
        passiveRatePct={passiveRatePct}
        etaDisplay={etaDisplay}
      />

      <div className="space-y-4 px-4 lg:px-6">
        {outpostNotEstablished ? (
          <OutpostNotEstablishedSection
            status={status}
            planetConvoys={planetConvoys}
            onSendConvoy={() => navigate(fleetSendUrl('transport'))}
          />
        ) : (
          <>
            {/* Grace period banner — short alert tied to hero */}
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

            <LogisticsSection
              status={status}
              onSendResources={() => navigate(fleetSendUrl('transport'))}
            />

            <GarrisonSection
              status={status}
              gameConfig={gameConfig}
              onSendReinforcements={() => navigate(fleetSendUrl('colonize_reinforce'))}
            />

            <ThreatsSection
              planetRaids={planetRaids}
              gameConfig={gameConfig}
            />
          </>
        )}
      </div>
    </div>
  );
}
