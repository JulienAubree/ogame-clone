import { useMemo, useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { EditModal } from '@/components/ui/EditModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const FIELDS = [
  { key: 'key', label: 'Cle', type: 'text' as const },
  { key: 'label', label: 'Label', type: 'text' as const },
];

const EDIT_FIELDS = FIELDS.filter((f) => f.key !== 'key');

function defaultForm() {
  return { key: '', label: '' };
}

export default function Labels() {
  const { data, isLoading, refetch } = useGameConfig();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const createMutation = trpc.gameConfig.admin.createLabel.useMutation({
    onSuccess: () => { refetch(); setCreating(false); },
  });
  const updateMutation = trpc.gameConfig.admin.updateLabel.useMutation({
    onSuccess: () => { refetch(); setEditing(null); },
  });
  const deleteMutation = trpc.gameConfig.admin.deleteLabel.useMutation({
    onSuccess: () => { refetch(); setDeleting(null); setDeleteError(null); },
    onError: (err) => { setDeleteError(err.message); },
  });

  const labelEntries = useMemo(() => {
    if (!data?.labels) return [];
    return Object.entries(data.labels).sort(([a], [b]) => a.localeCompare(b));
  }, [data?.labels]);

  // Group by prefix
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string }[]>();
    for (const [key, label] of labelEntries) {
      const prefix = key.split('.')[0] ?? 'other';
      if (!map.has(prefix)) map.set(prefix, []);
      map.get(prefix)!.push({ key, label });
    }
    return Array.from(map.entries());
  }, [labelEntries]);

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const editingLabel = editing ? { key: editing, label: data.labels?.[editing] ?? '' } : null;
  const editValues: Record<string, string | number> = editingLabel ? { label: editingLabel.label } : {};

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Labels UI</h1>
        <button onClick={() => setCreating(true)} className="admin-btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {groups.map(([prefix, items]) => (
        <div key={prefix} className="mb-6">
          <h2 className="text-sm font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">{prefix}.*</h2>
          <div className="admin-card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cle</th>
                  <th>Label</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key}>
                    <td className="font-mono text-gray-400">{item.key}</td>
                    <td>{item.label}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => setEditing(item.key)} className="admin-btn-ghost p-1.5">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setDeleting(item.key); setDeleteError(null); }} className="admin-btn-ghost p-1.5 text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <EditModal
        open={creating}
        title="Nouveau label"
        fields={FIELDS}
        values={defaultForm()}
        saving={createMutation.isPending}
        onClose={() => setCreating(false)}
        onSave={(values) => {
          createMutation.mutate({
            key: String(values.key),
            label: String(values.label),
          });
        }}
      />

      <EditModal
        open={!!editing}
        title={`Modifier ${editingLabel?.key ?? ''}`}
        fields={EDIT_FIELDS}
        values={editValues}
        saving={updateMutation.isPending}
        onClose={() => setEditing(null)}
        onSave={(values) => {
          if (!editing) return;
          updateMutation.mutate({
            key: editing,
            data: { label: String(values.label) },
          });
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Supprimer ce label ?"
        message={deleteError || `Le label "${deleting}" sera supprime. Cette action est irreversible.`}
        danger
        confirmLabel="Supprimer"
        onConfirm={() => { if (deleting) deleteMutation.mutate({ key: deleting }); }}
        onCancel={() => { setDeleting(null); setDeleteError(null); }}
      />
    </div>
  );
}
