import { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { HostileAlertBanner } from '@/components/fleet/HostileAlertBanner';
import { ShipCategoryGrid } from '@/components/fleet/ShipCategoryGrid';
import { MovementCardCompact } from '@/components/fleet/MovementCardCompact';

export default function FleetDashboard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();

  const { data: ships, isLoading: shipsLoading } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: fleetSlots } = trpc.fleet.slots.useQuery();
  const { data: movements, isLoading: movementsLoading } = trpc.fleet.movements.useQuery();
  const { data: inboundFleets } = trpc.fleet.inbound.useQuery();

  const isLoading = shipsLoading || movementsLoading;

  // Build shipNames record for MovementCardCompact
  const shipNames = useMemo<Record<string, string>>(() => {
    if (!ships) return {};
    return Object.fromEntries(ships.map((s) => [s.id, s.name]));
  }, [ships]);

  // Filter hostile inbound fleets (attack missions targeting the player)
  const hostileFleets = useMemo(
    () => (inboundFleets ?? []).filter((f) => f.mission === 'attack'),
    [inboundFleets],
  );

  // Sort movements by nearest arrival, cap at 5
  const recentMovements = useMemo(() => {
    if (!movements) return [];
    return [...movements]
      .sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime())
      .slice(0, 5);
  }, [movements]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Flotte" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  const totalMovements = movements?.length ?? 0;

  return (
    <div className="space-y-4 p-4 pb-28 lg:space-y-6 lg:p-6 lg:pb-6">
      {/* Header */}
      <PageHeader
        title="Flotte"
        actions={
          <Link
            to="/fleet/send"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
            Envoyer une flotte
          </Link>
        }
      />

      {/* Hostile alert banner */}
      <HostileAlertBanner hostileFleets={hostileFleets} />

      {/* Status badges */}
      <div className="flex flex-wrap gap-3">
        {/* Fleet slots badge */}
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <span className="text-muted-foreground">Slots flotte</span>
          <span className="font-semibold tabular-nums">
            {fleetSlots?.current ?? 0}
            <span className="text-muted-foreground font-normal">/{fleetSlots?.max ?? '?'}</span>
          </span>
        </div>

        {/* PvE missions link badge */}
        <Link
          to="/missions"
          className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-accent/50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 text-amber-400"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
          <span className="text-muted-foreground">Missions PvE</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3 text-muted-foreground/50"
            aria-hidden="true"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr] lg:gap-6">
        {/* Left: Stationed fleet */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Flotte stationnee
            </h2>
            <Link
              to="/fleet/stationed"
              className="text-xs text-primary hover:underline underline-offset-2"
            >
              Voir tout →
            </Link>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            {!ships || ships.filter((s) => s.count > 0).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucun vaisseau stationne.{' '}
                <Link to="/shipyard" className="text-primary hover:underline">
                  Construire des vaisseaux
                </Link>
              </p>
            ) : (
              <ShipCategoryGrid
                ships={ships}
                imageSize="h-12 w-12"
                hideEmpty
              />
            )}
          </div>
        </div>

        {/* Right: Active movements */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Mouvements actifs ({totalMovements})
            </h2>
            <Link
              to="/fleet/movements"
              className="text-xs text-primary hover:underline underline-offset-2"
            >
              Voir tout →
            </Link>
          </div>

          {recentMovements.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Aucun mouvement en cours.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMovements.map((movement) => (
                <MovementCardCompact
                  key={movement.id}
                  movement={movement}
                  shipNames={shipNames}
                />
              ))}
              {totalMovements > 5 && (
                <p className="text-center text-xs text-muted-foreground">
                  +{totalMovements - 5} autres —{' '}
                  <Link to="/fleet/movements" className="text-primary hover:underline">
                    Voir tout
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
