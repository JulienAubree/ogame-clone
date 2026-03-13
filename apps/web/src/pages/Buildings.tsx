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

export default function Buildings() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();

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
    },
  });

  if (isLoading || !buildings) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const isAnyUpgrading = buildings.some((b) => b.isUpgrading);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Bâtiments</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {buildings.map((building) => {
          const canAfford =
            resources.metal >= building.nextLevelCost.metal &&
            resources.crystal >= building.nextLevelCost.crystal &&
            resources.deuterium >= building.nextLevelCost.deuterium;

          return (
            <Card key={building.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{building.name}</CardTitle>
                  <Badge variant="secondary">Niv. {building.currentLevel}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{building.description}</p>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Coût niveau {building.currentLevel + 1} :
                  </div>
                  <ResourceCost
                    metal={building.nextLevelCost.metal}
                    crystal={building.nextLevelCost.crystal}
                    deuterium={building.nextLevelCost.deuterium}
                    currentMetal={resources.metal}
                    currentCrystal={resources.crystal}
                    currentDeuterium={resources.deuterium}
                  />
                  <div className="text-xs text-muted-foreground">
                    Durée : {formatDuration(building.nextLevelTime)}
                  </div>
                </div>

                {building.isUpgrading && building.upgradeEndTime ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary">En construction...</span>
                      <Timer
                        endTime={new Date(building.upgradeEndTime)}
                        onComplete={() => {
                          utils.building.list.invalidate({ planetId: planetId! });
                          utils.resource.production.invalidate({ planetId: planetId! });
                        }}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelMutation.mutate({ planetId: planetId! })}
                      disabled={cancelMutation.isPending}
                    >
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      upgradeMutation.mutate({
                        planetId: planetId!,
                        buildingId: building.id,
                      })
                    }
                    disabled={!canAfford || isAnyUpgrading || upgradeMutation.isPending}
                  >
                    Améliorer au niv. {building.currentLevel + 1}
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
