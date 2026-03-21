import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
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


export default function Research() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { data: gameConfig } = useGameConfig();

  const researchCategories = (gameConfig?.categories ?? [])
    .filter((c) => c.entityType === 'research')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const { data: techs, isLoading } = trpc.research.list.useQuery(
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

  const startMutation = trpc.research.start.useMutation({
    onSuccess: () => {
      utils.research.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  const cancelMutation = trpc.research.cancel.useMutation({
    onSuccess: () => {
      utils.research.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      setCancelConfirm(false);
    },
  });

  const researchLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    techs?.forEach((t) => { levels[t.id] = t.currentLevel; });
    return levels;
  }, [techs]);

  if (isLoading || !techs) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Recherche" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  const isAnyResearching = techs.some((t) => t.isResearching);

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Recherche" />

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

                    return (
                      <button
                        key={tech.id}
                        onClick={() => setDetailId(tech.id)}
                        className={`flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50 transition-colors ${!tech.prerequisitesMet ? 'opacity-50' : ''}`}
                      >
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
                                onComplete={() => utils.research.list.invalidate({ planetId: planetId! })}
                              />
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <ResourceCost
                                minerai={tech.nextLevelCost.minerai}
                                silicium={tech.nextLevelCost.silicium}
                                hydrogene={tech.nextLevelCost.hydrogene}
                                currentMinerai={resources.minerai}
                                currentSilicium={resources.silicium}
                                currentHydrogene={resources.hydrogene}
                              />
                            </div>
                          )}
                        </div>
                        {!tech.isResearching && (
                          <Button
                            size="sm"
                            className="shrink-0"
                            onClick={(e) => { e.stopPropagation(); startMutation.mutate({ planetId: planetId!, researchId: tech.id as any }); }}
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

                    return (
                      <button
                        key={tech.id}
                        onClick={() => setDetailId(tech.id)}
                        className={`retro-card text-left cursor-pointer overflow-hidden flex flex-col ${!tech.prerequisitesMet ? 'opacity-50' : ''}`}
                      >
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
                                utils.research.list.invalidate({ planetId: planetId! });
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
                                    startMutation.mutate({ planetId: planetId!, researchId: tech.id as any });
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
        {detailId && <ResearchDetailContent researchId={detailId} researchLevels={researchLevels} />}
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
