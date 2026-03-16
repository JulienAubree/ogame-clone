import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
import { formatDuration } from '@/lib/format';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityDetailOverlay, InfoButton } from '@/components/common/EntityDetailOverlay';
import { ShipDetailContent } from '@/components/entity-details/ShipDetailContent';
import { useGameConfig } from '@/hooks/useGameConfig';
import { formatMissingPrerequisite } from '@/lib/prerequisites';

const SHIP_CATEGORIES = [
  { id: 'combat', label: 'Combat', shipIds: ['lightFighter', 'heavyFighter', 'cruiser', 'battleship'] },
  { id: 'transport', label: 'Transport', shipIds: ['smallCargo', 'largeCargo'] },
  { id: 'utilitaire', label: 'Utilitaire', shipIds: ['espionageProbe', 'colonyShip', 'recycler'] },
] as const;

export default function Shipyard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { data: gameConfig } = useGameConfig();

  const { data: ships, isLoading } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
    resourceData
      ? {
          minerai: resourceData.minerai,
          silicium: resourceData.silicium,
          hydrogene: resourceData.hydrogene,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          mineraiPerHour: resourceData.rates.mineraiPerHour,
          siliciumPerHour: resourceData.rates.siliciumPerHour,
          hydrogenePerHour: resourceData.rates.hydrogenePerHour,
          storageMineraiCapacity: resourceData.rates.storageMineraiCapacity,
          storageSiliciumCapacity: resourceData.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: resourceData.rates.storageHydrogeneCapacity,
        }
      : undefined,
  );

  const { data: queue } = trpc.shipyard.queue.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const buildMutation = trpc.shipyard.buildShip.useMutation({
    onSuccess: () => {
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  if (isLoading || !ships) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Chantier spatial" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Chantier spatial" />

      {queue && queue.length > 0 && (
        <section className="glass-card p-4">
          <h2 className="text-base font-semibold mb-3">File de construction</h2>
          <div className="space-y-3">
            {queue.map((item) => (
              <div key={item.id} className="space-y-1 border-l-4 border-l-orange-500 pl-3">
                <div className="flex items-center justify-between text-sm">
                  <span>{item.itemId} x{item.quantity - (item.completedCount ?? 0)}</span>
                </div>
                {item.endTime && (
                  <Timer
                    endTime={new Date(item.endTime)}
                    totalDuration={Math.floor((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 1000)}
                    onComplete={() => {
                      utils.shipyard.queue.invalidate({ planetId: planetId! });
                      utils.shipyard.ships.invalidate({ planetId: planetId! });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {SHIP_CATEGORIES.map((category) => {
        const categoryShips = ships.filter((s) =>
          (category.shipIds as readonly string[]).includes(s.id),
        );
        if (categoryShips.length === 0) return null;
        const isCollapsed = collapsed[category.id] ?? false;

        return (
          <div key={category.id}>
            <button
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [category.id]: !prev[category.id] }))
              }
              className="flex w-full items-center justify-between py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider"
            >
              <span>{category.label}</span>
              <svg
                className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {!isCollapsed && (
              <>
                {/* Mobile compact list */}
                <div className="space-y-1 lg:hidden">
                  {categoryShips.map((ship) => {
                    const qty = quantities[ship.id] || 1;
                    const totalCost = {
                      minerai: ship.cost.minerai * qty,
                      silicium: ship.cost.silicium * qty,
                      hydrogene: ship.cost.hydrogene * qty,
                    };
                    const canAfford =
                      resources.minerai >= totalCost.minerai &&
                      resources.silicium >= totalCost.silicium &&
                      resources.hydrogene >= totalCost.hydrogene;

                    return (
                      <button
                        key={ship.id}
                        onClick={() => setDetailId(ship.id)}
                        className={`flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50 transition-colors ${!ship.prerequisitesMet ? 'opacity-50' : ''}`}
                      >
                        <GameImage category="ships" id={ship.id} size="icon" alt={ship.name} className="h-8 w-8 rounded" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{ship.name}</span>
                            <span className="text-xs text-muted-foreground">x{ship.count}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <ResourceCost minerai={ship.cost.minerai} silicium={ship.cost.silicium} hydrogene={ship.cost.hydrogene} />
                          </div>
                        </div>
                        {ship.prerequisitesMet && (
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Input
                              type="number"
                              min={1}
                              max={9999}
                              value={qty}
                              onChange={(e) =>
                                setQuantities({ ...quantities, [ship.id]: Math.max(1, Number(e.target.value) || 1) })
                              }
                              className="w-14 h-8 text-xs"
                            />
                            <Button
                              size="sm"
                              className="h-8 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                buildMutation.mutate({ planetId: planetId!, shipId: ship.id as any, quantity: qty });
                              }}
                              disabled={!canAfford || buildMutation.isPending}
                            >
                              +
                            </Button>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop card grid */}
                <div className="hidden lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4">
                  {categoryShips.map((ship) => {
                    const qty = quantities[ship.id] || 1;
                    const totalCost = {
                      minerai: ship.cost.minerai * qty,
                      silicium: ship.cost.silicium * qty,
                      hydrogene: ship.cost.hydrogene * qty,
                    };
                    const canAfford =
                      resources.minerai >= totalCost.minerai &&
                      resources.silicium >= totalCost.silicium &&
                      resources.hydrogene >= totalCost.hydrogene;

                    return (
                      <div key={ship.id} className={`glass-card p-4 relative ${!ship.prerequisitesMet ? 'opacity-50' : ''}`}>
                        <InfoButton onClick={() => setDetailId(ship.id)} />
                        <div className="pb-2">
                          <div className="flex items-center gap-3">
                            <GameImage
                              category="ships"
                              id={ship.id}
                              size="icon"
                              alt={ship.name}
                              className="h-10 w-10 rounded"
                            />
                            <div className="flex flex-1 items-center justify-between">
                              <h3 className="text-base font-semibold">{ship.name}</h3>
                              <span className="text-sm text-muted-foreground">x{ship.count}</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">{ship.description}</p>

                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Coût par unité :</div>
                            <ResourceCost
                              minerai={ship.cost.minerai}
                              silicium={ship.cost.silicium}
                              hydrogene={ship.cost.hydrogene}
                            />
                            <div className="text-xs text-muted-foreground">
                              Durée par unité : {formatDuration(ship.timePerUnit)}
                            </div>
                          </div>

                          {!ship.prerequisitesMet && ship.missingPrerequisites.length > 0 && (
                            <p className="text-xs text-destructive">
                              Prérequis : {ship.missingPrerequisites.map((p) => formatMissingPrerequisite(p, gameConfig)).join(', ')}
                            </p>
                          )}

                          {ship.prerequisitesMet && (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={9999}
                                value={qty}
                                onChange={(e) =>
                                  setQuantities({ ...quantities, [ship.id]: Math.max(1, Number(e.target.value) || 1) })
                                }
                                className="w-20"
                              />
                              <Button
                                size="sm"
                                onClick={() =>
                                  buildMutation.mutate({ planetId: planetId!, shipId: ship.id as any, quantity: qty })
                                }
                                disabled={!canAfford || buildMutation.isPending}
                              >
                                Construire
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}

      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? gameConfig?.ships[detailId]?.name ?? '' : ''}
      >
        {detailId && <ShipDetailContent shipId={detailId} />}
      </EntityDetailOverlay>
    </div>
  );
}
