import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
import { RESEARCH, type ResearchId } from '@ogame-clone/game-engine';

export default function Research() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

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
      <div className="space-y-6 p-6">
        <PageHeader title="Recherche" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  const isAnyResearching = techs.some((t) => t.isResearching);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Recherche" />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {techs.map((tech) => {
          const canAfford =
            resources.metal >= tech.nextLevelCost.metal &&
            resources.crystal >= tech.nextLevelCost.crystal &&
            resources.deuterium >= tech.nextLevelCost.deuterium;

          return (
            <Card key={tech.id} className={`relative ${!tech.prerequisitesMet ? 'opacity-50' : ''}`}>
              <InfoButton onClick={() => setDetailId(tech.id)} />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <GameImage
                    category="research"
                    id={tech.id}
                    size="icon"
                    alt={tech.name}
                    className="h-10 w-10 rounded"
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <CardTitle className="text-base">{tech.name}</CardTitle>
                    <Badge variant="secondary">Niv. {tech.currentLevel}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{tech.description}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Coût niveau {tech.currentLevel + 1} :
                  </div>
                  <ResourceCost
                    metal={tech.nextLevelCost.metal}
                    crystal={tech.nextLevelCost.crystal}
                    deuterium={tech.nextLevelCost.deuterium}
                    currentMetal={resources.metal}
                    currentCrystal={resources.crystal}
                    currentDeuterium={resources.deuterium}
                  />
                  <div className="text-xs text-muted-foreground">
                    Durée : {formatDuration(tech.nextLevelTime)}
                  </div>
                </div>

                {!tech.prerequisitesMet && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Prérequis manquants
                  </div>
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
                      startMutation.mutate({ planetId: planetId!, researchId: tech.id })
                    }
                    disabled={!canAfford || !tech.prerequisitesMet || isAnyResearching || startMutation.isPending}
                  >
                    Rechercher niv. {tech.currentLevel + 1}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? RESEARCH[detailId as ResearchId]?.name ?? '' : ''}
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
