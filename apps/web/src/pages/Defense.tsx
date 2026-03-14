import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResourceCost } from '@/components/common/ResourceCost';
import { GameImage } from '@/components/common/GameImage';
import { formatDuration } from '@/lib/format';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityDetailOverlay, InfoButton } from '@/components/common/EntityDetailOverlay';
import { DefenseDetailContent } from '@/components/entity-details/DefenseDetailContent';
import { DEFENSES, type DefenseId } from '@ogame-clone/game-engine';

export default function Defense() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

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
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Défense" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Défense" />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
            <Card key={defense.id} className={`relative ${!defense.prerequisitesMet ? 'opacity-50' : ''}`}>
              <InfoButton onClick={() => setDetailId(defense.id)} />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <GameImage
                    category="defenses"
                    id={defense.id}
                    size="icon"
                    alt={defense.name}
                    className="h-10 w-10 rounded"
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <CardTitle className="text-base">{defense.name}</CardTitle>
                    <span className="text-sm text-muted-foreground">
                      x{defense.count}
                      {defense.maxPerPlanet ? ` / ${defense.maxPerPlanet}` : ''}
                    </span>
                  </div>
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
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Prérequis manquants
                  </div>
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
      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? DEFENSES[detailId as DefenseId]?.name ?? '' : ''}
      >
        {detailId && <DefenseDetailContent defenseId={detailId} />}
      </EntityDetailOverlay>
    </div>
  );
}
