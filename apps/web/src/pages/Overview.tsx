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
import {
  HistoryIcon,
  MovementsIcon,
  MissionsIcon,
  FleetIcon,
  DefenseIcon,
  OverviewIcon,
  MoreIcon,
  BuildingsIcon,
  ResearchIcon,
  ShipyardIcon,
  GalaxyIcon,
} from '@/lib/icons';

const MISSION_LABELS: Record<string, string> = {
  transport: 'Transport',
  station: 'Stationner',
  spy: 'Espionnage',
  attack: 'Attaque',
  colonize: 'Colonisation',
  recycle: 'Recyclage',
};

// ── Circular gauge (inline, used only here) ──

function ResourceGauge({ current, capacity, rate, label, color }: {
  current: number;
  capacity: number;
  rate: number;
  label: string;
  color: string;
}) {
  const pct = capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="text-center">
      <div className="relative w-[66px] h-[66px] flex items-center justify-center mx-auto">
        <svg className="absolute top-0 left-0 -rotate-90" width={66} height={66}>
          <circle cx={33} cy={33} r={radius} fill="none" stroke={color} strokeWidth={3} opacity={0.2} />
          <circle
            cx={33} cy={33} r={radius} fill="none" stroke={color} strokeWidth={3}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          />
        </svg>
        <span className="text-xs font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="text-[10px] mt-1 font-medium" style={{ color }}>{label}</div>
      <div className="text-[10px] text-muted-foreground">+{Math.floor(rate).toLocaleString('fr-FR')}/h</div>
    </div>
  );
}

// ── Production & Storage card (isolated to avoid re-rendering the whole page every second) ──

function ProductionStorageCard({ planetId }: { planetId: string }) {
  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId },
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

  return (
    <section className="glass-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        Production & Stockage
      </h2>
      <div className="flex justify-around py-2">
        <ResourceGauge
          current={resources?.minerai ?? 0}
          capacity={resourceData?.rates.storageMineraiCapacity ?? 1}
          rate={resourceData?.rates.mineraiPerHour ?? 0}
          label="Minerai"
          color="#f59e0b"
        />
        <ResourceGauge
          current={resources?.silicium ?? 0}
          capacity={resourceData?.rates.storageSiliciumCapacity ?? 1}
          rate={resourceData?.rates.siliciumPerHour ?? 0}
          label="Silicium"
          color="#06b6d4"
        />
        <ResourceGauge
          current={resources?.hydrogene ?? 0}
          capacity={resourceData?.rates.storageHydrogeneCapacity ?? 1}
          rate={resourceData?.rates.hydrogenePerHour ?? 0}
          label="Hydrogene"
          color="#10b981"
        />
      </div>
    </section>
  );
}

// ── Quick action button ──

function QuickAction({ icon: Icon, label, to }: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  to: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/50 text-sm text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
    >
      <Icon width={16} height={16} className="opacity-70" />
      {label}
    </button>
  );
}

export default function Overview() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const utils = trpc.useUtils();

  const { data: gameConfig } = useGameConfig();
  const { data: planets, isLoading, isError, refetch } = trpc.planet.list.useQuery();

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
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

  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: defenses } = trpc.shipyard.defenses.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: allMovements } = trpc.fleet.movements.useQuery();
  const { data: recentEvents } = trpc.gameEvent.byPlanet.useQuery(
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
    return <OverviewSkeleton />;
  }

  if (isError && !planets) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader title="Vue d'ensemble" />
        <QueryError error={{ message: 'Impossible de charger vos planetes.' }} retry={() => refetch()} />
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

  const stationaryShips = ships?.filter((s) => s.count > 0) ?? [];
  const stationaryDefenses = defenses?.filter((d) => d.count > 0) ?? [];
  const usedFields = buildings?.reduce((sum, b) => sum + b.currentLevel, 0) ?? 0;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Vue d'ensemble" />

      {/* ════ HERO ════ */}
      <section className="glass-card overflow-hidden rounded-xl">
        <div className="relative h-40 lg:h-56 w-full overflow-hidden">
          {planet.planetClassId && planet.planetImageIndex != null ? (
            <img
              src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex)}
              alt={planet.name}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 flex justify-between items-end">
            <div>
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
                  <Button type="submit" size="sm" disabled={renameMutation.isPending}>OK</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setIsRenaming(false)}>Annuler</Button>
                </form>
              ) : (
                <h2
                  className={`text-xl lg:text-2xl font-bold text-white ${!planet.renamed ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
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
            <div className="text-right text-sm text-muted-foreground">
              <div><span className="text-foreground">{planet.minTemp}&deg;C</span> a <span className="text-foreground">{planet.maxTemp}&deg;C</span></div>
              <div><span className="text-foreground">{planet.diameter.toLocaleString('fr-FR')}</span> km</div>
            </div>
          </div>
        </div>
      </section>

      {/* ════ LAYOUT: main + sidebar ════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 lg:gap-6">

        {/* ── COLONNE PRINCIPALE ── */}
        <div className="flex flex-col gap-4">

          {/* Activites en cours */}
          {hasActivity && (
            <section className="glass-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <HistoryIcon width={16} height={16} className="opacity-70" />
                Activites en cours
              </h2>
              <div className="space-y-2">
                {activeBuilding && activeBuilding.upgradeEndTime && (
                  <div
                    className="flex gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate('/buildings')}
                  >
                    <div className="w-9 h-9 rounded-md bg-blue-500/15 text-blue-400 flex items-center justify-center flex-shrink-0">
                      <BuildingsIcon width={18} height={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground font-medium">{activeBuilding.name}</span>
                        <span className="text-muted-foreground text-xs">Niv. {activeBuilding.currentLevel + 1}</span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-blue-500/15">
                        <div
                          className="h-full rounded-full"
                          style={{
                            background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                            width: `${Math.max(2, Math.min(100, ((activeBuilding.nextLevelTime - (new Date(activeBuilding.upgradeEndTime).getTime() - Date.now()) / 1000) / activeBuilding.nextLevelTime) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1">
                        <Timer
                          endTime={new Date(activeBuilding.upgradeEndTime)}
                          totalDuration={activeBuilding.nextLevelTime}
                          className="text-[10px] text-muted-foreground"
                          onComplete={() => {
                            utils.building.list.invalidate({ planetId: planetId! });
                            utils.resource.production.invalidate({ planetId: planetId! });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeResearch && activeResearch.researchEndTime && (
                  <div
                    className="flex gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate('/research')}
                  >
                    <div className="w-9 h-9 rounded-md bg-violet-500/15 text-violet-400 flex items-center justify-center flex-shrink-0">
                      <ResearchIcon width={18} height={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground font-medium">{activeResearch.name}</span>
                        <span className="text-muted-foreground text-xs">Niv. {activeResearch.currentLevel + 1}</span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-violet-500/15">
                        <div
                          className="h-full rounded-full"
                          style={{
                            background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                            width: `${Math.max(2, Math.min(100, ((activeResearch.nextLevelTime - (new Date(activeResearch.researchEndTime).getTime() - Date.now()) / 1000) / activeResearch.nextLevelTime) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1">
                        <Timer
                          endTime={new Date(activeResearch.researchEndTime)}
                          totalDuration={activeResearch.nextLevelTime}
                          className="text-[10px] text-muted-foreground"
                          onComplete={() => {
                            utils.research.list.invalidate({ planetId: planetId! });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate('/shipyard')}
                  >
                    <div className="w-9 h-9 rounded-md bg-orange-500/15 text-orange-400 flex items-center justify-center flex-shrink-0">
                      <ShipyardIcon width={18} height={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm">
                        <span className="text-foreground font-medium">{gameConfig?.ships[item.itemId]?.name ?? gameConfig?.defenses[item.itemId]?.name ?? item.itemId}</span>
                        <span className="text-muted-foreground text-xs">x{item.quantity - (item.completedCount ?? 0)}</span>
                      </div>
                      {item.endTime && (
                        <>
                          <div className="mt-1.5 h-1 rounded-full bg-orange-500/15">
                            <div
                              className="h-full rounded-full"
                              style={{
                                background: 'linear-gradient(90deg, #f97316, #fb923c)',
                                width: `${Math.max(2, Math.min(100, ((Date.now() - new Date(item.startTime).getTime()) / (new Date(item.endTime).getTime() - new Date(item.startTime).getTime())) * 100))}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1">
                            <Timer
                              endTime={new Date(item.endTime)}
                              totalDuration={Math.floor((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 1000)}
                              className="text-[10px] text-muted-foreground"
                              onComplete={() => {
                                utils.shipyard.queue.invalidate({ planetId: planetId! });
                                utils.shipyard.ships.invalidate({ planetId: planetId! });
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Mouvements de flotte */}
          {fleetMovements && fleetMovements.length > 0 && (
            <section className="glass-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <MovementsIcon width={16} height={16} className="opacity-70" />
                Mouvements de flotte
              </h2>
              <div className="space-y-1.5">
                {fleetMovements.map((event) => {
                  const isReturn = event.phase === 'return';
                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 px-2.5 py-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate('/movements')}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          background: isReturn ? '#22c55e' : '#3b82f6',
                          boxShadow: isReturn ? '0 0 6px rgba(34,197,94,0.5)' : '0 0 6px rgba(59,130,246,0.5)',
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground font-medium">
                          {isReturn ? 'Retour — ' : ''}{MISSION_LABELS[event.mission] ?? event.mission}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          [{event.targetGalaxy}:{event.targetSystem}:{event.targetPosition}]
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground flex-shrink-0">
                        <Timer
                          endTime={new Date(event.arrivalTime)}
                          onComplete={() => utils.fleet.movements.invalidate()}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Evenements recents */}
          <section className="glass-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <MissionsIcon width={16} height={16} className="opacity-70" />
              Evenements recents
            </h2>
            {recentEvents && recentEvents.length > 0 ? (
              <div className="space-y-0.5">
                {groupEvents(recentEvents).map((event) => (
                  <div key={event.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${eventTypeColor(event.type)}`} />
                      <span className="text-muted-foreground">{formatEventText(event)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground/60 shrink-0 ml-2">{formatRelativeTime(event.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun evenement recent</p>
            )}
          </section>

          {/* Flotte stationnee */}
          {stationaryShips.length > 0 && (
            <section className="glass-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <FleetIcon width={16} height={16} className="opacity-70" />
                Flotte stationnee
              </h2>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {stationaryShips.map((ship) => (
                  <div key={ship.id} className="flex justify-between px-2 py-1.5 rounded bg-muted/30">
                    <span className="text-muted-foreground">{ship.name}</span>
                    <span className="text-foreground font-semibold">{ship.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Defenses planetaires */}
          {stationaryDefenses.length > 0 && (
            <section className="glass-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <DefenseIcon width={16} height={16} className="opacity-70" />
                Defenses planetaires
              </h2>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {stationaryDefenses.map((def) => (
                  <div key={def.id} className="flex justify-between px-2 py-1.5 rounded bg-muted/30">
                    <span className="text-muted-foreground">{def.name}</span>
                    <span className="text-foreground font-semibold">{def.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── SIDEBAR ── */}
        <div className="flex flex-col gap-4">

          {/* Production & Stockage (isolated component — re-renders every 1s without affecting the rest) */}
          {planetId && <ProductionStorageCard planetId={planetId} />}

          {/* Informations planete */}
          <section className="glass-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <OverviewIcon width={16} height={16} className="opacity-70" />
              Informations planete
            </h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Cases</span>
                <span className="text-foreground font-medium">{usedFields} / {planet.maxFields}</span>
              </div>
              <div className="mx-0 my-1">
                <div className="h-1 rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${planet.maxFields > 0 ? Math.min(100, (usedFields / planet.maxFields) * 100) : 0}%`,
                      background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Energie</span>
                <span className="font-medium" style={{ color: (resourceData?.rates.energyProduced ?? 0) >= (resourceData?.rates.energyConsumed ?? 0) ? '#facc15' : '#f87171' }}>
                  {Math.floor(resourceData?.rates.energyProduced ?? 0) - Math.floor(resourceData?.rates.energyConsumed ?? 0)} / {Math.floor(resourceData?.rates.energyProduced ?? 0)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Diametre</span>
                <span className="text-foreground font-medium">{planet.diameter.toLocaleString('fr-FR')} km</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Temperature</span>
                <span className="text-foreground font-medium">{planet.minTemp}&deg;C a {planet.maxTemp}&deg;C</span>
              </div>
            </div>
          </section>

          {/* Actions rapides */}
          <section className="glass-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <MoreIcon width={16} height={16} className="opacity-70" />
              Actions rapides
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction icon={BuildingsIcon} label="Batiments" to="/buildings" />
              <QuickAction icon={ResearchIcon} label="Recherche" to="/research" />
              <QuickAction icon={ShipyardIcon} label="Chantier" to="/shipyard" />
              <QuickAction icon={DefenseIcon} label="Defenses" to="/defense" />
              <QuickAction icon={FleetIcon} label="Flotte" to="/fleet" />
              <QuickAction icon={GalaxyIcon} label="Galaxie" to="/galaxy" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
