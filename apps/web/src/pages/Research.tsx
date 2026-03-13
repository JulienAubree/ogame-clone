import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ResourceCost } from '@/components/common/ResourceCost';
import { Timer } from '@/components/common/Timer';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export default function Research() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();

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
    },
  });

  if (isLoading || !techs) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const isAnyResearching = techs.some((t) => t.isResearching);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Recherche</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {techs.map((tech) => {
          const canAfford =
            resources.metal >= tech.nextLevelCost.metal &&
            resources.crystal >= tech.nextLevelCost.crystal &&
            resources.deuterium >= tech.nextLevelCost.deuterium;

          return (
            <Card key={tech.id} className={!tech.prerequisitesMet ? 'opacity-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{tech.name}</CardTitle>
                  <Badge variant="secondary">Niv. {tech.currentLevel}</Badge>
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
                  <p className="text-xs text-destructive">
                    Prérequis manquants
                  </p>
                )}

                {tech.isResearching && tech.researchEndTime ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary">En recherche...</span>
                      <Timer
                        endTime={new Date(tech.researchEndTime)}
                        onComplete={() => {
                          utils.research.list.invalidate({ planetId: planetId! });
                        }}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelMutation.mutate()}
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
    </div>
  );
}
