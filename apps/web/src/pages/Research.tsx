import { useState, useMemo } from 'react';
import { Home } from 'lucide-react';
import { trpc } from '@/trpc';
import { usePlanetStore } from '@/stores/planet.store';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
import { ClockIcon } from '@/components/icons/utility-icons';
import { formatDuration } from '@/lib/format';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { ResearchDetailContent } from '@/components/entity-details/ResearchDetailContent';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PrerequisiteList, buildPrerequisiteItems } from '@/components/common/PrerequisiteList';
import { cn } from '@/lib/utils';
import { useTutorialTargetId } from '@/hooks/useTutorialHighlight';
import { FacilityHero } from '@/components/common/FacilityHero';
import { FacilityLockedHero } from '@/components/common/FacilityLockedHero';
import { BuildingUpgradeCard } from '@/components/common/BuildingUpgradeCard';
import { ResearchActivePanel } from '@/components/research/ResearchActivePanel';
import { ResearchRoleFilter, type ResearchFilter } from '@/components/research/ResearchRoleFilter';
import { ResearchHelp } from '@/components/research/ResearchHelp';
import { RESEARCH_CATEGORIES, RESEARCH_CATEGORY_MAP, type ResearchCategoryId } from '@/components/research/research-icons';

const ANNEX_LAB_BY_PLANET_CLASS: Record<string, { id: string; name: string }> = {
  volcanic: { id: 'labVolcanic', name: 'Forge Volcanique' },
  arid: { id: 'labArid', name: 'Laboratoire Aride' },
  temperate: { id: 'labTemperate', name: 'Bio-Laboratoire' },
  glacial: { id: 'labGlacial', name: 'Cryo-Laboratoire' },
  gaseous: { id: 'labGaseous', name: 'Nebula-Lab' },
};

export default function Research() {
  const planetId = usePlanetStore((s) => s.activePlanetId);
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();
  const tutorialTargetId = useTutorialTargetId();

  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [filter, setFilter] = useState<ResearchFilter>('all');

  const { data: researchData, isLoading } = trpc.research.list.useQuery();
  const techs = researchData?.items;
  const bonuses = researchData?.bonuses;
  const labLevel = bonuses?.labLevel ?? 0;

  // ── Home planet (researchLab lives there) ─────────────────────────────
  const { data: planets } = trpc.planet.list.useQuery();
  const homePlanet = planets?.find((p) => p.planetClassId === 'homeworld');
  const currentPlanet = planets?.find((p) => p.id === planetId);
  const isOnColony = !!homePlanet && !!planetId && planetId !== homePlanet.id;

  const { data: homeBuildings } = trpc.building.list.useQuery(
    { planetId: homePlanet?.id ?? '' },
    { enabled: !!homePlanet?.id },
  );
  const { data: colonyBuildings } = trpc.building.list.useQuery(
    { planetId: planetId ?? '' },
    { enabled: !!planetId && isOnColony },
  );
  const researchLabBuilding = homeBuildings?.find((b) => b.id === 'researchLab');
  const isAnyBuildingUpgrading = homeBuildings?.some((b) => b.isUpgrading) ?? false;

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

  const startMutation = trpc.research.start.useMutation({
    onSuccess: () => {
      utils.research.list.invalidate();
      if (planetId) utils.resource.production.invalidate({ planetId });
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
    },
  });

  const cancelMutation = trpc.research.cancel.useMutation({
    onSuccess: () => {
      utils.research.list.invalidate();
      if (planetId) utils.resource.production.invalidate({ planetId });
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
      setCancelConfirm(false);
    },
  });

  const upgradeMutation = trpc.building.upgrade.useMutation({
    onSuccess: () => {
      if (homePlanet?.id) utils.building.list.invalidate({ planetId: homePlanet.id });
      utils.research.list.invalidate();
      utils.resource.production.invalidate();
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
    },
  });

  const buildingCancelMutation = trpc.building.cancel.useMutation({
    onSuccess: () => {
      if (homePlanet?.id) utils.building.list.invalidate({ planetId: homePlanet.id });
      utils.resource.production.invalidate();
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
    },
  });

  const researchLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    techs?.forEach((t) => { levels[t.id] = t.currentLevel; });
    return levels;
  }, [techs]);

  const buildingLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    if (bonuses) {
      levels['researchLab'] = bonuses.labLevel;
      for (const annex of bonuses.annexDetails) {
        levels[annex.buildingId] = annex.level;
      }
    }
    return levels;
  }, [bonuses]);

  // ── Loading ───────────────────────────────────────────────────────────
  if (isLoading || !researchData || !techs) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Recherche" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  // ── Colony view: lab vit sur la home, montrer l'annexe locale ─────────
  if (isOnColony && homePlanet && currentPlanet) {
    const annex = ANNEX_LAB_BY_PLANET_CLASS[currentPlanet.planetClassId ?? ''];
    const annexBuilding = annex ? colonyBuildings?.find((b) => b.id === annex.id) : undefined;
    const isAnyColonyUpgrading = colonyBuildings?.some((b) => b.isUpgrading) ?? false;
    const colonyBuildingLevels: Record<string, number> = {};
    colonyBuildings?.forEach((b) => { colonyBuildingLevels[b.id] = b.currentLevel; });

    return (
      <FacilityLockedHero
        buildingId={annex?.id ?? 'researchLab'}
        title={annex ? annex.name : 'Recherche'}
        description={
          annex ? (
            <>Le programme scientifique principal s'exécute depuis votre <span className="text-foreground font-semibold">planète-mère</span>. Cette colonie peut héberger une annexe spécialisée qui boostera l'ensemble de votre recherche.</>
          ) : (
            <>Le programme scientifique s'exécute depuis votre <span className="text-foreground font-semibold">planète-mère</span>.</>
          )
        }
      >
        <div className="flex flex-col items-center gap-3">
          {annex && annexBuilding && (
            <BuildingUpgradeCard
              currentLevel={annexBuilding.currentLevel}
              nextLevelCost={annexBuilding.nextLevelCost}
              nextLevelTime={annexBuilding.nextLevelTime}
              prerequisites={annexBuilding.prerequisites as any}
              isUpgrading={!!annexBuilding.isUpgrading}
              upgradeEndTime={annexBuilding.upgradeEndTime ?? null}
              resources={{ minerai: resources.minerai, silicium: resources.silicium, hydrogene: resources.hydrogene }}
              buildingLevels={colonyBuildingLevels}
              isAnyUpgrading={isAnyColonyUpgrading}
              upgradePending={upgradeMutation.isPending}
              cancelPending={buildingCancelMutation.isPending}
              gameConfig={gameConfig}
              onUpgrade={() => upgradeMutation.mutate({ planetId: planetId!, buildingId: annex.id as any })}
              onCancel={() => buildingCancelMutation.mutate({ planetId: planetId! })}
              onTimerComplete={() => {
                utils.building.list.invalidate({ planetId: planetId! });
                utils.resource.production.invalidate({ planetId: planetId! });
              }}
            />
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setActivePlanet(homePlanet.id)}
          >
            <Home className="h-3.5 w-3.5" />
            Voir le laboratoire principal
          </Button>
        </div>
      </FacilityLockedHero>
    );
  }

  // ── Locked state (lab not built) ──────────────────────────────────────
  if (bonuses && labLevel < 1) {
    return (
      <FacilityLockedHero
        buildingId="researchLab"
        title="Laboratoire de recherche"
        description={<>Construisez le <span className="text-foreground font-semibold">Laboratoire de recherche</span> sur votre planète-mère pour démarrer le programme scientifique de votre empire.</>}
      >
        {researchLabBuilding && homePlanet && (
          <BuildingUpgradeCard
            currentLevel={researchLabBuilding.currentLevel}
            nextLevelCost={researchLabBuilding.nextLevelCost}
            nextLevelTime={researchLabBuilding.nextLevelTime}
            prerequisites={researchLabBuilding.prerequisites as any}
            isUpgrading={!!researchLabBuilding.isUpgrading}
            upgradeEndTime={researchLabBuilding.upgradeEndTime ?? null}
            resources={{ minerai: resources.minerai, silicium: resources.silicium, hydrogene: resources.hydrogene }}
            buildingLevels={buildingLevels}
            isAnyUpgrading={isAnyBuildingUpgrading}
            upgradePending={upgradeMutation.isPending}
            cancelPending={buildingCancelMutation.isPending}
            gameConfig={gameConfig}
            onUpgrade={() => upgradeMutation.mutate({ planetId: homePlanet.id, buildingId: 'researchLab' as any })}
            onCancel={() => buildingCancelMutation.mutate({ planetId: homePlanet.id })}
            onTimerComplete={() => {
              if (homePlanet.id) utils.building.list.invalidate({ planetId: homePlanet.id });
              utils.resource.production.invalidate();
            }}
          />
        )}
      </FacilityLockedHero>
    );
  }

  const researchingTech = techs.find((t) => t.isResearching && t.researchEndTime);
  const isAnyResearching = techs.some((t) => t.isResearching);

  // ── Group techs by category ───────────────────────────────────────────
  const techsByCategory = new Map<ResearchCategoryId, typeof techs>();
  for (const tech of techs) {
    const catId = gameConfig?.research[tech.id]?.categoryId as ResearchCategoryId | undefined;
    if (!catId || !RESEARCH_CATEGORY_MAP[catId]) continue;
    const list = techsByCategory.get(catId) ?? [];
    list.push(tech);
    techsByCategory.set(catId, list);
  }
  const availableCategories = RESEARCH_CATEGORIES.filter((c) => techsByCategory.has(c.id)).map((c) => c.id);
  const visibleCategories = filter === 'all' ? availableCategories : availableCategories.filter((id) => id === filter);

  // ── Main layout ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <FacilityHero
        buildingId="researchLab"
        title="Laboratoire de recherche"
        level={labLevel}
        planetClassId={homePlanet?.planetClassId}
        planetImageIndex={homePlanet?.planetImageIndex}
        onOpenHelp={() => setHelpOpen(true)}
        upgradeCard={researchLabBuilding && homePlanet && (
          <BuildingUpgradeCard
            currentLevel={researchLabBuilding.currentLevel}
            nextLevelCost={researchLabBuilding.nextLevelCost}
            nextLevelTime={researchLabBuilding.nextLevelTime}
            prerequisites={researchLabBuilding.prerequisites as any}
            isUpgrading={!!researchLabBuilding.isUpgrading}
            upgradeEndTime={researchLabBuilding.upgradeEndTime ?? null}
            resources={{ minerai: resources.minerai, silicium: resources.silicium, hydrogene: resources.hydrogene }}
            buildingLevels={buildingLevels}
            isAnyUpgrading={isAnyBuildingUpgrading}
            upgradePending={upgradeMutation.isPending}
            cancelPending={buildingCancelMutation.isPending}
            gameConfig={gameConfig}
            onUpgrade={() => upgradeMutation.mutate({ planetId: homePlanet.id, buildingId: 'researchLab' as any })}
            onCancel={() => buildingCancelMutation.mutate({ planetId: homePlanet.id })}
            onTimerComplete={() => {
              if (homePlanet.id) utils.building.list.invalidate({ planetId: homePlanet.id });
              utils.research.list.invalidate();
            }}
          />
        )}
      >
        {bonuses && (
          <ResearchActivePanel
            bonuses={bonuses}
            researchingTech={researchingTech ?? null}
            onTimerComplete={() => {
              utils.research.list.invalidate();
              utils.tutorial.getCurrent.invalidate();
            }}
            onCancel={() => setCancelConfirm(true)}
            cancelPending={cancelMutation.isPending}
          />
        )}
      </FacilityHero>

      <div className="space-y-4 px-4 pb-4 lg:px-6 lg:pb-6">
        <ResearchRoleFilter value={filter} onChange={setFilter} availableCategories={availableCategories} />

        <section className="glass-card p-4 lg:p-5 space-y-8">
          {visibleCategories.map((categoryId) => {
            const categoryTechs = techsByCategory.get(categoryId) ?? [];
            if (categoryTechs.length === 0) return null;
            const category = RESEARCH_CATEGORY_MAP[categoryId];
            const { Icon: CategoryIcon, label } = category;

            return (
              <div key={categoryId}>
                {filter === 'all' && (
                  <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    <CategoryIcon className="h-3.5 w-3.5" />
                    {label}
                  </h3>
                )}

                {/* Mobile compact list */}
                <div className="space-y-1 lg:hidden">
                  {categoryTechs.map((tech) => {
                    const canAfford =
                      resources.minerai >= tech.nextLevelCost.minerai &&
                      resources.silicium >= tech.nextLevelCost.silicium &&
                      resources.hydrogene >= tech.nextLevelCost.hydrogene;
                    const highlighted = tutorialTargetId === tech.id;

                    return (
                      <button
                        key={tech.id}
                        onClick={() => setDetailId(tech.id)}
                        className={cn(
                          'relative flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50 transition-colors',
                          !tech.prerequisitesMet && 'opacity-50',
                          highlighted && 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10',
                        )}
                      >
                        {highlighted && (
                          <span className="absolute top-2 right-2 z-10 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
                            Objectif
                          </span>
                        )}
                        <GameImage category="research" id={tech.id} size="icon" alt={tech.name} className="h-8 w-8 rounded" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{tech.name}</span>
                            <Badge variant="secondary" className="text-xs ml-2">Niv. {tech.currentLevel}</Badge>
                          </div>
                          {tech.isResearching && tech.researchEndTime ? (
                            <div className="mt-1">
                              <Timer
                                endTime={new Date(tech.researchEndTime)}
                                totalDuration={tech.nextLevelTime}
                                onComplete={() => {
                                  utils.research.list.invalidate();
                                  utils.tutorial.getCurrent.invalidate();
                                }}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <ResourceCost
                                minerai={tech.nextLevelCost.minerai}
                                silicium={tech.nextLevelCost.silicium}
                                hydrogene={tech.nextLevelCost.hydrogene}
                                currentMinerai={resources.minerai}
                                currentSilicium={resources.silicium}
                                currentHydrogene={resources.hydrogene}
                              />
                              <span className="font-mono text-[10px] shrink-0">{formatDuration(tech.nextLevelTime)}</span>
                            </div>
                          )}
                        </div>
                        {!tech.isResearching && (
                          <Button
                            size="sm"
                            className="shrink-0"
                            onClick={(e) => { e.stopPropagation(); startMutation.mutate({ researchId: tech.id as any }); }}
                            disabled={!canAfford || !tech.prerequisitesMet || isAnyResearching || startMutation.isPending}
                          >
                            ↑
                          </Button>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: vertical card grid */}
                <div className="hidden lg:grid lg:gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                  {categoryTechs.map((tech) => {
                    const canAfford =
                      resources.minerai >= tech.nextLevelCost.minerai &&
                      resources.silicium >= tech.nextLevelCost.silicium &&
                      resources.hydrogene >= tech.nextLevelCost.hydrogene;
                    const highlighted = tutorialTargetId === tech.id;

                    return (
                      <button
                        key={tech.id}
                        onClick={() => setDetailId(tech.id)}
                        className={cn(
                          'retro-card relative text-left cursor-pointer overflow-hidden flex flex-col',
                          !tech.prerequisitesMet && 'opacity-50',
                          highlighted && 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10',
                        )}
                      >
                        {highlighted && (
                          <span className="absolute top-2 right-2 z-10 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
                            Objectif
                          </span>
                        )}
                        <div className="relative h-[130px] overflow-hidden">
                          <GameImage
                            category="research"
                            id={tech.id}
                            size="full"
                            alt={tech.name}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-2 right-2 bg-emerald-700 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            Niv. {tech.currentLevel}
                          </span>
                        </div>

                        <div className="p-3 flex flex-col flex-1 gap-1.5">
                          <div className="text-[13px] font-semibold text-foreground truncate">
                            {tech.name}
                          </div>

                          <div className="flex-1" />

                          {tech.isResearching && tech.researchEndTime ? (
                            <Timer
                              endTime={new Date(tech.researchEndTime)}
                              totalDuration={tech.nextLevelTime}
                              onComplete={() => {
                                utils.research.list.invalidate();
                                utils.tutorial.getCurrent.invalidate();
                              }}
                            />
                          ) : (
                            <>
                              <ResourceCost
                                minerai={tech.nextLevelCost.minerai}
                                silicium={tech.nextLevelCost.silicium}
                                hydrogene={tech.nextLevelCost.hydrogene}
                                currentMinerai={resources.minerai}
                                currentSilicium={resources.silicium}
                                currentHydrogene={resources.hydrogene}
                              />
                              <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                <ClockIcon className="h-3 w-3" />
                                {formatDuration(tech.nextLevelTime)}
                              </div>
                              {!tech.prerequisitesMet ? (
                                <PrerequisiteList items={buildPrerequisiteItems(gameConfig?.research[tech.id]?.prerequisites ?? {}, buildingLevels, researchLevels, gameConfig)} missingOnly />
                              ) : (
                                <Button
                                  variant="retro"
                                  size="sm"
                                  className="w-full"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startMutation.mutate({ researchId: tech.id as any });
                                  }}
                                  disabled={!canAfford || isAnyResearching || startMutation.isPending}
                                >
                                  Rechercher
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {/* Detail overlay */}
      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? gameConfig?.research[detailId]?.name ?? '' : ''}
      >
        {detailId && <ResearchDetailContent researchId={detailId} researchLevels={researchLevels} buildingLevels={buildingLevels} />}
      </EntityDetailOverlay>

      {/* Help overlay */}
      <EntityDetailOverlay open={helpOpen} onClose={() => setHelpOpen(false)} title="Laboratoire de recherche">
        <ResearchHelp level={labLevel} />
      </EntityDetailOverlay>

      <ConfirmDialog
        open={cancelConfirm}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setCancelConfirm(false)}
        title="Annuler la recherche ?"
        description="Le remboursement est proportionnel au temps restant, plafonné à 70% des ressources investies."
        variant="destructive"
        confirmLabel="Annuler la recherche"
      />
    </div>
  );
}
