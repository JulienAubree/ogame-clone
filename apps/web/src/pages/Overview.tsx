import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Timer } from '@/components/common/Timer';
import { OverviewSkeleton } from '@/components/common/PageSkeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryError } from '@/components/common/QueryError';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { eventTypeColor, formatEventText, formatRelativeTime, groupEvents } from '@/lib/game-events';
import { getPlanetImageUrl } from '@/lib/assets';

const MISSION_LABELS: Record<string, string> = {
  transport: 'Transport',
  station: 'Stationner',
  spy: 'Espionnage',
  attack: 'Attaque',
  colonize: 'Colonisation',
  recycle: 'Recyclage',
};

export default function Overview() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const utils = trpc.useUtils();

  const { data: planets, isLoading, isError, refetch } = trpc.planet.list.useQuery();

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

  const { data: allMovements } = trpc.fleet.movements.useQuery();
  const { data: recentEvents } = trpc.gameEvent.byPlanet.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const { data: gameConfig } = useGameConfig();

  const renameMutation = trpc.planet.rename.useMutation({
    onSuccess: () => {
      utils.planet.list.invalidate();
      setIsRenaming(false);
    },
  });

  if (isLoading) {
    return <OverviewSkeleton />;
  }

  if (isError && !planets) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader title="Vue d'ensemble" />
        <QueryError error={{ message: 'Impossible de charger vos planètes.' }} retry={() => refetch()} />
      </div>
    );
  }

  const planet = planets?.find((p) => p.id === planetId) ?? planets?.[0];
  if (!planet) {
    return (
      <div className="p-4">
        <EmptyState title="Aucune planete trouvee" description="Aucune planete n'est associee a votre compte." />
      </div>
    );
  }

  const activeBuilding = buildings?.find((b) => b.isUpgrading);
  const activeResearch = techs?.find((t) => t.isResearching);
  const activeQueue = queue?.filter((q) => q.endTime) ?? [];
  const hasActivity = activeBuilding || activeResearch || activeQueue.length > 0;

  const fleetMovements = allMovements?.filter(
    (m) => m.originPlanetId === planet.id,
  );

  return (
    <div className="space-y-4 p-4 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-6 lg:p-6 lg:space-y-0">
      <div className="lg:col-span-2 xl:col-span-3">
        <PageHeader title="Vue d'ensemble" />
      </div>

      {/* Planet header */}
      <section className="glass-card overflow-hidden lg:col-span-2 xl:col-span-3">
        {/* Planet hero image */}
        {planet.planetClassId && planet.planetImageIndex != null && (
          <div className="relative h-40 lg:h-56 w-full overflow-hidden">
            <img
              src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex)}
              alt={planet.name}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
          </div>
        )}

        <div className="p-4">
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
            <h2
              className={`text-lg font-semibold text-foreground ${!planet.renamed ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
              onClick={!planet.renamed ? () => { setNewName(planet.name); setIsRenaming(true); } : undefined}
              title={!planet.renamed ? 'Cliquer pour renommer' : undefined}
            >
              {planet.name}
            </h2>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            [{planet.galaxy}:{planet.system}:{planet.position}]
          </p>
        </div>
      </section>

      {/* Activities in progress */}
      {hasActivity && (
        <section className="glass-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Activites en cours</h2>
          <div className="space-y-3">
            {activeBuilding && activeBuilding.upgradeEndTime && (
              <div
                className="cursor-pointer space-y-1 rounded-md p-3 hover:bg-muted/50 border-l-2 border-l-primary"
                onClick={() => navigate('/buildings')}
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Construction</Badge>
                    <span>{activeBuilding.name} &rarr; Niv. {activeBuilding.currentLevel + 1}</span>
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
                className="cursor-pointer space-y-1 rounded-md p-3 hover:bg-muted/50 border-l-2 border-l-violet-500"
                onClick={() => navigate('/research')}
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Recherche</Badge>
                    <span>{activeResearch.name} &rarr; Niv. {activeResearch.currentLevel + 1}</span>
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
                className="cursor-pointer space-y-1 rounded-md p-3 hover:bg-muted/50 border-l-2 border-l-orange-500"
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
          </div>
        </section>
      )}

      {/* Fleet movements */}
      {fleetMovements && fleetMovements.length > 0 && (
        <section className="glass-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Mouvements de flotte</h2>
          <div className="space-y-3">
            {fleetMovements.map((event) => (
              <div
                key={event.id}
                className="cursor-pointer space-y-1 rounded-md p-3 hover:bg-muted/50 border-l-2 border-l-blue-500"
                onClick={() => navigate('/movements')}
              >
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {MISSION_LABELS[event.mission] ?? event.mission}
                    </Badge>
                    <span className="text-muted-foreground">
                      [{event.targetGalaxy}:{event.targetSystem}:{event.targetPosition}]
                    </span>
                  </div>
                </div>
                <Timer
                  endTime={new Date(event.arrivalTime)}
                  onComplete={() => utils.fleet.movements.invalidate()}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent events */}
      <section className="glass-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Événements récents</h2>
        {recentEvents && recentEvents.length > 0 ? (
          <div className="space-y-2">
            {groupEvents(recentEvents).map((event) => (
              <div key={event.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${eventTypeColor(event.type)}`} />
                  <span className="text-muted-foreground">{formatEventText(event)}</span>
                </div>
                <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">{formatRelativeTime(event.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun événement récent</p>
        )}
      </section>

      {/* Production /h summary */}
      <section className="glass-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Production /h</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-minerai glow-minerai">Minerai</span>
            <span>+{Math.floor(resourceData?.rates.mineraiPerHour ?? 0).toLocaleString('fr-FR')}/h</span>
          </div>
          <div className="flex justify-between">
            <span className="text-silicium glow-silicium">Silicium</span>
            <span>+{Math.floor(resourceData?.rates.siliciumPerHour ?? 0).toLocaleString('fr-FR')}/h</span>
          </div>
          <div className="flex justify-between">
            <span className="text-hydrogene glow-hydrogene">Hydrogene</span>
            <span>+{Math.floor(resourceData?.rates.hydrogenePerHour ?? 0).toLocaleString('fr-FR')}/h</span>
          </div>
        </div>
      </section>

      {/* Planet info */}
      <section className="glass-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Informations planete</h2>
        {(() => {
          const ptId = planet.planetClassId;
          const planetType = ptId ? gameConfig?.planetTypes?.find((t) => t.id === ptId) : null;
          return (
            <div className="space-y-2 text-sm">
              {planetType && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{planetType.name}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap text-xs">
                    {planetType.mineraiBonus !== 1 && (
                      <span className={planetType.mineraiBonus > 1 ? 'text-emerald-400' : 'text-red-400'}>
                        Minerai x{planetType.mineraiBonus}
                      </span>
                    )}
                    {planetType.siliciumBonus !== 1 && (
                      <span className={planetType.siliciumBonus > 1 ? 'text-emerald-400' : 'text-red-400'}>
                        Silicium x{planetType.siliciumBonus}
                      </span>
                    )}
                    {planetType.hydrogeneBonus !== 1 && (
                      <span className={planetType.hydrogeneBonus > 1 ? 'text-emerald-400' : 'text-red-400'}>
                        Hydrogene x{planetType.hydrogeneBonus}
                      </span>
                    )}
                    {planetType.fieldsBonus !== 1 && (
                      <span className={planetType.fieldsBonus > 1 ? 'text-emerald-400' : 'text-red-400'}>
                        Cases x{planetType.fieldsBonus}
                      </span>
                    )}
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Champs</span>
                <span>0 / {planet.maxFields}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Temperature</span>
                <span>{planet.minTemp}&deg;C a {planet.maxTemp}&deg;C</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diametre</span>
                <span>{planet.diameter.toLocaleString('fr-FR')} km</span>
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
