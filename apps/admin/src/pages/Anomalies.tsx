import { useEffect, useMemo, useState } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@exilium/api/trpc';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { AnomalyImageSlot } from '@/components/ui/AnomalyImageSlot';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Save, RotateCcw, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

type AnomalyContent = inferRouterOutputs<AppRouter>['anomalyContent']['get'];
type DepthEntry = AnomalyContent['depths'][number];

export default function Anomalies() {
  const { data, isLoading, refetch } = trpc.anomalyContent.get.useQuery();
  const updateMutation = trpc.anomalyContent.admin.update.useMutation();
  const resetMutation = trpc.anomalyContent.admin.reset.useMutation();

  const [draft, setDraft] = useState<AnomalyContent | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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

  async function handleSave() {
    if (!draft) return;
    await updateMutation.mutateAsync(draft);
    setSavedAt(Date.now());
    await refetch();
    setTimeout(() => setSavedAt(null), 2500);
  }

  async function handleReset() {
    await resetMutation.mutateAsync();
    setResetConfirm(false);
    await refetch();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="sticky top-0 z-10 -mx-6 flex items-center justify-between border-b border-panel-border bg-bg/95 px-6 py-3 backdrop-blur">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-hull-300">Anomalies gravitationnelles</h1>
          <p className="text-xs text-gray-500">
            Images et textes affichés à chaque profondeur. Pool d&apos;événements aléatoires (V3) au-dessous.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      <Section title="Événements aléatoires (V3 — bientôt)">
        <div className="rounded border border-dashed border-panel-border bg-panel/30 p-6 text-center text-sm text-gray-500">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-hull-400" />
          La pool d&apos;événements arrivera avec la V3 du mode (nœuds non-combat avec choix narratifs).
          Le schéma JSON est déjà prêt côté serveur — l&apos;UI d&apos;édition viendra ici.
        </div>
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
