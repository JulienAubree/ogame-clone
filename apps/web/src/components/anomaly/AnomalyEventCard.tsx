import { useState } from 'react';
import { Sparkles, AlertTriangle, Loader2, Lock, Package, Zap, FlaskConical } from 'lucide-react';
import { trpc } from '@/trpc';
import { useToastStore } from '@/stores/toast.store';
import { useGameConfig } from '@/hooks/useGameConfig';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
import { Timer } from '@/components/common/Timer';
import { formatNumber } from '@/lib/format';
import { resolveResearchName } from '@/lib/entity-details';
import { cn } from '@/lib/utils';

type HullId = 'combat' | 'industrial' | 'scientific';
type ModuleRarity = 'common' | 'rare' | 'epic';
type ChoiceTone = 'positive' | 'negative' | 'risky' | 'neutral';

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

interface AnomalyEventOutcomeShape {
  minerai: number;
  silicium: number;
  hydrogene: number;
  exilium: number;
  hullDelta: number;
  shipsGain: Record<string, number>;
  shipsLoss: Record<string, number>;
  moduleDrop?: ModuleRarity;
}

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
    outcome: AnomalyEventOutcomeShape;
    resolutionText: string;
    requiredHull?: HullId;
    requiredResearch?: { researchId: string; minLevel: number };
    /** V8.14 — outcome appliqué quand requiredResearch n'est pas atteint. */
    failureOutcome?: AnomalyEventOutcomeShape;
    failureResolutionText?: string;
    /** V8.14 — tag visuel pur UX. */
    tone?: ChoiceTone;
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
  const { data: gameConfig } = useGameConfig();
  const flagshipHullId = (flagship?.hullId ?? null) as HullId | null;
  const researchLevels: Record<string, number> = {};
  for (const r of researchData?.items ?? []) {
    researchLevels[r.id] = r.currentLevel;
  }

  function getResearchLevel(researchId: string): number {
    return researchLevels[researchId] ?? 0;
  }

  /**
   * V8.14 : on distingue 2 niveaux d'inéligibilité.
   *  - hull mismatch → gate dur (toujours bloquant)
   *  - recherche insuffisante SANS failureOutcome → gate dur
   *  - recherche insuffisante AVEC failureOutcome → cliquable mais "test
   *    technique raté" (badge rouge, applique failureOutcome serveur-side).
   */
  function getIneligibilityReason(
    choice: AnomalyEvent['choices'][number],
  ): string | null {
    if (choice.requiredHull && flagshipHullId !== choice.requiredHull) {
      const label = HULL_LABELS[choice.requiredHull] ?? choice.requiredHull;
      return `Réservé à la coque ${label}`;
    }
    if (
      choice.requiredResearch &&
      getResearchLevel(choice.requiredResearch.researchId) < choice.requiredResearch.minLevel &&
      !choice.failureOutcome  // V8.14 : avec failureOutcome → toujours cliquable
    ) {
      const name = resolveResearchName(choice.requiredResearch.researchId, gameConfig ?? undefined);
      return `Requiert ${name} niv. ${choice.requiredResearch.minLevel}`;
    }
    return null;
  }

  /**
   * V8.14 : retourne l'état du test technique pour un choix donné.
   * `null` si pas de requiredResearch, sinon { current, min, passed }.
   */
  function getSkillCheck(
    choice: AnomalyEvent['choices'][number],
  ): { researchId: string; researchName: string; current: number; min: number; passed: boolean } | null {
    if (!choice.requiredResearch) return null;
    const current = getResearchLevel(choice.requiredResearch.researchId);
    return {
      researchId: choice.requiredResearch.researchId,
      researchName: resolveResearchName(choice.requiredResearch.researchId, gameConfig ?? undefined),
      current,
      min: choice.requiredResearch.minLevel,
      passed: current >= choice.requiredResearch.minLevel,
    };
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
            const skillCheck = getSkillCheck(choice);
            return (
              <ChoiceButton
                key={idx}
                choice={choice}
                disabled={disabled || !ready || resolveMutation.isPending || !eligible}
                ineligibilityReason={ineligibilityReason}
                skillCheck={skillCheck}
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

/**
 * V8.14 — palette par tone. `hidden` reste prioritaire (amber question-mark)
 * mais on layer le tone par-dessus si défini. Neutral = style legacy.
 */
const TONE_STYLES: Record<ChoiceTone, { border: string; bg: string; hover: string; icon: React.ReactNode; label: string }> = {
  positive: {
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/5',
    hover: 'hover:bg-emerald-500/10',
    icon: <Sparkles className="h-3 w-3" />,
    label: 'Favorable',
  },
  negative: {
    border: 'border-red-500/40',
    bg: 'bg-red-500/5',
    hover: 'hover:bg-red-500/10',
    icon: <AlertTriangle className="h-3 w-3" />,
    label: 'Défavorable',
  },
  risky: {
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/5',
    hover: 'hover:bg-amber-500/10',
    icon: <Zap className="h-3 w-3" />,
    label: 'Risqué',
  },
  neutral: {
    border: 'border-border/50',
    bg: 'bg-card/40',
    hover: 'hover:bg-card/70',
    icon: null,
    label: 'Neutre',
  },
};

const TONE_TEXT_COLOR: Record<ChoiceTone, string> = {
  positive: 'text-emerald-300',
  negative: 'text-red-300',
  risky: 'text-amber-300',
  neutral: 'text-foreground/70',
};

function ChoiceButton({
  choice,
  disabled,
  ineligibilityReason,
  skillCheck,
  onClick,
}: {
  choice: AnomalyEvent['choices'][number];
  disabled: boolean;
  ineligibilityReason: string | null;
  skillCheck: { researchId: string; researchName: string; current: number; min: number; passed: boolean } | null;
  onClick: () => void;
}) {
  const ineligible = ineligibilityReason !== null;
  const summary = choice.hidden ? null : <OutcomeSummary outcome={choice.outcome} />;
  const moduleRarity = choice.outcome.moduleDrop;
  const tone: ChoiceTone = choice.tone ?? 'neutral';
  const toneStyle = TONE_STYLES[tone];
  // V8.14 : un skill check raté avec failureOutcome rend le bouton cliquable
  // mais on l'affiche en rouge "Test technique : échec probable".
  const willFailSkillCheck = skillCheck !== null && !skillCheck.passed && choice.failureOutcome !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={ineligibilityReason ?? undefined}
      className={cn(
        'w-full text-left rounded-md border px-3 py-2.5 transition-colors',
        // hidden → amber (priorité) ; sinon palette par tone
        choice.hidden
          ? 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
          : cn(toneStyle.border, toneStyle.bg, toneStyle.hover),
        disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
        ineligible && 'opacity-40 cursor-not-allowed hover:bg-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-foreground/90 flex-1">{choice.label}</span>
        <div className="flex items-center gap-2 shrink-0">
          {!choice.hidden && tone !== 'neutral' && toneStyle.icon && (
            <span
              className={cn(
                'text-[11px] uppercase tracking-wider flex items-center gap-1 rounded border px-1.5 py-0.5',
                toneStyle.border,
                TONE_TEXT_COLOR[tone],
              )}
            >
              {toneStyle.icon}
              {toneStyle.label}
            </span>
          )}
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
      {/* V8.14 — badge "test technique" : vert si réussi, rouge si raté
          (ou amber si bloquant / pas de failureOutcome → géré via ineligible). */}
      {skillCheck && !ineligible && (
        <div
          className={cn(
            'mt-1.5 flex items-center gap-1 text-[11px]',
            skillCheck.passed
              ? 'text-emerald-400'
              : willFailSkillCheck
                ? 'text-red-400'
                : 'text-amber-400/80',
          )}
        >
          <FlaskConical className="h-3 w-3" />
          <span>
            Test {skillCheck.researchName} {skillCheck.current}/{skillCheck.min}
          </span>
          {!skillCheck.passed && willFailSkillCheck && (
            <span className="font-semibold">— échec probable</span>
          )}
        </div>
      )}
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
