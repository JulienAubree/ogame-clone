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

export default function Defense() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const { data: defenses, isLoading } = trpc.shipyard.defenses.useQuery(
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

  const buildMutation = trpc.shipyard.buildDefense.useMutation({
    onSuccess: () => {
      utils.shipyard.defenses.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  if (isLoading || !defenses) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Défense</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {defenses.map((defense) => {
          const qty = quantities[defense.id] || 1;
          const maxQty = defense.maxPerPlanet
            ? Math.max(0, defense.maxPerPlanet - defense.count)
            : 9999;
          const effectiveQty = Math.min(qty, maxQty);
          const totalCost = {
            metal: defense.cost.metal * effectiveQty,
            crystal: defense.cost.crystal * effectiveQty,
            deuterium: defense.cost.deuterium * effectiveQty,
          };
          const canAfford =
            resources.metal >= totalCost.metal &&
            resources.crystal >= totalCost.crystal &&
            resources.deuterium >= totalCost.deuterium;

          return (
            <Card key={defense.id} className={!defense.prerequisitesMet ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{defense.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">
                    x{defense.count}
                    {defense.maxPerPlanet ? ` / ${defense.maxPerPlanet}` : ''}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{defense.description}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Coût par unité :</div>
                  <ResourceCost
                    metal={defense.cost.metal}
                    crystal={defense.cost.crystal}
                    deuterium={defense.cost.deuterium}
                  />
                  <div className="text-xs text-muted-foreground">
                    Durée par unité : {formatDuration(defense.timePerUnit)}
                  </div>
                </div>

                {!defense.prerequisitesMet && (
                  <p className="text-xs text-destructive">Prérequis manquants</p>
                )}

                {defense.prerequisitesMet && maxQty > 0 && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={maxQty}
                      value={effectiveQty}
                      onChange={(e) =>
                        setQuantities({
                          ...quantities,
                          [defense.id]: Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)),
                        })
                      }
                      className="w-20"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        buildMutation.mutate({
                          planetId: planetId!,
                          defenseId: defense.id,
                          quantity: effectiveQty,
                        })
                      }
                      disabled={!canAfford || buildMutation.isPending || effectiveQty === 0}
                    >
                      Construire
                    </Button>
                  </div>
                )}

                {defense.maxPerPlanet && defense.count >= defense.maxPerPlanet && (
                  <p className="text-xs text-muted-foreground">Maximum atteint</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
