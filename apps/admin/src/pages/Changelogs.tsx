import { useState } from 'react';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pencil, Trash2, Eye, EyeOff, Sparkles, X } from 'lucide-react';

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

export default function Changelogs() {
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', published: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.changelog.admin.list.useQuery();

  const generateMutation = trpc.changelog.admin.generate.useMutation({
    onSuccess: () => refetch(),
  });

  const updateMutation = trpc.changelog.admin.update.useMutation({
    onSuccess: () => { refetch(); setEditItem(null); },
  });

  const deleteMutation = trpc.changelog.admin.delete.useMutation({
    onSuccess: () => { refetch(); setDeleteId(null); },
  });

  const handleEdit = (item: any) => {
    setEditItem(item);
    setEditForm({ title: item.title ?? '', content: item.content ?? '', published: !!item.published });
  };

  const handleSave = () => {
    if (!editItem) return;
    updateMutation.mutate({
      id: editItem.id,
      title: editForm.title,
      content: editForm.content,
      published: editForm.published,
    });
  };

  const handleTogglePublish = (item: any) => {
    updateMutation.mutate({ id: item.id, published: !item.published });
  };

  if (isLoading) return <PageSkeleton />;

  const items = data ?? [];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Journal de developpement</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{items.length} entree{items.length > 1 ? 's' : ''}</span>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="admin-btn-primary flex items-center gap-1.5 text-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generateMutation.isPending ? 'Generation...' : 'Generer'}
          </button>
        </div>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Titre</th>
              <th>Statut</th>
              <th>Commentaires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id}>
                <td className="text-sm text-gray-400 whitespace-nowrap">{formatDate(item.date ?? item.createdAt)}</td>
                <td className="font-medium max-w-[300px] truncate">{truncate(item.title ?? '', 60)}</td>
                <td>
                  <button
                    onClick={() => handleTogglePublish(item)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      item.published
                        ? 'bg-green-900/40 text-green-400 hover:bg-green-900/60'
                        : 'bg-amber-900/40 text-amber-400 hover:bg-amber-900/60'
                    }`}
                  >
                    {item.published ? 'Publie' : 'Brouillon'}
                  </button>
                </td>
                <td className="font-mono text-sm text-center">{item.commentCount ?? item._count?.comments ?? 0}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(item)}
                      className="admin-btn-ghost p-1.5"
                      title="Modifier"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleTogglePublish(item)}
                      className="admin-btn-ghost p-1.5"
                      title={item.published ? 'Depublier' : 'Publier'}
                    >
                      {item.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setDeleteId(item.id)}
                      className="admin-btn-ghost p-1.5 text-red-500"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-500 py-8">Aucun changelog.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="admin-card p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto animate-slide-up shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-100">Modifier le changelog</h3>
              <button type="button" onClick={() => setEditItem(null)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Titre</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contenu (Markdown)</label>
                <textarea
                  value={editForm.content}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                  className="admin-input font-mono text-sm min-h-[300px] resize-y"
                  rows={15}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="published-toggle"
                  checked={editForm.published}
                  onChange={(e) => setEditForm({ ...editForm, published: e.target.checked })}
                  className="rounded border-gray-600 bg-panel-dark text-hull-500 focus:ring-hull-500"
                />
                <label htmlFor="published-toggle" className="text-sm text-gray-400">
                  Publie
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setEditItem(null)} className="admin-btn-ghost">
                Annuler
              </button>
              <button type="submit" disabled={updateMutation.isPending} className="admin-btn-primary">
                {updateMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer ce changelog ?"
        message="Cette action est irreversible. Le changelog et tous ses commentaires seront supprimes."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
