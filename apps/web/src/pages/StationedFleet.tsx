import { useState, useMemo } from 'react';
import { useNavigate, useOutletContext, Link } from 'react-router';
import { trpc } from '@/trpc';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { ShipCategoryGrid, type ShipData } from '@/components/fleet/ShipCategoryGrid';
import { cn } from '@/lib/utils';
import { getFlagshipImageUrl } from '@/lib/assets';
import { QuantityStepper } from '@/components/common/QuantityStepper';
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
  const { data: flagship } = trpc.flagship.get.useQuery();

  const { data: researchList } = trpc.research.list.useQuery();

  const researchLevels = useMemo(() => {
    if (!researchList) return {};
    return Object.fromEntries(researchList.map((r) => [r.id, r.currentLevel]));
  }, [researchList]);

  const flagshipOnPlanet = flagship && flagship.status === 'active' && flagship.planetId === planetId;
  const flagshipInFlight = flagship && flagship.status === 'in_mission';

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

  if (availableShips.length === 0 && !flagshipOnPlanet) {
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

      {/* Flagship */}
      {(flagshipOnPlanet || flagshipInFlight) && flagship && (
        <div>
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
    </div>
  );
}
