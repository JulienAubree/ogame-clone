import { useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { EditModal } from '@/components/ui/EditModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, Pencil, Trash2, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';

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
