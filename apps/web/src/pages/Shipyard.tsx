import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResourceCost } from '@/components/common/ResourceCost';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export default function Shipyard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

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

  const buildMutation = trpc.shipyard.buildShip.useMutation({
    onSuccess: () => {
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  if (isLoading || !ships) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Chantier spatial</h1>

      <div className="grid gap-4 md:grid-cols-2">
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
            <Card key={ship.id} className={!ship.prerequisitesMet ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{ship.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">x{ship.count}</span>
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
                  <p className="text-xs text-destructive">Prérequis manquants</p>
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
    </div>
  );
}
