import { useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { EditModal } from '@/components/ui/EditModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, Pencil, Trash2, Skull } from 'lucide-react';

const TIER_COLORS: Record<string, string> = {
  easy: 'text-emerald-400 bg-emerald-900/20',
  medium: 'text-amber-400 bg-amber-900/20',
  hard: 'text-red-400 bg-red-900/20',
};

const FIELDS = [
  { key: 'id', label: 'ID (slug)', type: 'text' as const },
  { key: 'name', label: 'Nom', type: 'text' as const },
  { key: 'tier', label: 'Difficulte', type: 'select' as const, options: [
    { value: 'easy', label: 'Facile' },
    { value: 'medium', label: 'Moyen' },
    { value: 'hard', label: 'Difficile' },
  ]},
  { key: 'ships', label: 'Vaisseaux (JSON, ex: {"lightFighter":5})', type: 'textarea' as const },
  { key: 'techs', label: 'Techs (JSON, ex: {"weapons":1,"shielding":0,"armor":1})', type: 'textarea' as const },
  { key: 'rewardMinerai', label: 'Recompense Minerai', type: 'number' as const },
  { key: 'rewardSilicium', label: 'Recompense Silicium', type: 'number' as const },
  { key: 'rewardHydrogene', label: 'Recompense Hydrogene', type: 'number' as const },
  { key: 'bonusShips', label: 'Bonus Ships (JSON, ex: [{"shipId":"lightFighter","count":2,"chance":0.3}])', type: 'textarea' as const },
  { key: 'centerLevelMin', label: 'Centre missions min', type: 'number' as const },
  { key: 'centerLevelMax', label: 'Centre missions max', type: 'number' as const },
];

const EDIT_FIELDS = FIELDS.filter((f) => f.key !== 'id');

function defaultForm(): Record<string, string | number> {
  return {
    id: '',
    name: '',
    tier: 'easy',
    ships: '{}',
    techs: '{"weapons":0,"shielding":0,"armor":0}',
    rewardMinerai: 0,
    rewardSilicium: 0,
    rewardHydrogene: 0,
    bonusShips: '[]',
    centerLevelMin: 3,
    centerLevelMax: 10,
  };
}

function templateToForm(t: any): Record<string, string | number> {
  return {
    name: t.name,
    tier: t.tier,
    ships: JSON.stringify(t.ships, null, 2),
    techs: JSON.stringify(t.techs, null, 2),
    rewardMinerai: t.rewards?.minerai ?? 0,
    rewardSilicium: t.rewards?.silicium ?? 0,
    rewardHydrogene: t.rewards?.hydrogene ?? 0,
    bonusShips: JSON.stringify(t.rewards?.bonusShips ?? [], null, 2),
    centerLevelMin: t.centerLevelMin,
    centerLevelMax: t.centerLevelMax,
  };
}

function formToMutationData(values: Record<string, string | number>) {
  let ships: Record<string, number> = {};
  let techs = { weapons: 0, shielding: 0, armor: 0 };
  let bonusShips: { shipId: string; count: number; chance: number }[] = [];
  try { ships = JSON.parse(String(values.ships)); } catch {}
  try { techs = JSON.parse(String(values.techs)); } catch {}
  try { bonusShips = JSON.parse(String(values.bonusShips)); } catch {}

  return {
    name: String(values.name),
    tier: String(values.tier) as 'easy' | 'medium' | 'hard',
    ships,
    techs,
    rewards: {
      minerai: Number(values.rewardMinerai),
      silicium: Number(values.rewardSilicium),
      hydrogene: Number(values.rewardHydrogene),
      bonusShips,
    },
    centerLevelMin: Number(values.centerLevelMin),
    centerLevelMax: Number(values.centerLevelMax),
  };
}

export default function PveMissions() {
  const { data, isLoading, refetch } = useGameConfig();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const createMutation = trpc.gameConfig.admin.createPirateTemplate.useMutation({
    onSuccess: () => { refetch(); setCreating(false); },
  });
  const updateMutation = trpc.gameConfig.admin.updatePirateTemplate.useMutation({
    onSuccess: () => { refetch(); setEditing(null); },
  });
  const deleteMutation = trpc.gameConfig.admin.deletePirateTemplate.useMutation({
    onSuccess: () => { refetch(); setDeleting(null); setDeleteError(null); },
    onError: (err) => { setDeleteError(err.message); },
  });

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const templates = [...(data.pirateTemplates ?? [])].sort((a, b) => {
    const tierOrder = { easy: 0, medium: 1, hard: 2 };
    const tierDiff = (tierOrder[a.tier as keyof typeof tierOrder] ?? 0) - (tierOrder[b.tier as keyof typeof tierOrder] ?? 0);
    return tierDiff || a.centerLevelMin - b.centerLevelMin;
  });

  const editingTemplate = editing ? templates.find((t) => t.id === editing) : null;
  const editValues = editingTemplate ? templateToForm(editingTemplate) : {};

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skull className="w-5 h-5 text-red-400" />
          <h1 className="text-lg font-semibold text-gray-100">Missions PvE — Templates pirates</h1>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="admin-btn-primary flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Difficulte</th>
              <th>Vaisseaux</th>
              <th>Techs</th>
              <th>Recompenses</th>
              <th>Centre Min</th>
              <th>Centre Max</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const shipSummary = Object.entries(t.ships as Record<string, number>)
                .map(([k, v]) => `${v}x ${k}`)
                .join(', ');
              const techs = t.techs as { weapons: number; shielding: number; armor: number };
              return (
                <tr key={t.id}>
                  <td className="font-mono text-gray-400 text-xs">{t.id}</td>
                  <td className="font-medium">{t.name}</td>
                  <td>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[t.tier] ?? ''}`}>
                      {t.tier}
                    </span>
                  </td>
                  <td className="text-xs text-gray-400 max-w-[200px] truncate" title={shipSummary}>
                    {shipSummary}
                  </td>
                  <td className="text-xs font-mono text-gray-400">
                    W{techs.weapons} S{techs.shielding} A{techs.armor}
                  </td>
                  <td className="text-xs">
                    <span className="text-orange-400">{(t.rewards as any).minerai?.toLocaleString('fr-FR')}</span>
                    {' / '}
                    <span className="text-blue-400">{(t.rewards as any).silicium?.toLocaleString('fr-FR')}</span>
                    {' / '}
                    <span className="text-emerald-400">{(t.rewards as any).hydrogene?.toLocaleString('fr-FR')}</span>
                  </td>
                  <td className="text-center">{t.centerLevelMin}</td>
                  <td className="text-center">{t.centerLevelMax}</td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(t.id)} className="admin-btn-ghost p-1.5">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setDeleting(t.id); setDeleteError(null); }}
                        className="admin-btn-ghost p-1.5 text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      <EditModal
        open={creating}
        title="Nouveau template pirate"
        fields={FIELDS}
        values={defaultForm()}
        saving={createMutation.isPending}
        onClose={() => setCreating(false)}
        onSave={(values) => {
          createMutation.mutate({
            id: String(values.id),
            ...formToMutationData(values),
          });
        }}
      />

      {/* Edit modal */}
      <EditModal
        open={!!editing}
        title={`Modifier ${editingTemplate?.name ?? ''}`}
        fields={EDIT_FIELDS}
        values={editValues}
        saving={updateMutation.isPending}
        onClose={() => setEditing(null)}
        onSave={(values) => {
          if (!editing) return;
          updateMutation.mutate({
            id: editing,
            data: formToMutationData(values),
          });
        }}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleting}
        title="Supprimer ce template pirate ?"
        message={deleteError || `Le template "${deleting}" sera supprime. Cette action est irreversible.`}
        danger
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (deleting) deleteMutation.mutate({ id: deleting });
        }}
        onCancel={() => { setDeleting(null); setDeleteError(null); }}
      />
    </div>
  );
}
