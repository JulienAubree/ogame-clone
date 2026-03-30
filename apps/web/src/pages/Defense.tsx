import { useState, useMemo } from 'react';
import { useOutletContext, Link } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatDuration } from '@/lib/format';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { DefenseDetailContent } from '@/components/entity-details/DefenseDetailContent';
import { getDefenseName } from '@/lib/entity-names';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PrerequisiteList, buildPrerequisiteItems } from '@/components/common/PrerequisiteList';


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

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const arsenalLevel = buildings?.find((b) => b.id === 'arsenal')?.currentLevel ?? 0;

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

  const { data: researchList } = trpc.research.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const researchLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    researchList?.forEach((r) => { levels[r.id] = r.currentLevel; });
    return levels;
  }, [researchList]);

  const buildingLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    buildings?.forEach((b) => { levels[b.id] = b.currentLevel; });
    return levels;
  }, [buildings]);

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

  if (buildings && arsenalLevel < 1) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Défense" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Avant de pouvoir acceder aux defenses, veuillez construire l'<span className="text-foreground font-semibold">Arsenal planetaire</span>.
          </p>
          <Link to="/buildings" className="text-xs text-primary hover:underline">
            Aller aux batiments
          </Link>
        </div>
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
              const name = getDefenseName(item.itemId, gameConfig);
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
                            <QuantityStepper
                              value={effectiveQty}
                              onChange={(v) => setQuantities({ ...quantities, [defense.id]: v })}
                              max={maxQty}
                              showMax={false}
                            />
                            <Button
                              size="sm"
                              className="h-7 px-2"
                              onClick={() =>
                                buildMutation.mutate({
                                  planetId: planetId!,
                                  defenseId: defense.id as any,
                                  quantity: effectiveQty,
                                })
                              }
                              disabled={!canAfford || buildMutation.isPending || effectiveQty === 0}
                            >
                              OK
                            </Button>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: vertical card grid */}
                <div className="hidden lg:grid lg:gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
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
                        className={`retro-card text-left cursor-pointer overflow-hidden flex flex-col ${!defense.prerequisitesMet ? 'opacity-50' : ''}`}
                      >
                        <div className="relative h-[130px] overflow-hidden">
                          <GameImage
                            category="defenses"
                            id={defense.id}
                            size="full"
                            alt={defense.name}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-2 right-2 bg-slate-700/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            x{defense.count}
                            {defense.maxPerPlanet ? ` / ${defense.maxPerPlanet}` : ''}
                          </span>
                        </div>

                        <div className="p-3 flex flex-col flex-1 gap-1.5">
                          <div className="text-[13px] font-semibold text-foreground truncate">
                            {defense.name}
                          </div>

                          <div className="flex-1" />

                          {defense.maxPerPlanet && defense.count >= defense.maxPerPlanet ? (
                            <div className="text-[10px] text-muted-foreground">Maximum atteint</div>
                          ) : (
                            <>
                              <ResourceCost
                                minerai={defense.cost.minerai}
                                silicium={defense.cost.silicium}
                                hydrogene={defense.cost.hydrogene}
                                currentMinerai={resources.minerai}
                                currentSilicium={resources.silicium}
                                currentHydrogene={resources.hydrogene}
                              />
                              <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 6v6l4 2" />
                                </svg>
                                {formatDuration(defense.timePerUnit)}
                              </div>
                              {!defense.prerequisitesMet ? (
                                <PrerequisiteList items={buildPrerequisiteItems(gameConfig?.defenses[defense.id]?.prerequisites ?? {}, buildingLevels, researchLevels, gameConfig)} missingOnly />
                              ) : maxQty > 0 ? (
                                <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                                  <QuantityStepper
                                    value={effectiveQty}
                                    onChange={(v) => setQuantities({ ...quantities, [defense.id]: v })}
                                    max={maxQty}
                                  />
                                  <Button
                                    variant="retro"
                                    size="sm"
                                    className="w-full"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      buildMutation.mutate({
                                        planetId: planetId!,
                                        defenseId: defense.id as any,
                                        quantity: effectiveQty,
                                      });
                                    }}
                                    disabled={!canAfford || buildMutation.isPending || effectiveQty === 0}
                                  >
                                    Construire
                                  </Button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </button>
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
        {detailId && <DefenseDetailContent defenseId={detailId} researchLevels={researchLevels} buildingLevels={buildingLevels} timePerUnit={defenses?.find(d => d.id === detailId)?.timePerUnit} />}
      </EntityDetailOverlay>

      <ConfirmDialog
        open={!!cancelConfirm}
        onConfirm={() => cancelConfirm && cancelMutation.mutate({ planetId: planetId!, batchId: cancelConfirm })}
        onCancel={() => setCancelConfirm(null)}
        title="Annuler la production ?"
        description="Les unités restantes seront annulées. Le remboursement est proportionnel au temps restant, plafonné à 70% des ressources investies. Les unités déjà produites sont conservées."
        confirmLabel="Annuler la production"
        variant="destructive"
      />
    </div>
  );
}
