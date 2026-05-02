import { useEffect, useMemo, useState } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@exilium/api/trpc';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { HomepageImageSlot } from '@/components/ui/HomepageImageSlot';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, Trash2, ChevronDown, ChevronUp, Save, RotateCcw, ExternalLink } from 'lucide-react';

type HomepageContent = inferRouterOutputs<AppRouter>['homepage']['get'];
type PillarIcon = HomepageContent['pillars']['items'][number]['icon'];
type SocialPlatform = HomepageContent['footer']['socials'][number]['platform'];
type FooterSection = HomepageContent['footer']['sections'][number];
type FooterLink = FooterSection['links'][number];
type Social = HomepageContent['footer']['socials'][number];
type NavItem = HomepageContent['nav']['items'][number];
type Pillar = HomepageContent['pillars']['items'][number];
type ImmersiveImage = HomepageContent['immersive']['images'][number];

const PILLAR_ICONS: PillarIcon[] = ['planet', 'building', 'sword', 'shield', 'rocket', 'globe'];
const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'discord',
  'twitter',
  'youtube',
  'facebook',
  'instagram',
  'twitch',
  'github',
];

export default function Homepage() {
  const { data, isLoading, refetch } = trpc.homepage.get.useQuery();
  const updateMutation = trpc.homepage.admin.update.useMutation();
  const resetMutation = trpc.homepage.admin.reset.useMutation();

  const [draft, setDraft] = useState<HomepageContent | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Hydrate the local draft from the server payload — and re-sync any time
  // the server data changes (e.g. after reset).
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return JSON.stringify(data) !== JSON.stringify(draft);
  }, [data, draft]);

  if (isLoading || !draft) return <PageSkeleton />;

  function update<K extends keyof HomepageContent>(key: K, value: HomepageContent[K]) {
    setDraft((prev: HomepageContent | null) => (prev ? { ...prev, [key]: value } : prev));
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 -mx-6 border-b border-panel-border bg-bg/95 px-6 py-3 backdrop-blur space-y-2">
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-hull-300">Page d&apos;accueil</h1>
          <p className="text-xs text-gray-500">
            Tous les textes et images affichés sur la landing publique.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && !updateMutation.isPending && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
              Modifications non enregistrées
            </span>
          )}
          <a
            href="/login"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-panel-border px-3 py-1.5 text-xs text-gray-400 hover:text-hull-300"
          >
            <ExternalLink className="h-3 w-3" /> Voir
          </a>
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

      <Section title="Hero (bannière principale)" defaultOpen>
        <HeroEditor
          hero={draft.hero}
          onChange={(hero) => update('hero', hero)}
        />
      </Section>

      <Section title="Navigation">
        <NavEditor nav={draft.nav} onChange={(nav) => update('nav', nav)} />
      </Section>

      <Section title="Piliers (Univers sans limites)">
        <PillarsEditor
          pillars={draft.pillars}
          onChange={(pillars) => update('pillars', pillars)}
        />
      </Section>

      <Section title="Univers immersif (galerie)">
        <ImmersiveEditor
          immersive={draft.immersive}
          onChange={(immersive) => update('immersive', immersive)}
        />
      </Section>

      <Section title="Inscription bêta (newsletter)">
        <NewsletterEditor
          newsletter={draft.newsletter}
          onChange={(newsletter) => update('newsletter', newsletter)}
        />
      </Section>

      <Section title="Pied de page">
        <FooterEditor
          footer={draft.footer}
          onChange={(footer) => update('footer', footer)}
        />
      </Section>

      <ConfirmDialog
        open={resetConfirm}
        title="Réinitialiser la page d'accueil"
        message="Toutes les modifications de textes et de chemins d'images seront remplacées par les valeurs par défaut. Les fichiers uploadés ne sont pas supprimés."
        confirmLabel="Réinitialiser"
        danger
        onConfirm={handleReset}
        onCancel={() => setResetConfirm(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper — collapsible card.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reusable form atoms
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-mono uppercase tracking-wider text-gray-400">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-600">{hint}</span>}
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
      className="w-full rounded border border-panel-border bg-bg/60 px-3 py-2 text-sm text-foreground placeholder:text-gray-600 focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className="w-full rounded border border-panel-border bg-bg/60 px-3 py-2 text-sm text-foreground placeholder:text-gray-600 focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
    />
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded border border-panel-border bg-bg/60 px-3 py-2 text-sm capitalize text-foreground focus:border-hull-500 focus:outline-none focus:ring-1 focus:ring-hull-500/40"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground/90">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-panel-border bg-bg/60"
      />
      {label}
    </label>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-red-900/30 hover:text-red-400"
      aria-label="Supprimer"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded border border-dashed border-hull-700/40 px-3 py-1.5 text-xs text-hull-300 hover:bg-hull-900/30"
    >
      <Plus className="h-3 w-3" /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hero editor
// ---------------------------------------------------------------------------

function HeroEditor({
  hero,
  onChange,
}: {
  hero: HomepageContent['hero'];
  onChange: (h: HomepageContent['hero']) => void;
}) {
  const set = <K extends keyof HomepageContent['hero']>(k: K, v: HomepageContent['hero'][K]) =>
    onChange({ ...hero, [k]: v });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Field label="Eyebrow (suptitre, optionnel)" hint="Petit texte au-dessus du titre">
          <TextInput value={hero.eyebrow} onChange={(v) => set('eyebrow', v)} maxLength={80} />
        </Field>
        <Field label="Titre principal (logo)">
          <TextInput value={hero.title} onChange={(v) => set('title', v)} maxLength={60} />
        </Field>
        <Field label="Tagline" hint="Slogan en majuscules sous le titre">
          <TextInput value={hero.tagline} onChange={(v) => set('tagline', v)} maxLength={120} />
        </Field>
        <Field label="Description">
          <TextArea
            value={hero.description}
            onChange={(v) => set('description', v)}
            rows={3}
            maxLength={500}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="CTA principal — texte">
            <TextInput
              value={hero.primaryCta.label}
              onChange={(v) => set('primaryCta', { ...hero.primaryCta, label: v })}
            />
          </Field>
          <Field label="CTA principal — lien">
            <TextInput
              value={hero.primaryCta.href}
              onChange={(v) => set('primaryCta', { ...hero.primaryCta, href: v })}
            />
          </Field>
        </div>

        <div className="rounded border border-panel-border/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
              CTA secondaire
            </span>
            <Checkbox
              checked={hero.secondaryCta !== null}
              onChange={(v) =>
                set(
                  'secondaryCta',
                  v ? { label: 'Regarder le trailer', href: '#trailer' } : null,
                )
              }
              label="Activer"
            />
          </div>
          {hero.secondaryCta && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Texte">
                <TextInput
                  value={hero.secondaryCta.label}
                  onChange={(v) =>
                    set('secondaryCta', { ...hero.secondaryCta!, label: v })
                  }
                />
              </Field>
              <Field label="Lien">
                <TextInput
                  value={hero.secondaryCta.href}
                  onChange={(v) =>
                    set('secondaryCta', { ...hero.secondaryCta!, href: v })
                  }
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      <div>
        <HomepageImageSlot
          slot="hero"
          value={hero.backgroundImage}
          aspect="16/9"
          label="Image de fond du hero"
          hint="Recommandé : 1920×1080+, paysage cinéma"
          onChange={(path) => set('backgroundImage', path)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav editor
// ---------------------------------------------------------------------------

function NavEditor({
  nav,
  onChange,
}: {
  nav: HomepageContent['nav'];
  onChange: (n: HomepageContent['nav']) => void;
}) {
  function setItem(idx: number, item: NavItem) {
    onChange({ items: nav.items.map((it: NavItem, i: number) => (i === idx ? item : it)) });
  }
  function remove(idx: number) {
    onChange({ items: nav.items.filter((_: NavItem, i: number) => i !== idx) });
  }
  function add() {
    if (nav.items.length >= 8) return;
    onChange({ items: [...nav.items, { label: 'Nouveau', href: '#' }] });
  }

  return (
    <div className="space-y-3">
      {nav.items.map((item: NavItem, i: number) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <Field label={`#${i + 1} Texte`}>
              <TextInput value={item.label} onChange={(v) => setItem(i, { ...item, label: v })} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Lien">
              <TextInput
                value={item.href}
                onChange={(v) => setItem(i, { ...item, href: v })}
                placeholder="#section ou /chemin"
              />
            </Field>
          </div>
          <RemoveButton onClick={() => remove(i)} />
        </div>
      ))}
      {nav.items.length < 8 && <AddButton onClick={add} label="Ajouter un lien" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pillars editor
// ---------------------------------------------------------------------------

function PillarsEditor({
  pillars,
  onChange,
}: {
  pillars: HomepageContent['pillars'];
  onChange: (p: HomepageContent['pillars']) => void;
}) {
  function setItem(idx: number, item: Pillar) {
    onChange({ ...pillars, items: pillars.items.map((it: Pillar, i: number) => (i === idx ? item : it)) });
  }
  function remove(idx: number) {
    onChange({ ...pillars, items: pillars.items.filter((_: Pillar, i: number) => i !== idx) });
  }
  function add() {
    if (pillars.items.length >= 8) return;
    onChange({
      ...pillars,
      items: [...pillars.items, { title: 'Nouveau', description: '', icon: 'planet', image: '' }],
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Titre de la section">
        <TextInput
          value={pillars.title}
          onChange={(v) => onChange({ ...pillars, title: v })}
          maxLength={120}
        />
      </Field>

      <div className="space-y-3">
        {pillars.items.map((item: Pillar, i: number) => {
          const slot = slotFromPath(item.image) ?? `pillar-${i + 1}`;
          return (
            <div
              key={i}
              className="grid gap-3 rounded border border-panel-border/60 p-3 sm:grid-cols-[140px_120px_1fr_2fr_auto]"
            >
              <div>
                <HomepageImageSlot
                  slot={slot}
                  value={item.image}
                  aspect="1/1"
                  label="Image"
                  hint="Optionnel — remplace l'icône"
                  onChange={(path) => setItem(i, { ...item, image: path })}
                />
              </div>
              <Field label="Icône (fallback)">
                <Select<PillarIcon>
                  value={item.icon}
                  options={PILLAR_ICONS}
                  onChange={(v) => setItem(i, { ...item, icon: v })}
                />
              </Field>
              <Field label="Titre">
                <TextInput value={item.title} onChange={(v) => setItem(i, { ...item, title: v })} />
              </Field>
              <Field label="Description">
                <TextArea
                  value={item.description}
                  onChange={(v) => setItem(i, { ...item, description: v })}
                  rows={2}
                />
              </Field>
              <div className="flex items-end pb-2">
                <RemoveButton onClick={() => remove(i)} />
              </div>
            </div>
          );
        })}
        {pillars.items.length < 8 && <AddButton onClick={add} label="Ajouter un pilier" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Immersive editor
// ---------------------------------------------------------------------------

function ImmersiveEditor({
  immersive,
  onChange,
}: {
  immersive: HomepageContent['immersive'];
  onChange: (i: HomepageContent['immersive']) => void;
}) {
  function setImage(idx: number, img: ImmersiveImage) {
    onChange({
      ...immersive,
      images: immersive.images.map((it: ImmersiveImage, i: number) => (i === idx ? img : it)),
    });
  }
  function removeImage(idx: number) {
    onChange({
      ...immersive,
      images: immersive.images.filter((_: ImmersiveImage, i: number) => i !== idx),
    });
  }
  function addImage() {
    if (immersive.images.length >= 6) return;
    const slot = `immersive-${immersive.images.length + 1}`;
    onChange({
      ...immersive,
      images: [...immersive.images, { src: `/assets/landing/${slot}.webp`, alt: '' }],
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre">
          <TextInput
            value={immersive.title}
            onChange={(v) => onChange({ ...immersive, title: v })}
          />
        </Field>
        <Field label="CTA — texte">
          <TextInput
            value={immersive.ctaLabel}
            onChange={(v) => onChange({ ...immersive, ctaLabel: v })}
          />
        </Field>
      </div>
      <Field label="Description">
        <TextArea
          value={immersive.description}
          onChange={(v) => onChange({ ...immersive, description: v })}
          rows={3}
        />
      </Field>
      <Field label="CTA — lien">
        <TextInput
          value={immersive.ctaHref}
          onChange={(v) => onChange({ ...immersive, ctaHref: v })}
        />
      </Field>

      <div className="space-y-3 border-t border-panel-border/40 pt-4">
        <div className="text-xs font-mono uppercase tracking-wider text-gray-400">
          Images de la galerie
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {immersive.images.map((img: ImmersiveImage, i: number) => {
            const slot = slotFromPath(img.src) ?? `immersive-${i + 1}`;
            return (
              <div key={i} className="space-y-2 rounded border border-panel-border/60 p-3">
                <HomepageImageSlot
                  slot={slot}
                  value={img.src}
                  aspect="3/4"
                  label={`Image ${i + 1}`}
                  onChange={(path) => setImage(i, { ...img, src: path })}
                />
                <Field label="Légende (alt)">
                  <TextInput
                    value={img.alt}
                    onChange={(v) => setImage(i, { ...img, alt: v })}
                  />
                </Field>
                <div className="flex justify-end">
                  <RemoveButton onClick={() => removeImage(i)} />
                </div>
              </div>
            );
          })}
        </div>
        {immersive.images.length < 6 && (
          <AddButton onClick={addImage} label="Ajouter une image" />
        )}
      </div>
    </div>
  );
}

function slotFromPath(p: string): string | null {
  const m = p.match(/\/assets\/landing\/([a-z0-9_-]+)\.webp/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Newsletter editor
// ---------------------------------------------------------------------------

function NewsletterEditor({
  newsletter,
  onChange,
}: {
  newsletter: HomepageContent['newsletter'];
  onChange: (n: HomepageContent['newsletter']) => void;
}) {
  return (
    <div className="space-y-4">
      <Checkbox
        checked={newsletter.enabled}
        onChange={(v) => onChange({ ...newsletter, enabled: v })}
        label="Afficher la section sur la page d'accueil"
      />
      <Field label="Titre">
        <TextInput
          value={newsletter.title}
          onChange={(v) => onChange({ ...newsletter, title: v })}
        />
      </Field>
      <Field label="Description">
        <TextArea
          value={newsletter.description}
          onChange={(v) => onChange({ ...newsletter, description: v })}
          rows={3}
        />
      </Field>
      <Field label="Texte du bouton">
        <TextInput
          value={newsletter.submitLabel}
          onChange={(v) => onChange({ ...newsletter, submitLabel: v })}
          maxLength={40}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer editor
// ---------------------------------------------------------------------------

function FooterEditor({
  footer,
  onChange,
}: {
  footer: HomepageContent['footer'];
  onChange: (f: HomepageContent['footer']) => void;
}) {
  function setSection(idx: number, sec: FooterSection) {
    onChange({
      ...footer,
      sections: footer.sections.map((s: FooterSection, i: number) => (i === idx ? sec : s)),
    });
  }
  function removeSection(idx: number) {
    onChange({
      ...footer,
      sections: footer.sections.filter((_: FooterSection, i: number) => i !== idx),
    });
  }
  function addSection() {
    if (footer.sections.length >= 6) return;
    onChange({ ...footer, sections: [...footer.sections, { title: 'Nouveau', links: [] }] });
  }
  function setSocial(idx: number, s: Social) {
    onChange({
      ...footer,
      socials: footer.socials.map((x: Social, i: number) => (i === idx ? s : x)),
    });
  }
  function removeSocial(idx: number) {
    onChange({
      ...footer,
      socials: footer.socials.filter((_: Social, i: number) => i !== idx),
    });
  }
  function addSocial() {
    if (footer.socials.length >= 8) return;
    onChange({
      ...footer,
      socials: [...footer.socials, { platform: 'discord', href: 'https://discord.gg/' }],
    });
  }

  return (
    <div className="space-y-5">
      <Field label="Description (sous le logo)">
        <TextArea
          value={footer.description}
          onChange={(v) => onChange({ ...footer, description: v })}
          rows={3}
        />
      </Field>

      <div className="space-y-3 border-t border-panel-border/40 pt-4">
        <div className="text-xs font-mono uppercase tracking-wider text-gray-400">
          Colonnes de liens
        </div>
        {footer.sections.map((section: FooterSection, i: number) => (
          <div key={i} className="rounded border border-panel-border/60 p-3">
            <div className="mb-3 flex items-end gap-2">
              <div className="flex-1">
                <Field label={`Section ${i + 1} — titre`}>
                  <TextInput
                    value={section.title}
                    onChange={(v) => setSection(i, { ...section, title: v })}
                  />
                </Field>
              </div>
              <RemoveButton onClick={() => removeSection(i)} />
            </div>
            <FooterLinksEditor
              links={section.links}
              onChange={(links) => setSection(i, { ...section, links })}
            />
          </div>
        ))}
        {footer.sections.length < 6 && (
          <AddButton onClick={addSection} label="Ajouter une colonne" />
        )}
      </div>

      <div className="space-y-3 border-t border-panel-border/40 pt-4">
        <div className="text-xs font-mono uppercase tracking-wider text-gray-400">
          Réseaux sociaux
        </div>
        {footer.socials.map((s: Social, i: number) => (
          <div key={i} className="grid grid-cols-[140px_1fr_auto] items-end gap-2">
            <Field label="Plateforme">
              <Select<SocialPlatform>
                value={s.platform}
                options={SOCIAL_PLATFORMS}
                onChange={(v) => setSocial(i, { ...s, platform: v })}
              />
            </Field>
            <Field label="URL">
              <TextInput value={s.href} onChange={(v) => setSocial(i, { ...s, href: v })} />
            </Field>
            <RemoveButton onClick={() => removeSocial(i)} />
          </div>
        ))}
        {footer.socials.length < 8 && <AddButton onClick={addSocial} label="Ajouter un réseau" />}
      </div>

      <Field label="Mention légale (en bas)">
        <TextInput
          value={footer.legalNote}
          onChange={(v) => onChange({ ...footer, legalNote: v })}
        />
      </Field>
    </div>
  );
}

function FooterLinksEditor({
  links,
  onChange,
}: {
  links: HomepageContent['footer']['sections'][number]['links'];
  onChange: (l: HomepageContent['footer']['sections'][number]['links']) => void;
}) {
  function set(idx: number, link: FooterLink) {
    onChange(links.map((l: FooterLink, i: number) => (i === idx ? link : l)));
  }
  function remove(idx: number) {
    onChange(links.filter((_: FooterLink, i: number) => i !== idx));
  }
  function add() {
    if (links.length >= 10) return;
    onChange([...links, { label: 'Nouveau', href: '#' }]);
  }
  return (
    <div className="space-y-2">
      {links.map((link: FooterLink, i: number) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <TextInput
            value={link.label}
            onChange={(v) => set(i, { ...link, label: v })}
            placeholder="Libellé"
          />
          <TextInput
            value={link.href}
            onChange={(v) => set(i, { ...link, href: v })}
            placeholder="URL"
          />
          <RemoveButton onClick={() => remove(i)} />
        </div>
      ))}
      {links.length < 10 && <AddButton onClick={add} label="Ajouter un lien" />}
    </div>
  );
}
