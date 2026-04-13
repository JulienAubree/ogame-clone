import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { usePlanetStore } from '@/stores/planet.store';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';
import { GameImage } from '@/components/common/GameImage';
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
import { ResearchIcon, BuildingsIcon, GalaxyIcon, FlagshipIcon, EmpireIcon } from '@/lib/icons';


export default function Research() {
  const planetId = usePlanetStore((s) => s.activePlanetId);
  const utils = trpc.useUtils();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { data: gameConfig } = useGameConfig();
  const tutorialTargetId = useTutorialTargetId();

  const researchCategories = (gameConfig?.categories ?? [])
    .filter((c) => c.entityType === 'research')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const { data: researchData, isLoading } = trpc.research.list.useQuery();
  const techs = researchData?.items;
  const bonuses = researchData?.bonuses;
  const labLevel = bonuses?.labLevel ?? 0;

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

  if (isLoading || !researchData || !techs) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Recherche" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  if (bonuses && labLevel < 1) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Recherche" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Avant de pouvoir acceder a la recherche, veuillez construire le <span className="text-foreground font-semibold">Laboratoire de recherche</span>.
          </p>
          <Link to="/buildings" className="text-xs text-primary hover:underline">
            Aller aux batiments
          </Link>
        </div>
      </div>
    );
  }

  const researchingTech = techs.find((t) => t.isResearching && t.researchEndTime);
  const isAnyResearching = techs.some((t) => t.isResearching);

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Recherche" />

      {/* Research Dashboard */}
      {bonuses && (() => {
        const totalReduction = Math.round((1 - bonuses.totalMultiplier) * 100);
        const labReduction = Math.round((1 - bonuses.labMultiplier) * 100);
        const annexReduction = Math.round((1 - bonuses.annexMultiplier) * 100);
        const biomeReduction = Math.round((1 - bonuses.biomeMultiplier) * 100);
        const talentReduction = Math.round((1 - bonuses.talentMultiplier) * 100);
        const hullReduction = Math.round((1 - bonuses.hullMultiplier) * 100);

        const ANNEX_NAMES: Record<string, string> = {
          labVolcanic: 'Forge Volcanique',
          labArid: 'Laboratoire Aride',
          labTemperate: 'Bio-Laboratoire',
          labGlacial: 'Cryo-Laboratoire',
          labGaseous: 'Nebula-Lab',
        };

        return (
          <section className="glass-card p-4 space-y-4">
            {/* Speed bar */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-foreground">Vitesse de recherche</h2>
                <span className="text-lg font-bold text-emerald-400">-{totalReduction}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.min(totalReduction, 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Vos recherches sont <span className="text-emerald-400 font-medium">{totalReduction}% plus rapides</span> grace aux bonus cumules de votre empire.
              </p>
            </div>

            {/* Bonus breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {/* Main lab */}
              <div className="rounded-lg border border-white/10 bg-card/50 px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <ResearchIcon width={14} height={14} className="text-violet-400 shrink-0" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Labo principal</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-foreground">Niveau {bonuses.labLevel}</span>
                  <span className="text-xs font-semibold text-emerald-400">-{labReduction}%</span>
                </div>
              </div>

              {/* Annex labs */}
              <div className="rounded-lg border border-white/10 bg-card/50 px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <BuildingsIcon width={14} height={14} className="text-violet-400 shrink-0" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Labos annexes</span>
                </div>
                {bonuses.annexDetails.length > 0 ? (
                  <div className="space-y-0.5">
                    {bonuses.annexDetails.map((annex, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate">{ANNEX_NAMES[annex.buildingId] ?? annex.buildingId} <span className="text-foreground/50">({annex.planetName})</span></span>
                        <span className="text-violet-400 font-medium shrink-0 ml-2">Niv. {annex.level}</span>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between border-t border-white/5 pt-1 mt-1">
                      <span className="text-[10px] text-muted-foreground">{bonuses.annexLevelsSum} niveaux cumules</span>
                      <span className="text-xs font-semibold text-emerald-400">-{annexReduction}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground italic">Aucun</span>
                    <span className="text-xs text-muted-foreground/50">-0%</span>
                  </div>
                )}
              </div>

              {/* Biomes */}
              <div className="rounded-lg border border-white/10 bg-card/50 px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <GalaxyIcon width={14} height={14} className="text-amber-400 shrink-0" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Biomes decouverts</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-foreground">{bonuses.discoveredBiomesCount} biomes</span>
                  <span className={cn('text-xs font-semibold', biomeReduction > 0 ? 'text-emerald-400' : 'text-muted-foreground/50')}>-{biomeReduction}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground">-1% par biome explore</p>
              </div>

              {/* Talents (only if active) */}
              {talentReduction > 0 && (
                <div className="rounded-lg border border-white/10 bg-card/50 px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <EmpireIcon width={14} height={14} className="text-emerald-400 shrink-0" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Talents</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-foreground">Bonus du vaisseau amiral</span>
                    <span className="text-xs font-semibold text-emerald-400">-{talentReduction}%</span>
                  </div>
                </div>
              )}

              {/* Hull (only if active) */}
              {hullReduction > 0 && (
                <div className="rounded-lg border border-white/10 bg-card/50 px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <FlagshipIcon width={14} height={14} className="text-cyan-400 shrink-0" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Vaisseau amiral</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-foreground">Bonus passif de coque</span>
                    <span className="text-xs font-semibold text-emerald-400">-{hullReduction}%</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {researchingTech && (
        <section className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">Recherche en cours</h2>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-card/50 p-3 border-l-4 border-l-orange-500">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {researchingTech.name} <span className="text-muted-foreground">Niv. {researchingTech.currentLevel + 1}</span>
              </p>
              <Timer
                endTime={new Date(researchingTech.researchEndTime!)}
                totalDuration={researchingTech.nextLevelTime}
                onComplete={() => {
                  utils.research.list.invalidate();
                  utils.tutorial.getCurrent.invalidate();
                }}
              />
            </div>
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="text-sm text-destructive hover:text-destructive/80 font-medium shrink-0"
            >
              Annuler
            </button>
          </div>
        </section>
      )}

      {researchCategories.map((category) => {
        const categoryTechs = techs.filter((t) =>
          gameConfig?.research[t.id]?.categoryId === category.id,
        );
        if (categoryTechs.length === 0) return null;
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
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 6v6l4 2" />
                                </svg>
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
              </>
            )}
          </div>
        );
      })}

      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? gameConfig?.research[detailId]?.name ?? '' : ''}
      >
        {detailId && <ResearchDetailContent researchId={detailId} researchLevels={researchLevels} buildingLevels={buildingLevels} />}
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

