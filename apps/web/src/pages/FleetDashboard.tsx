import { useState, useMemo } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { HostileAlertBanner } from '@/components/fleet/HostileAlertBanner';
import { ShipCategoryGrid, type ShipData } from '@/components/fleet/ShipCategoryGrid';
import { MovementCard, type MovementEvent } from '@/components/fleet/MovementCard';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { ShipDetailContent } from '@/components/entity-details/ShipDetailContent';
import { useGameConfig } from '@/hooks/useGameConfig';
import { cn } from '@/lib/utils';
import { getFlagshipImageUrl } from '@/lib/assets';

export default function FleetDashboard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();

  const [selectedShips, setSelectedShips] = useState<Record<string, number>>({});
  const [overlayShipId, setOverlayShipId] = useState<string | null>(null);
  const [recallConfirm, setRecallConfirm] = useState<string | null>(null);

  const { data: ships, isLoading: shipsLoading } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const { data: flagship } = trpc.flagship.get.useQuery();

  const flagshipOnPlanet = flagship && flagship.status === 'active' && flagship.planetId === planetId;
  const flagshipInFlight = flagship && flagship.status === 'in_mission';

  const { data: fleetSlots } = trpc.fleet.slots.useQuery();
  const { data: movements, isLoading: movementsLoading } = trpc.fleet.movements.useQuery();
  const { data: inboundFleets } = trpc.fleet.inbound.useQuery();

  const { data: planets } = trpc.planet.list.useQuery();
  const firstPlanetId = planets?.[0]?.id;
  const { data: researchList } = trpc.research.list.useQuery(
    { planetId: firstPlanetId! },
    { enabled: !!firstPlanetId },
  );

  const isLoading = shipsLoading || movementsLoading;

  const recallMutation = trpc.fleet.recall.useMutation({
    onSuccess: () => {
      utils.fleet.movements.invalidate();
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
      setRecallConfirm(null);
    },
  });

  const researchLevels = useMemo(() => {
    if (!researchList) return {};
    return Object.fromEntries(researchList.map((r) => [r.id, r.currentLevel]));
  }, [researchList]);

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

  // Ship selection
  const availableShips = useMemo(
    () => (ships ?? []).filter((s) => s.count > 0),
    [ships],
  );

  function toggleShip(ship: ShipData) {
    setSelectedShips((prev) => {
      if (prev[ship.id] !== undefined) {
        const next = { ...prev };
        delete next[ship.id];
        return next;
      }
      return { ...prev, [ship.id]: ship.count };
    });
  }

  function setQuantity(shipId: string, value: number) {
    setSelectedShips((prev) => ({ ...prev, [shipId]: value }));
  }

  const selectedIds = useMemo(() => new Set(Object.keys(selectedShips)), [selectedShips]);
  const selectedCount = selectedIds.size;

  function handleSend() {
    const params = new URLSearchParams();
    for (const [id, qty] of Object.entries(selectedShips)) {
      if (qty > 0) {
        params.set(`ship_${id}`, String(qty));
      }
    }
    navigate(`/fleet/send?${params.toString()}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Flotte" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  const totalMovements = movements?.length ?? 0;
  const overlayShip = overlayShipId ? availableShips.find((s) => s.id === overlayShipId) : null;

  // Recall dialog labels
  const recallingEvent = recallConfirm ? recentMovements.find((m) => m.id === recallConfirm) : null;
  const recallingLabel = recallingEvent
    ? (gameConfig?.missions[recallingEvent.mission]?.label ?? recallingEvent.mission)
    : '';
  const recallingCoords = recallingEvent
    ? `[${recallingEvent.targetGalaxy}:${recallingEvent.targetSystem}:${recallingEvent.targetPosition}]`
    : '';

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

      {/* Two-column layout — on mobile, movements come first */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr] lg:gap-6">
        {/* Left on desktop, second on mobile: Stationed fleet */}
        <div className="order-2 lg:order-1 space-y-3">
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

          {availableShips.length === 0 && !flagshipOnPlanet ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Aucun vaisseau stationne.{' '}
                <Link to="/shipyard" className="text-primary hover:underline">
                  Construire des vaisseaux
                </Link>
              </p>
            </div>
          ) : (
            <>
            {/* Flagship */}
            {(flagshipOnPlanet || flagshipInFlight) && flagship && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                    Vaisseau amiral
                  </span>
                  {flagshipInFlight && (
                    <span className="text-[10px] font-medium text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded-full">
                      En vol
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                  <button
                    type="button"
                    disabled={!!flagshipInFlight}
                    onClick={() => {
                      if (flagshipInFlight) return;
                      setSelectedShips((prev) => {
                        if (prev['flagship'] !== undefined) {
                          const next = { ...prev };
                          delete next['flagship'];
                          return next;
                        }
                        return { ...prev, flagship: 1 };
                      });
                    }}
                    className={cn(
                      'retro-card overflow-hidden flex flex-col text-left',
                      flagshipInFlight ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                      selectedIds.has('flagship') && 'border-primary',
                    )}
                  >
                    <div className="relative h-24 overflow-hidden bg-gradient-to-br from-amber-950/50 to-amber-900/20 flex items-center justify-center">
                      {flagship.flagshipImageIndex != null ? (
                        <img
                          src={getFlagshipImageUrl(flagship.hullId ?? 'industrial', flagship.flagshipImageIndex, 'full')}
                          alt={flagship.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-amber-400/60">
                          <path d="M12 2L3 9l9 13 9-13-9-7z" fill="currentColor" opacity={0.3} />
                          <path d="M12 2L3 9l9 13 9-13-9-7z" stroke="currentColor" strokeWidth={1.5} fill="none" />
                        </svg>
                      )}
                      <span className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
                        x1
                      </span>
                      {selectedIds.has('flagship') && (
                        <div className="absolute top-2 left-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md">
                          <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 flex flex-col gap-1.5">
                      <span className="text-[13px] font-semibold text-amber-400 leading-tight line-clamp-2">
                        {flagship.name}
                      </span>
                      <Link
                        to="/flagship"
                        className="text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Details →
                      </Link>
                    </div>
                  </button>
                </div>
              </div>
            )}

            <ShipCategoryGrid
              ships={availableShips}
              hideEmpty
              selectedIds={selectedIds}
              onShipClick={(shipId) => {
                const ship = availableShips.find((s) => s.id === shipId);
                if (ship) toggleShip(ship);
              }}
              renderActions={(ship) => {
                const isSelected = selectedShips[ship.id] !== undefined;
                return (
                  <div className="mt-1 flex flex-col items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                    {isSelected && (
                      <QuantityStepper
                        value={selectedShips[ship.id]}
                        onChange={(v) => setQuantity(ship.id, v)}
                        min={1}
                        max={ship.count}
                      />
                    )}
                    <button
                      onClick={() => setOverlayShipId(ship.id)}
                      className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    >
                      Détails
                    </button>
                  </div>
                );
              }}
            />
            </>
          )}
        </div>

        {/* Right on desktop, first on mobile: Active movements */}
        <div className="order-1 lg:order-2 space-y-3">
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
              {recentMovements.map((movement) => {
                const origin = planets?.find((p) => p.id === movement.originPlanetId);
                const target = planets?.find((p) => p.galaxy === movement.targetGalaxy && p.system === movement.targetSystem && p.position === movement.targetPosition);
                return (
                  <MovementCard
                    key={movement.id}
                    event={movement as unknown as MovementEvent}
                    originPlanet={origin ? { name: origin.name, galaxy: origin.galaxy, system: origin.system, position: origin.position } : undefined}
                    targetPlanetName={target?.name}
                    researchLevels={researchLevels}
                    onRecall={setRecallConfirm}
                    recallingId={recallConfirm}
                    onTimerComplete={() => utils.fleet.movements.invalidate()}
                  />
                );
              })}
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

      {/* Sticky bottom bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-lg px-4 py-3 lg:bottom-0">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedCount} type{selectedCount > 1 ? 's' : ''} selectione{selectedCount > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={handleSend}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Envoyer les vaisseaux selectionnes
            </button>
          </div>
        </div>
      )}

      {/* Ship detail overlay */}
      <EntityDetailOverlay
        open={!!overlayShipId}
        onClose={() => setOverlayShipId(null)}
        title={overlayShip?.name ?? ''}
      >
        {overlayShipId && (
          <ShipDetailContent
            shipId={overlayShipId}
            researchLevels={researchLevels}
          />
        )}
      </EntityDetailOverlay>

      {/* Recall confirm dialog */}
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
