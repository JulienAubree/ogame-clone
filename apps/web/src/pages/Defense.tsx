import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatDuration } from '@/lib/format';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityDetailOverlay, InfoButton } from '@/components/common/EntityDetailOverlay';
import { DefenseDetailContent } from '@/components/entity-details/DefenseDetailContent';
import { useGameConfig } from '@/hooks/useGameConfig';
import { formatMissingPrerequisite } from '@/lib/prerequisites';


export default function Defense() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const { data: gameConfig } = useGameConfig();

  const defenseCategories = (gameConfig?.categories ?? [])
    .filter((c) => c.entityType === 'defense')
    .sort((a, b) => a.sortOrder - b.sortOrder);

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

  const buildMutation = trpc.shipyard.buildDefense.useMutation({
    onSuccess: () => {
      utils.shipyard.defenses.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  const cancelMutation = trpc.shipyard.cancelBatch.useMutation({
    onSuccess: () => {
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.shipyard.defenses.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      setCancelConfirm(null);
    },
  });

  const defenseQueue = (queue ?? []).filter((q) => q.type === 'defense');

  if (isLoading || !defenses) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Défense" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Défense" />

      {defenseQueue.length > 0 && (
        <section className="glass-card p-4">
          <h2 className="text-base font-semibold mb-3">File de construction</h2>
          <div className="space-y-3">
            {defenseQueue.map((item) => {
              const name = gameConfig?.defenses[item.itemId]?.name ?? item.itemId;
              const remaining = item.quantity - (item.completedCount ?? 0);
              return (
                <div key={item.id} className="space-y-1 border-l-4 border-l-orange-500 pl-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{remaining}x {name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setCancelConfirm(item.id)}
                      disabled={cancelMutation.isPending}
                    >
                      Annuler
                    </Button>
                  </div>
                  {item.status === 'active' && item.endTime && (
                    <Timer
                      endTime={new Date(item.endTime)}
                      totalDuration={Math.floor((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 1000)}
                      onComplete={() => {
                        utils.shipyard.queue.invalidate({ planetId: planetId! });
                        utils.shipyard.defenses.invalidate({ planetId: planetId! });
                      }}
                    />
                  )}
                  {item.status === 'queued' && (
                    <span className="text-xs text-muted-foreground">En attente</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {defenseCategories.map((category) => {
        const categoryDefenses = defenses.filter((d) =>
          gameConfig?.defenses[d.id]?.categoryId === category.id,
        );
        if (categoryDefenses.length === 0) return null;
        const isCollapsed = collapsed[category.id] ?? false;

        return (
          <div key={category.id}>
            <button
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [category.id]: !prev[category.id] }))
              }
              className="flex w-full items-center justify-between py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider"
            >
              <span>{category.name}</span>
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
                {/* Mobile: compact list */}
                <div className="space-y-1 lg:hidden">
                  {categoryDefenses.map((defense) => {
                    const qty = quantities[defense.id] || 1;
                    const maxQty = defense.maxPerPlanet
                      ? Math.max(0, defense.maxPerPlanet - defense.count)
                      : 9999;
                    const effectiveQty = Math.min(qty, maxQty);
                    const totalCost = {
                      minerai: defense.cost.minerai * effectiveQty,
                      silicium: defense.cost.silicium * effectiveQty,
                      hydrogene: defense.cost.hydrogene * effectiveQty,
                    };
                    const canAfford =
                      resources.minerai >= totalCost.minerai &&
                      resources.silicium >= totalCost.silicium &&
                      resources.hydrogene >= totalCost.hydrogene;

                    return (
                      <button
                        key={defense.id}
                        onClick={() => setDetailId(defense.id)}
                        className={`flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50 transition-colors ${!defense.prerequisitesMet ? 'opacity-50' : ''}`}
                      >
                        <GameImage category="defenses" id={defense.id} size="icon" alt={defense.name} className="h-8 w-8 rounded" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{defense.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              x{defense.count}
                              {defense.maxPerPlanet ? ` / ${defense.maxPerPlanet}` : ''}
                            </span>
                          </div>
                          {defense.maxPerPlanet && defense.count >= defense.maxPerPlanet ? (
                            <p className="text-xs text-muted-foreground mt-0.5">Maximum atteint</p>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <ResourceCost
                                minerai={defense.cost.minerai}
                                silicium={defense.cost.silicium}
                                hydrogene={defense.cost.hydrogene}
                                currentMinerai={resources.minerai}
                                currentSilicium={resources.silicium}
                                currentHydrogene={resources.hydrogene}
                              />
                            </div>
                          )}
                        </div>
                        {defense.prerequisitesMet && maxQty > 0 && (
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                              className="w-16 h-8 text-xs"
                            />
                            <Button
                              size="sm"
                              className="shrink-0 h-8 px-2"
                              onClick={() =>
                                buildMutation.mutate({
                                  planetId: planetId!,
                                  defenseId: defense.id as any,
                                  quantity: effectiveQty,
                                })
                              }
                              disabled={!canAfford || buildMutation.isPending || effectiveQty === 0}
                            >
                              +
                            </Button>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: card grid */}
                <div className="hidden lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4">
                  {categoryDefenses.map((defense) => {
                    const qty = quantities[defense.id] || 1;
                    const maxQty = defense.maxPerPlanet
                      ? Math.max(0, defense.maxPerPlanet - defense.count)
                      : 9999;
                    const effectiveQty = Math.min(qty, maxQty);
                    const totalCost = {
                      minerai: defense.cost.minerai * effectiveQty,
                      silicium: defense.cost.silicium * effectiveQty,
                      hydrogene: defense.cost.hydrogene * effectiveQty,
                    };
                    const canAfford =
                      resources.minerai >= totalCost.minerai &&
                      resources.silicium >= totalCost.silicium &&
                      resources.hydrogene >= totalCost.hydrogene;

                    return (
                      <div key={defense.id} className={`glass-card relative p-4 space-y-3 ${!defense.prerequisitesMet ? 'opacity-50' : ''}`}>
                        <InfoButton onClick={() => setDetailId(defense.id)} />
                        <div className="flex items-center gap-3">
                          <GameImage
                            category="defenses"
                            id={defense.id}
                            size="icon"
                            alt={defense.name}
                            className="h-10 w-10 rounded"
                          />
                          <div className="flex flex-1 items-center justify-between">
                            <span className="text-base font-semibold">{defense.name}</span>
                            <span className="text-sm text-muted-foreground">
                              x{defense.count}
                              {defense.maxPerPlanet ? ` / ${defense.maxPerPlanet}` : ''}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">{defense.description}</p>

                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Coût par unité :</div>
                          <ResourceCost
                            minerai={defense.cost.minerai}
                            silicium={defense.cost.silicium}
                            hydrogene={defense.cost.hydrogene}
                            currentMinerai={resources.minerai}
                            currentSilicium={resources.silicium}
                            currentHydrogene={resources.hydrogene}
                          />
                          <div className="text-xs text-muted-foreground">
                            Durée par unité : {formatDuration(defense.timePerUnit)}
                          </div>
                        </div>

                        {!defense.prerequisitesMet && defense.missingPrerequisites.length > 0 && (
                          <p className="text-xs text-destructive">
                            Prérequis : {defense.missingPrerequisites.map((p) => formatMissingPrerequisite(p, gameConfig)).join(', ')}
                          </p>
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
                                  defenseId: defense.id as any,
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
        title={detailId ? gameConfig?.defenses[detailId]?.name ?? '' : ''}
      >
        {detailId && <DefenseDetailContent defenseId={detailId} />}
      </EntityDetailOverlay>

      <ConfirmDialog
        open={!!cancelConfirm}
        onConfirm={() => cancelConfirm && cancelMutation.mutate({ planetId: planetId!, batchId: cancelConfirm })}
        onCancel={() => setCancelConfirm(null)}
        title="Annuler la production ?"
        description="Les unités restantes seront annulées et les ressources correspondantes remboursées. Les unités déjà produites sont conservées."
        confirmLabel="Annuler la production"
        variant="destructive"
      />
    </div>
  );
}
