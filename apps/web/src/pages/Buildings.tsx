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
import { BuildingDetailContent } from '@/components/entity-details/BuildingDetailContent';
import { BUILDINGS, type BuildingId } from '@ogame-clone/game-engine';

export default function Buildings() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

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
      setCancelConfirm(false);
    },
  });

  if (isLoading || !buildings) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Bâtiments" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  const isAnyUpgrading = buildings.some((b) => b.isUpgrading);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Bâtiments" />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {buildings.map((building) => {
          const canAfford =
            resources.metal >= building.nextLevelCost.metal &&
            resources.crystal >= building.nextLevelCost.crystal &&
            resources.deuterium >= building.nextLevelCost.deuterium;

          return (
            <Card key={building.id} className="relative hover:shadow-glow-metal/20">
              <InfoButton onClick={() => setDetailId(building.id)} />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <GameImage
                    category="buildings"
                    id={building.id}
                    size="icon"
                    alt={building.name}
                    className="h-10 w-10 rounded"
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <CardTitle className="text-base">{building.name}</CardTitle>
                    <Badge variant="secondary">Niv. {building.currentLevel}</Badge>
                  </div>
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
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-primary">En construction...</span>
                      </div>
                      <Timer
                        endTime={new Date(building.upgradeEndTime)}
                        totalDuration={building.nextLevelTime}
                        onComplete={() => {
                          utils.building.list.invalidate({ planetId: planetId! });
                          utils.resource.production.invalidate({ planetId: planetId! });
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

      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? BUILDINGS[detailId as BuildingId]?.name ?? '' : ''}
      >
        {detailId && <BuildingDetailContent buildingId={detailId} />}
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
