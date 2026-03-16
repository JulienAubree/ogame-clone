import { useState } from 'react';
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
import { EntityDetailOverlay, InfoButton } from '@/components/common/EntityDetailOverlay';
import { ResearchDetailContent } from '@/components/entity-details/ResearchDetailContent';
import { useGameConfig } from '@/hooks/useGameConfig';
import { formatMissingPrerequisite } from '@/lib/prerequisites';


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

                {/* Desktop: card grid */}
                <div className="hidden lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4">
                  {categoryTechs.map((tech) => {
                    const canAfford =
                      resources.minerai >= tech.nextLevelCost.minerai &&
                      resources.silicium >= tech.nextLevelCost.silicium &&
                      resources.hydrogene >= tech.nextLevelCost.hydrogene;

                    return (
                      <div key={tech.id} className={`glass-card relative p-4 space-y-3 ${!tech.prerequisitesMet ? 'opacity-50' : ''}`}>
                        <InfoButton onClick={() => setDetailId(tech.id)} />
                        <div className="flex items-center gap-3">
                          <GameImage
                            category="research"
                            id={tech.id}
                            size="icon"
                            alt={tech.name}
                            className="h-10 w-10 rounded"
                          />
                          <div className="flex flex-1 items-center justify-between">
                            <span className="text-base font-semibold">{tech.name}</span>
                            <Badge variant="secondary">Niv. {tech.currentLevel}</Badge>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">{tech.description}</p>

                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Coût niveau {tech.currentLevel + 1} :
                          </div>
                          <ResourceCost
                            minerai={tech.nextLevelCost.minerai}
                            silicium={tech.nextLevelCost.silicium}
                            hydrogene={tech.nextLevelCost.hydrogene}
                            currentMinerai={resources.minerai}
                            currentSilicium={resources.silicium}
                            currentHydrogene={resources.hydrogene}
                          />
                          <div className="text-xs text-muted-foreground">
                            Durée : {formatDuration(tech.nextLevelTime)}
                          </div>
                        </div>

                        {!tech.prerequisitesMet && tech.missingPrerequisites.length > 0 && (
                          <p className="text-xs text-destructive">
                            Prérequis : {tech.missingPrerequisites.map((p) => formatMissingPrerequisite(p, gameConfig)).join(', ')}
                          </p>
                        )}

                        {tech.isResearching && tech.researchEndTime ? (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-primary">En recherche...</span>
                              </div>
                              <Timer
                                endTime={new Date(tech.researchEndTime)}
                                totalDuration={tech.nextLevelTime}
                                onComplete={() => {
                                  utils.research.list.invalidate({ planetId: planetId! });
                                }}
                              />
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setCancelConfirm(true)}
                              disabled={cancelMutation.isPending}
                            >
                              Annuler
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              startMutation.mutate({ planetId: planetId!, researchId: tech.id as any })
                            }
                            disabled={!canAfford || !tech.prerequisitesMet || isAnyResearching || startMutation.isPending}
                          >
                            Rechercher niv. {tech.currentLevel + 1}
                          </Button>
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
        title={detailId ? gameConfig?.research[detailId]?.name ?? '' : ''}
      >
        {detailId && <ResearchDetailContent researchId={detailId} />}
      </EntityDetailOverlay>

      <ConfirmDialog
        open={cancelConfirm}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setCancelConfirm(false)}
        title="Annuler la recherche ?"
        description="Les ressources investies seront partiellement remboursées."
        variant="destructive"
        confirmLabel="Annuler la recherche"
      />
    </div>
  );
}
