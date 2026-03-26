import { useState, useMemo } from 'react';
import { useNavigate, useOutletContext, Link } from 'react-router';
import { trpc } from '@/trpc';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { ShipCategoryGrid, type ShipData } from '@/components/fleet/ShipCategoryGrid';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { ShipDetailContent } from '@/components/entity-details/ShipDetailContent';

const BREADCRUMB_SEGMENTS = [
  { label: 'Flotte', path: '/fleet' },
  { label: 'Flotte stationnee', path: '/fleet/stationed' },
];

export default function StationedFleet() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();

  const [selectedShips, setSelectedShips] = useState<Record<string, number>>({});
  const [overlayShipId, setOverlayShipId] = useState<string | null>(null);

  const { data: ships, isLoading } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

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
      <div className="space-y-4 p-4 lg:p-6">
        <Breadcrumb segments={BREADCRUMB_SEGMENTS} />
        <PageHeader title="Flotte stationnee" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  if (availableShips.length === 0) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <Breadcrumb segments={BREADCRUMB_SEGMENTS} />
        <PageHeader title="Flotte stationnee" />
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aucun vaisseau stationne sur cette planete.{' '}
            <Link to="/shipyard" className="text-primary hover:underline">
              Construire des vaisseaux
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const overlayShip = overlayShipId ? availableShips.find((s) => s.id === overlayShipId) : null;

  return (
    <div className="space-y-4 p-4 pb-28 lg:p-6 lg:pb-6">
      <Breadcrumb segments={BREADCRUMB_SEGMENTS} />
      <PageHeader title="Flotte stationnee" />

      <ShipCategoryGrid
        ships={availableShips}
        imageSize="h-16 w-16"
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
                <div className="flex items-center gap-1.5 w-full">
                  <button
                    onClick={() => setQuantity(ship.id, ship.count)}
                    className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 shrink-0"
                  >
                    MAX
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={ship.count}
                    value={selectedShips[ship.id]}
                    onChange={(e) => {
                      const v = Math.min(ship.count, Math.max(1, Number(e.target.value)));
                      setQuantity(ship.id, v);
                    }}
                    className="flex-1 min-w-0 rounded border border-border bg-background px-1 py-0.5 text-center text-xs font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
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

      {/* Sticky bottom bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-14 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-lg px-4 py-3 lg:bottom-0">
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
    </div>
  );
}
