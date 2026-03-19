import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
import { formatDuration } from '@/lib/format';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { BuildingDetailContent } from '@/components/entity-details/BuildingDetailContent';
import { useGameConfig } from '@/hooks/useGameConfig';
import { cn } from '@/lib/utils';
import {
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
} from '@ogame-clone/game-engine';


interface ProductionStats {
  current: number;
  next: number;
  delta: number;
  label: string;
  unit: string;
  color: string;
  energyCurrent?: number;
  energyNext?: number;
  energyDelta?: number;
}

function getProductionStats(
  buildingId: string,
  level: number,
  maxTemp: number,
  productionFactor: number,
): ProductionStats | null {
  const pf = productionFactor;
  switch (buildingId) {
    case 'mineraiMine':
      return {
        current: mineraiProduction(level, pf),
        next: mineraiProduction(level + 1, pf),
        delta: mineraiProduction(level + 1, pf) - mineraiProduction(level, pf),
        label: 'Production', unit: '/h', color: 'text-emerald-400',
        energyCurrent: mineraiMineEnergy(level),
        energyNext: mineraiMineEnergy(level + 1),
        energyDelta: mineraiMineEnergy(level + 1) - mineraiMineEnergy(level),
      };
    case 'siliciumMine':
      return {
        current: siliciumProduction(level, pf),
        next: siliciumProduction(level + 1, pf),
        delta: siliciumProduction(level + 1, pf) - siliciumProduction(level, pf),
        label: 'Production', unit: '/h', color: 'text-emerald-400',
        energyCurrent: siliciumMineEnergy(level),
        energyNext: siliciumMineEnergy(level + 1),
        energyDelta: siliciumMineEnergy(level + 1) - siliciumMineEnergy(level),
      };
    case 'hydrogeneSynth':
      return {
        current: hydrogeneProduction(level, maxTemp, pf),
        next: hydrogeneProduction(level + 1, maxTemp, pf),
        delta: hydrogeneProduction(level + 1, maxTemp, pf) - hydrogeneProduction(level, maxTemp, pf),
        label: 'Production', unit: '/h', color: 'text-emerald-400',
        energyCurrent: hydrogeneSynthEnergy(level),
        energyNext: hydrogeneSynthEnergy(level + 1),
        energyDelta: hydrogeneSynthEnergy(level + 1) - hydrogeneSynthEnergy(level),
      };
    case 'solarPlant':
      return {
        current: solarPlantEnergy(level),
        next: solarPlantEnergy(level + 1),
        delta: solarPlantEnergy(level + 1) - solarPlantEnergy(level),
        label: 'Énergie', unit: '', color: 'text-amber-400',
      };
    case 'storageMinerai':
    case 'storageSilicium':
    case 'storageHydrogene':
      return {
        current: storageCapacity(level),
        next: storageCapacity(level + 1),
        delta: storageCapacity(level + 1) - storageCapacity(level),
        label: 'Capacité', unit: '', color: 'text-sky-400',
      };
    default:
      return null;
  }
}

function getResourceGlowClass(buildingId: string): string {
  switch (buildingId) {
    case 'mineraiMine':
    case 'storageMinerai':
      return 'retro-card-minerai';
    case 'siliciumMine':
    case 'storageSilicium':
      return 'retro-card-silicium';
    case 'hydrogeneSynth':
    case 'storageHydrogene':
      return 'retro-card-hydrogene';
    case 'solarPlant':
      return 'retro-card-energy';
    default:
      return '';
  }
}

export default function Buildings() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { data: gameConfig } = useGameConfig();

  const { data: buildings, isLoading } = trpc.building.list.useQuery(
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

  const upgradeMutation = trpc.building.upgrade.useMutation({
    onSuccess: () => {
      utils.building.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  const cancelMutation = trpc.building.cancel.useMutation({
    onSuccess: () => {
      utils.building.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      setCancelConfirm(false);
    },
  });

  if (isLoading || !buildings) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Bâtiments" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  const isAnyUpgrading = buildings.some((b) => b.isUpgrading);
  const maxTemp = resourceData?.maxTemp ?? 50;
  const productionFactor = resourceData?.rates.productionFactor ?? 1;

  const buildingCategories = (gameConfig?.categories ?? [])
    .filter((c) => c.entityType === 'building')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const detailBuilding = detailId ? buildings.find((b) => b.id === detailId) : undefined;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Bâtiments" />

      {buildingCategories.map((category) => {
        const categoryBuildings = buildings.filter((b) =>
          gameConfig?.buildings[b.id]?.categoryId === category.id,
        );
        if (categoryBuildings.length === 0) return null;
        const isCollapsed = collapsed[category.id] ?? false;

        return (
          <div key={category.id}>
            {/* Category header - collapsible */}
            <button
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [category.id]: !prev[category.id] }))
              }
              className="flex w-full items-center justify-between py-2 border-b border-border mb-4 font-mono text-sm font-semibold text-muted-foreground uppercase tracking-widest"
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
                {/* Mobile: compact list with thumbnails */}
                <div className="space-y-1 lg:hidden">
                  {categoryBuildings.map((building) => {
                    const canAfford =
                      resources.minerai >= building.nextLevelCost.minerai &&
                      resources.silicium >= building.nextLevelCost.silicium &&
                      resources.hydrogene >= building.nextLevelCost.hydrogene;

                    const prereqsMet = building.prerequisites.every((p) => {
                      const pb = buildings.find((b) => b.id === p.buildingId);
                      return pb && pb.currentLevel >= p.level;
                    });

                    return (
                      <button
                        key={building.id}
                        onClick={() => setDetailId(building.id)}
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50 transition-colors"
                      >
                        <GameImage
                          category="buildings"
                          id={building.id}
                          size="icon"
                          alt={building.name}
                          className="h-11 w-11 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold truncate">{building.name}</span>
                            <span className="ml-2 shrink-0 bg-primary/12 text-primary border border-primary/20 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded">
                              {building.currentLevel}
                            </span>
                          </div>
                          {building.isUpgrading && building.upgradeEndTime ? (
                            <div className="mt-1">
                              <Timer
                                endTime={new Date(building.upgradeEndTime)}
                                totalDuration={building.nextLevelTime}
                                onComplete={() => {
                                  utils.building.list.invalidate({ planetId: planetId! });
                                  utils.resource.production.invalidate({ planetId: planetId! });
                                }}
                              />
                            </div>
                          ) : (
                            <div className="mt-0.5">
                              <ResourceCost
                                minerai={building.nextLevelCost.minerai}
                                silicium={building.nextLevelCost.silicium}
                                hydrogene={building.nextLevelCost.hydrogene}
                                currentMinerai={resources.minerai}
                                currentSilicium={resources.silicium}
                                currentHydrogene={resources.hydrogene}
                              />
                            </div>
                          )}
                        </div>
                        {!building.isUpgrading && (
                          <Button
                            variant="retro"
                            size="sm"
                            className="shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              upgradeMutation.mutate({
                                planetId: planetId!,
                                buildingId: building.id as any,
                              });
                            }}
                            disabled={
                              !canAfford ||
                              !prereqsMet ||
                              isAnyUpgrading ||
                              upgradeMutation.isPending
                            }
                          >
                            ↑
                          </Button>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: retro card grid */}
                <div className="hidden lg:grid lg:gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                  {categoryBuildings.map((building) => {
                    const canAfford =
                      resources.minerai >= building.nextLevelCost.minerai &&
                      resources.silicium >= building.nextLevelCost.silicium &&
                      resources.hydrogene >= building.nextLevelCost.hydrogene;

                    const prereqsMet = building.prerequisites.every((p) => {
                      const pb = buildings.find((b) => b.id === p.buildingId);
                      return pb && pb.currentLevel >= p.level;
                    });

                    const stats = getProductionStats(
                      building.id,
                      building.currentLevel,
                      maxTemp,
                      productionFactor,
                    );

                    return (
                      <button
                        key={building.id}
                        onClick={() => setDetailId(building.id)}
                        className={cn(
                          'retro-card text-left cursor-pointer overflow-hidden flex flex-col',
                          getResourceGlowClass(building.id),
                          !prereqsMet && 'opacity-50',
                        )}
                      >
                        {/* Image area with gradient background */}
                        <div className="relative h-[130px] bg-gradient-to-br from-[#0f3460] via-[#16213e] to-[#1a1a2e] flex items-center justify-center">
                          <GameImage
                            category="buildings"
                            id={building.id}
                            size="thumb"
                            alt={building.name}
                            className="h-20 w-20 rounded-xl object-cover"
                          />
                          <span className="absolute top-2 right-2 bg-emerald-700 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            Niv. {building.currentLevel}
                          </span>
                        </div>

                        {/* Info area */}
                        <div className="p-3 flex flex-col flex-1 gap-1.5">
                          <div className="text-[13px] font-semibold text-foreground truncate">
                            {building.name}
                          </div>

                          {/* Contextual stat line */}
                          {stats && building.currentLevel > 0 && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {stats.label === 'Capacité'
                                ? `capacité ${stats.current.toLocaleString('fr-FR')}`
                                : `+${stats.current.toLocaleString('fr-FR')}${stats.unit}`}
                            </div>
                          )}

                          {/* Spacer to push cost/button to bottom */}
                          <div className="flex-1" />

                          {building.isUpgrading && building.upgradeEndTime ? (
                            <Timer
                              endTime={new Date(building.upgradeEndTime)}
                              totalDuration={building.nextLevelTime}
                              onComplete={() => {
                                utils.building.list.invalidate({ planetId: planetId! });
                                utils.resource.production.invalidate({ planetId: planetId! });
                              }}
                            />
                          ) : (
                            <>
                              <ResourceCost
                                minerai={building.nextLevelCost.minerai}
                                silicium={building.nextLevelCost.silicium}
                                hydrogene={building.nextLevelCost.hydrogene}
                                currentMinerai={resources.minerai}
                                currentSilicium={resources.silicium}
                                currentHydrogene={resources.hydrogene}
                              />
                              <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 6v6l4 2" />
                                </svg>
                                {formatDuration(building.nextLevelTime)}
                              </div>
                              {!prereqsMet ? (
                                <div className="text-[10px] text-destructive">
                                  Prérequis manquants
                                </div>
                              ) : (
                                <Button
                                  variant="retro"
                                  size="sm"
                                  className="w-full"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    upgradeMutation.mutate({
                                      planetId: planetId!,
                                      buildingId: building.id as any,
                                    });
                                  }}
                                  disabled={
                                    !canAfford ||
                                    isAnyUpgrading ||
                                    upgradeMutation.isPending
                                  }
                                >
                                  Améliorer
                                </Button>
                              )}
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
        title={detailId ? gameConfig?.buildings[detailId]?.name ?? '' : ''}
      >
        {detailId && (
          <BuildingDetailContent
            buildingId={detailId}
            planetContext={
              resourceData
                ? {
                    maxTemp: resourceData.maxTemp,
                    productionFactor: resourceData.rates.productionFactor,
                  }
                : undefined
            }
            runtimeData={
              detailBuilding
                ? {
                    currentLevel: detailBuilding.currentLevel,
                    nextLevelCost: detailBuilding.nextLevelCost,
                    nextLevelTime: detailBuilding.nextLevelTime,
                    isUpgrading: detailBuilding.isUpgrading,
                    upgradeEndTime: detailBuilding.upgradeEndTime,
                  }
                : undefined
            }
          />
        )}
      </EntityDetailOverlay>

      <ConfirmDialog
        open={cancelConfirm}
        onConfirm={() => cancelMutation.mutate({ planetId: planetId! })}
        onCancel={() => setCancelConfirm(false)}
        title="Annuler la construction ?"
        description="Les ressources investies seront partiellement remboursées."
        variant="destructive"
        confirmLabel="Annuler la construction"
      />
    </div>
  );
}
