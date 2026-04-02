import { useState, useEffect } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc, fetchWithAuth } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { EditModal } from '@/components/ui/EditModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';
import { Plus, Pencil, Trash2, Sparkles, ChevronDown, ChevronRight, Ship, Shield, Zap, X } from 'lucide-react';

// ── Branch CRUD ──

const BRANCH_FIELDS = [
  { key: 'id', label: 'ID (slug)', type: 'text' as const },
  { key: 'name', label: 'Nom', type: 'text' as const },
  { key: 'description', label: 'Description', type: 'textarea' as const },
  { key: 'color', label: 'Couleur (hex)', type: 'text' as const },
  { key: 'sortOrder', label: 'Ordre', type: 'number' as const },
];

const BRANCH_EDIT_FIELDS = BRANCH_FIELDS.filter((f) => f.key !== 'id');

function defaultBranchForm(): Record<string, string | number> {
  return { id: '', name: '', description: '', color: '#ef4444', sortOrder: 0 };
}

function branchToForm(b: any): Record<string, string | number> {
  return { name: b.name, description: b.description ?? '', color: b.color, sortOrder: b.sortOrder ?? 0 };
}

// ── Talent CRUD ──

const EFFECT_TYPES = [
  { value: 'modify_stat', label: 'Modifier stat flagship' },
  { value: 'global_bonus', label: 'Bonus global (comme recherche)' },
  { value: 'planet_bonus', label: 'Bonus planete' },
  { value: 'timed_buff', label: 'Buff temporaire' },
  { value: 'unlock', label: 'Deblocage' },
];

const POSITIONS = [
  { value: 'left', label: 'Gauche' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Droite' },
];

function talentFields(branches: { id: string; name: string }[], talents: { id: string; name: string }[]) {
  return [
    { key: 'id', label: 'ID (slug)', type: 'text' as const },
    { key: 'branchId', label: 'Branche', type: 'select' as const, options: branches.map((b) => ({ value: b.id, label: b.name })) },
    { key: 'tier', label: 'Tier', type: 'number' as const },
    { key: 'position', label: 'Position', type: 'select' as const, options: POSITIONS },
    { key: 'name', label: 'Nom', type: 'text' as const },
    { key: 'description', label: 'Description', type: 'textarea' as const },
    { key: 'maxRanks', label: 'Rangs max', type: 'number' as const },
    { key: 'prerequisiteId', label: 'Prerequis (talent ID)', type: 'select' as const, options: [{ value: '', label: '— Aucun —' }, ...talents.map((t) => ({ value: t.id, label: `${t.name} (${t.id})` }))] },
    { key: 'effectType', label: "Type d'effet", type: 'select' as const, options: EFFECT_TYPES },
    { key: 'effectParams', label: 'Parametres effet (JSON)', type: 'textarea' as const },
    { key: 'sortOrder', label: 'Ordre', type: 'number' as const },
  ];
}

function defaultTalentForm(branchId?: string): Record<string, string | number> {
  return {
    id: '', branchId: branchId ?? '', tier: 1, position: 'center',
    name: '', description: '', maxRanks: 1, prerequisiteId: '',
    effectType: 'modify_stat', effectParams: '{}', sortOrder: 0,
  };
}

function talentToForm(t: any): Record<string, string | number> {
  return {
    branchId: t.branchId, tier: t.tier, position: t.position,
    name: t.name, description: t.description ?? '', maxRanks: t.maxRanks ?? 1,
    prerequisiteId: t.prerequisiteId ?? '', effectType: t.effectType,
    effectParams: JSON.stringify(t.effectParams, null, 2), sortOrder: t.sortOrder ?? 0,
  };
}

function formToTalentData(values: Record<string, string | number>) {
  let effectParams: Record<string, unknown> = {};
  try { effectParams = JSON.parse(String(values.effectParams)); } catch {}
  return {
    branchId: String(values.branchId),
    tier: Number(values.tier),
    position: String(values.position),
    name: String(values.name),
    description: String(values.description),
    maxRanks: Number(values.maxRanks),
    prerequisiteId: values.prerequisiteId ? String(values.prerequisiteId) : null,
    effectType: String(values.effectType),
    effectParams,
    sortOrder: Number(values.sortOrder),
  };
}

// ── Effect type display helpers ──

const EFFECT_COLORS: Record<string, string> = {
  modify_stat: 'text-blue-400 bg-blue-900/20',
  global_bonus: 'text-amber-400 bg-amber-900/20',
  planet_bonus: 'text-emerald-400 bg-emerald-900/20',
  timed_buff: 'text-pink-400 bg-pink-900/20',
  unlock: 'text-purple-400 bg-purple-900/20',
};

function effectParamsSummary(effectType: string, params: any): string {
  if (!params) return '';
  if (effectType === 'modify_stat') return `${params.stat}: ${params.valuePerRank > 0 ? '+' : ''}${params.valuePerRank}/rang`;
  if (effectType === 'global_bonus') return `${params.stat}: ${params.percentPerRank > 0 ? '+' : ''}${params.percentPerRank}%/rang`;
  if (effectType === 'planet_bonus') return `${params.stat}: ${params.percentPerRank > 0 ? '+' : ''}${params.percentPerRank}%/rang`;
  if (effectType === 'timed_buff') return `${params.stat}: ${params.value} (${params.durationSeconds}s)`;
  if (effectType === 'unlock') return `${params.key}`;
  return JSON.stringify(params);
}

// ── Flagship Image Pool (per hull) ──

const HULL_TYPES = [
  { id: 'combat', label: 'Combat', color: 'text-red-400' },
  { id: 'industrial', label: 'Industrielle', color: 'text-amber-400' },
  { id: 'scientific', label: 'Scientifique', color: 'text-cyan-400' },
];

function FlagshipHullImages({ hullId, label, color }: { hullId: string; label: string; color: string }) {
  const [images, setImages] = useState<{ index: number; thumbUrl: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadImages = async () => {
    try {
      const res = await fetchWithAuth(`/admin/flagship-images/${hullId}`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadImages(); }, [hullId]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${color}`}>{label}</span>
        <span className="text-xs text-gray-500">({images.length})</span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {images.map((img) => (
          <img
            key={img.index}
            src={`${img.thumbUrl}?t=${Date.now()}`}
            alt={`${label} ${img.index}`}
            className="w-16 h-16 rounded border border-panel-border object-cover"
          />
        ))}
        <AdminImageUpload
          category="flagships"
          entityId={hullId}
          entityName={`Flagship ${label}`}
          onUploadComplete={loadImages}
        />
      </div>
      {!loading && images.length === 0 && (
        <p className="text-xs text-gray-500">Aucun visuel pour cette coque.</p>
      )}
    </div>
  );
}

function FlagshipImagePool() {
  return (
    <div className="admin-card mb-6">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-panel-border">
        <Ship className="w-4 h-4 text-hull-400" />
        <span className="font-semibold text-gray-100">Visuels du Flagship</span>
      </div>
      <div className="p-4 space-y-4">
        {HULL_TYPES.map((hull) => (
          <FlagshipHullImages key={hull.id} hullId={hull.id} label={hull.label} color={hull.color} />
        ))}
      </div>
    </div>
  );
}

// ── Hull Config Section ──

const BONUS_LABELS: Record<string, string> = {
  combat_build_time_reduction: 'Temps construction militaire',
  industrial_build_time_reduction: 'Temps construction industrielle',
  research_time_reduction: 'Temps de recherche',
  bonus_armor: 'Blindage',
  bonus_shot_count: 'Attaques',
  bonus_weapons: 'Armes',
};

function HullEditModal({ hull, open, onClose, onSave, saving }: {
  hull: any;
  open: boolean;
  onClose: () => void;
  onSave: (updated: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (hull) setForm({ ...hull });
  }, [hull]);

  if (!open || !hull) return null;

  const setField = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const setBonus = (key: string, value: number) => setForm((f: any) => ({
    ...f, passiveBonuses: { ...f.passiveBonuses, [key]: value },
  }));
  const setCostField = (key: string, value: number) => setForm((f: any) => ({
    ...f, changeCost: { ...f.changeCost, [key]: value },
  }));
  const setRatio = (res: string, value: number) => setForm((f: any) => ({
    ...f, changeCost: { ...f.changeCost, resourceRatio: { ...f.changeCost?.resourceRatio, [res]: value } },
  }));
  const setBonusLabel = (i: number, value: string) => setForm((f: any) => {
    const labels = [...(f.bonusLabels ?? [])];
    labels[i] = value;
    return { ...f, bonusLabels: labels };
  });
  const addBonusLabel = () => setForm((f: any) => ({ ...f, bonusLabels: [...(f.bonusLabels ?? []), ''] }));
  const removeBonusLabel = (i: number) => setForm((f: any) => ({
    ...f, bonusLabels: (f.bonusLabels ?? []).filter((_: any, idx: number) => idx !== i),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
      <div className="admin-card p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto animate-slide-up shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-100">Modifier : {hull.name}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          {/* General */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
              <input value={form.name ?? ''} onChange={e => setField('name', e.target.value)} className="admin-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Playstyle</label>
              <select value={form.playstyle ?? ''} onChange={e => setField('playstyle', e.target.value)} className="admin-input">
                <option value="warrior">warrior</option>
                <option value="miner">miner</option>
                <option value="explorer">explorer</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea value={form.description ?? ''} onChange={e => setField('description', e.target.value)} className="admin-input min-h-[50px] resize-y" rows={2} />
          </div>

          {/* Passive bonuses */}
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-2">Bonus passifs</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(form.passiveBonuses ?? {}).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-[11px] text-gray-400 w-40 truncate" title={key}>{BONUS_LABELS[key] ?? key}</label>
                  <input type="number" step="any" value={val as number} onChange={e => setBonus(key, Number(e.target.value))}
                    className="admin-input w-24 text-right" />
                </div>
              ))}
            </div>
          </div>

          {/* Bonus labels */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Labels joueurs</span>
              <button type="button" onClick={addBonusLabel} className="text-[10px] text-cyan-400 hover:text-cyan-300">+ Ajouter</button>
            </div>
            <div className="space-y-1.5">
              {(form.bonusLabels ?? []).map((label: string, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={label} onChange={e => setBonusLabel(i, e.target.value)} className="admin-input flex-1" />
                  <button type="button" onClick={() => removeBonusLabel(i)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Abilities */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Capacites (separees par virgule)</label>
            <input value={(form.abilities ?? []).join(', ')} onChange={e => setField('abilities', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
              className="admin-input" />
          </div>

          {/* Scan params */}
          {form.id === 'scientific' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Scan cooldown (secondes)</label>
                <input type="number" value={form.scanCooldownSeconds ?? ''} onChange={e => setField('scanCooldownSeconds', Number(e.target.value))} className="admin-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Scan bonus espionnage</label>
                <input type="number" value={form.scanEspionageBonus ?? ''} onChange={e => setField('scanEspionageBonus', Number(e.target.value))} className="admin-input" />
              </div>
            </div>
          )}

          {/* Change cost */}
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-2">Cout de changement</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Multiplicateur (x totalEarned)</label>
                <input type="number" value={form.changeCost?.baseMultiplier ?? ''} onChange={e => setCostField('baseMultiplier', Number(e.target.value))} className="admin-input" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-orange-400/70 mb-1">Minerai</label>
                  <input type="number" value={form.changeCost?.resourceRatio?.minerai ?? ''} onChange={e => setRatio('minerai', Number(e.target.value))} className="admin-input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-400/70 mb-1">Silicium</label>
                  <input type="number" value={form.changeCost?.resourceRatio?.silicium ?? ''} onChange={e => setRatio('silicium', Number(e.target.value))} className="admin-input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-400/70 mb-1">Hydrogene</label>
                  <input type="number" value={form.changeCost?.resourceRatio?.hydrogene ?? ''} onChange={e => setRatio('hydrogene', Number(e.target.value))} className="admin-input" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Indisponibilite (secondes)</label>
                <input type="number" value={form.unavailabilitySeconds ?? ''} onChange={e => setField('unavailabilitySeconds', Number(e.target.value))} className="admin-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cooldown changement (secondes)</label>
                <input type="number" value={form.cooldownSeconds ?? ''} onChange={e => setField('cooldownSeconds', Number(e.target.value))} className="admin-input" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="admin-btn-ghost">Annuler</button>
          <button onClick={() => onSave(form)} disabled={saving} className="admin-btn-primary">
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HullConfigSection({ hulls, onUpdated }: { hulls: Record<string, any>; onUpdated: () => void }) {
  const [editingHull, setEditingHull] = useState<any>(null);
  const updateMutation = trpc.gameConfig.admin.updateUniverseConfig.useMutation({
    onSuccess: () => {
      setEditingHull(null);
      onUpdated();
    },
  });

  if (!hulls || Object.keys(hulls).length === 0) return null;

  const hullList = Object.values(hulls);

  const handleSave = (updated: any) => {
    // Replace the edited hull in the full list and save as array
    const newList = hullList.map((h: any) => h.id === updated.id ? updated : h);
    updateMutation.mutate({ key: 'hulls', value: newList });
  };

  return (
    <div className="admin-card mb-6">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-panel-border">
        <Shield className="w-4 h-4 text-cyan-400" />
        <span className="font-semibold text-gray-100">Configuration des coques</span>
        <span className="text-xs text-gray-500">({hullList.length})</span>
      </div>
      <div className="divide-y divide-panel-border">
        {hullList.map((hull: any) => {
          const hullStyle = HULL_TYPES.find(h => h.id === hull.id);
          return (
            <div key={hull.id} className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${hullStyle?.color ?? 'text-gray-200'}`}>{hull.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">{hull.id}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">playstyle: {hull.playstyle}</span>
                </div>
                <button onClick={() => setEditingHull(hull)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Modifier
                </button>
              </div>

              <p className="text-xs text-gray-400">{hull.description}</p>

              {/* Passive bonuses */}
              <div>
                <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Bonus passifs</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(hull.passiveBonuses ?? {}).map(([key, val]) => (
                    <span key={key} className="text-[11px] px-2 py-1 rounded bg-gray-800/80 border border-gray-700/50 text-gray-300">
                      <span className="text-gray-500">{BONUS_LABELS[key] ?? key}:</span>{' '}
                      <span className="font-semibold text-gray-200">
                        {typeof val === 'number' && val < 1 ? `${(val as number) * 100}%` : String(val)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Bonus labels */}
              {hull.bonusLabels && hull.bonusLabels.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Labels affiches aux joueurs</div>
                  <div className="flex flex-wrap gap-1.5">
                    {hull.bonusLabels.map((label: string, i: number) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-gray-800/60 text-gray-400 italic">{label}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Abilities */}
              {hull.abilities && hull.abilities.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Capacites</div>
                  <div className="flex gap-2">
                    {hull.abilities.map((a: string) => (
                      <span key={a} className="text-[11px] px-2 py-1 rounded bg-cyan-900/30 border border-cyan-800/30 text-cyan-400 font-mono">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Scan params */}
              {hull.scanCooldownSeconds != null && (
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Parametres scan</div>
                  <div className="flex gap-3 text-[11px] text-gray-400">
                    <span>Cooldown: <span className="text-gray-200 font-semibold">{hull.scanCooldownSeconds}s</span> ({Math.round(hull.scanCooldownSeconds / 60)}min)</span>
                    <span>Bonus espionnage: <span className="text-gray-200 font-semibold">+{hull.scanEspionageBonus ?? 0}</span></span>
                  </div>
                </div>
              )}

              {/* Change cost */}
              <div>
                <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Cout de changement</div>
                <div className="flex gap-3 text-[11px] text-gray-400">
                  <span>Multiplicateur: <span className="text-gray-200 font-semibold">{hull.changeCost?.baseMultiplier ?? '?'}</span> x totalEarned</span>
                  <span>Ratio: <span className="text-orange-400">{hull.changeCost?.resourceRatio?.minerai ?? 0}</span>/<span className="text-emerald-400">{hull.changeCost?.resourceRatio?.silicium ?? 0}</span>/<span className="text-blue-400">{hull.changeCost?.resourceRatio?.hydrogene ?? 0}</span></span>
                </div>
                <div className="flex gap-3 text-[11px] text-gray-400 mt-0.5">
                  <span>Indisponibilite: <span className="text-gray-200 font-semibold">{hull.unavailabilitySeconds}s</span> ({Math.round(hull.unavailabilitySeconds / 3600)}h)</span>
                  <span>Cooldown: <span className="text-gray-200 font-semibold">{hull.cooldownSeconds}s</span> ({Math.round(hull.cooldownSeconds / 86400)}j)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <HullEditModal
        hull={editingHull}
        open={!!editingHull}
        onClose={() => setEditingHull(null)}
        onSave={handleSave}
        saving={updateMutation.isPending}
      />
    </div>
  );
}

// ── Main Component ──

export default function Talents() {
  const { data, isLoading, refetch } = useGameConfig();

  // Branch state
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<string | null>(null);

  // Talent state
  const [creatingTalent, setCreatingTalent] = useState<string | null>(null); // branchId
  const [editingTalent, setEditingTalent] = useState<string | null>(null);
  const [deletingTalent, setDeletingTalent] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Collapsed branches
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Branch mutations
  const createBranchMut = trpc.gameConfig.admin.createTalentBranch.useMutation({
    onSuccess: () => { refetch(); setCreatingBranch(false); },
  });
  const updateBranchMut = trpc.gameConfig.admin.updateTalentBranch.useMutation({
    onSuccess: () => { refetch(); setEditingBranch(null); },
  });
  const deleteBranchMut = trpc.gameConfig.admin.deleteTalentBranch.useMutation({
    onSuccess: () => { refetch(); setDeletingBranch(null); setDeleteError(null); },
    onError: (err) => setDeleteError(err.message),
  });

  // Talent mutations
  const createTalentMut = trpc.gameConfig.admin.createTalent.useMutation({
    onSuccess: () => { refetch(); setCreatingTalent(null); },
  });
  const updateTalentMut = trpc.gameConfig.admin.updateTalent.useMutation({
    onSuccess: () => { refetch(); setEditingTalent(null); },
  });
  const deleteTalentMut = trpc.gameConfig.admin.deleteTalent.useMutation({
    onSuccess: () => { refetch(); setDeletingTalent(null); setDeleteError(null); },
    onError: (err) => setDeleteError(err.message),
  });

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const branches = [...(data.talentBranches ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const allTalents = Object.values(data.talents ?? {});
  const talentsByBranch = (branchId: string) =>
    allTalents
      .filter((t) => t.branchId === branchId)
      .sort((a, b) => a.tier - b.tier || a.sortOrder - b.sortOrder);

  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name }));
  const talentOptions = allTalents.map((t) => ({ id: t.id, name: t.name }));

  const editingBranchData = editingBranch ? branches.find((b) => b.id === editingBranch) : null;
  const editingTalentData = editingTalent ? allTalents.find((t) => t.id === editingTalent) : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h1 className="text-lg font-semibold text-gray-100">Talents du Flagship</h1>
        </div>
        <button onClick={() => setCreatingBranch(true)} className="admin-btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Nouvelle branche
        </button>
      </div>

      <FlagshipImagePool />
      <HullConfigSection hulls={data?.hulls ?? {}} onUpdated={refetch} />

      {branches.length === 0 && (
        <div className="admin-card p-8 text-center text-gray-500">Aucune branche de talent configuree.</div>
      )}

      {branches.map((branch) => {
        const talents = talentsByBranch(branch.id);
        const isCollapsed = collapsed.has(branch.id);

        return (
          <div key={branch.id} className="admin-card mb-4">
            {/* Branch header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
              <button
                onClick={() => toggleCollapse(branch.id)}
                className="flex items-center gap-2 text-left flex-1"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: branch.color }}
                />
                <span className="font-semibold text-gray-100">{branch.name}</span>
                <span className="text-xs text-gray-500 font-mono">({branch.id})</span>
                <span className="text-xs text-gray-500">{talents.length} talent{talents.length > 1 ? 's' : ''}</span>
              </button>
              <div className="flex gap-1">
                <button
                  onClick={() => setCreatingTalent(branch.id)}
                  className="admin-btn-ghost p-1.5 text-emerald-400"
                  title="Ajouter un talent"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setEditingBranch(branch.id)} className="admin-btn-ghost p-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setDeletingBranch(branch.id); setDeleteError(null); }}
                  className="admin-btn-ghost p-1.5 text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Talents table */}
            {!isCollapsed && (
              <div className="overflow-x-auto">
                {talents.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">Aucun talent dans cette branche.</div>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nom</th>
                        <th>Tier</th>
                        <th>Position</th>
                        <th>Rangs</th>
                        <th>Type effet</th>
                        <th>Parametres</th>
                        <th>Prerequis</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {talents.map((t) => (
                        <tr key={t.id}>
                          <td className="font-mono text-gray-400 text-xs">{t.id}</td>
                          <td className="font-medium">{t.name}</td>
                          <td className="text-center font-mono">{t.tier}</td>
                          <td className="text-xs text-gray-400">{t.position}</td>
                          <td className="text-center font-mono">{t.maxRanks}</td>
                          <td>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${EFFECT_COLORS[t.effectType] ?? 'text-gray-400'}`}>
                              {EFFECT_TYPES.find((e) => e.value === t.effectType)?.label ?? t.effectType}
                            </span>
                          </td>
                          <td className="text-xs text-gray-400 max-w-[200px] truncate" title={JSON.stringify(t.effectParams)}>
                            {effectParamsSummary(t.effectType, t.effectParams)}
                          </td>
                          <td className="text-xs text-gray-500 font-mono">{t.prerequisiteId ?? '—'}</td>
                          <td>
                            <div className="flex gap-1">
                              <button onClick={() => setEditingTalent(t.id)} className="admin-btn-ghost p-1.5">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setDeletingTalent(t.id); setDeleteError(null); }}
                                className="admin-btn-ghost p-1.5 text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Branch modals ── */}
      <EditModal
        open={creatingBranch}
        title="Nouvelle branche de talent"
        fields={BRANCH_FIELDS}
        values={defaultBranchForm()}
        saving={createBranchMut.isPending}
        onClose={() => setCreatingBranch(false)}
        onSave={(values) => {
          createBranchMut.mutate({
            id: String(values.id),
            name: String(values.name),
            description: String(values.description),
            color: String(values.color),
            sortOrder: Number(values.sortOrder),
          });
        }}
      />

      <EditModal
        open={!!editingBranch}
        title={`Modifier ${editingBranchData?.name ?? ''}`}
        fields={BRANCH_EDIT_FIELDS}
        values={editingBranchData ? branchToForm(editingBranchData) : {}}
        saving={updateBranchMut.isPending}
        onClose={() => setEditingBranch(null)}
        onSave={(values) => {
          if (!editingBranch) return;
          updateBranchMut.mutate({
            id: editingBranch,
            data: { name: String(values.name), description: String(values.description), color: String(values.color), sortOrder: Number(values.sortOrder) },
          });
        }}
      />

      <ConfirmDialog
        open={!!deletingBranch}
        title="Supprimer cette branche ?"
        message={deleteError || `La branche "${deletingBranch}" et tous ses talents seront supprimes.`}
        danger
        confirmLabel="Supprimer"
        onConfirm={() => { if (deletingBranch) deleteBranchMut.mutate({ id: deletingBranch }); }}
        onCancel={() => { setDeletingBranch(null); setDeleteError(null); }}
      />

      {/* ── Talent modals ── */}
      <EditModal
        open={!!creatingTalent}
        title="Nouveau talent"
        fields={talentFields(branchOptions, talentOptions)}
        values={defaultTalentForm(creatingTalent ?? undefined)}
        saving={createTalentMut.isPending}
        onClose={() => setCreatingTalent(null)}
        onSave={(values) => {
          createTalentMut.mutate({
            id: String(values.id),
            ...formToTalentData(values),
          });
        }}
      />

      <EditModal
        open={!!editingTalent}
        title={`Modifier ${editingTalentData?.name ?? ''}`}
        fields={talentFields(branchOptions, talentOptions).filter((f) => f.key !== 'id')}
        values={editingTalentData ? talentToForm(editingTalentData) : {}}
        saving={updateTalentMut.isPending}
        onClose={() => setEditingTalent(null)}
        onSave={(values) => {
          if (!editingTalent) return;
          updateTalentMut.mutate({
            id: editingTalent,
            data: formToTalentData(values),
          });
        }}
      />

      <ConfirmDialog
        open={!!deletingTalent}
        title="Supprimer ce talent ?"
        message={deleteError || `Le talent "${deletingTalent}" sera supprime.`}
        danger
        confirmLabel="Supprimer"
        onConfirm={() => { if (deletingTalent) deleteTalentMut.mutate({ id: deletingTalent }); }}
        onCancel={() => { setDeletingTalent(null); setDeleteError(null); }}
      />
    </div>
  );
}
