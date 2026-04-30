import { useState } from 'react';
import { Zap, ChevronRight, Trophy, Skull, X, Swords } from 'lucide-react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { Timer } from '@/components/common/Timer';
import { useToastStore } from '@/stores/toast.store';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
import { AnomalyIcon } from '@/lib/icons';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AnomalyEngageModal } from '@/components/anomaly/AnomalyEngageModal';

interface FleetEntry {
  count: number;
  hullPercent: number;
}

export default function Anomaly() {
  const { data: gameConfig } = useGameConfig();
  const { data: current, isLoading: loadingCurrent } = trpc.anomaly.current.useQuery(undefined, {
    refetchInterval: 30_000, // poll while engaged so timer updates
  });
  const { data: history } = trpc.anomaly.history.useQuery({ limit: 10 });
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const [engageOpen, setEngageOpen] = useState(false);

  const advanceMutation = trpc.anomaly.advance.useMutation({
    onSuccess: (data) => {
      utils.anomaly.current.invalidate();
      utils.anomaly.history.invalidate();
      utils.flagship.get.invalidate();
      if (data.outcome === 'wiped') {
        addToast('💀 Votre flotte a été anéantie. Anomalie effondrée.', 'error');
      } else {
        addToast(`⚔️ Combat remporté — profondeur ${data.depth}`, 'success');
      }
    },
    onError: (err) => addToast(err.message ?? 'Combat impossible', 'error'),
  });

  const retreatMutation = trpc.anomaly.retreat.useMutation({
    onSuccess: () => {
      utils.anomaly.current.invalidate();
      utils.anomaly.history.invalidate();
      utils.exilium.getBalance.invalidate();
      utils.flagship.get.invalidate();
      utils.planet.list.invalidate();
      utils.shipyard.empireOverview.invalidate();
      addToast('🛑 Retour avec votre butin. Anomalie scellée.', 'success');
    },
    onError: (err) => addToast(err.message ?? 'Retraite impossible', 'error'),
  });

  if (loadingCurrent) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6 pb-6">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/70 via-slate-950 to-indigo-950/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        <div className="relative flex items-center gap-4 px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
          <div className="flex h-16 w-16 lg:h-20 lg:w-20 items-center justify-center rounded-full border-2 border-violet-500/30 bg-violet-950/50 shadow-lg shadow-violet-500/15">
            <AnomalyIcon className="h-9 w-9 lg:h-11 lg:w-11 text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">Anomalies Gravitationnelles</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Plongez dans le vide quantique, à vos risques et périls.
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-4">
        {current ? (
          <RunView
            anomaly={current}
            onAdvance={() => advanceMutation.mutate()}
            onRetreat={() => retreatMutation.mutate()}
            advancePending={advanceMutation.isPending}
            retreatPending={retreatMutation.isPending}
            cost={Number(gameConfig?.universe?.anomaly_entry_cost_exilium ?? 5)}
          />
        ) : (
          <IntroView
            cost={Number(gameConfig?.universe?.anomaly_entry_cost_exilium ?? 5)}
            onEngage={() => setEngageOpen(true)}
            historyCount={history?.length ?? 0}
            wipeCount={(history ?? []).filter((h) => h.status === 'wiped').length}
          />
        )}

        {/* History */}
        {history && history.length > 0 && (
          <HistoryList history={history} />
        )}
      </div>

      <AnomalyEngageModal open={engageOpen} onClose={() => setEngageOpen(false)} />
    </div>
  );
}

// ─── Intro view ──────────────────────────────────────────────────────────────

function IntroView({ cost, onEngage, historyCount, wipeCount }: {
  cost: number;
  onEngage: () => void;
  historyCount: number;
  wipeCount: number;
}) {
  return (
    <div className="glass-card p-6 lg:p-8 space-y-6">
      <div className="space-y-2 text-foreground/90">
        <p>
          Les <span className="text-violet-300 font-semibold">anomalies gravitationnelles</span> sont des poches instables de l'espace-temps. Votre vaisseau mère peut en provoquer l'ouverture en injectant de l'Exilium — une opération <em>risquée mais lucrative</em>.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Comment ça marche</h3>
        <ol className="space-y-2 text-sm text-muted-foreground/90 list-decimal list-inside">
          <li>Engagez votre vaisseau mère et la flotte de votre choix. Ils sont <span className="text-foreground">bloqués jusqu'au retour</span>.</li>
          <li>À l'intérieur de l'anomalie, des combats se succèdent — chacun <span className="text-foreground">plus difficile</span> que le précédent, mais aussi plus <span className="text-foreground">lucratif</span>.</li>
          <li>Après chaque combat gagné, vous décidez : <span className="text-violet-300">continuer</span> pour empocher plus, ou <span className="text-emerald-400">rentrer</span> avec votre butin.</li>
          <li>Si votre flotte est anéantie, <span className="text-red-400 font-semibold">tout est perdu</span> — sauf votre vaisseau mère qui sera incapacité.</li>
        </ol>
      </div>

      <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-4 flex items-center gap-4">
        <div className="flex items-center gap-1 shrink-0">
          <ExiliumIcon size={16} className="text-purple-400" />
          <span className="text-2xl font-bold text-purple-300">{cost}</span>
          <span className="text-xs text-muted-foreground/70 ml-1">d'entrée</span>
        </div>
        <div className="text-xs text-muted-foreground flex-1">
          Remboursés intégralement si vous rentrez vivant — perdus si vous wipez.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {historyCount > 0 ? (
            <>{historyCount} anomalies traversées · <span className="text-red-400">{wipeCount} wipes</span></>
          ) : (
            'Première anomalie ?'
          )}
        </div>
        <Button onClick={onEngage} size="lg">
          <Zap className="h-4 w-4 mr-2" />
          Engager une anomalie
        </Button>
      </div>
    </div>
  );
}

// ─── Run view ────────────────────────────────────────────────────────────────

interface AnomalyRow {
  id: string;
  status: string;
  currentDepth: number;
  fleet?: unknown;
  lootMinerai: string | number;
  lootSilicium: string | number;
  lootHydrogene: string | number;
  lootShips?: unknown;
  exiliumPaid: number;
  nextNodeAt: string | Date | null;
}

function RunView({ anomaly, onAdvance, onRetreat, advancePending, retreatPending, cost }: {
  anomaly: AnomalyRow;
  onAdvance: () => void;
  onRetreat: () => void;
  advancePending: boolean;
  retreatPending: boolean;
  cost: number;
}) {
  const fleet = (anomaly.fleet ?? {}) as Record<string, FleetEntry>;
  const lootShips = (anomaly.lootShips ?? {}) as Record<string, number>;
  const { data: gameConfig } = useGameConfig();
  const minerai = Math.floor(Number(anomaly.lootMinerai));
  const silicium = Math.floor(Number(anomaly.lootSilicium));
  const hydrogene = Math.floor(Number(anomaly.lootHydrogene));

  const nextAt = anomaly.nextNodeAt ? new Date(anomaly.nextNodeAt) : null;
  const ready = !nextAt || nextAt <= new Date();

  const totalShips = Object.values(fleet).reduce((s, e) => s + e.count, 0);

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-border/30 pb-3">
          <AnomalyIcon className="h-5 w-5 text-violet-300 shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground">Anomalie en cours</h2>
            <p className="text-xs text-muted-foreground">Profondeur {anomaly.currentDepth}{anomaly.currentDepth > 0 ? ' atteinte' : ''}</p>
          </div>
          {anomaly.currentDepth > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {anomaly.currentDepth} combat{anomaly.currentDepth > 1 ? 's' : ''} gagné{anomaly.currentDepth > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Flotte engagée */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Flotte engagée</h3>
          {totalShips === 0 ? (
            <div className="text-sm text-red-400">Aucun vaisseau survivant.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {Object.entries(fleet).map(([shipId, entry]) => {
                const def = gameConfig?.ships?.[shipId];
                const hullPct = Math.round(entry.hullPercent * 100);
                return (
                  <div key={shipId} className="flex items-center gap-2">
                    <span className="flex-1 text-foreground/90">{def?.name ?? shipId}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">×{entry.count}</span>
                    <div className="w-20 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className={cn(
                          'h-full transition-all',
                          hullPct > 60 ? 'bg-emerald-500/70' : hullPct > 30 ? 'bg-amber-500/70' : 'bg-red-500/70',
                        )}
                        style={{ width: `${hullPct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{hullPct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Loot */}
        {(minerai + silicium + hydrogene > 0 || Object.keys(lootShips).length > 0) && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Loot accumulé</h3>
            <div className="flex flex-wrap gap-3 text-sm">
              {minerai > 0 && <span className="text-minerai">+{formatNumber(minerai)} M</span>}
              {silicium > 0 && <span className="text-silicium">+{formatNumber(silicium)} Si</span>}
              {hydrogene > 0 && <span className="text-hydrogene">+{formatNumber(hydrogene)} H</span>}
              {Object.entries(lootShips).map(([id, n]) => {
                const def = gameConfig?.ships?.[id];
                return (
                  <span key={id} className="text-emerald-300">
                    +{n} {def?.name ?? id}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Next node */}
        <div className="border-t border-border/30 pt-3">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Prochain combat</h3>
          {ready ? (
            <Button
              onClick={onAdvance}
              disabled={advancePending || retreatPending || totalShips === 0}
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              <Swords className="h-4 w-4 mr-2" />
              {advancePending ? 'Combat en cours...' : 'Lancer le combat'}
            </Button>
          ) : (
            <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3 flex items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">Prochain palier dans</span>
              <Timer endTime={nextAt!} className="font-mono text-violet-300 tabular-nums" />
            </div>
          )}
        </div>

        {/* Retreat */}
        <div className="border-t border-border/30 pt-3">
          <Button
            onClick={onRetreat}
            disabled={advancePending || retreatPending}
            variant="outline"
            className="w-full"
          >
            <ChevronRight className="h-4 w-4 mr-2 rotate-180" />
            {retreatPending ? 'Retraite en cours...' : `Rentrer (${cost} Exilium remboursés + butin)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── History list ────────────────────────────────────────────────────────────

function HistoryList({ history }: { history: AnomalyRow[] }) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Historique</h3>
      <ul className="space-y-1 text-sm">
        {history.map((h) => {
          const minerai = Math.floor(Number(h.lootMinerai));
          const silicium = Math.floor(Number(h.lootSilicium));
          const hydrogene = Math.floor(Number(h.lootHydrogene));
          const totalLoot = minerai + silicium + hydrogene;
          const lootShips = (h.lootShips ?? {}) as Record<string, number>;
          const totalShips = Object.values(lootShips).reduce((s, n) => s + n, 0);

          let icon: React.ReactNode;
          let label: string;
          if (h.status === 'wiped') {
            icon = <Skull className="h-4 w-4 text-red-400" />;
            label = 'Wipe';
          } else if (h.currentDepth >= 5) {
            icon = <Trophy className="h-4 w-4 text-yellow-400" />;
            label = 'Profondeur atteinte';
          } else {
            icon = <X className="h-4 w-4 text-amber-400" />;
            label = 'Abandon';
          }

          return (
            <li key={h.id} className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-0">
              {icon}
              <span className="text-foreground/80 shrink-0">{label}</span>
              <span className="text-xs text-muted-foreground shrink-0">prof. {h.currentDepth}</span>
              <span className="flex-1 text-xs text-muted-foreground/70 truncate">
                {totalLoot > 0 ? `+${formatNumber(totalLoot)} ressources` : ''}
                {totalShips > 0 ? ` · +${totalShips} ships` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
