import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Lock, Home, HelpCircle, Sun, Frown, Clock, Info, ChevronDown, Boxes, ArrowRight, Plus, Telescope } from 'lucide-react';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { Timer } from '@/components/common/Timer';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { useGameConfig } from '@/hooks/useGameConfig';
import { cn } from '@/lib/utils';
import { getBuildingIllustrationUrl } from '@/lib/assets';

const fmt = (n: number) => Number(n).toLocaleString('fr-FR');

const TIER_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/40',
  medium: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  hard: 'bg-red-500/20 text-red-400 border-red-500/40',
};

// ── Types ────────────────────────────────────────────────────────────

type MissionFilter = 'all' | 'mine' | 'pirate' | 'exploration';

const FILTERS: { key: MissionFilter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'mine', label: 'Gisements' },
  { key: 'pirate', label: 'Pirates' },
  { key: 'exploration', label: 'Exploration' },
];

// ── KPI Tile ─────────────────────────────────────────────────────────

function KpiTile({ label, value, icon, color, onClick }: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border border-border/30 bg-card/60 px-4 py-3 text-left transition-colors',
        onClick ? 'hover:bg-card/80 hover:border-primary/20 cursor-pointer' : 'cursor-default',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-white/5', color)}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={cn('text-lg font-bold tabular-nums leading-tight', color)}>{value}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────

export default function Missions() {
  const [combatInfoOpen, setCombatInfoOpen] = useState(false);
  const [miningInfoOpen, setMiningInfoOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [filter, setFilter] = useState<MissionFilter>('all');
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
      <div className="space-y-4">
        <div className="h-40 bg-card/30 animate-pulse" />
        <div className="px-4 lg:px-6">
          <CardGridSkeleton count={4} />
        </div>
      </div>
    );
  }

  const centerLevel = data?.centerLevel ?? 0;
  const missions = data?.missions ?? [];
  const nextDiscoveryAt = data?.nextDiscoveryAt ? new Date(data.nextDiscoveryAt) : null;
  const nextDiscoveryInFuture = nextDiscoveryAt && nextDiscoveryAt.getTime() > Date.now();

  const miningMissions = missions.filter((m) => m.missionType === 'mine');
  const pirateMissions = missions.filter((m) => m.missionType === 'pirate');
  const explorationMissions = missions.filter((m) => m.missionType === 'exploration');

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

  // ── Locked state ────────────────────────────────────────────────────

  if (centerLevel === 0) {
    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950/80 via-slate-950 to-rose-950/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="relative flex flex-col items-center justify-center px-5 py-16 lg:py-24 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-muted-foreground/20 bg-card/50 mb-6">
              <Lock className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground mb-2">Centre de missions</h1>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Construisez le <span className="text-foreground font-semibold">Centre de missions</span> pour
              decouvrir des gisements de ressources et traquer des repaires pirates.
            </p>
            <Link
              to="/buildings"
              className="inline-flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              Aller aux bâtiments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Hero banner */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={getBuildingIllustrationUrl(gameConfig, 'missionCenter', 'homeworld')}
            alt=""
            className="h-full w-full object-cover opacity-40 blur-sm scale-110"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950/60 via-slate-950/80 to-rose-950/60" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

        <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
          <div className="flex items-start gap-5">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="relative group shrink-0"
              title="Comment fonctionnent les missions ?"
            >
              <img
                src={getBuildingIllustrationUrl(gameConfig, 'missionCenter', 'homeworld', 'thumb')}
                alt="Centre de missions"
                className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-amber-500/30 object-cover shadow-lg shadow-amber-500/10 transition-opacity group-hover:opacity-80"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <HelpCircle className="h-5 w-5 text-white" />
              </div>
            </button>

            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">Centre de missions</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Niveau {centerLevel} · Decouverte toutes les {Math.max(1, 7 - centerLevel)}h
              </p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-lg leading-relaxed hidden lg:block">
                Decouvrez des gisements de ressources et traquez des repaires pirates.
                Decouverte automatique toutes les {Math.max(1, 7 - centerLevel)}h.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content with padding */}
      <div className="space-y-4 px-4 pb-4 lg:px-6 lg:pb-6">

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="Gisements actifs"
            value={`${miningMissions.length}/3`}
            color="text-amber-400"
            onClick={() => setFilter('mine')}
            icon={
              <Sun className="h-[18px] w-[18px]" />
            }
          />
          <KpiTile
            label="Repaires pirates"
            value={`${pirateMissions.length}/2`}
            color="text-rose-400"
            onClick={() => setFilter('pirate')}
            icon={
              <Frown className="h-[18px] w-[18px]" />
            }
          />
          <KpiTile
            label="Reconnaissances"
            value={`${explorationMissions.length}/2`}
            color="text-cyan-300"
            onClick={() => setFilter('exploration')}
            icon={
              <Telescope className="h-[18px] w-[18px]" />
            }
          />
          <KpiTile
            label="Prochaine découverte"
            value={
              nextDiscoveryInFuture ? (
                <Timer
                  endTime={nextDiscoveryAt}
                  onComplete={() => utils.pve.getMissions.invalidate()}
                  className="text-lg font-bold tabular-nums leading-tight text-cyan-400"
                />
              ) : (
                '--:--'
              )
            }
            color="text-cyan-400"
            icon={
              <Clock className="h-[18px] w-[18px]" />
            }
          />
        </div>

        {/* Filter */}
        <div className="flex gap-0.5 bg-card/50 rounded-lg p-0.5 border border-border/30 w-fit">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-semibold transition-colors',
                filter === key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Content ──────────────────────────────────────── */}

        <section className="glass-card p-4 lg:p-5 space-y-8">
          {/* Mining missions */}
          {(filter === 'all' || filter === 'mine') && (
            <div>
              {filter === 'all' && (
                <div className="flex items-center gap-2 mb-4">
                  <Sun className="h-4 w-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Gisements ({miningMissions.length}/3)
                  </h3>
                </div>
              )}

              {/* Mining info */}
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2 mb-4">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => setMiningInfoOpen(!miningInfoOpen)}
                >
                  <Info className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    La <span className="text-amber-300 font-semibold">capacité de soute</span> de votre flotte détermine combien de ressources vous ramenez.
                  </span>
                  <ChevronDown className={cn('h-3 w-3 text-muted-foreground/60 ml-auto shrink-0 transition-transform', miningInfoOpen && 'rotate-180')} />
                </button>
                {miningInfoOpen && (
                  <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                    <p>
                      Envoyez des <span className="text-foreground">cargos</span> avec votre flotte minière pour maximiser le butin. Sans cargos, vos vaisseaux ne pourront rien ramener.
                    </p>
                    <p>
                      Le minage se déroule en plusieurs phases : <span className="text-foreground">aller</span>, <span className="text-foreground">prospection</span>, <span className="text-foreground">extraction</span>, puis <span className="text-foreground">retour</span>. La recherche <span className="text-foreground">Raffinage spatial</span> réduit les pertes de scories lors de l&apos;extraction.
                    </p>
                    <p>
                      Un gisement reste exploitable tant qu&apos;il contient des ressources — vous pouvez envoyer <span className="text-foreground">plusieurs flottes</span> successivement pour le vider complètement.
                    </p>
                  </div>
                )}
              </div>

              {miningMissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Boxes className="h-10 w-10 mb-3 opacity-30" strokeWidth={1.5} />
                  <p className="text-sm">Aucun gisement découvert pour le moment.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {miningMissions.map((mission) => {
                    const params = mission.parameters as Record<string, any>;
                    const rewards = mission.rewards as Record<string, any>;
                    return (
                      <div key={mission.id} className="retro-card p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">Extraction miniere</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Coordonnees : [{params.galaxy}:{params.system}:{params.position}]
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Ressources estimees :</div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {rewards.minerai > 0 && <span className="text-minerai">M: {fmt(rewards.minerai)}</span>}
                            {rewards.silicium > 0 && <span className="text-silicium">S: {fmt(rewards.silicium)}</span>}
                            {rewards.hydrogene > 0 && <span className="text-hydrogene">H: {fmt(rewards.hydrogene)}</span>}
                          </div>
                        </div>
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
            </div>
          )}

          {/* Pirate missions */}
          {(filter === 'all' || filter === 'pirate') && (
            <div>
              {filter === 'all' && (
                <div className="flex items-center gap-2 mb-4">
                  <Frown className="h-4 w-4 text-rose-400" />
                  <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                    Repaires pirates ({pirateMissions.length}/2)
                  </h3>
                </div>
              )}

              {/* Combat info */}
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 space-y-2 mb-4">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => setCombatInfoOpen(!combatInfoOpen)}
                >
                  <Info className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    Le <span className="text-rose-300 font-semibold">Facteur de Puissance (FP)</span> mesure la force d&apos;une flotte.
                  </span>
                  <ChevronDown className={cn('h-3 w-3 text-muted-foreground/60 ml-auto shrink-0 transition-transform', combatInfoOpen && 'rotate-180')} />
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
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>

              {pirateMissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Frown className="h-10 w-10 mb-3 opacity-30" strokeWidth={1.5} />
                  <p className="text-sm">Aucun repaire pirate detecte pour le moment.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pirateMissions.map((mission) => {
                    const params = mission.parameters as Record<string, any>;
                    const rewards = mission.rewards as Record<string, any>;
                    return (
                      <div key={mission.id} className="retro-card border-rose-500/10 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">Repaire pirate</span>
                          {mission.difficultyTier && (
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase',
                                TIER_COLORS[mission.difficultyTier],
                              )}
                            >
                              {gameConfig?.labels[`tier.${mission.difficultyTier}`] ?? mission.difficultyTier}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Coordonnees : [{params.galaxy}:{params.system}:{params.position}]
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
                              <Plus className="h-3 w-3" />
                              Vaisseaux bonus possibles
                            </div>
                          )}
                        </div>
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
            </div>
          )}

          {/* Exploration missions */}
          {(filter === 'all' || filter === 'exploration') && (
            <div>
              {filter === 'all' && (
                <div className="flex items-center gap-2 mb-4">
                  <Telescope className="h-4 w-4 text-cyan-300" />
                  <h3 className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                    Reconnaissances ({explorationMissions.length}/2)
                  </h3>
                </div>
              )}

              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-2 mb-4">
                <div className="flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-cyan-300 shrink-0 mt-0.5" />
                  <span className="text-xs text-muted-foreground">
                    Cartographiez un système éloigné de votre planète mère pour empocher la prime. Seules les <span className="text-cyan-200">positions explorées après acceptation</span> du contrat comptent.
                  </span>
                </div>
              </div>

              {explorationMissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Telescope className="h-10 w-10 mb-3 opacity-30" strokeWidth={1.5} />
                  <p className="text-sm">Aucun contrat d&apos;exploration disponible.</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">Recherche <span className="text-foreground/70">Exploration planétaire</span> requise.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {explorationMissions.map((mission) => {
                    const params = mission.parameters as { galaxy: number; system: number; quota: number; progress?: number };
                    const rewards = mission.rewards as { minerai: number; silicium: number; hydrogene: number; exilium: number };
                    const progress = params.progress ?? 0;
                    const pct = Math.min(100, Math.round((progress / params.quota) * 100));
                    const expiresAt = mission.expiresAt ? new Date(mission.expiresAt) : null;
                    return (
                      <div key={mission.id} className="retro-card border-cyan-500/10 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">Cartographie</span>
                          <span className="text-xs text-cyan-300 tabular-nums">{progress}/{params.quota}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Système cible : [{params.galaxy}:{params.system}]
                        </div>

                        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500/30 to-cyan-400 rounded-full transition-[width] duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Récompense :</div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {rewards.minerai > 0 && <span className="text-minerai">M: {fmt(rewards.minerai)}</span>}
                            {rewards.silicium > 0 && <span className="text-silicium">S: {fmt(rewards.silicium)}</span>}
                            {rewards.hydrogene > 0 && <span className="text-hydrogene">H: {fmt(rewards.hydrogene)}</span>}
                            {rewards.exilium > 0 && <span className="text-purple-300">+{rewards.exilium} Exilium</span>}
                          </div>
                        </div>

                        {expiresAt && (
                          <div className="text-[11px] text-muted-foreground/70">
                            Expire dans <Timer endTime={expiresAt} className="text-cyan-300 tabular-nums" />
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => navigate(`/galaxy?galaxy=${params.galaxy}&system=${params.system}`)}
                          >
                            Voir le système
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => dismissMutation.mutate({ missionId: mission.id })}
                            disabled={dismissMutation.isPending}
                            title="Annuler ce contrat"
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

      </div>

      {/* Help overlay */}
      <EntityDetailOverlay open={helpOpen} onClose={() => setHelpOpen(false)} title="Centre de missions">
        {/* Hero image */}
        <div className="relative -mx-5 -mt-5 overflow-hidden rounded-t-lg">
          <img
            src={getBuildingIllustrationUrl(gameConfig, 'missionCenter', 'homeworld')}
            alt=""
            className="w-full h-40 object-cover"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
          <div className="absolute bottom-3 left-5">
            <p className="text-sm font-semibold text-foreground">Niveau {centerLevel}</p>
            <p className="text-xs text-muted-foreground">Decouverte toutes les {Math.max(1, 7 - centerLevel)}h</p>
          </div>
        </div>

        {/* Decouverte */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            Découverte automatique
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Votre Centre de missions découvre automatiquement des gisements et des repaires pirates toutes les <span className="text-foreground font-medium">{Math.max(1, 7 - centerLevel)}h</span> (6h au niv. 1, -1h/niveau, min 1h). Jusqu&apos;à <span className="text-foreground font-medium">3 gisements</span> et <span className="text-foreground font-medium">2 repaires pirates</span> peuvent être découverts simultanément.
          </p>
        </div>

        {/* Gisements */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-amber-400" />
            Gisements miniers
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Un gisement reste exploitable <span className="text-foreground font-medium">tant qu&apos;il contient des ressources</span> — envoyez plusieurs flottes pour le vider complètement. Le minage se déroule en phases : aller, prospection, extraction, puis retour.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">Pensez à envoyer des cargos</span> avec vos flottes ! Les ressources extraites sont limitées par la capacité de soute. La recherche <span className="text-foreground font-medium">Raffinage spatial</span> réduit les pertes de scories.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Vous pouvez annuler un gisement pour libérer un emplacement (cooldown 24h).
          </p>
        </div>

        {/* Pirates */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Frown className="h-3.5 w-3.5 text-rose-400" />
            Repaires pirates
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Un repaire pirate est une <span className="text-foreground font-medium">mission de combat unique</span>. Le <span className="text-rose-300 font-medium">Facteur de Puissance (FP)</span> mesure la force d&apos;une flotte — comparez votre FP a celui des pirates avant d&apos;attaquer.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Detruisez les pirates pour recuperer leur butin et potentiellement des <span className="text-foreground font-medium">vaisseaux bonus</span>.
          </p>
        </div>
      </EntityDetailOverlay>
    </div>
  );
}
