import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Zap, ChevronLeft, ChevronDown, Trophy, Skull, X, FileText, Sparkles } from 'lucide-react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { useToastStore } from '@/stores/toast.store';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
import { AnomalyIcon } from '@/lib/icons';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AnomalyEngageModal } from '@/components/anomaly/AnomalyEngageModal';
import { AnomalyEventCard } from '@/components/anomaly/AnomalyEventCard';
import { AnomalyEventLog } from '@/components/anomaly/AnomalyEventLog';
import { AnomalyCombatPreview } from '@/components/anomaly/AnomalyCombatPreview';
import { AnomalyLootSummaryModal } from '@/components/anomaly/AnomalyLootSummaryModal';

interface FleetEntry {
  count: number;
  hullPercent: number;
}

const MAX_DEPTH = 20;

interface LootSummaryState {
  drops: Array<{ id: string; name: string; rarity: string; image: string; isFinal?: boolean }>;
  resources: { minerai: number; silicium: number; hydrogene: number };
  exiliumRefunded: number;
  // V4 (2026-05-03) : `forced_retreat` removed — flagship-only means a wipe is
  // total, no partial retreat outcome any more. The modal type still accepts
  // it for back-compat but Anomaly.tsx never sets it.
  outcome: 'survived' | 'wiped';
}

interface MutationLootSnapshot {
  lootMinerai: number;
  lootSilicium: number;
  lootHydrogene: number;
  exiliumPaid: number;
}

const RARITY_LABEL_FR: Record<string, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
};

export default function Anomaly() {
  const { data: gameConfig } = useGameConfig();
  const { data: current, isLoading: loadingCurrent } = trpc.anomaly.current.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const { data: history } = trpc.anomaly.history.useQuery({ limit: 10 });
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const [engageOpen, setEngageOpen] = useState(false);
  const [lootSummary, setLootSummary] = useState<LootSummaryState | null>(null);

  // Snapshot of the active anomaly row, refreshed each render. We read from
  // it inside `onMutate` (NOT `onSuccess`) to capture the values BEFORE the
  // mutation fires — otherwise a `refetchInterval` race could land between
  // mutate and onSuccess, wiping the row server-side and leaving us with
  // null in `currentRef.current`.
  const currentRef = useRef(current);
  currentRef.current = current;

  // Snapshot captured in `onMutate`, consumed in `onSuccess`, cleared in
  // `onSettled`. Holds the row state at mutation invocation time so the
  // modal can show pre-mutation loot/exilium even after the server wipes it.
  const mutationSnapshotRef = useRef<MutationLootSnapshot | null>(null);

  function captureSnapshot(): MutationLootSnapshot | null {
    const row = currentRef.current;
    if (!row) return null;
    return {
      lootMinerai: Math.floor(Number(row.lootMinerai ?? 0)),
      lootSilicium: Math.floor(Number(row.lootSilicium ?? 0)),
      lootHydrogene: Math.floor(Number(row.lootHydrogene ?? 0)),
      exiliumPaid: row.exiliumPaid ?? 0,
    };
  }

  const advanceMutation = trpc.anomaly.advance.useMutation({
    onMutate: () => {
      mutationSnapshotRef.current = captureSnapshot();
    },
    onSuccess: (data) => {
      const snap = mutationSnapshotRef.current;
      utils.anomaly.current.invalidate();
      utils.anomaly.history.invalidate();
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      utils.planet.list.invalidate();
      utils.shipyard.empireOverview.invalidate();

      // XP toasts — defensive casts in case tRPC inference doesn't expose
      // the new fields yet.
      const xpGained = (data as { xpGained?: number }).xpGained;
      const levelUp = (data as { levelUp?: { newLevel: number } | null }).levelUp;
      if (xpGained && xpGained > 0) {
        addToast(`✨ +${xpGained} XP`, 'success');
      }
      if (levelUp) {
        addToast(`🌟 NIVEAU ${levelUp.newLevel} atteint !`, 'success');
      }

      // In-run drop toast (per-combat module dropped on a survived combat).
      // Translated rarity to match the modal labelling.
      if (data.outcome === 'survived' && data.droppedModule) {
        const rarityLabel =
          RARITY_LABEL_FR[data.droppedModule.rarity] ?? data.droppedModule.rarity;
        addToast(
          `✨ +1 module : ${data.droppedModule.name} (${rarityLabel})`,
          'success',
        );
      }

      if (data.outcome === 'wiped') {
        addToast('💀 Votre flotte a été anéantie. Tout est perdu.', 'error');
        // Wipe = no resources recovered, exilium lost. finalDrops is [] but
        // surface the modal anyway so the player sees the run summary.
        setLootSummary({
          drops: data.finalDrops ?? [],
          resources: { minerai: 0, silicium: 0, hydrogene: 0 },
          exiliumRefunded: 0,
          outcome: 'wiped',
        });
      } else {
        addToast(`⚔️ Combat remporté — profondeur ${data.depth}`, 'success');
        // Run completed at MAX_DEPTH — surface the same end-of-run modal as a
        // voluntary retreat. The API includes the new combat's loot in
        // `nodeLoot` but it has not yet been merged into the row snapshot, so
        // we add it on top of the pre-mutation resource totals.
        // Note: server only returns non-empty `finalDrops` when `runComplete`
        // is true (rolled in the survived MAX_DEPTH branch in
        // anomaly.service.ts). So `runComplete` alone is the sufficient
        // trigger condition.
        if (data.runComplete) {
          const baseMinerai = snap?.lootMinerai ?? 0;
          const baseSilicium = snap?.lootSilicium ?? 0;
          const baseHydrogene = snap?.lootHydrogene ?? 0;
          const nodeLoot = data.nodeLoot ?? { minerai: 0, silicium: 0, hydrogene: 0 };
          const finalDrops = data.finalDrops ?? [];
          // Include the per-combat drop (if any) alongside the final drops so
          // the player sees ALL modules in the modal, not just the orphan
          // toast that fired above. Per-combat drop has no `isFinal` flag.
          const allDrops = data.droppedModule
            ? [{ ...data.droppedModule, isFinal: false }, ...finalDrops]
            : finalDrops;
          setLootSummary({
            drops: allDrops,
            resources: {
              minerai: baseMinerai + Math.floor(Number(nodeLoot.minerai ?? 0)),
              silicium: baseSilicium + Math.floor(Number(nodeLoot.silicium ?? 0)),
              hydrogene: baseHydrogene + Math.floor(Number(nodeLoot.hydrogene ?? 0)),
            },
            // Server's `survived + runComplete` branch does NOT refund Exilium
            // (only `retreat` does — see anomaly.service.ts ; V4 removed
            // `forced_retreat`).
            exiliumRefunded: 0,
            outcome: 'survived',
          });
        }
      }
    },
    onError: (err) => {
      utils.anomaly.current.invalidate();
      const isEventPending = (err.message ?? '').includes('événement');
      addToast(
        isEventPending
          ? '✨ Un événement est apparu — la page se met à jour'
          : err.message ?? 'Combat impossible',
        isEventPending ? 'success' : 'error',
      );
    },
    onSettled: () => {
      mutationSnapshotRef.current = null;
    },
  });

  const retreatMutation = trpc.anomaly.retreat.useMutation({
    onMutate: () => {
      mutationSnapshotRef.current = captureSnapshot();
    },
    onSuccess: (data) => {
      const snap = mutationSnapshotRef.current;
      utils.anomaly.current.invalidate();
      utils.anomaly.history.invalidate();
      utils.exilium.getBalance.invalidate();
      utils.flagship.get.invalidate();
      utils.planet.list.invalidate();
      utils.shipyard.empireOverview.invalidate();
      addToast('🛑 Retour avec votre butin. Anomalie scellée.', 'success');

      // XP toasts — defensive casts in case tRPC inference doesn't expose
      // the new fields yet.
      const xpGained = (data as { xpGained?: number }).xpGained;
      const levelUp = (data as { levelUp?: { newLevel: number } | null }).levelUp;
      if (xpGained && xpGained > 0) {
        addToast(`✨ +${xpGained} XP`, 'success');
      }
      if (levelUp) {
        addToast(`🌟 NIVEAU ${levelUp.newLevel} atteint !`, 'success');
      }

      setLootSummary({
        drops: data.finalDrops ?? [],
        resources: {
          minerai: snap?.lootMinerai ?? 0,
          silicium: snap?.lootSilicium ?? 0,
          hydrogene: snap?.lootHydrogene ?? 0,
        },
        exiliumRefunded: 0, // V4 : retreat ne refund plus l'Exilium (cf. anomaly.service.ts retreat())
        outcome: 'survived',
      });
    },
    onError: (err) => addToast(err.message ?? 'Retraite impossible', 'error'),
    onSettled: () => {
      mutationSnapshotRef.current = null;
    },
  });

  // V4 (2026-05-03) : restore +N% hull on the flagship by burning 1 charge.
  // Charges are seeded at engage and decremented per use ; refused if at 0
  // or if the flagship is already at full hull.
  const repairMutation = trpc.anomaly.useRepairCharge.useMutation({
    onSuccess: (data) => {
      addToast(
        `🔧 Hull réparé : ${Math.round(data.newHullPercent * 100)}% (${data.remainingCharges} charges restantes)`,
        'success',
      );
      utils.anomaly.current.invalidate();
    },
    onError: (err) => addToast(err.message ?? 'Réparation impossible', 'error'),
  });

  if (loadingCurrent) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  const cost = Number(gameConfig?.universe?.anomaly_entry_cost_exilium ?? 5);

  if (!current) {
    return (
      <div className="space-y-4 lg:space-y-6 pb-6">
        <IntroHero />
        <div className="px-4 lg:px-6">
          <IntroView
            cost={cost}
            onEngage={() => setEngageOpen(true)}
            historyCount={history?.length ?? 0}
            wipeCount={(history ?? []).filter((h) => h.status === 'wiped').length}
          />
        </div>
        {history && history.length > 0 && (
          <div className="px-4 lg:px-6">
            <HistoryList history={history} />
          </div>
        )}
        <AnomalyEngageModal open={engageOpen} onClose={() => setEngageOpen(false)} />
        <AnomalyLootSummaryModal
          open={!!lootSummary}
          onClose={() => setLootSummary(null)}
          drops={lootSummary?.drops ?? []}
          resources={lootSummary?.resources ?? { minerai: 0, silicium: 0, hydrogene: 0 }}
          exiliumRefunded={lootSummary?.exiliumRefunded ?? 0}
          outcome={lootSummary?.outcome ?? 'survived'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 lg:space-y-4 pb-6">
      <RunHero
        anomaly={current}
        cost={cost}
        onRetreat={() => retreatMutation.mutate()}
        retreatPending={retreatMutation.isPending}
        advancePending={advanceMutation.isPending}
      />

      <div className="px-3 lg:px-6">
        <RunView
          anomaly={current}
          onAdvance={() => advanceMutation.mutate()}
          advancePending={advanceMutation.isPending}
          retreatPending={retreatMutation.isPending}
          onRepair={() => repairMutation.mutate()}
          repairPending={repairMutation.isPending}
        />
      </div>

      {history && history.length > 0 && (
        <div className="px-3 lg:px-6">
          <HistoryAccordion history={history} />
        </div>
      )}

      <AnomalyEngageModal open={engageOpen} onClose={() => setEngageOpen(false)} />
      <AnomalyLootSummaryModal
        open={!!lootSummary}
        onClose={() => setLootSummary(null)}
        drops={lootSummary?.drops ?? []}
        resources={lootSummary?.resources ?? { minerai: 0, silicium: 0, hydrogene: 0 }}
        exiliumRefunded={lootSummary?.exiliumRefunded ?? 0}
        outcome={lootSummary?.outcome ?? 'survived'}
      />
    </div>
  );
}

// ─── Intro hero (when no run) ────────────────────────────────────────────────

function IntroHero() {
  return (
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
  );
}

// ─── Run hero (slim, when in run) ────────────────────────────────────────────

function RunHero({
  anomaly,
  cost,
  onRetreat,
  retreatPending,
  advancePending,
}: {
  anomaly: AnomalyRow;
  cost: number;
  onRetreat: () => void;
  retreatPending: boolean;
  advancePending: boolean;
}) {
  const depth = anomaly.currentDepth;
  return (
    <div className="relative overflow-hidden">
      {/* Atmospheric backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950/80 via-slate-950 to-indigo-950/60" />
      <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      {/* Subtle scanline overlay */}
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(167,139,250,0.04), rgba(167,139,250,0.04) 1px, transparent 1px, transparent 3px)',
        }}
      />

      <div className="relative px-4 lg:px-8 py-3 lg:py-4 flex items-center gap-3 lg:gap-4">
        <div className="flex h-11 w-11 lg:h-12 lg:w-12 shrink-0 items-center justify-center rounded-full border border-violet-500/40 bg-violet-950/70 shadow-[0_0_16px_rgba(167,139,250,0.18)]">
          <AnomalyIcon className="h-6 w-6 text-violet-200 animate-pulse" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-[11px] lg:text-xs font-mono font-semibold uppercase tracking-[0.22em] text-violet-200">
              Anomalie en cours
            </h1>
            <span className="text-[10px] lg:text-xs text-violet-300/60 font-mono tabular-nums">
              · prof {String(depth).padStart(2, '0')}/{MAX_DEPTH}
            </span>
            {depth > 0 && (
              <span className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] lg:text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                {depth} W
              </span>
            )}
          </div>
          <DepthMeter current={depth} />
        </div>

        <Button
          onClick={onRetreat}
          disabled={advancePending || retreatPending}
          variant="outline"
          size="sm"
          className="shrink-0 border-violet-500/40 hover:bg-violet-950/40 hover:border-violet-400/60 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-1" />
          <span className="hidden sm:inline">{retreatPending ? 'Retour…' : 'Rentrer'}</span>
          <span className="sm:ml-1.5 inline-flex items-center gap-0.5 text-violet-300">
            <ExiliumIcon size={10} />
            <span className="text-xs tabular-nums">{cost}</span>
          </span>
        </Button>
      </div>
    </div>
  );
}

function DepthMeter({ current }: { current: number }) {
  return (
    <div className="flex gap-[2px] mt-1.5" role="progressbar" aria-valuenow={current} aria-valuemax={MAX_DEPTH}>
      {Array.from({ length: MAX_DEPTH }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors',
            i < current
              ? 'bg-violet-400 shadow-[0_0_4px_rgba(167,139,250,0.6)]'
              : i === current
                ? 'bg-violet-500/40 animate-pulse'
                : 'bg-violet-900/40',
          )}
        />
      ))}
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
          <li>Engagez votre <span className="text-foreground font-semibold">vaisseau amiral seul</span>, équipé de modules. Pas d'escorte — vos modules et vos charges de réparation feront la différence.</li>
          <li>À l'intérieur de l'anomalie, des combats se succèdent — chacun <span className="text-foreground">plus difficile</span> que le précédent, mais aussi plus <span className="text-foreground">lucratif</span>.</li>
          <li>Après chaque combat gagné, vous décidez : <span className="text-violet-300">continuer</span> pour empocher plus, ou <span className="text-emerald-400">rentrer</span> avec votre butin.</li>
          <li>Si votre vaisseau amiral est détruit en combat : <span className="text-red-400 font-semibold">wipe radical</span>. Vous perdez votre Exilium engagé, le butin du run, et votre vaisseau est incapacité 30 minutes (réparation longue).</li>
        </ol>
      </div>

      <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-4 flex items-center gap-4">
        <div className="flex items-center gap-1 shrink-0">
          <ExiliumIcon size={16} className="text-purple-400" />
          <span className="text-2xl font-bold text-purple-300">{cost}</span>
          <span className="text-xs text-muted-foreground/70 ml-1">d'entrée</span>
        </div>
        <div className="text-xs text-muted-foreground flex-1">
          Coût <span className="text-foreground font-semibold">perdu dans tous les cas</span> (réussite, retour volontaire ou wipe). Vous payez pour jouer.
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
  reportIds?: unknown;
  completedAt?: string | Date | null;
  nextEnemyFleet?: unknown;
  nextEnemyFp?: number | null;
  nextNodeType?: string;
  nextEventId?: string | null;
  eventLog?: unknown;
  /** Snapshot of equipped modules at engage : Record<hullId, { epic, rare[], common[] }>. */
  equippedModules?: unknown;
  pendingEpicEffect?: unknown;
  /** V4 : repair charges seeded at engage, burned via `useRepairCharge`. */
  repairChargesCurrent?: number;
  repairChargesMax?: number;
}

function RunView({
  anomaly,
  onAdvance,
  advancePending,
  retreatPending,
  onRepair,
  repairPending,
}: {
  anomaly: AnomalyRow;
  onAdvance: () => void;
  advancePending: boolean;
  retreatPending: boolean;
  onRepair: () => void;
  repairPending: boolean;
}) {
  const fleet = (anomaly.fleet ?? {}) as Record<string, FleetEntry>;
  const lootShips = (anomaly.lootShips ?? {}) as Record<string, number>;
  const reportIds = (anomaly.reportIds ?? []) as string[];
  const eventLog = (anomaly.eventLog ?? []) as Array<{
    depth: number;
    eventId: string;
    choiceIndex: number;
    outcomeApplied: Record<string, unknown>;
    resolvedAt: string;
  }>;
  const { data: gameConfig } = useGameConfig();
  const { data: content } = trpc.anomalyContent.get.useQuery();
  const equippedModules = (anomaly.equippedModules ?? {}) as Record<
    string,
    { epic?: string | null; rare?: (string | null)[]; common?: (string | null)[] }
  >;
  const nextDepth = anomaly.currentDepth + 1;
  const nextDepthContent = content?.depths.find((d) => d.depth === nextDepth);
  const minerai = Math.floor(Number(anomaly.lootMinerai));
  const silicium = Math.floor(Number(anomaly.lootSilicium));
  const hydrogene = Math.floor(Number(anomaly.lootHydrogene));

  const nextAt = anomaly.nextNodeAt ? new Date(anomaly.nextNodeAt) : null;
  const nextAtMs = nextAt?.getTime() ?? null;
  const [, forceTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!nextAtMs) return;
    const delay = nextAtMs - Date.now();
    if (delay <= 0) return;
    const id = setTimeout(forceTick, delay);
    return () => clearTimeout(id);
  }, [nextAtMs]);
  const ready = !nextAt || nextAt <= new Date();

  const totalShips = Object.values(fleet).reduce((s, e) => s + e.count, 0);
  const hasLoot = minerai + silicium + hydrogene > 0 || Object.keys(lootShips).length > 0;

  return (
    // 2-column on desktop: action gets the focus on the left, status on the right.
    // Stacked on mobile so the player sees the action card first.
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-3 lg:gap-4">
      {/* ─── Action zone ─────────────────────────────────────────────────── */}
      <main className="min-w-0 space-y-3">
        <EpicActivateButton
          equippedModules={equippedModules}
          actionInFlight={advancePending || retreatPending}
        />
        <RepairChargeButton
          fleet={fleet}
          chargesCurrent={anomaly.repairChargesCurrent ?? 0}
          chargesMax={anomaly.repairChargesMax ?? 0}
          onRepair={onRepair}
          repairPending={repairPending}
          actionInFlight={advancePending || retreatPending}
        />
        {anomaly.nextNodeType === 'event' && anomaly.nextEventId ? (
          <EventNodeBlock
            eventId={anomaly.nextEventId}
            event={content?.events.find((e) => e.id === anomaly.nextEventId)}
            ready={ready}
            disabled={retreatPending}
            nextAt={nextAt}
          />
        ) : (
          <AnomalyCombatPreview
            depth={nextDepth}
            depthContent={nextDepthContent}
            enemyFleet={anomaly.nextEnemyFleet as Record<string, number> | null}
            enemyFp={anomaly.nextEnemyFp ?? null}
            ready={ready}
            disabled={retreatPending}
            totalShips={totalShips}
            nextAt={nextAt}
            advancePending={advancePending}
            onAdvance={onAdvance}
          />
        )}
      </main>

      {/* ─── Status sidebar ─────────────────────────────────────────────── */}
      <aside className="space-y-3 min-w-0">
        <FleetCard fleet={fleet} totalShips={totalShips} gameConfig={gameConfig} />
        {hasLoot && (
          <LootCard
            minerai={minerai}
            silicium={silicium}
            hydrogene={hydrogene}
            lootShips={lootShips}
            gameConfig={gameConfig}
          />
        )}
        {eventLog.length > 0 && content?.events && (
          <SidebarCard
            label="Événements résolus"
            count={eventLog.length}
          >
            <AnomalyEventLog log={eventLog as never} events={content.events} />
          </SidebarCard>
        )}
        {reportIds.length > 0 && <ReportsCard reportIds={reportIds} />}
      </aside>
    </div>
  );
}

// ─── Epic ability activation ────────────────────────────────────────────────

/**
 * Compact button that lets the player trigger their equipped epic module's
 * ability during an active anomaly run. Self-fetches the flagship row to read
 * `epicChargesCurrent` (live, decremented per use) and `hullId` (snapshot
 * lookup key on `equippedModules`), and the modules pool to resolve the epic
 * id to its display name.
 *
 * Visibility rules :
 *   - hidden if no flagship, no epic equipped on the run's snapshot for the
 *     player's hull, or charges are at 0.
 *   - disabled while the activate mutation is pending OR while another action
 *     (advance / retreat) is in flight, to avoid racing the same advisory lock.
 */
function EpicActivateButton({
  equippedModules,
  actionInFlight,
}: {
  equippedModules: Record<
    string,
    { epic?: string | null; rare?: (string | null)[]; common?: (string | null)[] }
  >;
  actionInFlight: boolean;
}) {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const { data: flagship } = trpc.flagship.get.useQuery();
  const { data: allModules } = trpc.modules.list.useQuery();
  const moduleMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const mod of allModules ?? []) m.set(mod.id, { id: mod.id, name: mod.name });
    return m;
  }, [allModules]);

  const hullId = (flagship?.hullId ?? 'industrial') as string;
  const epicId = equippedModules[hullId]?.epic ?? null;
  const charges = (flagship as { epicChargesCurrent?: number } | null | undefined)?.epicChargesCurrent ?? 0;
  const maxCharges = (flagship as { epicChargesMax?: number } | null | undefined)?.epicChargesMax ?? 0;

  const activateMutation = trpc.anomaly.activateEpic.useMutation({
    onSuccess: (data) => {
      utils.flagship.get.invalidate();
      utils.anomaly.current.invalidate();
      const where = data.applied === 'immediate' ? 'effet immédiat' : 'effet appliqué au prochain combat';
      const epicName = epicId ? moduleMap.get(epicId)?.name ?? data.ability : data.ability;
      addToast(`⚡ ${epicName} activée — ${where}`, 'success');
    },
    onError: (err) => {
      addToast(err.message ?? 'Activation impossible', 'error');
    },
  });

  // Hide entirely when not actionable. Charges == 0 still happens often (1
  // charge baseline, consumed once) so a silent hide is the right default.
  if (!flagship || !epicId || charges <= 0) return null;

  const epicName = moduleMap.get(epicId)?.name ?? epicId;
  const disabled = activateMutation.isPending || actionInFlight;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-950/30 to-orange-950/20 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-950/50">
          <Sparkles className="h-5 w-5 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300/80">
            Module épique
          </div>
          <div className="text-sm font-semibold text-amber-100 truncate">{epicName}</div>
        </div>
        <div className="shrink-0 text-xs font-mono tabular-nums text-amber-200">
          {charges}/{maxCharges}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => activateMutation.mutate({ hullId })}
          className="shrink-0 border-amber-500/50 text-amber-100 hover:bg-amber-950/40 hover:border-amber-400/70"
        >
          <Zap className="h-3.5 w-3.5 mr-1" />
          {activateMutation.isPending ? 'Activation…' : 'Activer'}
        </Button>
      </div>
    </div>
  );
}

// ─── Repair charge button (V4) ──────────────────────────────────────────────

/**
 * Compact card showing remaining hull-repair charges + a button that burns one
 * to restore +30% hull on the flagship. Hidden entirely when there are no
 * charges left (V4 always seeds at least 1, so this only hides mid-run after
 * the player has spent everything). Disabled when the flagship is at full HP
 * or when another action is in flight.
 */
function RepairChargeButton({
  fleet,
  chargesCurrent,
  chargesMax,
  onRepair,
  repairPending,
  actionInFlight,
}: {
  fleet: Record<string, FleetEntry>;
  chargesCurrent: number;
  chargesMax: number;
  onRepair: () => void;
  repairPending: boolean;
  actionInFlight: boolean;
}) {
  if (chargesCurrent <= 0) return null;
  const flagshipHp = fleet.flagship?.hullPercent ?? 1.0;
  const hpPct = Math.round(flagshipHp * 100);
  const canRepair = flagshipHp < 1.0;
  const disabled = !canRepair || repairPending || actionInFlight;
  const title = !canRepair
    ? 'Vaisseau mère à pleine santé — réparation inutile'
    : `Restaure +30% du hull (${chargesCurrent}/${chargesMax} charges restantes)`;

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-teal-950/20 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-950/50 text-base">
          🔧
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-300/80">
            Réparation d'urgence
          </div>
          <div className="text-sm font-semibold text-emerald-100 truncate">
            Hull vaisseau mère <span className="font-mono tabular-nums text-emerald-200/80">{hpPct}%</span>
          </div>
        </div>
        <div className="shrink-0 text-xs font-mono tabular-nums text-emerald-200">
          {chargesCurrent}/{chargesMax}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onRepair}
          title={title}
          className="shrink-0 border-emerald-500/50 text-emerald-100 hover:bg-emerald-950/40 hover:border-emerald-400/70"
        >
          {repairPending ? 'Réparation…' : 'Réparer'}
        </Button>
      </div>
    </div>
  );
}

// ─── Sidebar primitives ─────────────────────────────────────────────────────

function SidebarCard({
  label,
  count,
  accent = 'violet',
  children,
}: {
  label: string;
  count?: number | string;
  accent?: 'violet' | 'emerald' | 'amber';
  children: React.ReactNode;
}) {
  const accentMap = {
    violet: 'text-violet-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
  } as const;
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 backdrop-blur-sm p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className={cn('text-[10px] font-mono uppercase tracking-[0.2em] font-semibold', accentMap[accent])}>
          {label}
        </h3>
        {count !== undefined && (
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function FleetCard({
  fleet,
  totalShips,
  gameConfig,
}: {
  fleet: Record<string, FleetEntry>;
  totalShips: number;
  gameConfig: ReturnType<typeof useGameConfig>['data'];
}) {
  return (
    <SidebarCard label="Flotte engagée" count={`${totalShips} VSX`} accent="violet">
      {totalShips === 0 ? (
        <div className="text-xs text-red-400 italic">Aucun vaisseau survivant.</div>
      ) : (
        <div className="space-y-1.5 text-xs">
          {Object.entries(fleet).map(([shipId, entry]) => {
            const def = gameConfig?.ships?.[shipId];
            const hullPct = Math.round(entry.hullPercent * 100);
            return (
              <div key={shipId} className="flex items-center gap-2">
                <span className="flex-1 truncate text-foreground/90">
                  {def?.name ?? shipId}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                  ×{entry.count}
                </span>
                <div className="w-12 h-1 rounded-full bg-white/[0.04] overflow-hidden shrink-0">
                  <div
                    className={cn(
                      'h-full transition-all',
                      hullPct > 60
                        ? 'bg-emerald-500/70'
                        : hullPct > 30
                          ? 'bg-amber-500/70'
                          : 'bg-red-500/70',
                    )}
                    style={{ width: `${hullPct}%` }}
                  />
                </div>
                <span className="w-7 text-right text-[10px] tabular-nums text-muted-foreground shrink-0">
                  {hullPct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </SidebarCard>
  );
}

function LootCard({
  minerai,
  silicium,
  hydrogene,
  lootShips,
  gameConfig,
}: {
  minerai: number;
  silicium: number;
  hydrogene: number;
  lootShips: Record<string, number>;
  gameConfig: ReturnType<typeof useGameConfig>['data'];
}) {
  const totalRes = minerai + silicium + hydrogene;
  return (
    <SidebarCard label="Butin accumulé" accent="emerald">
      <div className="space-y-1.5 text-xs">
        {totalRes > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            <ResPill className="text-minerai bg-minerai/5 border-minerai/20" value={minerai} suffix="M" />
            <ResPill className="text-silicium bg-silicium/5 border-silicium/20" value={silicium} suffix="Si" />
            <ResPill className="text-hydrogene bg-hydrogene/5 border-hydrogene/20" value={hydrogene} suffix="H" />
          </div>
        )}
        {Object.keys(lootShips).length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1 border-t border-border/30">
            {Object.entries(lootShips).map(([id, n]) => {
              const def = gameConfig?.ships?.[id];
              return (
                <span
                  key={id}
                  className="rounded border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[10px] text-emerald-300"
                >
                  +{n} {def?.name ?? id}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </SidebarCard>
  );
}

function ResPill({
  className,
  value,
  suffix,
}: {
  className: string;
  value: number;
  suffix: string;
}) {
  if (value <= 0) {
    return (
      <div className="rounded border border-border/30 bg-card/20 px-1.5 py-1 text-center">
        <div className="text-[10px] tabular-nums text-muted-foreground/40">—</div>
        <div className="text-[8px] uppercase tracking-wider text-muted-foreground/50">{suffix}</div>
      </div>
    );
  }
  return (
    <div className={cn('rounded border px-1.5 py-1 text-center', className)}>
      <div className="text-[11px] font-mono font-semibold tabular-nums">+{formatNumber(value)}</div>
      <div className="text-[8px] uppercase tracking-wider opacity-70">{suffix}</div>
    </div>
  );
}

function ReportsCard({ reportIds }: { reportIds: string[] }) {
  return (
    <SidebarCard label="Rapports de combat" count={reportIds.length} accent="violet">
      <div className="flex flex-wrap gap-1.5">
        {reportIds.map((reportId, i) => (
          <Link
            key={reportId}
            to={`/reports/${reportId}`}
            className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 border border-violet-500/30 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/20 transition-colors"
          >
            <FileText className="h-2.5 w-2.5" />
            P{i + 1}
          </Link>
        ))}
      </div>
    </SidebarCard>
  );
}

// ─── Event node wrapper (auto-scroll into view) ─────────────────────────────

interface AnomalyEventShape {
  id: string;
  enabled: boolean;
  tier: 'early' | 'mid' | 'deep';
  image: string;
  title: string;
  description: string;
  choices: Array<{
    label: string;
    hidden: boolean;
    outcome: {
      minerai: number;
      silicium: number;
      hydrogene: number;
      exilium: number;
      hullDelta: number;
      shipsGain: Record<string, number>;
      shipsLoss: Record<string, number>;
    };
    resolutionText: string;
  }>;
}

function EventNodeBlock({
  eventId,
  event,
  ready,
  disabled,
  nextAt,
}: {
  eventId: string;
  event: AnomalyEventShape | undefined;
  ready: boolean;
  disabled: boolean;
  nextAt: Date | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [eventId]);

  if (!event) {
    return (
      <div ref={containerRef} className="rounded-xl border border-border/40 bg-card/30 p-4 text-xs text-muted-foreground">
        Événement en cours de chargement…
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <AnomalyEventCard event={event} ready={ready} disabled={disabled} nextAt={nextAt} />
    </div>
  );
}

// ─── History (collapsed accordion) ───────────────────────────────────────────

function HistoryAccordion({ history }: { history: AnomalyRow[] }) {
  const [open, setOpen] = useState(false);
  const wipes = history.filter((h) => h.status === 'wiped').length;
  const completed = history.length - wipes;

  return (
    <div className="rounded-lg border border-border/40 bg-card/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-card/40 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground font-semibold">
            Historique
          </h3>
          <span className="text-[10px] text-muted-foreground/70">
            {history.length} runs · <span className="text-red-400/80">{wipes} wipes</span> · <span className="text-emerald-400/80">{completed} retours</span>
          </span>
        </div>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/30 p-3">
          <HistoryList history={history} compact />
        </div>
      )}
    </div>
  );
}

function HistoryList({ history, compact = false }: { history: AnomalyRow[]; compact?: boolean }) {
  return (
    <div className={compact ? '' : 'glass-card p-4'}>
      {!compact && (
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Historique
        </h3>
      )}
      <ul className="divide-y divide-border/20 text-sm">
        {history.map((h) => {
          const minerai = Math.floor(Number(h.lootMinerai));
          const silicium = Math.floor(Number(h.lootSilicium));
          const hydrogene = Math.floor(Number(h.lootHydrogene));
          const totalLoot = minerai + silicium + hydrogene;
          const lootShips = (h.lootShips ?? {}) as Record<string, number>;
          const totalShips = Object.values(lootShips).reduce((s, n) => s + n, 0);
          const reportIds = (h.reportIds ?? []) as string[];

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
            <li key={h.id} className="py-2.5">
              <div className="flex items-center gap-3">
                {icon}
                <span className="text-foreground/80 shrink-0 text-xs">{label}</span>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                  prof {String(h.currentDepth).padStart(2, '0')}
                </span>
                <span className="flex-1 text-[11px] text-muted-foreground/70 truncate">
                  {totalLoot > 0 ? `+${formatNumber(totalLoot)} ressources` : ''}
                  {totalShips > 0 ? ` · +${totalShips} ships` : ''}
                </span>
              </div>
              {reportIds.length > 0 && (
                <div className="mt-1 ml-7 flex flex-wrap gap-1">
                  {reportIds.map((reportId, i) => (
                    <Link
                      key={reportId}
                      to={`/reports/${reportId}`}
                      className="inline-flex items-center gap-1 rounded bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/20 transition-colors"
                    >
                      <FileText className="h-2.5 w-2.5" />
                      P{i + 1}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
