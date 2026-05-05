import { useEffect, useMemo, useState } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@exilium/api/trpc';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { AnomalyImageSlot } from '@/components/ui/AnomalyImageSlot';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Save,
  RotateCcw,
  Plus,
  Trash2,
  EyeOff,
  Eye,
  ImageIcon,
  Atom,
  Sparkles,
  Layers,
  ChevronRight,
  Skull,
  Copy,
} from 'lucide-react';

type AnomalyContent = inferRouterOutputs<AppRouter>['anomalyContent']['get'];
type DepthEntry = AnomalyContent['depths'][number];
type EventEntry = AnomalyContent['events'][number];
type ChoiceEntry = EventEntry['choices'][number];
type Outcome = ChoiceEntry['outcome'];
// V9.2 — boss editing types (matches anomaly-bosses.types.ts schema).
type BossEntry = AnomalyContent['bosses'][number];
type BossSkillEntry = BossEntry['skills'][number];
type BossBuffEntry = BossEntry['buffChoices'][number];
type BossStatsEntry = NonNullable<BossEntry['bossStats']>;

const TIERS = ['early', 'mid', 'deep'] as const;
type Tier = (typeof TIERS)[number];

const TIER_LABELS: Record<Tier, string> = {
  early: 'Profondeurs 1-7',
  mid: 'Profondeurs 8-14',
  deep: 'Profondeurs 15-20',
};

// Slim color coding so each tier reads at a glance in the rails.
const TIER_TONE: Record<Tier, { dot: string; pill: string; text: string }> = {
  early: {
    dot: 'bg-emerald-400',
    pill: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    text: 'text-emerald-300',
  },
  mid: {
    dot: 'bg-hull-400',
    pill: 'bg-hull-500/10 border-hull-500/30 text-hull-300',
    text: 'text-hull-300',
  },
  deep: {
    dot: 'bg-amber-400',
    pill: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    text: 'text-amber-300',
  },
};

function tierForDepth(depth: number): Tier {
  if (depth <= 7) return 'early';
  if (depth <= 14) return 'mid';
  return 'deep';
}

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

// V9.2 — boss factory helpers ────────────────────────────────────────────────

const BOSS_SKILL_TYPES = [
  'armor_pierce',
  'regen',
  'shield_aura',
  'damage_burst',
  'summon_drones',
  'disable_battery',
  'armor_corrosion',
  'last_stand',
  'evasion',
  'rafale_swarm',
] as const;
type BossSkillType = (typeof BOSS_SKILL_TYPES)[number];

const BOSS_SKILL_LABELS: Record<BossSkillType, string> = {
  armor_pierce: 'Perforation (armor_pierce)',
  regen: 'Régénération (regen)',
  shield_aura: 'Aura de bouclier (shield_aura)',
  damage_burst: 'Salve dévastatrice (damage_burst)',
  summon_drones: 'Invocation drones (summon_drones)',
  disable_battery: 'Brouillage batterie (disable_battery)',
  armor_corrosion: 'Corrosion armure (armor_corrosion)',
  last_stand: "Sursaut d'agonie (last_stand)",
  evasion: 'Esquive (evasion)',
  rafale_swarm: 'Essaim de rafales (rafale_swarm)',
};

const BOSS_BUFF_TYPES = [
  'damage_boost',
  'hull_repair',
  'shield_amp',
  'armor_amp',
  'extra_charge',
  'module_unlock',
] as const;
type BossBuffType = (typeof BOSS_BUFF_TYPES)[number];

const BOSS_BUFF_LABELS: Record<BossBuffType, string> = {
  damage_boost: 'Dégâts +N% (damage_boost)',
  hull_repair: 'Réparation +N% (hull_repair)',
  shield_amp: 'Bouclier +N% (shield_amp)',
  armor_amp: 'Blindage +N% (armor_amp)',
  extra_charge: 'Charges épiques +N (extra_charge)',
  module_unlock: 'Déblocage module (module_unlock)',
};

function newBossTemplate(tier: Tier): BossEntry {
  const id = `boss-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    enabled: true,
    // V9.2 — Le tier admin (early/mid/deep) doit matcher les profondeurs boss
    // 1/5 (early), 10/15 (mid), 20 (deep). On force `early` même si la
    // profondeur est ≤7 ici car les bosses spawnent uniquement à 1/5/10/15/20.
    tier: tier as BossEntry['tier'],
    image: '',
    name: 'Nouveau boss',
    title: '',
    description: 'Description à remplir.',
    fpMultiplier: 1.5,
    escortFpRatio: 0.4,
    skills: [{ type: 'armor_pierce', magnitude: 0.30 }],
    buffChoices: [
      { type: 'damage_boost', magnitude: 0.20 },
      { type: 'hull_repair', magnitude: 0.30 },
    ],
  };
}

function duplicateBoss(source: BossEntry): BossEntry {
  return {
    ...source,
    id: `${source.id}-copy-${Math.random().toString(36).slice(2, 6)}`,
    name: `${source.name} (copie)`,
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Anomalies() {
  const { data, isLoading, refetch } = trpc.anomalyContent.get.useQuery();
  const updateMutation = trpc.anomalyContent.admin.update.useMutation();
  const resetMutation = trpc.anomalyContent.admin.reset.useMutation();

  const [draft, setDraft] = useState<AnomalyContent | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  const [activeTab, setActiveTab] = useState<'depths' | 'events' | 'bosses'>('depths');
  const [selectedDepth, setSelectedDepth] = useState<number>(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventTierFilter, setEventTierFilter] = useState<Tier | 'all'>('all');
  // V9.2 — boss tab state
  const [selectedBossId, setSelectedBossId] = useState<string | null>(null);
  const [bossTierFilter, setBossTierFilter] = useState<Tier | 'all'>('all');

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  // Auto-select an event when entering the events tab so the detail pane
  // is never empty.
  useEffect(() => {
    if (
      activeTab === 'events' &&
      draft &&
      (!selectedEventId || !draft.events.find((e) => e.id === selectedEventId))
    ) {
      setSelectedEventId(draft.events[0]?.id ?? null);
    }
  }, [activeTab, draft, selectedEventId]);

  // V9.2 — Auto-select a boss when entering the bosses tab.
  useEffect(() => {
    if (
      activeTab === 'bosses' &&
      draft &&
      (!selectedBossId || !draft.bosses.find((b) => b.id === selectedBossId))
    ) {
      setSelectedBossId(draft.bosses[0]?.id ?? null);
    }
  }, [activeTab, draft, selectedBossId]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(data) !== JSON.stringify(draft);
  }, [data, draft]);

  if (isLoading || !draft) return <PageSkeleton />;

  // ── Derived counters ─────────────────────────────────────────────────────
  const depthsWithImage = draft.depths.filter((d) => d.image).length;
  const eventsWithImage = draft.events.filter((e) => e.image).length;
  const enabledEvents = draft.events.filter((e) => e.enabled).length;
  const eventsByTier: Record<Tier, EventEntry[]> = {
    early: draft.events.filter((e) => e.tier === 'early'),
    mid: draft.events.filter((e) => e.tier === 'mid'),
    deep: draft.events.filter((e) => e.tier === 'deep'),
  };
  // V9.2 — boss counters
  const enabledBosses = draft.bosses.filter((b) => b.enabled).length;
  const bossesWithStats = draft.bosses.filter((b) => !!b.bossStats).length;
  const bossesByTier: Record<Tier, BossEntry[]> = {
    early: draft.bosses.filter((b) => b.tier === 'early'),
    mid: draft.bosses.filter((b) => b.tier === 'mid'),
    deep: draft.bosses.filter((b) => b.tier === 'deep'),
  };

  // ── Mutations ────────────────────────────────────────────────────────────
  function setDepth(idx: number, entry: DepthEntry) {
    setDraft((prev) =>
      prev ? { ...prev, depths: prev.depths.map((d, i) => (i === idx ? entry : d)) } : prev,
    );
  }

  function setEventById(id: string, entry: EventEntry) {
    setDraft((prev) =>
      prev ? { ...prev, events: prev.events.map((e) => (e.id === id ? entry : e)) } : prev,
    );
    if (entry.id !== id) setSelectedEventId(entry.id);
  }

  function removeEventById(id: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = prev.events.filter((e) => e.id !== id);
      return { ...prev, events: next };
    });
    setSelectedEventId(null);
  }

  function addEvent(tier: Tier) {
    const tpl = newEventTemplate(tier);
    setDraft((prev) => (prev ? { ...prev, events: [...prev.events, tpl] } : prev));
    setSelectedEventId(tpl.id);
    setEventTierFilter(tier);
  }

  // V9.2 — boss CRUD handlers ───────────────────────────────────────────────
  function setBossById(id: string, entry: BossEntry) {
    setDraft((prev) =>
      prev ? { ...prev, bosses: prev.bosses.map((b) => (b.id === id ? entry : b)) } : prev,
    );
    if (entry.id !== id) setSelectedBossId(entry.id);
  }

  function removeBossById(id: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, bosses: prev.bosses.filter((b) => b.id !== id) };
    });
    setSelectedBossId(null);
  }

  function addBoss(tier: Tier) {
    const tpl = newBossTemplate(tier);
    setDraft((prev) => (prev ? { ...prev, bosses: [...prev.bosses, tpl] } : prev));
    setSelectedBossId(tpl.id);
    setBossTierFilter(tier);
  }

  function dupBoss(source: BossEntry) {
    const copy = duplicateBoss(source);
    setDraft((prev) => (prev ? { ...prev, bosses: [...prev.bosses, copy] } : prev));
    setSelectedBossId(copy.id);
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

  const selectedDepthEntry = draft.depths.find((d) => d.depth === selectedDepth);
  const selectedDepthIdx = draft.depths.findIndex((d) => d.depth === selectedDepth);
  const selectedEvent = selectedEventId ? draft.events.find((e) => e.id === selectedEventId) : null;
  const selectedBoss = selectedBossId ? draft.bosses.find((b) => b.id === selectedBossId) : null;

  return (
    // -m-4 md:-m-6 takes the page full-bleed inside the AdminLayout's padding.
    // h-[calc...] sits inside the available main height (mobile topbar=14, no
    // SPA chrome on desktop) so the rail/detail can scroll independently.
    <div className="-m-4 md:-m-6 flex h-[calc(100vh-3.5rem)] md:h-screen flex-col bg-bg/40">
      {/* ─── Toolbar ────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-panel-border bg-bg/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hull-700/40 bg-hull-950/60">
              <Atom className="h-4 w-4 text-hull-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-hull-300">
                Anomalies / Cabine de pilotage
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                Profondeurs · Événements narratifs · Pool de seed éditable
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StatPill label="prof. illustrées" value={`${depthsWithImage}/${draft.depths.length}`} />
            <StatPill
              label="events actifs"
              value={`${enabledEvents}/${draft.events.length}`}
            />
            <StatPill label="images events" value={`${eventsWithImage}/${draft.events.length}`} />
            <StatPill label="boss actifs" value={`${enabledBosses}/${draft.bosses.length}`} />
            <StatPill label="boss-as-unit" value={`${bossesWithStats}/${draft.bosses.length}`} />
            <div className="mx-1 h-7 w-px bg-panel-border" />
            {dirty && !updateMutation.isPending && (
              <span className="rounded-sm bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-amber-300">
                ● Modifs non enregistrées
              </span>
            )}
            <button
              type="button"
              onClick={() => setResetConfirm(true)}
              className="inline-flex items-center gap-1 rounded border border-panel-border px-3 py-1.5 text-xs text-gray-400 hover:border-red-500/40 hover:text-red-400 transition-colors"
              disabled={resetMutation.isPending}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded bg-hull-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-hull-900/40 transition-colors hover:bg-hull-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <Save className="h-3 w-3" />
              {updateMutation.isPending ? 'Enregistrement…' : savedAt ? 'Enregistré' : 'Enregistrer'}
            </button>
          </div>
        </div>

        {/* ─── Tabs ───────────────────────────────────────────────────── */}
        <div className="flex border-t border-panel-border/60">
          <TabButton
            active={activeTab === 'depths'}
            onClick={() => setActiveTab('depths')}
            label="Profondeurs"
            count={draft.depths.length}
            icon={<Layers className="h-3.5 w-3.5" />}
          />
          <TabButton
            active={activeTab === 'events'}
            onClick={() => setActiveTab('events')}
            label="Événements narratifs"
            count={draft.events.length}
            icon={<Sparkles className="h-3.5 w-3.5" />}
          />
          <TabButton
            active={activeTab === 'bosses'}
            onClick={() => setActiveTab('bosses')}
            label="Boss"
            count={draft.bosses.length}
            icon={<Skull className="h-3.5 w-3.5" />}
          />
        </div>

        {saveError && (
          <div className="border-t border-red-500/30 bg-red-500/10 px-5 py-2 text-xs text-red-300">
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
      </header>

      {/* ─── Workbench (rail + detail) ──────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[340px_1fr] overflow-hidden">
        {activeTab === 'depths' ? (
          <>
            <DepthRail
              depths={draft.depths}
              selected={selectedDepth}
              onSelect={setSelectedDepth}
            />
            {selectedDepthEntry ? (
              <DepthDetail
                depth={selectedDepthEntry}
                onChange={(d) => setDepth(selectedDepthIdx, d)}
              />
            ) : (
              <EmptyDetail
                icon={<Layers className="h-6 w-6 text-hull-400/60" />}
                title="Sélectionne une profondeur"
                hint="Le panneau latéral liste les 20 paliers. L'illustration active sera affichée au-dessus du combat correspondant."
              />
            )}
          </>
        ) : activeTab === 'events' ? (
          <>
            <EventRail
              events={draft.events}
              eventsByTier={eventsByTier}
              selectedId={selectedEventId}
              tierFilter={eventTierFilter}
              onTierFilter={setEventTierFilter}
              onSelect={setSelectedEventId}
              onAdd={addEvent}
            />
            {selectedEvent ? (
              <EventDetail
                event={selectedEvent}
                onChange={(e) => setEventById(selectedEvent.id, e)}
                onRemove={() => removeEventById(selectedEvent.id)}
              />
            ) : (
              <EmptyDetail
                icon={<Sparkles className="h-6 w-6 text-hull-400/60" />}
                title="Aucun événement sélectionné"
                hint="Ajoute un nouvel event via le bouton + dans le rail, ou sélectionne-en un existant."
              />
            )}
          </>
        ) : (
          <>
            <BossRail
              bosses={draft.bosses}
              bossesByTier={bossesByTier}
              selectedId={selectedBossId}
              tierFilter={bossTierFilter}
              onTierFilter={setBossTierFilter}
              onSelect={setSelectedBossId}
              onAdd={addBoss}
            />
            {selectedBoss ? (
              <BossDetail
                boss={selectedBoss}
                onChange={(b) => setBossById(selectedBoss.id, b)}
                onRemove={() => removeBossById(selectedBoss.id)}
                onDuplicate={() => dupBoss(selectedBoss)}
              />
            ) : (
              <EmptyDetail
                icon={<Skull className="h-6 w-6 text-hull-400/60" />}
                title="Aucun boss sélectionné"
                hint="Ajoute un boss via le bouton + ou sélectionne-en un dans la pool."
              />
            )}
          </>
        )}
      </div>

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

// ─── Toolbar atoms ──────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden md:block rounded-sm border border-panel-border/60 bg-panel/40 px-2.5 py-1 text-right">
      <div className="font-mono text-[14px] leading-none tabular-nums text-hull-200 font-semibold">
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-5 py-2.5 text-xs font-mono uppercase tracking-[0.16em] transition-colors ${
        active
          ? 'text-hull-300 bg-hull-950/40'
          : 'text-gray-500 hover:text-gray-300 hover:bg-panel/30'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        className={`rounded-sm px-1.5 py-0.5 text-[10px] tabular-nums ${
          active ? 'bg-hull-500/20 text-hull-200' : 'bg-panel/60 text-gray-500'
        }`}
      >
        {count}
      </span>
      {active && (
        <span className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-hull-400 to-transparent" />
      )}
    </button>
  );
}

// ─── Depth rail ─────────────────────────────────────────────────────────────

function DepthRail({
  depths,
  selected,
  onSelect,
}: {
  depths: DepthEntry[];
  selected: number;
  onSelect: (depth: number) => void;
}) {
  return (
    <aside className="border-r border-panel-border bg-bg/60 overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-panel-border/60 bg-bg/95 backdrop-blur px-4 py-2">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
          Paliers
        </div>
        <div className="text-[10px] text-gray-600">
          Clique pour éditer · {depths.length} entrées
        </div>
      </div>
      <ul className="p-2 space-y-1">
        {depths.map((depth) => (
          <li key={depth.depth}>
            <DepthRailRow
              depth={depth}
              selected={depth.depth === selected}
              onClick={() => onSelect(depth.depth)}
            />
          </li>
        ))}
      </ul>
    </aside>
  );
}

function DepthRailRow({
  depth,
  selected,
  onClick,
}: {
  depth: DepthEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const tier = tierForDepth(depth.depth);
  const tone = TIER_TONE[tier];
  const cacheBust = depth.image ? `?t=${depth.image.length}` : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full flex items-center gap-3 rounded border px-2 py-1.5 text-left transition-all ${
        selected
          ? 'border-hull-500/50 bg-hull-950/40 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.15)]'
          : 'border-transparent hover:bg-panel/40 hover:border-panel-border/60'
      }`}
    >
      <div
        className={`shrink-0 grid h-9 w-9 place-items-center rounded font-mono text-[15px] tabular-nums leading-none border ${
          selected
            ? 'border-hull-400/60 bg-hull-900/40 text-hull-200'
            : 'border-panel-border bg-bg/50 text-gray-400 group-hover:text-hull-300'
        }`}
      >
        {String(depth.depth).padStart(2, '0')}
      </div>
      <div className="shrink-0 h-9 w-14 overflow-hidden rounded border border-panel-border/60 bg-panel/30">
        {depth.image ? (
          <img
            src={`${depth.image}-thumb.webp${cacheBust}`}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              // Fallback to the hero file if the thumb didn't generate.
              const img = e.currentTarget;
              if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = `${depth.image}${cacheBust}`;
              } else {
                img.style.display = 'none';
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-3.5 w-3.5 text-gray-700" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-xs ${
            depth.title ? 'text-hull-200 font-semibold' : 'text-gray-600 italic'
          }`}
        >
          {depth.title || `Profondeur ${depth.depth}`}
        </div>
        <div className={`text-[9px] font-mono uppercase tracking-wider mt-0.5 ${tone.text}`}>
          {tier}
        </div>
      </div>
      {selected && <ChevronRight className="h-3.5 w-3.5 text-hull-300 shrink-0" />}
    </button>
  );
}

// ─── Depth detail ───────────────────────────────────────────────────────────

function DepthDetail({
  depth,
  onChange,
}: {
  depth: DepthEntry;
  onChange: (d: DepthEntry) => void;
}) {
  const tier = tierForDepth(depth.depth);
  const tone = TIER_TONE[tier];
  return (
    <main className="overflow-y-auto bg-bg/40">
      <DetailHeader
        eyebrow={`Palier · ${tier}`}
        eyebrowToneClass={tone.text}
        title={
          <span className="flex items-baseline gap-3">
            <span className="font-mono text-3xl tabular-nums text-hull-200">
              {String(depth.depth).padStart(2, '0')}
            </span>
            <span className="text-base font-semibold text-foreground/90">
              {depth.title || `Profondeur ${depth.depth}`}
            </span>
          </span>
        }
        hint="Affiché en bandeau au-dessus du combat correspondant côté joueur."
      />
      <div className="p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Field label="Titre (max 80, vide = générique)">
            <TextInput
              value={depth.title}
              onChange={(v) => onChange({ ...depth, title: v })}
              maxLength={80}
              placeholder={`Profondeur ${depth.depth}`}
            />
          </Field>
          <Field label="Description (max 500, vide = pas de texte)">
            <TextArea
              value={depth.description}
              onChange={(v) => onChange({ ...depth, description: v })}
              rows={5}
              maxLength={500}
              placeholder="Quelques lignes d'ambiance affichées avec l'image."
            />
          </Field>
        </div>
        <div>
          <AnomalyImageSlot
            slot={`depth-${depth.depth}`}
            value={depth.image}
            aspect="16/9"
            label="Illustration"
            hint="Optionnel — 1280×720 recommandé"
            onChange={(path) => onChange({ ...depth, image: path })}
          />
        </div>
      </div>
    </main>
  );
}

// ─── Event rail ─────────────────────────────────────────────────────────────

function EventRail({
  events,
  eventsByTier,
  selectedId,
  tierFilter,
  onTierFilter,
  onSelect,
  onAdd,
}: {
  events: EventEntry[];
  eventsByTier: Record<Tier, EventEntry[]>;
  selectedId: string | null;
  tierFilter: Tier | 'all';
  onTierFilter: (t: Tier | 'all') => void;
  onSelect: (id: string) => void;
  onAdd: (tier: Tier) => void;
}) {
  const filteredEvents =
    tierFilter === 'all' ? events : events.filter((e) => e.tier === tierFilter);
  const totalEnabled = events.filter((e) => e.enabled).length;

  return (
    <aside className="border-r border-panel-border bg-bg/60 overflow-y-auto flex flex-col">
      <div className="sticky top-0 z-10 border-b border-panel-border/60 bg-bg/95 backdrop-blur p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
              Pool d&apos;événements
            </div>
            <div className="text-[10px] text-gray-600">
              {totalEnabled}/{events.length} actifs
            </div>
          </div>
          <div className="relative group">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-hull-700/40 bg-hull-900/30 px-2 py-1 text-[11px] text-hull-300 hover:bg-hull-900/60"
            >
              <Plus className="h-3 w-3" /> Nouveau
            </button>
            {/* Tier picker on hover/focus */}
            <div className="invisible group-hover:visible group-focus-within:visible absolute right-0 top-full mt-1 z-20 min-w-[140px] rounded border border-panel-border bg-panel shadow-lg overflow-hidden">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onAdd(t)}
                  className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-hull-900/40 ${TIER_TONE[t].text}`}
                >
                  + {t}{' '}
                  <span className="text-gray-500 normal-case">({TIER_LABELS[t]})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tier filter chips */}
        <div className="flex gap-1">
          <FilterChip
            active={tierFilter === 'all'}
            onClick={() => onTierFilter('all')}
            label="Tous"
            count={events.length}
          />
          {TIERS.map((t) => (
            <FilterChip
              key={t}
              active={tierFilter === t}
              onClick={() => onTierFilter(t)}
              label={t}
              count={eventsByTier[t].length}
              tone={TIER_TONE[t].text}
            />
          ))}
        </div>
      </div>

      <ul className="p-2 space-y-1">
        {filteredEvents.length === 0 ? (
          <li className="rounded border border-dashed border-panel-border/40 p-4 text-center text-[11px] text-gray-600">
            Aucun événement dans ce filtre.
          </li>
        ) : (
          filteredEvents.map((event) => (
            <li key={event.id}>
              <EventRailRow
                event={event}
                selected={event.id === selectedId}
                onClick={() => onSelect(event.id)}
              />
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
        active
          ? `border-hull-500/50 bg-hull-950/50 ${tone ?? 'text-hull-200'}`
          : 'border-panel-border bg-panel/30 text-gray-500 hover:text-gray-300'
      }`}
    >
      {label} <span className="opacity-60 tabular-nums">{count}</span>
    </button>
  );
}

function EventRailRow({
  event,
  selected,
  onClick,
}: {
  event: EventEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const tone = TIER_TONE[event.tier];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full flex items-center gap-2 rounded border px-2 py-1.5 text-left transition-all ${
        selected
          ? 'border-hull-500/50 bg-hull-950/40 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.15)]'
          : 'border-transparent hover:bg-panel/40 hover:border-panel-border/60'
      }`}
    >
      <span
        className={`shrink-0 h-2 w-2 rounded-full ${
          event.enabled ? tone.dot : 'bg-gray-700'
        } ${event.enabled ? 'shadow-[0_0_4px_currentColor]' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-xs ${
            event.enabled ? 'text-foreground/90 font-semibold' : 'text-gray-600 italic line-through'
          }`}
        >
          {event.title}
        </div>
        <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider mt-0.5">
          <span className={tone.text}>{event.tier}</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-500">{event.choices.length} choix</span>
          {event.choices.some((c) => c.hidden) && (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-amber-400 inline-flex items-center gap-0.5">
                <EyeOff className="h-2.5 w-2.5" />
                caché
              </span>
            </>
          )}
        </div>
      </div>
      {selected && <ChevronRight className="h-3.5 w-3.5 text-hull-300 shrink-0" />}
    </button>
  );
}

// ─── Event detail ───────────────────────────────────────────────────────────

function EventDetail({
  event,
  onChange,
  onRemove,
}: {
  event: EventEntry;
  onChange: (e: EventEntry) => void;
  onRemove: () => void;
}) {
  const tone = TIER_TONE[event.tier];

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
    <main className="overflow-y-auto bg-bg/40">
      <DetailHeader
        eyebrow={`Événement · ${event.tier}`}
        eyebrowToneClass={tone.text}
        title={
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                event.enabled ? tone.dot : 'bg-gray-600'
              } ${event.enabled ? 'shadow-[0_0_6px_currentColor]' : ''}`}
            />
            <span className="text-base font-semibold text-foreground/90">{event.title}</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-600">
              · {event.id}
            </span>
          </span>
        }
        hint="Apparaît entre 2 combats — résolution instantanée selon le choix du joueur."
        actions={
          <>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-400">
              <input
                type="checkbox"
                checked={event.enabled}
                onChange={(e) => onChange({ ...event, enabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-hull-500"
              />
              <span className={event.enabled ? 'text-emerald-300' : 'text-gray-500'}>
                {event.enabled ? 'Actif' : 'Désactivé'}
              </span>
            </label>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded border border-panel-border px-2 py-1 text-[11px] text-gray-400 hover:border-red-500/40 hover:text-red-400 transition-colors"
              title="Supprimer cet événement"
            >
              <Trash2 className="h-3 w-3" /> Supprimer
            </button>
          </>
        }
      />

      <div className="p-6 space-y-6">
        {/* Identity + image */}
        <section className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <AnomalyImageSlot
            slot={`event-${event.id}`}
            value={event.image}
            aspect="16/9"
            label="Image"
            hint="1280×720 recommandé"
            onChange={(path) => onChange({ ...event, image: path })}
          />
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ID (kebab-case, immuable)">
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
                    <option key={t} value={t}>
                      {t} — {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Titre (max 80)">
              <TextInput
                value={event.title}
                onChange={(v) => onChange({ ...event, title: v })}
                maxLength={80}
              />
            </Field>
            <Field label="Description (max 1000)">
              <TextArea
                value={event.description}
                onChange={(v) => onChange({ ...event, description: v })}
                rows={4}
                maxLength={1000}
              />
            </Field>
          </div>
        </section>

        {/* Choices */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] text-hull-400">
              Choix proposés au joueur ({event.choices.length}/3)
            </h3>
            {event.choices.length < 3 && (
              <button
                type="button"
                onClick={addChoice}
                className="inline-flex items-center gap-1 rounded border border-dashed border-hull-700/40 px-2 py-1 text-[10px] text-hull-300 hover:bg-hull-900/30"
              >
                <Plus className="h-3 w-3" /> Ajouter un choix
              </button>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
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
        </section>
      </div>
    </main>
  );
}

// ─── Detail layout primitives ───────────────────────────────────────────────

function DetailHeader({
  eyebrow,
  eyebrowToneClass,
  title,
  hint,
  actions,
}: {
  eyebrow: string;
  eyebrowToneClass: string;
  title: React.ReactNode;
  hint?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-panel-border/60 bg-bg/60 px-6 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div
            className={`text-[10px] font-mono uppercase tracking-[0.18em] ${eyebrowToneClass}`}
          >
            {eyebrow}
          </div>
          <div className="mt-1.5">{title}</div>
          {hint && <div className="mt-1 text-[11px] text-gray-500">{hint}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

function EmptyDetail({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <main className="flex items-center justify-center bg-bg/40">
      <div className="max-w-sm text-center px-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-hull-700/30 bg-hull-950/30">
          {icon}
        </div>
        <div className="text-sm font-semibold text-hull-200">{title}</div>
        <div className="mt-1 text-xs text-gray-500">{hint}</div>
      </div>
    </main>
  );
}

// ─── Choice editor (compact card) ───────────────────────────────────────────

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
    <div
      className={`rounded border p-3 space-y-2 ${
        choice.hidden
          ? 'border-amber-500/30 bg-amber-500/[0.04]'
          : 'border-panel-border/60 bg-bg/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-hull-400">
          Choix {idx + 1}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ ...choice, hidden: !choice.hidden })}
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] transition-colors ${
              choice.hidden
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-panel-border bg-panel/40 text-gray-400 hover:text-gray-200'
            }`}
            title={choice.hidden ? "Outcome caché jusqu'au clic" : 'Outcome visible'}
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
      <Field label="Label (texte du bouton)">
        <TextInput
          value={choice.label}
          onChange={(v) => onChange({ ...choice, label: v })}
          maxLength={80}
        />
      </Field>
      <Field label="Texte de résolution">
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

// ─── Outcome editor ─────────────────────────────────────────────────────────

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

  const gainShipId = gainEntries[0]?.[0] ?? '';
  const gainShipCount = gainEntries[0]?.[1] ?? 0;
  const lossShipId = lossEntries[0]?.[0] ?? '';
  const lossShipCount = lossEntries[0]?.[1] ?? 0;
  const hullPct = Math.round(outcome.hullDelta * 100);

  return (
    <div className="rounded border border-panel-border/30 bg-panel/20 p-2 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
        Outcome
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="Minerai"
          value={outcome.minerai}
          onChange={(v) => onChange({ ...outcome, minerai: v })}
        />
        <NumberField
          label="Silicium"
          value={outcome.silicium}
          onChange={(v) => onChange({ ...outcome, silicium: v })}
        />
        <NumberField
          label="Hydrogène"
          value={outcome.hydrogene}
          onChange={(v) => onChange({ ...outcome, hydrogene: v })}
        />
        <NumberField
          label="Exilium"
          value={outcome.exilium}
          onChange={(v) => onChange({ ...outcome, exilium: v })}
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
            Hull Δ
          </span>
          <span
            className={`text-[11px] font-mono tabular-nums ${
              hullPct > 0
                ? 'text-emerald-400'
                : hullPct < 0
                  ? 'text-red-400'
                  : 'text-gray-500'
            }`}
          >
            {hullPct > 0 ? '+' : ''}
            {hullPct}%
          </span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          step={5}
          value={hullPct}
          onChange={(e) => onChange({ ...outcome, hullDelta: Number(e.target.value) / 100 })}
          className="w-full accent-hull-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ShipDeltaField
          label="+ Vaisseaux"
          shipId={gainShipId}
          count={gainShipCount}
          options={combatShipIds}
          onChange={setShipGain}
        />
        <ShipDeltaField
          label="− Vaisseaux"
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
        className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-xs text-foreground tabular-nums focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
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
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={count || ''}
          placeholder="0"
          disabled={!shipId}
          onChange={(e) =>
            onChange(shipId, Math.max(0, Math.floor(Number(e.target.value) || 0)))
          }
          className="w-14 rounded border border-panel-border bg-bg/60 px-1.5 py-1 text-xs text-foreground tabular-nums focus:border-hull-500 focus:outline-none disabled:opacity-40"
        />
      </div>
    </div>
  );
}

// ─── Boss rail (V9.2) ──────────────────────────────────────────────────────

function BossRail({
  bosses,
  bossesByTier,
  selectedId,
  tierFilter,
  onTierFilter,
  onSelect,
  onAdd,
}: {
  bosses: BossEntry[];
  bossesByTier: Record<Tier, BossEntry[]>;
  selectedId: string | null;
  tierFilter: Tier | 'all';
  onTierFilter: (t: Tier | 'all') => void;
  onSelect: (id: string) => void;
  onAdd: (tier: Tier) => void;
}) {
  const filtered = tierFilter === 'all' ? bosses : bosses.filter((b) => b.tier === tierFilter);
  const totalEnabled = bosses.filter((b) => b.enabled).length;

  return (
    <aside className="border-r border-panel-border bg-bg/60 overflow-y-auto flex flex-col">
      <div className="sticky top-0 z-10 border-b border-panel-border/60 bg-bg/95 backdrop-blur p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500">
              Pool de boss
            </div>
            <div className="text-[10px] text-gray-600">
              {totalEnabled}/{bosses.length} actifs
            </div>
          </div>
          <div className="relative group">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-rose-700/40 bg-rose-900/30 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-900/60"
            >
              <Plus className="h-3 w-3" /> Nouveau
            </button>
            <div className="invisible group-hover:visible group-focus-within:visible absolute right-0 top-full mt-1 z-20 min-w-[140px] rounded border border-panel-border bg-panel shadow-lg overflow-hidden">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onAdd(t)}
                  className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-rose-900/40 ${TIER_TONE[t].text}`}
                >
                  + {t}{' '}
                  <span className="text-gray-500 normal-case">({TIER_LABELS[t]})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-1">
          <FilterChip
            active={tierFilter === 'all'}
            onClick={() => onTierFilter('all')}
            label="Tous"
            count={bosses.length}
          />
          {TIERS.map((t) => (
            <FilterChip
              key={t}
              active={tierFilter === t}
              onClick={() => onTierFilter(t)}
              label={t}
              count={bossesByTier[t].length}
              tone={TIER_TONE[t].text}
            />
          ))}
        </div>
      </div>

      <ul className="p-2 space-y-1">
        {filtered.length === 0 ? (
          <li className="rounded border border-dashed border-panel-border/40 p-4 text-center text-[11px] text-gray-600">
            Aucun boss dans ce filtre.
          </li>
        ) : (
          filtered.map((boss) => (
            <li key={boss.id}>
              <BossRailRow
                boss={boss}
                selected={boss.id === selectedId}
                onClick={() => onSelect(boss.id)}
              />
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

function BossRailRow({
  boss,
  selected,
  onClick,
}: {
  boss: BossEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const tone = TIER_TONE[boss.tier];
  const hasStats = !!boss.bossStats;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full flex items-center gap-2 rounded border px-2 py-1.5 text-left transition-all ${
        selected
          ? 'border-rose-500/50 bg-rose-950/40 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.15)]'
          : 'border-transparent hover:bg-panel/40 hover:border-panel-border/60'
      }`}
    >
      <span
        className={`shrink-0 h-2 w-2 rounded-full ${
          boss.enabled ? tone.dot : 'bg-gray-700'
        } ${boss.enabled ? 'shadow-[0_0_4px_currentColor]' : ''}`}
      />
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-xs ${
            boss.enabled
              ? 'text-foreground/90 font-semibold'
              : 'text-gray-600 italic line-through'
          }`}
        >
          {boss.name}
        </div>
        <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider mt-0.5">
          <span className={tone.text}>{boss.tier}</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-500">{boss.skills.length}sk · {boss.buffChoices.length}b</span>
          {hasStats && (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-emerald-400">unit</span>
            </>
          )}
          {!hasStats && (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-amber-400/80">FP-only</span>
            </>
          )}
        </div>
      </div>
      {selected && <ChevronRight className="h-3.5 w-3.5 text-rose-300 shrink-0" />}
    </button>
  );
}

// ─── Boss detail (V9.2) ────────────────────────────────────────────────────

function BossDetail({
  boss,
  onChange,
  onRemove,
  onDuplicate,
}: {
  boss: BossEntry;
  onChange: (b: BossEntry) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const tone = TIER_TONE[boss.tier];

  function setSkill(idx: number, skill: BossSkillEntry) {
    onChange({
      ...boss,
      skills: boss.skills.map((s, i) => (i === idx ? skill : s)),
    });
  }
  function addSkill() {
    if (boss.skills.length >= 2) return;
    onChange({
      ...boss,
      skills: [...boss.skills, { type: 'armor_pierce', magnitude: 0.30 }],
    });
  }
  function removeSkill(idx: number) {
    if (boss.skills.length <= 1) return;
    onChange({ ...boss, skills: boss.skills.filter((_, i) => i !== idx) });
  }

  function setBuff(idx: number, buff: BossBuffEntry) {
    onChange({
      ...boss,
      buffChoices: boss.buffChoices.map((b, i) => (i === idx ? buff : b)),
    });
  }
  function addBuff() {
    if (boss.buffChoices.length >= 3) return;
    onChange({
      ...boss,
      buffChoices: [...boss.buffChoices, { type: 'damage_boost', magnitude: 0.20 }],
    });
  }
  function removeBuff(idx: number) {
    if (boss.buffChoices.length <= 1) return;
    onChange({ ...boss, buffChoices: boss.buffChoices.filter((_, i) => i !== idx) });
  }

  function toggleBossStats() {
    if (boss.bossStats) {
      // Remove stats — fallback FP-only mode.
      const { bossStats, ...rest } = boss;
      void bossStats;
      onChange(rest as BossEntry);
    } else {
      // Inject default stats based on tier.
      const defaults: Record<Tier, BossStatsEntry> = {
        early: { hull: 280, shield: 110, armor: 7, weapons: 45, shotCount: 1 },
        mid: { hull: 1100, shield: 400, armor: 18, weapons: 150, shotCount: 2 },
        deep: { hull: 4500, shield: 1500, armor: 38, weapons: 600, shotCount: 3 },
      };
      onChange({ ...boss, bossStats: defaults[boss.tier] });
    }
  }

  function setStats(patch: Partial<BossStatsEntry>) {
    if (!boss.bossStats) return;
    onChange({ ...boss, bossStats: { ...boss.bossStats, ...patch } });
  }

  return (
    <main className="overflow-y-auto bg-bg/40">
      <DetailHeader
        eyebrow={`Boss · ${boss.tier}`}
        eyebrowToneClass={tone.text}
        title={
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                boss.enabled ? tone.dot : 'bg-gray-600'
              } ${boss.enabled ? 'shadow-[0_0_6px_currentColor]' : ''}`}
            />
            <span className="text-base font-semibold text-foreground/90">{boss.name}</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-600">
              · {boss.id}
            </span>
          </span>
        }
        hint="Spawn aux profondeurs 1, 5, 10, 15, 20 selon le tier. Skills + buffs parmi les enums fixes."
        actions={
          <>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-400">
              <input
                type="checkbox"
                checked={boss.enabled}
                onChange={(e) => onChange({ ...boss, enabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-rose-500"
              />
              <span className={boss.enabled ? 'text-emerald-300' : 'text-gray-500'}>
                {boss.enabled ? 'Actif' : 'Désactivé'}
              </span>
            </label>
            <button
              type="button"
              onClick={onDuplicate}
              className="inline-flex items-center gap-1 rounded border border-panel-border px-2 py-1 text-[11px] text-gray-400 hover:border-hull-500/40 hover:text-hull-300 transition-colors"
              title="Dupliquer ce boss"
            >
              <Copy className="h-3 w-3" /> Dupliquer
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded border border-panel-border px-2 py-1 text-[11px] text-gray-400 hover:border-red-500/40 hover:text-red-400 transition-colors"
              title="Supprimer ce boss"
            >
              <Trash2 className="h-3 w-3" /> Supprimer
            </button>
          </>
        }
      />

      <div className="p-6 space-y-6">
        {/* Identity + image */}
        <section className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <AnomalyImageSlot
            slot={`boss-${boss.id}`}
            value={boss.image}
            aspect="16/9"
            label="Image"
            hint="1280×720 recommandé"
            onChange={(path) => onChange({ ...boss, image: path })}
          />
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ID (kebab-case, immuable)">
                <TextInput
                  value={boss.id}
                  onChange={(v) => onChange({ ...boss, id: v })}
                  maxLength={40}
                  placeholder="boss-id-stable"
                />
              </Field>
              <Field label="Tier (depth pool)">
                <select
                  value={boss.tier}
                  onChange={(e) => onChange({ ...boss, tier: e.target.value as BossEntry['tier'] })}
                  className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-sm capitalize text-foreground focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
                >
                  <option value="early">early — depth 1, 5</option>
                  <option value="mid">mid — depth 10, 15</option>
                  <option value="deep">deep — depth 20</option>
                </select>
              </Field>
            </div>
            <Field label="Nom (max 80)">
              <TextInput
                value={boss.name}
                onChange={(v) => onChange({ ...boss, name: v })}
                maxLength={80}
              />
            </Field>
            <Field label="Titre / sous-titre (max 120)">
              <TextInput
                value={boss.title}
                onChange={(v) => onChange({ ...boss, title: v })}
                maxLength={120}
              />
            </Field>
            <Field label="Description (max 1000)">
              <TextArea
                value={boss.description}
                onChange={(v) => onChange({ ...boss, description: v })}
                rows={4}
                maxLength={1000}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="FP multiplier (1.0–5.0)">
                <input
                  type="number"
                  step={0.1}
                  min={1}
                  max={5}
                  value={boss.fpMultiplier}
                  onChange={(e) =>
                    onChange({ ...boss, fpMultiplier: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })
                  }
                  className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1.5 text-sm text-foreground tabular-nums focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
                />
              </Field>
              <Field label="Escort FP ratio (0.0–1.0)">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={boss.escortFpRatio ?? 0.4}
                  onChange={(e) =>
                    onChange({ ...boss, escortFpRatio: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })
                  }
                  className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1.5 text-sm text-foreground tabular-nums focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Boss-as-unit stats */}
        <section className="rounded border border-panel-border/60 bg-panel/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] text-rose-400">
                Stats de l&apos;unité boss (V9.2)
              </h3>
              <p className="text-[10px] text-gray-600 mt-0.5">
                Si activées : le boss apparaît comme une unité distincte (category &apos;boss&apos;), ciblée en dernier.
                Sinon : boost FP diffus (legacy V9.1).
              </p>
            </div>
            <button
              type="button"
              onClick={toggleBossStats}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors ${
                boss.bossStats
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                  : 'border-panel-border bg-panel/40 text-gray-400 hover:text-gray-200'
              }`}
            >
              {boss.bossStats ? 'Boss-as-unit activé' : 'Activer boss-as-unit'}
            </button>
          </div>
          {boss.bossStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <NumberField
                label="Hull"
                value={boss.bossStats.hull}
                onChange={(v) => setStats({ hull: Math.max(1, v) })}
              />
              <NumberField
                label="Shield"
                value={boss.bossStats.shield}
                onChange={(v) => setStats({ shield: Math.max(0, v) })}
              />
              <NumberField
                label="Armor"
                value={boss.bossStats.armor}
                onChange={(v) => setStats({ armor: Math.max(0, v) })}
              />
              <NumberField
                label="Weapons"
                value={boss.bossStats.weapons}
                onChange={(v) => setStats({ weapons: Math.max(0, v) })}
              />
              <NumberField
                label="Shots"
                value={boss.bossStats.shotCount}
                onChange={(v) => setStats({ shotCount: Math.max(1, v) })}
              />
            </div>
          )}
          {boss.bossStats?.weaponProfiles && boss.bossStats.weaponProfiles.length > 0 && (
            <div className="rounded border border-panel-border/40 bg-bg/30 p-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
                Batteries personnalisées ({boss.bossStats.weaponProfiles.length})
              </div>
              <ul className="text-[10px] font-mono text-gray-400 space-y-0.5">
                {boss.bossStats.weaponProfiles.map((p, i) => (
                  <li key={i} className="truncate">
                    [{i + 1}] dmg {p.damage ?? '—'} × {p.shots} → {p.targetCategory ?? 'medium'}
                    {p.rafale && ` · raf ${p.rafale.count}× ${p.rafale.category}`}
                    {p.hasChainKill && ' · chainKill'}
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-[9px] text-gray-600">
                Lecture seule (édition fine via seed file).
              </div>
            </div>
          )}
        </section>

        {/* Skills */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] text-rose-400">
              Skills boss ({boss.skills.length}/2)
            </h3>
            {boss.skills.length < 2 && (
              <button
                type="button"
                onClick={addSkill}
                className="inline-flex items-center gap-1 rounded border border-dashed border-rose-700/40 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-900/30"
              >
                <Plus className="h-3 w-3" /> Ajouter un skill
              </button>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {boss.skills.map((sk, i) => (
              <SkillEditor
                key={i}
                idx={i}
                skill={sk}
                canRemove={boss.skills.length > 1}
                onChange={(s) => setSkill(i, s)}
                onRemove={() => removeSkill(i)}
              />
            ))}
          </div>
        </section>

        {/* Buff choices */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.18em] text-rose-400">
              Buffs récompense ({boss.buffChoices.length}/3)
            </h3>
            {boss.buffChoices.length < 3 && (
              <button
                type="button"
                onClick={addBuff}
                className="inline-flex items-center gap-1 rounded border border-dashed border-rose-700/40 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-900/30"
              >
                <Plus className="h-3 w-3" /> Ajouter un buff
              </button>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {boss.buffChoices.map((bf, i) => (
              <BuffEditor
                key={i}
                idx={i}
                buff={bf}
                canRemove={boss.buffChoices.length > 1}
                onChange={(b) => setBuff(i, b)}
                onRemove={() => removeBuff(i)}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function SkillEditor({
  idx,
  skill,
  canRemove,
  onChange,
  onRemove,
}: {
  idx: number;
  skill: BossSkillEntry;
  canRemove: boolean;
  onChange: (s: BossSkillEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-panel-border/60 bg-bg/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-rose-400">
          Skill {idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-500 hover:text-red-400"
            title="Supprimer ce skill"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <Field label="Type">
        <select
          value={skill.type}
          onChange={(e) => onChange({ ...skill, type: e.target.value as BossSkillType })}
          className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-xs text-foreground focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
        >
          {BOSS_SKILL_TYPES.map((t) => (
            <option key={t} value={t}>
              {BOSS_SKILL_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Magnitude (% ou count)">
        <input
          type="number"
          step={0.05}
          min={0}
          value={skill.magnitude}
          onChange={(e) => onChange({ ...skill, magnitude: Math.max(0, Number(e.target.value) || 0) })}
          className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1.5 text-xs text-foreground tabular-nums focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
        />
      </Field>
    </div>
  );
}

function BuffEditor({
  idx,
  buff,
  canRemove,
  onChange,
  onRemove,
}: {
  idx: number;
  buff: BossBuffEntry;
  canRemove: boolean;
  onChange: (b: BossBuffEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-panel-border/60 bg-bg/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-rose-400">
          Buff {idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-500 hover:text-red-400"
            title="Supprimer ce buff"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <Field label="Type">
        <select
          value={buff.type}
          onChange={(e) => onChange({ ...buff, type: e.target.value as BossBuffType })}
          className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1 text-xs text-foreground focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
        >
          {BOSS_BUFF_TYPES.map((t) => (
            <option key={t} value={t}>
              {BOSS_BUFF_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Magnitude (% ou count)">
        <input
          type="number"
          step={0.05}
          min={0}
          value={buff.magnitude}
          onChange={(e) => onChange({ ...buff, magnitude: Math.max(0, Number(e.target.value) || 0) })}
          className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1.5 text-xs text-foreground tabular-nums focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/40"
        />
      </Field>
    </div>
  );
}

// ─── Reusable form atoms ────────────────────────────────────────────────────

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
      className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1.5 text-sm text-foreground placeholder:text-gray-600 focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 3,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      className="w-full rounded border border-panel-border bg-bg/60 px-2 py-1.5 text-sm text-foreground placeholder:text-gray-600 focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
    />
  );
}
