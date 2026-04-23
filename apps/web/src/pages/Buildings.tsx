import { useState, useMemo } from 'react';
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
import { PrerequisiteList, buildPrerequisiteItems } from '@/components/common/PrerequisiteList';
import { buildProductionConfig } from '../lib/production-config';
import { cn } from '@/lib/utils';
import { useTutorialTargetId } from '@/hooks/useTutorialHighlight';
import {
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
  calculateShieldCapacity, calculateShieldEnergy,
} from '@exilium/game-engine';


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
  prodConfig?: ReturnType<typeof buildProductionConfig>,
): ProductionStats | null {
  const pf = productionFactor;
  switch (buildingId) {
    case 'mineraiMine':
      return {
        current: mineraiProduction(level, pf, prodConfig?.minerai),
        next: mineraiProduction(level + 1, pf, prodConfig?.minerai),
        delta: mineraiProduction(level + 1, pf, prodConfig?.minerai) - mineraiProduction(level, pf, prodConfig?.minerai),
        label: 'Production', unit: '/h', color: 'text-emerald-400',
        energyCurrent: mineraiMineEnergy(level, prodConfig?.mineraiEnergy),
        energyNext: mineraiMineEnergy(level + 1, prodConfig?.mineraiEnergy),
        energyDelta: mineraiMineEnergy(level + 1, prodConfig?.mineraiEnergy) - mineraiMineEnergy(level, prodConfig?.mineraiEnergy),
      };
    case 'siliciumMine':
      return {
        current: siliciumProduction(level, pf, prodConfig?.silicium),
        next: siliciumProduction(level + 1, pf, prodConfig?.silicium),
        delta: siliciumProduction(level + 1, pf, prodConfig?.silicium) - siliciumProduction(level, pf, prodConfig?.silicium),
        label: 'Production', unit: '/h', color: 'text-emerald-400',
        energyCurrent: siliciumMineEnergy(level, prodConfig?.siliciumEnergy),
        energyNext: siliciumMineEnergy(level + 1, prodConfig?.siliciumEnergy),
        energyDelta: siliciumMineEnergy(level + 1, prodConfig?.siliciumEnergy) - siliciumMineEnergy(level, prodConfig?.siliciumEnergy),
      };
    case 'hydrogeneSynth':
      return {
        current: hydrogeneProduction(level, maxTemp, pf, prodConfig?.hydrogene),
        next: hydrogeneProduction(level + 1, maxTemp, pf, prodConfig?.hydrogene),
        delta: hydrogeneProduction(level + 1, maxTemp, pf, prodConfig?.hydrogene) - hydrogeneProduction(level, maxTemp, pf, prodConfig?.hydrogene),
        label: 'Production', unit: '/h', color: 'text-emerald-400',
        energyCurrent: hydrogeneSynthEnergy(level, prodConfig?.hydrogeneEnergy),
        energyNext: hydrogeneSynthEnergy(level + 1, prodConfig?.hydrogeneEnergy),
        energyDelta: hydrogeneSynthEnergy(level + 1, prodConfig?.hydrogeneEnergy) - hydrogeneSynthEnergy(level, prodConfig?.hydrogeneEnergy),
      };
    case 'solarPlant':
      return {
        current: solarPlantEnergy(level, prodConfig?.solar),
        next: solarPlantEnergy(level + 1, prodConfig?.solar),
        delta: solarPlantEnergy(level + 1, prodConfig?.solar) - solarPlantEnergy(level, prodConfig?.solar),
        label: 'Énergie', unit: '', color: 'text-amber-400',
      };
    case 'storageMinerai':
    case 'storageSilicium':
    case 'storageHydrogene':
      return {
        current: storageCapacity(level, prodConfig?.storage),
        next: storageCapacity(level + 1, prodConfig?.storage),
        delta: storageCapacity(level + 1, prodConfig?.storage) - storageCapacity(level, prodConfig?.storage),
        label: 'Capacité', unit: '', color: 'text-sky-400',
      };
    case 'planetaryShield':
      return {
        current: calculateShieldCapacity(level),
        next: calculateShieldCapacity(level + 1),
        delta: calculateShieldCapacity(level + 1) - calculateShieldCapacity(level),
        label: 'Bouclier', unit: ' pts', color: 'text-blue-400',
        energyCurrent: calculateShieldEnergy(level),
        energyNext: calculateShieldEnergy(level + 1),
        energyDelta: calculateShieldEnergy(level + 1) - calculateShieldEnergy(level),
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

function estimateRefund(
  cost: { minerai: number; silicium: number; hydrogene: number },
  endTime: string,
  totalDurationSec: number,
  maxRatio = 0.7,
) {
  const totalMs = totalDurationSec * 1000;
  const timeLeft = Math.max(0, new Date(endTime).getTime() - Date.now());
  const ratio = Math.min(maxRatio, totalMs > 0 ? timeLeft / totalMs : 0);
  return {
    minerai: Math.floor(cost.minerai * ratio),
    silicium: Math.floor(cost.silicium * ratio),
    hydrogene: Math.floor(cost.hydrogene * ratio),
    ratio: Math.round(ratio * 100),
  };
}

export default function Buildings() {
  const { planetId, planetClassId } = useOutletContext<{ planetId?: string; planetClassId?: string | null }>();
  const utils = trpc.useUtils();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { data: gameConfig } = useGameConfig();
  const tutorialTargetId = useTutorialTargetId();

  const { data: buildings, isLoading } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const buildingLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    buildings?.forEach((b) => { levels[b.id] = b.currentLevel; });
    return levels;
  }, [buildings]);

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
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
    },
  });

  const cancelMutation = trpc.building.cancel.useMutation({
    onSuccess: () => {
      utils.building.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
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

  const upgradingBuilding = buildings.find((b) => b.isUpgrading && b.upgradeEndTime);
  const isAnyUpgrading = buildings.some((b) => b.isUpgrading);
  const maxTemp = resourceData?.maxTemp ?? 50;
  const productionFactor = resourceData?.rates.productionFactor ?? 1;
  const prodConfig = gameConfig ? buildProductionConfig(gameConfig) : undefined;
  const shieldLevelBonus = resourceData?.rates?.shieldLevelBonus ?? 0;

  const buildingCategories = (gameConfig?.categories ?? [])
    .filter((c) => c.entityType === 'building')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const getBuildingVariantProps = (buildingId: string) => {
    const def = gameConfig?.buildings?.[buildingId];
    const variants = def?.variantPlanetTypes ?? [];
    const hasVariant = !!planetClassId && variants.includes(planetClassId);
    return { planetType: planetClassId ?? undefined, hasVariant };
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Bâtiments" />

      {upgradingBuilding && (
        <section className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">En cours de construction</h2>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-card/50 p-3 border-l-4 border-l-orange-500">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {upgradingBuilding.name} <span className="text-muted-foreground">Niv. {upgradingBuilding.currentLevel + 1}</span>
              </p>
              <Timer
                endTime={new Date(upgradingBuilding.upgradeEndTime!)}
                totalDuration={upgradingBuilding.nextLevelTime}
                onComplete={() => {
                  utils.building.list.invalidate({ planetId: planetId! });
                  utils.tutorial.getCurrent.invalidate();
                }}
              />
            </div>
            <button
              onClick={() => cancelMutation.mutate({ planetId: planetId! })}
              disabled={cancelMutation.isPending}
              className="text-sm text-destructive hover:text-destructive/80 font-medium shrink-0"
            >
              Annuler
            </button>
          </div>
        </section>
      )}

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

                    const prereqsMet = building.prerequisites.every((p: any) => {
                      const currentLvl = p.currentLevel ?? buildings.find((b) => b.id === p.buildingId)?.currentLevel ?? 0;
                      return currentLvl >= p.level;
                    });

                    const highlighted = tutorialTargetId === building.id;

                    return (
                      <button
                        key={building.id}
                        onClick={() => setDetailId(building.id)}
                        className={cn(
                          'relative flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50 transition-colors',
                          highlighted && 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10',
                        )}
                      >
                        {highlighted && (
                          <span className="absolute top-2 right-2 z-10 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
                            Objectif
                          </span>
                        )}
                        <GameImage
                          category="buildings"
                          id={building.id}
                          size="icon"
                          alt={building.name}
                          className="h-11 w-11 rounded"
                          {...getBuildingVariantProps(building.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold truncate">{building.name}</span>
                            <span className="ml-2 shrink-0 bg-primary/12 text-primary border border-primary/20 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded">
                              {building.currentLevel}{building.id === 'planetaryShield' && shieldLevelBonus > 0 && <span className="text-primary ml-0.5">+{shieldLevelBonus}</span>}
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
                                  utils.tutorial.getCurrent.invalidate();
                                }}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 mt-0.5">
                              <ResourceCost
                                minerai={building.nextLevelCost.minerai}
                                silicium={building.nextLevelCost.silicium}
                                hydrogene={building.nextLevelCost.hydrogene}
                                currentMinerai={resources.minerai}
                                currentSilicium={resources.silicium}
                                currentHydrogene={resources.hydrogene}
                              />
                              <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatDuration(building.nextLevelTime)}</span>
                            </div>
                          )}
                        </div>
                        {building.isUpgrading ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCancelConfirm(true);
                            }}
                          >
                            ✕
                          </Button>
                        ) : (
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

                    const prereqsMet = building.prerequisites.every((p: any) => {
                      const currentLvl = p.currentLevel ?? buildings.find((b) => b.id === p.buildingId)?.currentLevel ?? 0;
                      return currentLvl >= p.level;
                    });

                    const effectiveLevel = building.id === 'planetaryShield'
                      ? building.currentLevel + shieldLevelBonus
                      : building.currentLevel;
                    const stats = getProductionStats(
                      building.id,
                      effectiveLevel,
                      maxTemp,
                      productionFactor,
                      prodConfig,
                    );

                    const highlighted = tutorialTargetId === building.id;

                    return (
                      <button
                        key={building.id}
                        onClick={() => setDetailId(building.id)}
                        className={cn(
                          'retro-card relative text-left cursor-pointer overflow-hidden flex flex-col',
                          getResourceGlowClass(building.id),
                          !prereqsMet && 'opacity-50',
                          highlighted && 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10',
                        )}
                      >
                        {highlighted && (
                          <span className="absolute top-2 right-2 z-10 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
                            Objectif
                          </span>
                        )}
                        {/* Image area with gradient background */}
                        <div className="relative h-[130px] overflow-hidden">
                          <GameImage
                            category="buildings"
                            id={building.id}
                            size="full"
                            alt={building.name}
                            className="w-full h-full object-cover"
                            {...getBuildingVariantProps(building.id)}
                          />
                          <span className="absolute top-2 right-2 bg-emerald-700 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            Niv. {building.currentLevel}{building.id === 'planetaryShield' && shieldLevelBonus > 0 && <span className="text-cyan-300 ml-0.5">+{shieldLevelBonus}</span>}
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
                                : stats.label === 'Énergie'
                                  ? `+${stats.current.toLocaleString('fr-FR')} énergie`
                                  : stats.label === 'Bouclier'
                                    ? `${stats.current.toLocaleString('fr-FR')} pts`
                                    : `+${stats.current.toLocaleString('fr-FR')}${stats.unit}`}
                            </div>
                          )}

                          {/* Spacer to push cost/button to bottom */}
                          <div className="flex-1" />

                          {building.isUpgrading && building.upgradeEndTime ? (
                            <div className="space-y-1.5">
                              <Timer
                                endTime={new Date(building.upgradeEndTime)}
                                totalDuration={building.nextLevelTime}
                                onComplete={() => {
                                  utils.building.list.invalidate({ planetId: planetId! });
                                  utils.resource.production.invalidate({ planetId: planetId! });
                                  utils.tutorial.getCurrent.invalidate();
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCancelConfirm(true);
                                }}
                              >
                                Annuler
                              </Button>
                            </div>
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
                                <PrerequisiteList items={buildPrerequisiteItems({ buildings: building.prerequisites }, Object.fromEntries(building.prerequisites.map((p: any) => [p.buildingId, p.currentLevel ?? buildingLevels[p.buildingId] ?? 0])), {}, gameConfig)} missingOnly />
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
        {detailId && buildings && (
          <BuildingDetailContent
            buildingId={detailId}
            buildings={buildings}
            planetClassId={planetClassId}
            planetContext={
              resourceData
                ? {
                    maxTemp: resourceData.maxTemp,
                    productionFactor: resourceData.rates.productionFactor,
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
        description="Le remboursement est proportionnel au temps restant, plafonné à 70% des ressources investies."
        variant="destructive"
        confirmLabel="Annuler la construction"
      >
        {(() => {
          const upgrading = buildings?.find((b) => b.isUpgrading && b.upgradeEndTime);
          if (!upgrading || !upgrading.upgradeEndTime) return null;
          const refund = estimateRefund(
            upgrading.nextLevelCost,
            upgrading.upgradeEndTime,
            upgrading.nextLevelTime,
          );
          return (
            <div className="rounded-md border border-border bg-card/50 p-3 space-y-1.5">
              <div className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
                Remboursement estimé ({refund.ratio}%)
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {refund.minerai > 0 && (
                  <span className="text-minerai font-semibold">+{refund.minerai.toLocaleString('fr-FR')} M</span>
                )}
                {refund.silicium > 0 && (
                  <span className="text-silicium font-semibold">+{refund.silicium.toLocaleString('fr-FR')} S</span>
                )}
                {refund.hydrogene > 0 && (
                  <span className="text-hydrogene font-semibold">+{refund.hydrogene.toLocaleString('fr-FR')} H</span>
                )}
              </div>
            </div>
          );
        })()}
      </ConfirmDialog>
    </div>
  );
}
