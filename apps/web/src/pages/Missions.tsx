import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { Timer } from '@/components/common/Timer';
import { useGameConfig } from '@/hooks/useGameConfig';
import { cn } from '@/lib/utils';
import { getAssetUrl } from '@/lib/assets';

const fmt = (n: number) => Number(n).toLocaleString('fr-FR');

const TIER_COLORS: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/40',
  medium: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  hard: 'bg-red-500/20 text-red-400 border-red-500/40',
};

// ── Types ────────────────────────────────────────────────────────────

type MissionFilter = 'all' | 'mine' | 'pirate';

const FILTERS: { key: MissionFilter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'mine', label: 'Gisements' },
  { key: 'pirate', label: 'Pirates' },
];

// ── KPI Tile ─────────────────────────────────────────────────────────

function KpiTile({ label, value, icon, color, onClick }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border/30 bg-card/60 px-4 py-3 text-left transition-colors hover:bg-card/80 hover:border-primary/20 cursor-pointer"
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
              <svg className="h-10 w-10 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Aller aux batiments
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
            src={getAssetUrl('buildings', 'missionCenter')}
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
                src={getAssetUrl('buildings', 'missionCenter', 'thumb')}
                alt="Centre de missions"
                className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-amber-500/30 object-cover shadow-lg shadow-amber-500/10 transition-opacity group-hover:opacity-80"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
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
        <div className="grid grid-cols-3 gap-3">
          <KpiTile
            label="Gisements actifs"
            value={`${miningMissions.length}/3`}
            color="text-amber-400"
            onClick={() => setFilter('mine')}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
              </svg>
            }
          />
          <KpiTile
            label="Repaires pirates"
            value={`${pirateMissions.length}/2`}
            color="text-rose-400"
            onClick={() => setFilter('pirate')}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 15s1.5-2 4-2 4 2 4 2" />
                <path d="M9 9l.01 0M15 9l.01 0" />
              </svg>
            }
          />
          <div className="rounded-xl border border-border/30 bg-card/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-cyan-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="min-w-0">
                {nextDiscoveryInFuture ? (
                  <Timer
                    endTime={nextDiscoveryAt}
                    onComplete={() => utils.pve.getMissions.invalidate()}
                    className="text-lg font-bold tabular-nums leading-tight text-cyan-400"
                  />
                ) : (
                  <div className="text-lg font-bold tabular-nums leading-tight text-cyan-400">--:--</div>
                )}
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">Prochaine decouverte</div>
              </div>
            </div>
          </div>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                    <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                  </svg>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  <span className="text-xs text-muted-foreground">
                    La <span className="text-amber-300 font-semibold">capacite de soute</span> de votre flotte determine combien de ressources vous ramenez.
                  </span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={cn('text-muted-foreground/60 ml-auto shrink-0 transition-transform', miningInfoOpen && 'rotate-180')}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {miningInfoOpen && (
                  <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                    <p>
                      Envoyez des <span className="text-foreground">cargos</span> avec votre flotte miniere pour maximiser le butin. Sans cargos, vos vaisseaux ne pourront rien ramener.
                    </p>
                    <p>
                      Le minage se deroule en plusieurs phases : <span className="text-foreground">aller</span>, <span className="text-foreground">prospection</span>, <span className="text-foreground">extraction</span>, puis <span className="text-foreground">retour</span>. La recherche <span className="text-foreground">Raffinage spatial</span> reduit les pertes de scories lors de l&apos;extraction.
                    </p>
                    <p>
                      Un gisement reste exploitable tant qu&apos;il contient des ressources — vous pouvez envoyer <span className="text-foreground">plusieurs flottes</span> successivement pour le vider completement.
                    </p>
                  </div>
                )}
              </div>

              {miningMissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <svg className="h-10 w-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-sm">Aucun gisement decouvert pour le moment.</p>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 15s1.5-2 4-2 4 2 4 2" />
                    <path d="M9 9l.01 0M15 9l.01 0" />
                  </svg>
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400 shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  <span className="text-xs text-muted-foreground">
                    Le <span className="text-rose-300 font-semibold">Facteur de Puissance (FP)</span> mesure la force d&apos;une flotte.
                  </span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={cn('text-muted-foreground/60 ml-auto shrink-0 transition-transform', combatInfoOpen && 'rotate-180')}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {combatInfoOpen && (
                  <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                    <p>
                      Plus le FP est eleve, plus la flotte est puissante. Comparez votre FP a celui des pirates avant d&apos;attaquer.
                    </p>
                    <p>
                      Le combat se deroule en <span className="text-foreground">4 rounds maximum</span>. Chaque round, vos vaisseaux tirent simultanement sur les ennemis et vice-versa. Les <span className="text-foreground">boucliers</span> absorbent les degats en premier puis se regenerent a chaque round. Les degats sur la <span className="text-foreground">coque</span> sont permanents.
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
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <svg className="h-10 w-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 15s1.5-2 4-2 4 2 4 2" />
                    <path d="M9 9l.01 0M15 9l.01 0" />
                  </svg>
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
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2v20M2 12h20" />
                              </svg>
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
        </section>

      </div>

      {/* Help overlay */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setHelpOpen(false)} />
          <div className="relative w-full max-w-lg rounded-xl border border-primary/20 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-primary">Comment fonctionnent les missions ?</h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ul className="text-xs text-muted-foreground space-y-2 list-disc list-inside">
              <li>Votre Centre de missions <span className="text-foreground">decouvre automatiquement</span> des gisements et des repaires pirates toutes les <span className="text-foreground">{Math.max(1, 7 - centerLevel)}h</span> (6h au niv. 1, -1h/niveau, min 1h).</li>
              <li>Jusqu&apos;a <span className="text-foreground">3 gisements</span> et <span className="text-foreground">2 repaires pirates</span> peuvent etre decouverts simultanement.</li>
              <li>Un gisement reste exploitable <span className="text-foreground">tant qu&apos;il contient des ressources</span> — envoyez plusieurs flottes pour le vider.</li>
              <li>Un repaire pirate est une <span className="text-foreground">mission de combat unique</span> — detruisez les pirates pour recuperer leur butin et potentiellement des vaisseaux bonus.</li>
              <li><span className="text-foreground">Pensez a envoyer des cargos</span> avec vos flottes ! Les ressources extraites ou pillees sont <span className="text-foreground">limitees par la capacite de soute</span> de votre flotte — sans cargos, vos vaisseaux ne pourront rien ramener.</li>
              <li>Vous pouvez <span className="text-foreground">annuler</span> un gisement pour liberer un emplacement (cooldown 24h).</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
