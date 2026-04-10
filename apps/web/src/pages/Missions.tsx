import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { Timer } from '@/components/common/Timer';
import { useGameConfig } from '@/hooks/useGameConfig';

const fmt = (n: number) => Number(n).toLocaleString('fr-FR');

const TIER_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/40',
  medium: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  hard: 'bg-red-500/20 text-red-400 border-red-500/40',
};

export default function Missions() {
  const [combatInfoOpen, setCombatInfoOpen] = useState(false);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();
  const { data, isLoading } = trpc.pve.getMissions.useQuery();
  const { data: movements } = trpc.fleet.movements.useQuery();
  const dismissMutation = trpc.pve.dismissMission.useMutation({
    onSuccess: () => {
      utils.pve.getMissions.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Missions" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  const centerLevel = data?.centerLevel ?? 0;
  const missions = data?.missions ?? [];
  const nextDiscoveryAt = data?.nextDiscoveryAt ? new Date(data.nextDiscoveryAt) : null;
  const nextDiscoveryInFuture = nextDiscoveryAt && nextDiscoveryAt.getTime() > Date.now();

  const miningMissions = missions.filter((m) => m.missionType === 'mine');
  const pirateMissions = missions.filter((m) => m.missionType === 'pirate');

  // Build lookup: pveMissionId → active fleet events
  const fleetsByMission = new Map<string, typeof movements>();
  if (movements) {
    for (const m of movements) {
      if (m.pveMissionId) {
        const existing = fleetsByMission.get(m.pveMissionId);
        if (existing) {
          existing.push(m);
        } else {
          fleetsByMission.set(m.pveMissionId, [m]);
        }
      }
    }
  }

  const phaseLabel = (phase: string): string =>
    gameConfig?.labels?.[`phase.${phase}`] ?? phase;

  if (centerLevel === 0) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Missions" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Avant de pouvoir acceder aux missions, veuillez construire le <span className="text-foreground font-semibold">Centre de missions</span>.
          </p>
          <Link to="/buildings" className="text-xs text-primary hover:underline">
            Aller aux batiments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Missions" />

      {/* Status bar */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-muted-foreground">Centre de missions :</span>
          <span className="font-semibold text-primary">Niveau {centerLevel}</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">
            {miningMissions.length}/3 gisement{miningMissions.length !== 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {pirateMissions.length}/2 repaire{pirateMissions.length !== 1 ? 's' : ''} pirate{pirateMissions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {nextDiscoveryInFuture && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Prochaine découverte dans</span>
            <Timer
              endTime={nextDiscoveryAt}
              onComplete={() => utils.pve.getMissions.invalidate()}
            />
          </div>
        )}
      </div>

      {/* Explainer */}
      <div className="glass-card border-primary/20 bg-primary/5 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Comment fonctionnent les missions ?</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Votre Centre de missions <span className="text-foreground">découvre automatiquement</span> des gisements et des repaires pirates toutes les <span className="text-foreground">{Math.max(1, 7 - centerLevel)}h</span> (6h au niv. 1, −1h/niveau, min 1h).</li>
          <li>Jusqu&apos;à <span className="text-foreground">3 gisements</span> et <span className="text-foreground">2 repaires pirates</span> peuvent être découverts simultanément.</li>
          <li>Un gisement reste exploitable <span className="text-foreground">tant qu&apos;il contient des ressources</span> — envoyez plusieurs flottes pour le vider.</li>
          <li>Un repaire pirate est une <span className="text-foreground">mission de combat unique</span> — détruisez les pirates pour récupérer leur butin et potentiellement des vaisseaux bonus.</li>
          <li><span className="text-foreground">Pensez à envoyer des cargos</span> avec vos flottes ! Les ressources extraites ou pillées sont <span className="text-foreground">limitées par la capacité de soute</span> de votre flotte — sans cargos, vos vaisseaux ne pourront rien ramener.</li>
          <li>Vous pouvez <span className="text-foreground">annuler</span> un gisement pour libérer un emplacement (cooldown 24h).</li>
        </ul>
      </div>

      {/* ═══ Mining section ═══ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
          </svg>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
            Gisements découverts
          </h2>
          <span className="text-[10px] text-muted-foreground/60 ml-auto">{miningMissions.length}/3</span>
        </div>

        {miningMissions.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun gisement découvert pour le moment.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {miningMissions.map((mission) => {
              const params = mission.parameters as Record<string, any>;
              const rewards = mission.rewards as Record<string, any>;
              return (
                <div key={mission.id} className="glass-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Extraction minière</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Coordonnées : [{params.galaxy}:{params.system}:{params.position}]
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Ressources estimées :</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {rewards.minerai > 0 && <span className="text-minerai">M: {fmt(rewards.minerai)}</span>}
                      {rewards.silicium > 0 && <span className="text-silicium">S: {fmt(rewards.silicium)}</span>}
                      {rewards.hydrogene > 0 && <span className="text-hydrogene">H: {fmt(rewards.hydrogene)}</span>}
                    </div>
                  </div>
                  {/* Fleet en route indicator */}
                  {fleetsByMission.get(mission.id)?.map((fleet) => (
                    <div
                      key={fleet.id}
                      className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                      <span className="text-[11px] text-blue-300">
                        {phaseLabel(fleet.phase)}
                      </span>
                      <Timer
                        endTime={new Date(fleet.arrivalTime)}
                        onComplete={() => utils.fleet.movements.invalidate()}
                        className="text-[11px] text-blue-400"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/fleet/send?mission=mine&galaxy=${params.galaxy}&system=${params.system}&position=${params.position}&pveMissionId=${mission.id}`)}
                    >
                      Envoyer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => dismissMutation.mutate({ missionId: mission.id })}
                      disabled={dismissMutation.isPending}
                      title="Annuler ce gisement"
                    >
                      Annuler
                    </Button>
                  </div>
                  {dismissMutation.error && (
                    <div className="text-xs text-red-400">{dismissMutation.error.message}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ Pirate section ═══ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 15s1.5-2 4-2 4 2 4 2" />
            <path d="M9 9l.01 0M15 9l.01 0" />
          </svg>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-400">
            Repaires pirates
          </h2>
          <span className="text-[10px] text-muted-foreground/60 ml-auto">{pirateMissions.length}/2</span>
        </div>

        {/* Combat info encart */}
        <div className="glass-card border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setCombatInfoOpen(!combatInfoOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="text-xs text-muted-foreground">
              Le <span className="text-rose-300 font-semibold">Facteur de Puissance (FP)</span> mesure la force d&apos;une flotte.
            </span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-muted-foreground/60 ml-auto shrink-0 transition-transform ${combatInfoOpen ? 'rotate-180' : ''}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {combatInfoOpen && (
            <div className="space-y-2 pt-1 text-xs text-muted-foreground">
              <p>
                Plus le FP est élevé, plus la flotte est puissante. Comparez votre FP à celui des pirates avant d&apos;attaquer.
              </p>
              <p>
                Le combat se déroule en <span className="text-foreground">4 rounds maximum</span>. Chaque round, vos vaisseaux tirent simultanément sur les ennemis et vice-versa. Les <span className="text-foreground">boucliers</span> absorbent les dégâts en premier puis se régénèrent à chaque round. Les dégâts sur la <span className="text-foreground">coque</span> sont permanents.
              </p>
              <Link
                to="/guide/combat"
                className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 font-medium"
              >
                Guide complet du combat spatial
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>

        {pirateMissions.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun repaire pirate détecté pour le moment.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pirateMissions.map((mission) => {
              const params = mission.parameters as Record<string, any>;
              const rewards = mission.rewards as Record<string, any>;
              return (
                <div key={mission.id} className="glass-card border-rose-500/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Repaire pirate</span>
                    {mission.difficultyTier && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                          TIER_COLORS[mission.difficultyTier] ?? ''
                        }`}
                      >
                        {gameConfig?.labels[`tier.${mission.difficultyTier}`] ?? mission.difficultyTier}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Coordonnées : [{params.galaxy}:{params.system}:{params.position}]
                  </div>
                  {mission.pirateFP != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Puissance :</span>
                      <span className="text-sm font-bold text-rose-300">{mission.pirateFP} FP</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Butin potentiel :</div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {rewards.minerai > 0 && <span className="text-minerai">M: {fmt(rewards.minerai)}</span>}
                      {rewards.silicium > 0 && <span className="text-silicium">S: {fmt(rewards.silicium)}</span>}
                      {rewards.hydrogene > 0 && <span className="text-hydrogene">H: {fmt(rewards.hydrogene)}</span>}
                    </div>
                    {rewards.bonusShips?.length > 0 && (
                      <div className="text-[11px] text-emerald-400/80 flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2v20M2 12h20" />
                        </svg>
                        Vaisseaux bonus possibles
                      </div>
                    )}
                  </div>
                  {/* Fleet en route indicator */}
                  {fleetsByMission.get(mission.id)?.map((fleet) => (
                    <div
                      key={fleet.id}
                      className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
                      <span className="text-[11px] text-rose-300">
                        {phaseLabel(fleet.phase)}
                      </span>
                      <Timer
                        endTime={new Date(fleet.arrivalTime)}
                        onComplete={() => utils.fleet.movements.invalidate()}
                        className="text-[11px] text-rose-400"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
                      onClick={() => navigate(`/fleet/send?mission=pirate&galaxy=${params.galaxy}&system=${params.system}&position=${params.position}&pveMissionId=${mission.id}`)}
                      disabled={!!fleetsByMission.get(mission.id)?.length}
                    >
                      {fleetsByMission.get(mission.id)?.length ? 'Flotte en route' : 'Attaquer'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => dismissMutation.mutate({ missionId: mission.id })}
                      disabled={dismissMutation.isPending || !!fleetsByMission.get(mission.id)?.length}
                      title="Annuler ce repaire"
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
