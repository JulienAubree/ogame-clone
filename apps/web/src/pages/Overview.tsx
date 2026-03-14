import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Timer } from '@/components/common/Timer';

export default function Overview() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const utils = trpc.useUtils();

  const { data: planets, isLoading } = trpc.planet.list.useQuery();

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

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: techs } = trpc.research.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: queue } = trpc.shipyard.queue.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const renameMutation = trpc.planet.rename.useMutation({
    onSuccess: () => {
      utils.planet.list.invalidate();
      setIsRenaming(false);
    },
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const planet = planets?.find((p) => p.id === planetId) ?? planets?.[0];
  if (!planet) {
    return <div className="p-6 text-muted-foreground">Aucune planète trouvée.</div>;
  }

  const activeBuilding = buildings?.find((b) => b.isUpgrading);
  const activeResearch = techs?.find((t) => t.isResearching);
  const activeQueue = queue?.filter((q) => q.endTime) ?? [];
  const hasActivity = activeBuilding || activeResearch || activeQueue.length > 0;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activités en cours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasActivity && (
            <p className="text-sm text-muted-foreground">Aucune activité en cours</p>
          )}

          {activeBuilding && activeBuilding.upgradeEndTime && (
            <div
              className="cursor-pointer space-y-1 rounded-md p-2 hover:bg-muted/50"
              onClick={() => navigate('/buildings')}
            >
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Construction</Badge>
                  <span>{activeBuilding.name} → Niv. {activeBuilding.currentLevel + 1}</span>
                </div>
              </div>
              <Timer
                endTime={new Date(activeBuilding.upgradeEndTime)}
                totalDuration={activeBuilding.nextLevelTime}
                onComplete={() => {
                  utils.building.list.invalidate({ planetId: planetId! });
                  utils.resource.production.invalidate({ planetId: planetId! });
                }}
              />
            </div>
          )}

          {activeResearch && activeResearch.researchEndTime && (
            <div
              className="cursor-pointer space-y-1 rounded-md p-2 hover:bg-muted/50"
              onClick={() => navigate('/research')}
            >
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Recherche</Badge>
                  <span>{activeResearch.name} → Niv. {activeResearch.currentLevel + 1}</span>
                </div>
              </div>
              <Timer
                endTime={new Date(activeResearch.researchEndTime)}
                totalDuration={activeResearch.nextLevelTime}
                onComplete={() => {
                  utils.research.list.invalidate({ planetId: planetId! });
                }}
              />
            </div>
          )}

          {activeQueue.map((item) => (
            <div
              key={item.id}
              className="cursor-pointer space-y-1 rounded-md p-2 hover:bg-muted/50"
              onClick={() => navigate('/shipyard')}
            >
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Chantier</Badge>
                  <span>{item.itemId} x{item.quantity - (item.completedCount ?? 0)}</span>
                </div>
              </div>
              {item.endTime && (
                <Timer
                  endTime={new Date(item.endTime)}
                  totalDuration={Math.floor((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 1000)}
                  onComplete={() => {
                    utils.shipyard.queue.invalidate({ planetId: planetId! });
                    utils.shipyard.ships.invalidate({ planetId: planetId! });
                  }}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            {isRenaming ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim()) {
                    renameMutation.mutate({ planetId: planet.id, name: newName.trim() });
                  }
                }}
              >
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={30}
                  className="h-8"
                />
                <Button type="submit" size="sm" disabled={renameMutation.isPending}>
                  OK
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setIsRenaming(false)}>
                  Annuler
                </Button>
              </form>
            ) : (
              <CardTitle
                className="cursor-pointer hover:text-primary transition-colors"
                onClick={() => { setNewName(planet.name); setIsRenaming(true); }}
                title="Cliquer pour renommer"
              >
                {planet.name}
              </CardTitle>
            )}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Coordonnées</span>
              <span>[{planet.galaxy}:{planet.system}:{planet.position}]</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Diamètre</span>
              <span>{planet.diameter.toLocaleString('fr-FR')} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Champs</span>
              <span>0 / {planet.maxFields}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Température</span>
              <span>{planet.minTemp}°C à {planet.maxTemp}°C</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ressources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-metal">Métal</span>
              <span>{resources.metal.toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-crystal">Cristal</span>
              <span>{resources.crystal.toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-deuterium">Deutérium</span>
              <span>{resources.deuterium.toLocaleString('fr-FR')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bâtiments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mine de métal</span>
              <Badge variant="secondary">Niv. {planet.metalMineLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mine de cristal</span>
              <Badge variant="secondary">Niv. {planet.crystalMineLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Synthétiseur de deut.</span>
              <Badge variant="secondary">Niv. {planet.deutSynthLevel}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Centrale solaire</span>
              <Badge variant="secondary">Niv. {planet.solarPlantLevel}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
