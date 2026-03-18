import { useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { EditModal } from '@/components/ui/EditModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, Pencil, Trash2, GraduationCap } from 'lucide-react';

const CONDITION_LABELS: Record<string, string> = {
  building_level: 'Niveau batiment',
  ship_count: 'Nombre vaisseaux',
  mission_complete: 'Mission completee',
};

const FIELDS = [
  { key: 'id', label: 'ID (slug)', type: 'text' as const },
  { key: 'order', label: 'Ordre', type: 'number' as const },
  { key: 'title', label: 'Titre', type: 'text' as const },
  { key: 'narrativeText', label: 'Texte narratif (Conseiller)', type: 'textarea' as const },
  { key: 'conditionType', label: 'Type de condition', type: 'select' as const, options: [
    { value: 'building_level', label: 'Niveau batiment' },
    { value: 'ship_count', label: 'Nombre vaisseaux' },
    { value: 'mission_complete', label: 'Mission completee' },
  ]},
  { key: 'conditionTargetId', label: 'Cible (ID batiment/vaisseau/mission)', type: 'text' as const },
  { key: 'conditionTargetValue', label: 'Valeur cible', type: 'number' as const },
  { key: 'rewardMinerai', label: 'Recompense Minerai', type: 'number' as const },
  { key: 'rewardSilicium', label: 'Recompense Silicium', type: 'number' as const },
  { key: 'rewardHydrogene', label: 'Recompense Hydrogene', type: 'number' as const },
];

const EDIT_FIELDS = FIELDS.filter((f) => f.key !== 'id');

function defaultForm(): Record<string, string | number> {
  return {
    id: '',
    order: 0,
    title: '',
    narrativeText: '',
    conditionType: 'building_level',
    conditionTargetId: '',
    conditionTargetValue: 1,
    rewardMinerai: 0,
    rewardSilicium: 0,
    rewardHydrogene: 0,
  };
}

function questToForm(q: any): Record<string, string | number> {
  return {
    order: q.order,
    title: q.title,
    narrativeText: q.narrativeText,
    conditionType: q.conditionType,
    conditionTargetId: q.conditionTargetId,
    conditionTargetValue: q.conditionTargetValue,
    rewardMinerai: q.rewardMinerai ?? 0,
    rewardSilicium: q.rewardSilicium ?? 0,
    rewardHydrogene: q.rewardHydrogene ?? 0,
  };
}

function formToCreateData(values: Record<string, string | number>) {
  return {
    id: String(values.id),
    order: Number(values.order),
    title: String(values.title),
    narrativeText: String(values.narrativeText),
    conditionType: String(values.conditionType) as 'building_level' | 'ship_count' | 'mission_complete',
    conditionTargetId: String(values.conditionTargetId),
    conditionTargetValue: Number(values.conditionTargetValue),
    rewardMinerai: Number(values.rewardMinerai),
    rewardSilicium: Number(values.rewardSilicium),
    rewardHydrogene: Number(values.rewardHydrogene),
  };
}

function formToUpdateData(values: Record<string, string | number>) {
  const { id, ...rest } = formToCreateData(values);
  return rest;
}

export default function TutorialQuests() {
  const { data, isLoading, refetch } = useGameConfig();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const createMutation = trpc.gameConfig.admin.createTutorialQuest.useMutation({
    onSuccess: () => { refetch(); setCreating(false); },
  });
  const updateMutation = trpc.gameConfig.admin.updateTutorialQuest.useMutation({
    onSuccess: () => { refetch(); setEditing(null); },
  });
  const deleteMutation = trpc.gameConfig.admin.deleteTutorialQuest.useMutation({
    onSuccess: () => { refetch(); setDeleting(null); setDeleteError(null); },
    onError: (err) => { setDeleteError(err.message); },
  });

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const quests = [...(data.tutorialQuests ?? [])].sort((a, b) => a.order - b.order);

  const editingQuest = editing ? quests.find((q) => q.id === editing) : null;
  const editValues = editingQuest ? questToForm(editingQuest) : {};

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-hull-400" />
          <h1 className="text-lg font-semibold text-gray-100">Onboarding — Quetes tutoriel</h1>
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
              <th>#</th>
              <th>ID</th>
              <th>Titre</th>
              <th>Condition</th>
              <th>Cible</th>
              <th>Valeur</th>
              <th>Recompenses</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {quests.map((q) => (
              <tr key={q.id}>
                <td className="text-center text-gray-500 font-mono text-xs">{q.order}</td>
                <td className="font-mono text-gray-400 text-xs">{q.id}</td>
                <td className="font-medium">{q.title}</td>
                <td>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-cyan-400 bg-cyan-900/20">
                    {CONDITION_LABELS[q.conditionType] ?? q.conditionType}
                  </span>
                </td>
                <td className="font-mono text-gray-400 text-xs">{q.conditionTargetId}</td>
                <td className="text-center">{q.conditionTargetValue}</td>
                <td className="text-xs">
                  <span className="text-orange-400">{q.rewardMinerai?.toLocaleString('fr-FR')}</span>
                  {' / '}
                  <span className="text-blue-400">{q.rewardSilicium?.toLocaleString('fr-FR')}</span>
                  {' / '}
                  <span className="text-emerald-400">{q.rewardHydrogene?.toLocaleString('fr-FR')}</span>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(q.id)} className="admin-btn-ghost p-1.5">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeleting(q.id); setDeleteError(null); }}
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
      </div>

      {/* Create modal */}
      <EditModal
        open={creating}
        title="Nouvelle quete tutoriel"
        fields={FIELDS}
        values={defaultForm()}
        saving={createMutation.isPending}
        onClose={() => setCreating(false)}
        onSave={(values) => {
          createMutation.mutate(formToCreateData(values));
        }}
      />

      {/* Edit modal */}
      <EditModal
        open={!!editing}
        title={`Modifier "${editingQuest?.title ?? ''}"`}
        fields={EDIT_FIELDS}
        values={editValues}
        saving={updateMutation.isPending}
        onClose={() => setEditing(null)}
        onSave={(values) => {
          if (!editing) return;
          updateMutation.mutate({
            id: editing,
            data: formToUpdateData(values),
          });
        }}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleting}
        title="Supprimer cette quete ?"
        message={deleteError || `La quete "${deleting}" sera supprimee. Cette action est irreversible.`}
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
