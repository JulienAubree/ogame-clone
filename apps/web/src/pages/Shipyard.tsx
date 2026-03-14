import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
import { SHIPS, type ShipId } from '@ogame-clone/game-engine';

export default function Shipyard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

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
          metal: resourceData.metal,
          crystal: resourceData.crystal,
          deuterium: resourceData.deuterium,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          metalPerHour: resourceData.rates.metalPerHour,
          crystalPerHour: resourceData.rates.crystalPerHour,
          deutPerHour: resourceData.rates.deutPerHour,
          storageMetalCapacity: resourceData.rates.storageMetalCapacity,
          storageCrystalCapacity: resourceData.rates.storageCrystalCapacity,
          storageDeutCapacity: resourceData.rates.storageDeutCapacity,
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
      <div className="space-y-6 p-6">
        <PageHeader title="Chantier spatial" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Chantier spatial" />

      {queue && queue.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">File de construction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {ships.map((ship) => {
          const qty = quantities[ship.id] || 1;
          const totalCost = {
            metal: ship.cost.metal * qty,
            crystal: ship.cost.crystal * qty,
            deuterium: ship.cost.deuterium * qty,
          };
          const canAfford =
            resources.metal >= totalCost.metal &&
            resources.crystal >= totalCost.crystal &&
            resources.deuterium >= totalCost.deuterium;

          return (
            <Card key={ship.id} className={`relative ${!ship.prerequisitesMet ? 'opacity-50' : ''}`}>
              <InfoButton onClick={() => setDetailId(ship.id)} />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <GameImage
                    category="ships"
                    id={ship.id}
                    size="icon"
                    alt={ship.name}
                    className="h-10 w-10 rounded"
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <CardTitle className="text-base">{ship.name}</CardTitle>
                    <span className="text-sm text-muted-foreground">x{ship.count}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{ship.description}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Coût par unité :</div>
                  <ResourceCost
                    metal={ship.cost.metal}
                    crystal={ship.cost.crystal}
                    deuterium={ship.cost.deuterium}
                  />
                  <div className="text-xs text-muted-foreground">
                    Durée par unité : {formatDuration(ship.timePerUnit)}
                  </div>
                </div>

                {!ship.prerequisitesMet && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Prérequis manquants
                  </div>
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
                        buildMutation.mutate({ planetId: planetId!, shipId: ship.id, quantity: qty })
                      }
                      disabled={!canAfford || buildMutation.isPending}
                    >
                      Construire
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? SHIPS[detailId as ShipId]?.name ?? '' : ''}
      >
        {detailId && <ShipDetailContent shipId={detailId} />}
      </EntityDetailOverlay>
    </div>
  );
}
