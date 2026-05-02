import { useEffect, useMemo, useState } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@exilium/api/trpc';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { AnomalyImageSlot } from '@/components/ui/AnomalyImageSlot';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Save, RotateCcw, ChevronDown, ChevronUp, Plus, Trash2, EyeOff, Eye } from 'lucide-react';

type AnomalyContent = inferRouterOutputs<AppRouter>['anomalyContent']['get'];
type DepthEntry = AnomalyContent['depths'][number];
type EventEntry = AnomalyContent['events'][number];
type ChoiceEntry = EventEntry['choices'][number];
type Outcome = ChoiceEntry['outcome'];

const TIERS = ['early', 'mid', 'deep'] as const;
type Tier = (typeof TIERS)[number];

const TIER_LABELS: Record<Tier, string> = {
  early: 'Profondeurs 1-7',
  mid: 'Profondeurs 8-14',
  deep: 'Profondeurs 15-20',
};

function emptyOutcome(): Outcome {
  return {
    minerai: 0,
    silicium: 0,
    hydrogene: 0,
    exilium: 0,
    hullDelta: 0,
    shipsGain: {},
    shipsLoss: {},
  };
}

function emptyChoice(label = 'Choix'): ChoiceEntry {
  return {
    label,
    hidden: false,
    outcome: emptyOutcome(),
    resolutionText: '',
  };
}

function newEventTemplate(tier: Tier): EventEntry {
  const id = `event-${Math.random().toString(36).slice(2, 9)}`;
  // Defaults must satisfy the Zod schema (min(1) on title/description) so the
  // first save after adding a new event doesn't get rejected silently.
  return {
    id,
    enabled: true,
    tier,
    image: '',
    title: 'Nouvel événement',
    description: 'Description à remplir.',
    choices: [emptyChoice('Premier choix'), emptyChoice('Second choix')],
  };
}

export default function Anomalies() {
  const { data, isLoading, refetch } = trpc.anomalyContent.get.useQuery();
  const updateMutation = trpc.anomalyContent.admin.update.useMutation();
  const resetMutation = trpc.anomalyContent.admin.reset.useMutation();

  const [draft, setDraft] = useState<AnomalyContent | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(data) !== JSON.stringify(draft);
  }, [data, draft]);

  if (isLoading || !draft) return <PageSkeleton />;

  function setDepth(idx: number, entry: DepthEntry) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            depths: prev.depths.map((d, i) => (i === idx ? entry : d)),
          }
        : prev,
    );
  }

  function setEvent(idx: number, entry: EventEntry) {
    setDraft((prev) =>
      prev
        ? { ...prev, events: prev.events.map((e, i) => (i === idx ? entry : e)) }
        : prev,
    );
  }

  function removeEvent(idx: number) {
    setDraft((prev) =>
      prev ? { ...prev, events: prev.events.filter((_, i) => i !== idx) } : prev,
    );
  }

  function addEvent(tier: Tier) {
    setDraft((prev) =>
      prev ? { ...prev, events: [...prev.events, newEventTemplate(tier)] } : prev,
    );
  }

  async function handleSave() {
    if (!draft) return;
    setSaveError(null);
    try {
      await updateMutation.mutateAsync(draft);
      setSavedAt(Date.now());
      await refetch();
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      // Surface validation errors (Zod) and other failures inline so the user
      // doesn't think the save succeeded when it didn't.
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setSaveError(msg);
    }
  }

  async function handleReset() {
    try {
      await resetMutation.mutateAsync();
      setResetConfirm(false);
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      alert(`Réinitialisation échouée : ${msg}`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="sticky top-0 z-10 -mx-6 border-b border-panel-border bg-bg/95 px-6 py-3 backdrop-blur space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-wide text-hull-300">Anomalies gravitationnelles</h1>
            <p className="text-xs text-gray-500">
              Images et textes affichés à chaque profondeur. Pool d&apos;événements aléatoires (V3) au-dessous.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && !updateMutation.isPending && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                Modifications non enregistrées
              </span>
            )}
            <button
              type="button"
              onClick={() => setResetConfirm(true)}
              className="inline-flex items-center gap-1 rounded border border-panel-border px-3 py-1.5 text-xs text-gray-400 hover:text-red-400"
              disabled={resetMutation.isPending}
            >
              <RotateCcw className="h-3 w-3" /> Réinitialiser
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
              className="inline-flex items-center gap-1 rounded bg-hull-600 px-4 py-1.5 text-xs font-semibold text-white shadow transition-colors hover:bg-hull-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {updateMutation.isPending ? 'Enregistrement…' : savedAt ? 'Enregistré' : 'Enregistrer'}
            </button>
          </div>
        </div>
        {saveError && (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <span className="font-semibold">Sauvegarde échouée :</span>{' '}
            <span className="break-words">{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="ml-2 text-red-400/60 hover:text-red-300"
            >
              [fermer]
            </button>
          </div>
        )}
      </div>

      <Section title={`Profondeurs (1 à ${draft.depths.length})`} defaultOpen>
        <p className="mb-4 text-xs text-gray-500">
          L&apos;image est affichée en bandeau au-dessus du combat correspondant. Titre et description sont optionnels — laissés vides, le rendu utilise le style générique violet.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {draft.depths.map((depth, i) => (
            <DepthCard
              key={depth.depth}
              depth={depth}
              onChange={(d) => setDepth(i, d)}
            />
          ))}
        </div>
      </Section>

      <Section title={`Événements aléatoires (${draft.events.length})`} defaultOpen>
        <p className="mb-4 text-xs text-gray-500">
          Pool d&apos;événements narratifs intercalés entre les combats. Chaque event a 2-3 choix avec un outcome ponctuel (ressources, hull, vaisseaux, exilium). Les choix marqués <span className="font-mono">cachés</span> n&apos;exposent pas leur effet avant le clic du joueur.
        </p>
        <EventsEditor
          events={draft.events}
          onSetEvent={setEvent}
          onRemove={removeEvent}
          onAdd={addEvent}
        />
      </Section>

      <ConfirmDialog
        open={resetConfirm}
        title="Réinitialiser le contenu des anomalies"
        message="Toutes les images et textes seront vidés. Les fichiers déjà uploadés ne sont pas supprimés."
        confirmLabel="Réinitialiser"
        danger
        onConfirm={handleReset}
        onCancel={() => setResetConfirm(false)}
      />
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-panel-border bg-panel/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-mono text-sm font-semibold uppercase tracking-wider text-hull-300">
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>
      {open && <div className="border-t border-panel-border p-5">{children}</div>}
    </section>
  );
}

// ─── Events editor ──────────────────────────────────────────────────────────

function EventsEditor({
  events,
  onSetEvent,
  onRemove,
  onAdd,
}: {
  events: EventEntry[];
  onSetEvent: (idx: number, entry: EventEntry) => void;
  onRemove: (idx: number) => void;
  onAdd: (tier: Tier) => void;
}) {
  // Build idx mapping per tier so child components can update via the global index.
  const indexed = events.map((e, idx) => ({ ...e, _idx: idx }));
  const byTier: Record<Tier, Array<EventEntry & { _idx: number }>> = {
    early: indexed.filter((e) => e.tier === 'early'),
    mid: indexed.filter((e) => e.tier === 'mid'),
    deep: indexed.filter((e) => e.tier === 'deep'),
  };

  return (
    <div className="space-y-5">
      {TIERS.map((tier) => (
        <div key={tier} className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono uppercase tracking-wider text-hull-400">
              {tier} <span className="text-gray-600">({TIER_LABELS[tier]})</span>
              <span className="ml-2 text-gray-500">— {byTier[tier].length} event{byTier[tier].length > 1 ? 's' : ''}</span>
            </h4>
            <button
              type="button"
              onClick={() => onAdd(tier)}
              className="inline-flex items-center gap-1 rounded border border-dashed border-hull-700/40 px-2 py-1 text-[11px] text-hull-300 hover:bg-hull-900/30"
            >
              <Plus className="h-3 w-3" /> Ajouter
            </button>
          </div>
          <div className="space-y-2">
            {byTier[tier].map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onChange={(e) => onSetEvent(event._idx, e)}
                onRemove={() => onRemove(event._idx)}
              />
            ))}
            {byTier[tier].length === 0 && (
              <div className="rounded border border-dashed border-panel-border/40 p-3 text-[11px] text-gray-600 text-center">
                Aucun événement dans ce tier.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventCard({
  event,
  onChange,
  onRemove,
}: {
  event: EventEntry;
  onChange: (e: EventEntry) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const slot = `event-${event.id}`;

  function setChoice(idx: number, choice: ChoiceEntry) {
    onChange({ ...event, choices: event.choices.map((c, i) => (i === idx ? choice : c)) });
  }
  function addChoice() {
    if (event.choices.length >= 3) return;
    onChange({ ...event, choices: [...event.choices, emptyChoice('Choix')] });
  }
  function removeChoice(idx: number) {
    if (event.choices.length <= 2) return;
    onChange({ ...event, choices: event.choices.filter((_, i) => i !== idx) });
  }

  return (
    <div className="rounded border border-panel-border/60 bg-panel/40">
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />}
          <span className={`text-xs ${event.enabled ? 'text-hull-300' : 'text-gray-500 line-through'} truncate font-semibold`}>
            {event.title}
          </span>
          <span className="text-[10px] text-gray-500 shrink-0">
            {event.choices.length} choix · {event.id}
          </span>
        </button>
        <label className="inline-flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={event.enabled}
            onChange={(e) => onChange({ ...event, enabled: e.target.checked })}
            className="h-3 w-3"
          />
          Actif
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-500 hover:text-red-400"
          title="Supprimer cet événement"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-panel-border p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <AnomalyImageSlot
              slot={slot}
              value={event.image}
              aspect="16/9"
              label="Image"
              hint="1280×720 recommandé"
              onChange={(path) => onChange({ ...event, image: path })}
            />
            <div className="space-y-2">
              <Field label="ID (kebab-case, immuable une fois utilisé)">
                <TextInput
                  value={event.id}
                  onChange={(v) => onChange({ ...event, id: v })}
                  maxLength={40}
                  placeholder="event-id-stable"
                />
              </Field>
              <Field label="Tier">
                <select
                  value={event.tier}
                  onChange={(e) => onChange({ ...event, tier: e.target.value as Tier })}
                  className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-sm capitalize text-foreground focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>{t} — {TIER_LABELS[t]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Titre (max 80)">
                <TextInput
                  value={event.title}
                  onChange={(v) => onChange({ ...event, title: v })}
                  maxLength={80}
                />
              </Field>
              <Field label="Description (texte d'ambiance, max 1000)">
                <TextArea
                  value={event.description}
                  onChange={(v) => onChange({ ...event, description: v })}
                  rows={3}
                  maxLength={1000}
                />
              </Field>
            </div>
          </div>

          <div className="space-y-2 border-t border-panel-border/40 pt-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-mono uppercase tracking-wider text-gray-400">
                Choix ({event.choices.length}/3)
              </h5>
              {event.choices.length < 3 && (
                <button
                  type="button"
                  onClick={addChoice}
                  className="inline-flex items-center gap-1 rounded border border-dashed border-hull-700/40 px-2 py-0.5 text-[10px] text-hull-300 hover:bg-hull-900/30"
                >
                  <Plus className="h-3 w-3" /> Choix
                </button>
              )}
            </div>
            {event.choices.map((choice, i) => (
              <ChoiceEditor
                key={i}
                idx={i}
                choice={choice}
                canRemove={event.choices.length > 2}
                onChange={(c) => setChoice(i, c)}
                onRemove={() => removeChoice(i)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceEditor({
  idx,
  choice,
  canRemove,
  onChange,
  onRemove,
}: {
  idx: number;
  choice: ChoiceEntry;
  canRemove: boolean;
  onChange: (c: ChoiceEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-panel-border/40 bg-bg/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-hull-400">
          Choix {idx + 1}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...choice, hidden: !choice.hidden })}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] ${
              choice.hidden
                ? 'border-amber-700/40 bg-amber-950/30 text-amber-300'
                : 'border-panel-border bg-panel/40 text-gray-400'
            }`}
            title={choice.hidden ? 'Outcome caché jusqu\'au clic' : 'Outcome visible'}
          >
            {choice.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {choice.hidden ? 'Caché' : 'Visible'}
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-gray-500 hover:text-red-400"
              title="Supprimer ce choix"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <Field label="Label (texte du bouton, max 80)">
        <TextInput
          value={choice.label}
          onChange={(v) => onChange({ ...choice, label: v })}
          maxLength={80}
        />
      </Field>
      <Field label="Texte de résolution (affiché après clic, max 500)">
        <TextArea
          value={choice.resolutionText}
          onChange={(v) => onChange({ ...choice, resolutionText: v })}
          rows={2}
          maxLength={500}
        />
      </Field>
      <OutcomeEditor
        outcome={choice.outcome}
        onChange={(o) => onChange({ ...choice, outcome: o })}
      />
    </div>
  );
}

function OutcomeEditor({
  outcome,
  onChange,
}: {
  outcome: Outcome;
  onChange: (o: Outcome) => void;
}) {
  const { data: gameConfig } = useGameConfig();
  const combatShipIds = useMemo(() => {
    if (!gameConfig?.ships) return [];
    return Object.entries(gameConfig.ships)
      .filter(([id, def]) => id !== 'flagship' && (def as { role?: string })?.role === 'combat')
      .map(([id, def]) => ({ id, name: (def as { name?: string })?.name ?? id }));
  }, [gameConfig]);

  const gainEntries = Object.entries(outcome.shipsGain);
  const lossEntries = Object.entries(outcome.shipsLoss);

  function setShipGain(shipId: string, count: number) {
    const next: Record<string, number> = {};
    for (const [k, v] of gainEntries) if (k !== shipId && v > 0) next[k] = v;
    if (count > 0 && shipId) next[shipId] = count;
    onChange({ ...outcome, shipsGain: next });
  }
  function setShipLoss(shipId: string, count: number) {
    const next: Record<string, number> = {};
    for (const [k, v] of lossEntries) if (k !== shipId && v > 0) next[k] = v;
    if (count > 0 && shipId) next[shipId] = count;
    onChange({ ...outcome, shipsLoss: next });
  }

  // Single-row controls: in V3 we restrict to one ship type per direction
  // (gain or loss). Multi-type can come later.
  const gainShipId = gainEntries[0]?.[0] ?? '';
  const gainShipCount = gainEntries[0]?.[1] ?? 0;
  const lossShipId = lossEntries[0]?.[0] ?? '';
  const lossShipCount = lossEntries[0]?.[1] ?? 0;

  return (
    <div className="rounded border border-panel-border/30 bg-panel/20 p-2 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Outcome</div>
      <div className="grid grid-cols-4 gap-2">
        <NumberField label="Minerai" value={outcome.minerai} onChange={(v) => onChange({ ...outcome, minerai: v })} />
        <NumberField label="Silicium" value={outcome.silicium} onChange={(v) => onChange({ ...outcome, silicium: v })} />
        <NumberField label="Hydrogène" value={outcome.hydrogene} onChange={(v) => onChange({ ...outcome, hydrogene: v })} />
        <NumberField label="Exilium" value={outcome.exilium} onChange={(v) => onChange({ ...outcome, exilium: v })} />
      </div>
      <div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Hull Δ</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={-100}
            max={100}
            step={5}
            value={Math.round(outcome.hullDelta * 100)}
            onChange={(e) => onChange({ ...outcome, hullDelta: Number(e.target.value) / 100 })}
            className="flex-1"
          />
          <span className="w-12 text-right text-xs font-mono tabular-nums text-foreground">
            {Math.round(outcome.hullDelta * 100) > 0 ? '+' : ''}
            {Math.round(outcome.hullDelta * 100)}%
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ShipDeltaField
          label="Gain vaisseaux"
          shipId={gainShipId}
          count={gainShipCount}
          options={combatShipIds}
          onChange={setShipGain}
        />
        <ShipDeltaField
          label="Perte vaisseaux"
          shipId={lossShipId}
          count={lossShipCount}
          options={combatShipIds}
          onChange={setShipLoss}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.floor(Number(e.target.value) || 0))}
        className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-sm text-foreground tabular-nums focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
      />
    </label>
  );
}

function ShipDeltaField({
  label,
  shipId,
  count,
  options,
  onChange,
}: {
  label: string;
  shipId: string;
  count: number;
  options: { id: string; name: string }[];
  onChange: (shipId: string, count: number) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</span>
      <div className="flex gap-1">
        <select
          value={shipId}
          onChange={(e) => onChange(e.target.value, count)}
          className="flex-1 rounded border border-panel-border bg-bg/60 px-1 py-1 text-xs text-foreground focus:border-hull-500 focus:outline-none"
        >
          <option value="">— aucun —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={count || ''}
          placeholder="0"
          disabled={!shipId}
          onChange={(e) => onChange(shipId, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          className="w-16 rounded border border-panel-border bg-bg/60 px-2 py-1 text-xs text-foreground tabular-nums focus:border-hull-500 focus:outline-none disabled:opacity-40"
        />
      </div>
    </div>
  );
}

// ─── Reusable form atoms (mirror Homepage.tsx) ──────────────────────────────

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</span>
      {children}
      {hint && <span className="block text-[9px] text-gray-600">{hint}</span>}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-sm text-foreground placeholder:text-gray-600 focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 3,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      maxLength={maxLength}
      className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-sm text-foreground focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
    />
  );
}

function DepthCard({
  depth,
  onChange,
}: {
  depth: DepthEntry;
  onChange: (d: DepthEntry) => void;
}) {
  const slot = `depth-${depth.depth}`;
  return (
    <div className="space-y-2 rounded border border-panel-border/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-hull-300">
          Profondeur {depth.depth}
        </span>
      </div>
      <AnomalyImageSlot
        slot={slot}
        value={depth.image}
        aspect="16/9"
        label="Illustration"
        hint="Optionnel — 1280×720 recommandé"
        onChange={(path) => onChange({ ...depth, image: path })}
      />
      <label className="block space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Titre</span>
        <input
          type="text"
          value={depth.title}
          onChange={(e) => onChange({ ...depth, title: e.target.value })}
          maxLength={80}
          placeholder={`Profondeur ${depth.depth}`}
          className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-sm text-foreground placeholder:text-gray-600 focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Description</span>
        <textarea
          value={depth.description}
          onChange={(e) => onChange({ ...depth, description: e.target.value })}
          rows={2}
          maxLength={500}
          placeholder="Quelques lignes d'ambiance affichées avec l'image"
          className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-sm text-foreground placeholder:text-gray-600 focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
        />
      </label>
    </div>
  );
}
