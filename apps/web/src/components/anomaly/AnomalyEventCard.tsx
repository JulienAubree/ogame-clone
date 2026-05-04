import { useState } from 'react';
import { Sparkles, AlertTriangle, Loader2, Lock, Package } from 'lucide-react';
import { trpc } from '@/trpc';
import { useToastStore } from '@/stores/toast.store';
import { useGameConfig } from '@/hooks/useGameConfig';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
import { Timer } from '@/components/common/Timer';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

type HullId = 'combat' | 'industrial' | 'scientific';
type ModuleRarity = 'common' | 'rare' | 'epic';

const HULL_LABELS: Record<HullId, string> = {
  combat: 'Combat',
  industrial: 'Industrielle',
  scientific: 'Scientifique',
};

const RARITY_LABELS: Record<ModuleRarity, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
};

const RARITY_COLORS: Record<ModuleRarity, string> = {
  common: 'text-slate-300',
  rare: 'text-sky-300',
  epic: 'text-violet-300',
};

interface AnomalyEvent {
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
      moduleDrop?: ModuleRarity;
    };
    resolutionText: string;
    requiredHull?: HullId;
    requiredResearch?: { researchId: string; minLevel: number };
  }>;
}

interface Props {
  event: AnomalyEvent;
  ready: boolean;
  disabled: boolean;
  /** When ready=false, used to display the countdown to resolution availability. */
  nextAt: Date | null;
}

/**
 * Event card rendered in place of the combat preview when nextNodeType='event'.
 * Visible choices show their outcome inline; hidden choices show "???" and
 * trigger a confirmation modal before resolution (since the player commits
 * blind to the consequences).
 */
export function AnomalyEventCard({ event, ready, disabled, nextAt }: Props) {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const [pendingHidden, setPendingHidden] = useState<number | null>(null);

  // V4 : pré-validation gating côté front pour griser les choix non éligibles.
  const { data: flagship } = trpc.flagship.get.useQuery();
  const { data: researchData } = trpc.research.list.useQuery();
  const flagshipHullId = (flagship?.hullId ?? null) as HullId | null;
  const researchLevels: Record<string, number> = {};
  for (const r of researchData?.items ?? []) {
    researchLevels[r.id] = r.currentLevel;
  }

  function getResearchLevel(researchId: string): number {
    return researchLevels[researchId] ?? 0;
  }

  function getIneligibilityReason(
    choice: AnomalyEvent['choices'][number],
  ): string | null {
    if (choice.requiredHull && flagshipHullId !== choice.requiredHull) {
      const label = HULL_LABELS[choice.requiredHull] ?? choice.requiredHull;
      return `Réservé à la coque ${label}`;
    }
    if (
      choice.requiredResearch &&
      getResearchLevel(choice.requiredResearch.researchId) < choice.requiredResearch.minLevel
    ) {
      return `Requiert ${choice.requiredResearch.researchId} niv. ${choice.requiredResearch.minLevel}`;
    }
    return null;
  }

  const resolveMutation = trpc.anomaly.resolveEvent.useMutation({
    onSuccess: (data) => {
      utils.anomaly.current.invalidate();
      utils.exilium.getBalance.invalidate();
      addToast(
        data.resolutionText || 'Choix résolu — votre flotte continue sa descente.',
        'success',
      );
    },
    onError: (err) => addToast(err.message ?? 'Résolution impossible', 'error'),
  });

  function handleChoice(idx: number, hidden: boolean) {
    if (hidden) {
      setPendingHidden(idx);
      return;
    }
    resolveMutation.mutate({ choiceIndex: idx });
  }

  function confirmHidden() {
    if (pendingHidden == null) return;
    const idx = pendingHidden;
    setPendingHidden(null);
    resolveMutation.mutate({ choiceIndex: idx });
  }

  return (
    <div className="border-t border-border/30 pt-4 -mx-2">
      <div className="relative overflow-hidden rounded-xl border border-violet-500/30 bg-gradient-to-b from-violet-950/40 via-slate-950/60 to-slate-950">
        {/* Illustration bandeau, même langage que AnomalyCombatPreview */}
        <div className="relative h-48 sm:h-56 lg:h-64 w-full overflow-hidden">
          {event.image ? (
            <img
              src={event.image}
              alt={event.title}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-violet-900/70 via-slate-900 to-indigo-900/60" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
          <div className="absolute left-4 top-4 sm:left-5 sm:top-5">
            <div className="inline-flex items-center gap-2 rounded-md border border-violet-300/30 bg-slate-950/70 backdrop-blur px-2.5 py-1">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-violet-200 font-semibold">
                Événement narratif
              </span>
            </div>
          </div>
        </div>

        {/* Texte narratif — toujours présent pour les events */}
        <div className="px-4 pt-4 pb-3 sm:px-5 space-y-2 border-b border-violet-500/15">
          <h3 className="text-base sm:text-lg font-bold text-violet-100 tracking-tight">
            {event.title}
          </h3>
          <p className="text-sm text-foreground/75 italic leading-relaxed whitespace-pre-line">
            {event.description}
          </p>
        </div>

        {/* Choix */}
        <div className="px-4 sm:px-5 py-3 space-y-2">
          {event.choices.map((choice, idx) => {
            const ineligibilityReason = getIneligibilityReason(choice);
            const eligible = ineligibilityReason === null;
            return (
              <ChoiceButton
                key={idx}
                choice={choice}
                disabled={disabled || !ready || resolveMutation.isPending || !eligible}
                ineligibilityReason={ineligibilityReason}
                onClick={() => eligible && handleChoice(idx, choice.hidden)}
              />
            );
          })}

          {!ready && nextAt && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.06] p-3 flex items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">Stabilisation en cours —</span>
              <Timer endTime={nextAt} className="font-mono text-violet-200 tabular-nums font-semibold" />
            </div>
          )}
        </div>
      </div>

      {pendingHidden !== null && (
        <ConfirmHiddenModal
          choice={event.choices[pendingHidden]}
          onConfirm={confirmHidden}
          onCancel={() => setPendingHidden(null)}
          pending={resolveMutation.isPending}
        />
      )}
    </div>
  );
}

function ChoiceButton({
  choice,
  disabled,
  ineligibilityReason,
  onClick,
}: {
  choice: AnomalyEvent['choices'][number];
  disabled: boolean;
  ineligibilityReason: string | null;
  onClick: () => void;
}) {
  const ineligible = ineligibilityReason !== null;
  const summary = choice.hidden ? null : <OutcomeSummary outcome={choice.outcome} />;
  const moduleRarity = choice.outcome.moduleDrop;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={ineligibilityReason ?? undefined}
      className={cn(
        'w-full text-left rounded-md border px-3 py-2.5 transition-colors',
        choice.hidden
          ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
          : 'border-border/50 bg-card/40 hover:bg-card/70',
        disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
        ineligible && 'opacity-40 cursor-not-allowed hover:bg-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-foreground/90 flex-1">{choice.label}</span>
        <div className="flex items-center gap-2 shrink-0">
          {moduleRarity && (
            <span
              className={cn(
                'text-[11px] uppercase tracking-wider flex items-center gap-1 rounded border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5',
                RARITY_COLORS[moduleRarity],
              )}
            >
              <Package className="h-3 w-3" />
              Module {RARITY_LABELS[moduleRarity]}
            </span>
          )}
          {choice.hidden && (
            <span className="text-[11px] uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> ???
            </span>
          )}
        </div>
      </div>
      {summary && <div className="mt-1.5">{summary}</div>}
      {ineligible && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-400/80">
          <Lock className="h-3 w-3" />
          {ineligibilityReason}
        </div>
      )}
    </button>
  );
}

function OutcomeSummary({ outcome }: { outcome: AnomalyEvent['choices'][number]['outcome'] }) {
  const { data: gameConfig } = useGameConfig();
  const parts: React.ReactNode[] = [];

  const r = outcome;
  if (r.minerai !== 0)
    parts.push(<Pill key="m" sign={r.minerai} label="Minerai" value={r.minerai} colorClass="text-minerai" />);
  if (r.silicium !== 0)
    parts.push(<Pill key="s" sign={r.silicium} label="Silicium" value={r.silicium} colorClass="text-silicium" />);
  if (r.hydrogene !== 0)
    parts.push(<Pill key="h" sign={r.hydrogene} label="Hydrogène" value={r.hydrogene} colorClass="text-hydrogene" />);
  if (r.exilium !== 0)
    parts.push(
      <span key="ex" className={cn('inline-flex items-center gap-1 text-xs', r.exilium > 0 ? 'text-purple-300' : 'text-red-300')}>
        <ExiliumIcon size={12} />
        {r.exilium > 0 ? '+' : ''}{r.exilium}
      </span>,
    );
  if (r.hullDelta !== 0) {
    const pct = Math.round(r.hullDelta * 100);
    parts.push(
      <span key="hull" className={cn('text-xs', pct > 0 ? 'text-emerald-400' : 'text-red-400')}>
        Coque {pct > 0 ? '+' : ''}{pct}%
      </span>,
    );
  }
  for (const [shipId, count] of Object.entries(r.shipsGain)) {
    if (count > 0) {
      const name = gameConfig?.ships?.[shipId]?.name ?? shipId;
      parts.push(<span key={`g-${shipId}`} className="text-xs text-emerald-300">+{count} {name}</span>);
    }
  }
  for (const [shipId, count] of Object.entries(r.shipsLoss)) {
    if (count > 0) {
      const name = gameConfig?.ships?.[shipId]?.name ?? shipId;
      parts.push(<span key={`l-${shipId}`} className="text-xs text-red-300">−{count} {name}</span>);
    }
  }
  if (parts.length === 0) {
    return <span className="text-xs text-muted-foreground/70 italic">Aucun effet matériel</span>;
  }
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{parts}</div>;
}

function Pill({ sign, label, value, colorClass }: { sign: number; label: string; value: number; colorClass: string }) {
  return (
    <span className={cn('text-xs', colorClass)}>
      {sign > 0 ? '+' : '−'}{formatNumber(Math.abs(value))} {label[0].toUpperCase()}
    </span>
  );
}

function ConfirmHiddenModal({
  choice,
  onConfirm,
  onCancel,
  pending,
}: {
  choice: AnomalyEvent['choices'][number];
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-md p-5 space-y-3">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          <h3 className="font-bold">Choix risqué</h3>
        </div>
        <p className="text-sm text-foreground/85">
          Vous êtes sur le point de tenter : <span className="font-semibold">{choice.label}</span>.
          Les conséquences ne sont pas connues à l&apos;avance.
        </p>
        <p className="text-xs text-muted-foreground">
          Confirmer ? Vous découvrirez l&apos;issue immédiatement.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-border bg-card px-4 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-md bg-amber-600 hover:bg-amber-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            Tenter
          </button>
        </div>
      </div>
    </div>
  );
}
