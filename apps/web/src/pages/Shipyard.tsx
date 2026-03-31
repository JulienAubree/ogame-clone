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
import { ShipDetailContent } from '@/components/entity-details/ShipDetailContent';
import { getShipName } from '@/lib/entity-names';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PrerequisiteList, buildPrerequisiteItems } from '@/components/common/PrerequisiteList';


export default function Shipyard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const { data: gameConfig } = useGameConfig();

  const shipCategories = (gameConfig?.categories ?? [])
    .filter((c) => c.entityType === 'ship' && c.id !== 'ship_combat')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const shipyardLevel = buildings?.find((b) => b.id === 'shipyard')?.currentLevel ?? 0;

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
    { planetId: planetId!, facilityId: 'shipyard' },
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

  const buildMutation = trpc.shipyard.buildShip.useMutation({
    onSuccess: () => {
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId!, facilityId: 'shipyard' });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  const cancelMutation = trpc.shipyard.cancelBatch.useMutation({
    onSuccess: () => {
      utils.shipyard.queue.invalidate({ planetId: planetId!, facilityId: 'shipyard' });
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      setCancelConfirm(null);
    },
  });

  const reduceMutation = trpc.shipyard.reduceQuantity.useMutation({
    onSuccess: () => {
      utils.shipyard.queue.invalidate();
      utils.shipyard.ships.invalidate();
      utils.shipyard.defenses.invalidate();
      utils.resource.production.invalidate();
    },
  });

  const shipQueue = queue ?? [];

  if (isLoading || !ships) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Chantier spatial" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  if (buildings && shipyardLevel < 1) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Chantier spatial" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Avant de pouvoir acceder au chantier spatial, veuillez construire le <span className="text-foreground font-semibold">Chantier spatial</span>.
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
      <PageHeader title="Chantier spatial" />

      {shipQueue.length > 0 && (() => {
        // Calculate total queue end time
        let queueEndTime: Date | null = null;
        let totalMs = 0;
        for (const item of shipQueue) {
          const remaining = item.quantity - (item.completedCount ?? 0);
          if (item.status === 'active' && item.endTime) {
            const unitDurationMs = new Date(item.endTime).getTime() - new Date(item.startTime).getTime();
            totalMs += (new Date(item.endTime).getTime() - Date.now()) + unitDurationMs * (remaining - 1);
          } else if (item.status === 'queued') {
            const ship = ships.find((s) => s.id === item.itemId);
            if (ship) totalMs += (ship.timePerUnit * 1000) * remaining;
          }
        }
        if (totalMs > 0) queueEndTime = new Date(Date.now() + totalMs);

        return (
        <section className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">File de construction</h2>
            {queueEndTime && (
              <span className="text-xs text-muted-foreground">
                Fin : {queueEndTime.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {shipQueue.map((item) => {
              const name = getShipName(item.itemId, gameConfig);
              const remaining = item.quantity - (item.completedCount ?? 0);
              return (
                <div key={item.id} className="space-y-1 border-l-4 border-l-orange-500 pl-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{remaining}x {name}</span>
                    <div className="flex items-center gap-1">
                      {remaining > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => reduceMutation.mutate({ planetId: planetId!, batchId: item.id, removeCount: 1 })}
                          disabled={reduceMutation.isPending}
                        >
                          -1
                        </Button>
                      )}
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
                  </div>
                  {item.status === 'active' && item.endTime && (
                    <Timer
                      endTime={new Date(item.endTime)}
                      totalDuration={Math.floor((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 1000)}
                      onComplete={() => {
                        utils.shipyard.queue.invalidate({ planetId: planetId!, facilityId: 'shipyard' });
                        utils.shipyard.ships.invalidate({ planetId: planetId! });
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
        );
      })()}

      {shipCategories.map((category) => {
        const categoryShips = ships.filter((s) =>
          gameConfig?.ships[s.id]?.categoryId === category.id,
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
                {/* Mobile compact list */}
                <div className="space-y-1 lg:hidden">
                  {categoryShips.map((ship) => {
                    const qty = quantities[ship.id] || 1;
                    const maxAffordable = Math.max(1, Math.min(
                      ship.cost.minerai > 0 ? Math.floor(resources.minerai / ship.cost.minerai) : 9999,
                      ship.cost.silicium > 0 ? Math.floor(resources.silicium / ship.cost.silicium) : 9999,
                      ship.cost.hydrogene > 0 ? Math.floor(resources.hydrogene / ship.cost.hydrogene) : 9999,
                      9999,
                    ));
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
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <ResourceCost minerai={ship.cost.minerai} silicium={ship.cost.silicium} hydrogene={ship.cost.hydrogene} />
                            <span className="font-mono text-[10px] shrink-0">{formatDuration(ship.timePerUnit)}</span>
                          </div>
                        </div>
                        {ship.prerequisitesMet && (
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <QuantityStepper
                              value={qty}
                              onChange={(v) => setQuantities({ ...quantities, [ship.id]: v })}
                              max={maxAffordable}
                              showMax={false}
                            />
                            <Button
                              size="sm"
                              className="h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                buildMutation.mutate({ planetId: planetId!, shipId: ship.id as any, quantity: qty });
                              }}
                              disabled={!canAfford || buildMutation.isPending}
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
                  {categoryShips.map((ship) => {
                    const qty = quantities[ship.id] || 1;
                    const maxAffordable = Math.max(1, Math.min(
                      ship.cost.minerai > 0 ? Math.floor(resources.minerai / ship.cost.minerai) : 9999,
                      ship.cost.silicium > 0 ? Math.floor(resources.silicium / ship.cost.silicium) : 9999,
                      ship.cost.hydrogene > 0 ? Math.floor(resources.hydrogene / ship.cost.hydrogene) : 9999,
                      9999,
                    ));
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
                        className={`retro-card text-left cursor-pointer overflow-hidden flex flex-col ${!ship.prerequisitesMet ? 'opacity-50' : ''}`}
                      >
                        <div className="relative h-[130px] overflow-hidden">
                          <GameImage
                            category="ships"
                            id={ship.id}
                            size="full"
                            alt={ship.name}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-2 right-2 bg-slate-700/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            x{ship.count}
                          </span>
                        </div>

                        <div className="p-3 flex flex-col flex-1 gap-1.5">
                          <div className="text-[13px] font-semibold text-foreground truncate">
                            {ship.name}
                          </div>

                          <div className="flex-1" />

                          <ResourceCost
                            minerai={ship.cost.minerai}
                            silicium={ship.cost.silicium}
                            hydrogene={ship.cost.hydrogene}
                            currentMinerai={resources.minerai}
                            currentSilicium={resources.silicium}
                            currentHydrogene={resources.hydrogene}
                          />
                          <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                            {formatDuration(ship.timePerUnit)}
                          </div>
                          {!ship.prerequisitesMet ? (
                            <PrerequisiteList items={buildPrerequisiteItems(gameConfig?.ships[ship.id]?.prerequisites ?? {}, buildingLevels, researchLevels, gameConfig)} missingOnly />
                          ) : (
                            <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                              <QuantityStepper
                                value={qty}
                                onChange={(v) => setQuantities({ ...quantities, [ship.id]: v })}
                                max={maxAffordable}
                              />
                              <Button
                                variant="retro"
                                size="sm"
                                className="w-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  buildMutation.mutate({ planetId: planetId!, shipId: ship.id as any, quantity: qty });
                                }}
                                disabled={!canAfford || buildMutation.isPending}
                              >
                                Construire
                              </Button>
                            </div>
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
        title={detailId ? gameConfig?.ships[detailId]?.name ?? '' : ''}
      >
        {detailId && <ShipDetailContent shipId={detailId} researchLevels={researchLevels} buildingLevels={buildingLevels} maxTemp={resourceData?.maxTemp} isHomePlanet={resourceData?.planetClassId === 'homeworld'} timePerUnit={ships?.find(s => s.id === detailId)?.timePerUnit} />}
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
