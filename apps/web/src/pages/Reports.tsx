import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName, getDefenseName, getBuildingName, getResearchName, getUnitName } from '@/lib/entity-names';
import { cn } from '@/lib/utils';

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function formatCoords(coords: { galaxy: number; system: number; position: number }) {
  return `[${coords.galaxy}:${coords.system}:${coords.position}]`;
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const { data: gameConfig } = useGameConfig();
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const loaderRef = useRef<HTMLDivElement>(null);
  const lastAppendedCursorRef = useRef<string | undefined>(undefined);

  const currentCursor = cursors[cursors.length - 1];

  const { data, isFetching } = trpc.report.list.useQuery(
    { cursor: currentCursor, limit: 20, missionTypes: typeFilter.length > 0 ? typeFilter as any : undefined },
    { placeholderData: (prev: any) => prev },
  );

  const pages = useRef<Map<string | undefined, any[]>>(new Map());
  if (data && data.reports.length > 0) {
    pages.current.set(currentCursor, data.reports);
  }

  const handleFilterChange = (type: string) => {
    setTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    pages.current.clear();
    setCursors([undefined]);
    lastAppendedCursorRef.current = undefined;
  };

  const handleLoadMore = useCallback(() => {
    if (data?.nextCursor && !isFetching && lastAppendedCursorRef.current !== data.nextCursor) {
      lastAppendedCursorRef.current = data.nextCursor;
      setCursors((prev) => [...prev, data.nextCursor]);
    }
  }, [data?.nextCursor, isFetching]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore(); },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  const allReports = Array.from(pages.current.values()).flat();
  const hasMore = !!data?.nextCursor;

  const { data: selectedReport } = trpc.report.detail.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId },
  );

  const utils = trpc.useUtils();
  const deleteMutation = trpc.report.delete.useMutation({
    onSuccess: () => {
      pages.current.clear();
      setCursors([undefined]);
      lastAppendedCursorRef.current = undefined;
      utils.report.list.invalidate();
      setSearchParams({});
    },
  });

  useEffect(() => {
    if (!selectedId && allReports.length > 0 && window.innerWidth >= 1024) {
      setSearchParams({ id: allReports[0].id });
    }
  }, [allReports.length]);

  const selectReport = (id: string) => setSearchParams({ id });

  /* ---- Shared sub-components ---- */

  const filterPills = (
    <div className="flex flex-wrap gap-2">
      {Object.entries(gameConfig?.missions ?? {}).map(([type, mission]) => (
        <button
          key={type}
          onClick={() => handleFilterChange(type)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
            typeFilter.includes(type)
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          {mission.label}
        </button>
      ))}
    </div>
  );

  const reportList = (
    <section className="glass-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Rapports</h2>
      <div className="space-y-1">
        {isFetching && allReports.length === 0 && (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        )}
        {!isFetching && allReports.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun rapport.</p>
        )}
        {allReports.map((report) => (
          <button
            key={report.id}
            onClick={() => selectReport(report.id)}
            className={`w-full text-left rounded px-3 py-2 text-sm transition-colors ${
              report.id === selectedId ? 'bg-primary/10' : 'hover:bg-accent'
            } ${!report.read ? 'font-bold' : ''}`}
          >
            <div className="flex justify-between">
              <span className="truncate">{report.title}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                {new Date(report.createdAt).toLocaleDateString('fr-FR')}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {gameConfig?.missions[report.missionType]?.label ?? report.missionType}
            </div>
          </button>
        ))}
        {hasMore && (
          <div ref={loaderRef} className="flex justify-center py-2">
            {isFetching && <span className="text-xs text-muted-foreground">Chargement...</span>}
          </div>
        )}
      </div>
    </section>
  );

  const reportDetail = selectedId && selectedReport ? (
    <section className="glass-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-foreground">{selectedReport.title}</h2>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => deleteMutation.mutate({ id: selectedReport.id })}
          disabled={deleteMutation.isPending}
        >
          Supprimer
        </Button>
      </div>
      <div className="text-xs text-muted-foreground mb-4">
        {gameConfig?.missions[selectedReport.missionType]?.label ?? selectedReport.missionType} — Cible : {formatCoords(selectedReport.coordinates as any)}
        {!!(selectedReport.originCoordinates as any) && (
          <> — Origine : {(selectedReport.originCoordinates as any).planetName} {formatCoords(selectedReport.originCoordinates as any)}</>
        )}
      </div>
      <div className="text-xs text-muted-foreground mb-4">
        Envoi : {formatDate(selectedReport.departureTime)} — Fin : {formatDate(selectedReport.completionTime)}
      </div>

      <div className="space-y-4">
        {/* Fleet — hide if empty (defender attack reports) */}
        {Object.keys((selectedReport.fleet as any).ships ?? {}).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flotte</h3>
            <div className="rounded border border-border p-3">
              <div className="flex flex-wrap gap-3">
                {Object.entries((selectedReport.fleet as any).ships).map(([ship, count]) => (
                  <span key={ship} className="text-sm">
                    <span className="text-foreground">{String(count)}x</span>{' '}
                    <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
                  </span>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Capacite cargo : {((selectedReport.fleet as any).totalCargo ?? 0).toLocaleString('fr-FR')}
              </div>
            </div>
          </div>
        )}

        {/* Mine-specific results */}
        {selectedReport.missionType === 'mine' && (() => {
          const result = selectedReport.result as any;
          return (
            <>
              {/* Resources */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ressources extraites</h3>
                <div className="rounded border border-border p-3">
                  <div className="flex flex-wrap gap-4">
                    {Object.entries(result.rewards ?? {}).map(([resource, amount]) => (
                      <div key={resource} className="flex items-center gap-2">
                        <span className={cn('text-lg font-bold', RESOURCE_COLORS[resource])}>
                          +{(amount as number).toLocaleString('fr-FR')}
                        </span>
                        <span className="text-sm text-muted-foreground capitalize">{resource}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Slag */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Scories</h3>
                <div className="rounded border border-border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500/70"
                        style={{ width: `${Math.round((result.slagRate ?? 0) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-amber-400">
                      {Math.round((result.slagRate ?? 0) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Technologies */}
              {result.technologies?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Technologies</h3>
                  <div className="rounded border border-border p-3 space-y-2">
                    {result.technologies.map((tech: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">
                          {tech.name === 'deepSpaceRefining' ? 'Raffinage spatial profond' : 'Bonus de minage'}
                          {tech.level != null && <span className="text-primary ml-1">Niv. {tech.level}</span>}
                        </span>
                        <span className="text-muted-foreground">{tech.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Spy-specific results */}
        {selectedReport.missionType === 'spy' && (() => {
          const result = selectedReport.result as any;
          const visibility = result.visibility ?? {};
          const visibilityKeys = ['resources', 'fleet', 'defenses', 'buildings', 'research'] as const;
          return (
            <>
              {/* Visibility & Detection */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Informations obtenues</h3>
                <div className="rounded border border-border p-3">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {visibilityKeys.map((key) => (
                      <span
                        key={key}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium',
                          visibility[key]
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-white/5 text-muted-foreground',
                        )}
                      >
                        {visibility[key] ? '\u2713' : '\u2717'} {gameConfig?.labels[`spy_visibility.${key}`] ?? key}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>Sondes : <span className="text-foreground font-medium">{result.probeCount}</span></span>
                    <span>Tech espionnage : <span className="text-foreground font-medium">{result.attackerTech}</span> vs <span className="text-foreground font-medium">{result.defenderTech}</span></span>
                    <span>Chance de détection : <span className={cn('font-medium', result.detectionChance > 50 ? 'text-red-400' : 'text-foreground')}>{result.detectionChance}%</span></span>
                    {result.detected && <span className="text-red-400 font-medium">Sondes détruites</span>}
                  </div>
                </div>
              </div>

              {/* Resources */}
              {result.resources && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ressources</h3>
                  <div className="rounded border border-border p-3">
                    <div className="flex flex-wrap gap-4">
                      {Object.entries(result.resources as Record<string, number>).map(([resource, amount]) => (
                        <div key={resource} className="flex items-center gap-2">
                          <span className={cn('text-lg font-bold', RESOURCE_COLORS[resource])}>
                            {(amount as number).toLocaleString('fr-FR')}
                          </span>
                          <span className="text-sm text-muted-foreground capitalize">{resource}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Fleet */}
              {result.fleet && Object.keys(result.fleet).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flotte ennemie</h3>
                  <div className="rounded border border-border p-3">
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(result.fleet as Record<string, number>).map(([ship, count]) => (
                        <span key={ship} className="text-sm">
                          <span className="text-foreground font-medium">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                          <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Defenses */}
              {result.defenses && Object.keys(result.defenses).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Défenses</h3>
                  <div className="rounded border border-border p-3">
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(result.defenses as Record<string, number>).map(([def, count]) => (
                        <span key={def} className="text-sm">
                          <span className="text-foreground font-medium">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                          <span className="text-muted-foreground">{getDefenseName(def, gameConfig)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Buildings */}
              {result.buildings && Object.keys(result.buildings).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Bâtiments</h3>
                  <div className="rounded border border-border p-3 space-y-1">
                    {Object.entries(result.buildings as Record<string, number>).map(([building, level]) => (
                      <div key={building} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{getBuildingName(building, gameConfig)}</span>
                        <span className="text-foreground font-medium">Niv. {level as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Research */}
              {result.research && Object.keys(result.research).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recherches</h3>
                  <div className="rounded border border-border p-3 space-y-1">
                    {Object.entries(result.research as Record<string, number>).map(([tech, level]) => (
                      <div key={tech} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{getResearchName(tech, gameConfig)}</span>
                        <span className="text-foreground font-medium">Niv. {level as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Attack-specific results */}
        {selectedReport.missionType === 'attack' && (() => {
          const result = selectedReport.result as any;
          const OUTCOME_STYLES: Record<string, string> = {
            attacker: 'bg-emerald-500/20 text-emerald-400',
            defender: 'bg-red-500/20 text-red-400',
            draw: 'bg-amber-500/20 text-amber-400',
          };
          const outcomeClassName = OUTCOME_STYLES[result.outcome] ?? OUTCOME_STYLES.draw;
          const outcomeLabel = gameConfig?.labels[`outcome.${result.outcome}`] ?? result.outcome;
          const hasAttackerLosses = result.attackerLosses && Object.keys(result.attackerLosses).length > 0;
          const hasDefenderLosses = result.defenderLosses && Object.keys(result.defenderLosses).length > 0;
          return (
            <>
              {/* Outcome */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resultat</h3>
                <div className="rounded border border-border p-3">
                  <div className="flex items-center gap-3">
                    <span className={cn('rounded-full px-4 py-1.5 text-sm font-bold', outcomeClassName)}>
                      {outcomeLabel}
                    </span>
                    <span className="text-sm text-muted-foreground">{result.roundCount} round{result.roundCount > 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Initial forces — attacker + defender */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Forces initiales</h3>
                <div className="rounded border border-border p-3 space-y-3">
                  {result.attackerFleet && Object.keys(result.attackerFleet).length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Attaquant</div>
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(result.attackerFleet as Record<string, number>).map(([ship, count]) => (
                          <span key={ship} className="text-sm">
                            <span className="text-foreground font-medium">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                            <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {((result.defenderFleet && Object.keys(result.defenderFleet).length > 0) ||
                    (result.defenderDefenses && Object.keys(result.defenderDefenses).length > 0)) && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Defenseur</div>
                      <div className="flex flex-wrap gap-3">
                        {result.defenderFleet && Object.entries(result.defenderFleet as Record<string, number>).map(([ship, count]) => (
                          <span key={ship} className="text-sm">
                            <span className="text-foreground font-medium">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                            <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
                          </span>
                        ))}
                        {result.defenderDefenses && Object.entries(result.defenderDefenses as Record<string, number>).map(([def, count]) => (
                          <span key={def} className="text-sm">
                            <span className="text-foreground font-medium">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                            <span className="text-muted-foreground">{getDefenseName(def, gameConfig)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Round-by-round detail — collapsible */}
              {result.rounds && result.rounds.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Detail des rounds</h3>
                  <div className="space-y-1">
                    {(result.rounds as any[]).map((round: any) => (
                      <details key={round.round} className="rounded border border-border">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors">
                          Round {round.round}
                          <span className="ml-3 text-xs text-muted-foreground">
                            Att: {round.attackersRemaining} — Def: {round.defendersRemaining}
                          </span>
                        </summary>
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
                          {round.attackerShips && Object.keys(round.attackerShips).length > 0 && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Attaquant</div>
                              <div className="flex flex-wrap gap-3">
                                {Object.entries(round.attackerShips as Record<string, number>).map(([ship, count]) => (
                                  <span key={ship} className="text-xs">
                                    <span className="text-foreground">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                                    <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {round.defenderShips && Object.keys(round.defenderShips).length > 0 && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Defenseur</div>
                              <div className="flex flex-wrap gap-3">
                                {Object.entries(round.defenderShips as Record<string, number>).map(([ship, count]) => (
                                  <span key={ship} className="text-xs">
                                    <span className="text-foreground">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                                    <span className="text-muted-foreground">{getUnitName(ship, gameConfig)}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {round.attackerShips && Object.keys(round.attackerShips).length === 0 &&
                           round.defenderShips && Object.keys(round.defenderShips).length === 0 && (
                            <div className="text-xs text-muted-foreground">Toutes les unites ont ete detruites</div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {/* Survivors */}
              {(result.attackerSurvivors || result.defenderSurvivors) && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Survivants</h3>
                  <div className="rounded border border-border p-3 space-y-3">
                    {result.attackerSurvivors && Object.keys(result.attackerSurvivors).length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Attaquant</div>
                        <div className="flex flex-wrap gap-3">
                          {Object.entries(result.attackerSurvivors as Record<string, number>).map(([ship, count]) => (
                            <span key={ship} className="text-sm">
                              <span className="text-emerald-400 font-medium">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                              <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.defenderSurvivors && Object.keys(result.defenderSurvivors).length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Defenseur</div>
                        <div className="flex flex-wrap gap-3">
                          {Object.entries(result.defenderSurvivors as Record<string, number>).map(([ship, count]) => (
                            <span key={ship} className="text-sm">
                              <span className="text-emerald-400 font-medium">{(count as number).toLocaleString('fr-FR')}x</span>{' '}
                              <span className="text-muted-foreground">{getUnitName(ship, gameConfig)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(!result.attackerSurvivors || Object.keys(result.attackerSurvivors).length === 0) &&
                     (!result.defenderSurvivors || Object.keys(result.defenderSurvivors).length === 0) && (
                      <div className="text-sm text-muted-foreground">Aucun survivant</div>
                    )}
                  </div>
                </div>
              )}

              {/* Losses */}
              {(hasAttackerLosses || hasDefenderLosses) && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pertes</h3>
                  <div className="rounded border border-border p-3 space-y-3">
                    {hasAttackerLosses && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Attaquant</div>
                        <div className="flex flex-wrap gap-3">
                          {Object.entries(result.attackerLosses as Record<string, number>).map(([ship, count]) => (
                            <span key={ship} className="text-sm">
                              <span className="text-red-400 font-medium">-{(count as number).toLocaleString('fr-FR')}</span>{' '}
                              <span className="text-muted-foreground">{getShipName(ship, gameConfig)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {hasDefenderLosses && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Defenseur</div>
                        <div className="flex flex-wrap gap-3">
                          {Object.entries(result.defenderLosses as Record<string, number>).map(([unit, count]) => (
                            <span key={unit} className="text-sm">
                              <span className="text-red-400 font-medium">-{(count as number).toLocaleString('fr-FR')}</span>{' '}
                              <span className="text-muted-foreground">{getUnitName(unit, gameConfig)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Repaired defenses */}
              {result.repairedDefenses && Object.keys(result.repairedDefenses).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Defenses reparees</h3>
                  <div className="rounded border border-border p-3">
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(result.repairedDefenses as Record<string, number>).map(([def, count]) => (
                        <span key={def} className="text-sm">
                          <span className="text-emerald-400 font-medium">+{(count as number).toLocaleString('fr-FR')}</span>{' '}
                          <span className="text-muted-foreground">{getDefenseName(def, gameConfig)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Debris */}
              {result.debris && (result.debris.minerai > 0 || result.debris.silicium > 0) && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Champ de debris</h3>
                  <div className="rounded border border-border p-3">
                    <div className="flex flex-wrap gap-4">
                      {result.debris.minerai > 0 && (
                        <div className="flex items-center gap-2">
                          <span className={cn('text-lg font-bold', RESOURCE_COLORS.minerai)}>
                            {(result.debris.minerai as number).toLocaleString('fr-FR')}
                          </span>
                          <span className="text-sm text-muted-foreground">Minerai</span>
                        </div>
                      )}
                      {result.debris.silicium > 0 && (
                        <div className="flex items-center gap-2">
                          <span className={cn('text-lg font-bold', RESOURCE_COLORS.silicium)}>
                            {(result.debris.silicium as number).toLocaleString('fr-FR')}
                          </span>
                          <span className="text-sm text-muted-foreground">Silicium</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Pillage */}
              {result.pillage && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ressources pillees</h3>
                  <div className="rounded border border-border p-3">
                    <div className="flex flex-wrap gap-4">
                      {Object.entries(result.pillage as Record<string, number>).map(([resource, amount]) => (
                        <div key={resource} className="flex items-center gap-2">
                          <span className={cn('text-lg font-bold', RESOURCE_COLORS[resource])}>
                            +{(amount as number).toLocaleString('fr-FR')}
                          </span>
                          <span className="text-sm text-muted-foreground capitalize">{resource}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </section>
  ) : null;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Rapports de mission" />

      {/* Filter pills */}
      {filterPills}

      {/* Main layout: mobile=stack, lg=2col */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_1.5fr]">
        {/* Report list */}
        {reportList}

        {/* Detail panel (lg+ desktop) */}
        <div className="hidden lg:block">
          {reportDetail ?? (
            <div className="glass-card p-8 text-center text-sm text-muted-foreground">
              Selectionnez un rapport pour voir les details
            </div>
          )}
        </div>
      </div>

      {/* Mobile/tablet detail overlay (below lg) */}
      {selectedId && selectedReport && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/95 overflow-y-auto p-4 animate-slide-up">
          <Button
            variant="outline"
            size="sm"
            className="mb-4"
            onClick={() => setSearchParams({})}
          >
            ← Retour
          </Button>
          {reportDetail}
        </div>
      )}
    </div>
  );
}
