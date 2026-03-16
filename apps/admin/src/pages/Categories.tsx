import { useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { Pencil, Trash2, Plus } from 'lucide-react';

const ENTITY_TYPES = [
  { value: 'building', label: 'Bâtiments' },
  { value: 'research', label: 'Recherches' },
  { value: 'ship', label: 'Vaisseaux' },
  { value: 'defense', label: 'Défenses' },
] as const;

export default function Categories() {
  const { data, isLoading, refetch } = useGameConfig();
  const [editing, setEditing] = useState<{ id: string; name: string; sortOrder: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState({ id: '', entityType: 'building' as string, name: '', sortOrder: 0 });
  const [deleting, setDeleting] = useState<string | null>(null);

  const createMutation = trpc.gameConfig.admin.createCategory.useMutation({
    onSuccess: () => { refetch(); setCreating(false); setNewCategory({ id: '', entityType: 'building', name: '', sortOrder: 0 }); },
  });

  const updateMutation = trpc.gameConfig.admin.updateCategory.useMutation({
    onSuccess: () => { refetch(); setEditing(null); },
  });

  const deleteMutation = trpc.gameConfig.admin.deleteCategory.useMutation({
    onSuccess: () => { refetch(); setDeleting(null); },
  });

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const categories = [...data.categories].sort((a, b) => {
    if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType);
    return a.sortOrder - b.sortOrder;
  });

  const grouped = ENTITY_TYPES.map((type) => ({
    ...type,
    items: categories.filter((c) => c.entityType === type.value),
  }));

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Catégories</h1>
        <button
          onClick={() => setCreating(true)}
          className="admin-btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {grouped.map((group) => (
        <div key={group.value} className="mb-6">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
            {group.label}
          </h2>
          <div className="admin-card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nom</th>
                  <th>Ordre</th>
                  <th>Entités</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-600 py-4">
                      Aucune catégorie
                    </td>
                  </tr>
                ) : (
                  group.items.map((cat) => {
                    const entityCount = getEntityCount(data, cat.id, cat.entityType);
                    return (
                      <tr key={cat.id}>
                        <td className="font-mono text-xs text-gray-500">{cat.id}</td>
                        <td className="font-medium">
                          {editing?.id === cat.id ? (
                            <input
                              type="text"
                              value={editing.name}
                              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                              className="admin-input w-full"
                              autoFocus
                            />
                          ) : (
                            cat.name
                          )}
                        </td>
                        <td className="font-mono text-sm">
                          {editing?.id === cat.id ? (
                            <input
                              type="number"
                              value={editing.sortOrder}
                              onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                              className="admin-input w-20"
                            />
                          ) : (
                            cat.sortOrder
                          )}
                        </td>
                        <td className="text-sm text-gray-400">{entityCount}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            {editing?.id === cat.id ? (
                              <>
                                <button
                                  onClick={() => updateMutation.mutate({ id: cat.id, data: { name: editing.name, sortOrder: editing.sortOrder } })}
                                  className="admin-btn-primary text-xs px-2 py-1"
                                  disabled={updateMutation.isPending}
                                >
                                  OK
                                </button>
                                <button
                                  onClick={() => setEditing(null)}
                                  className="admin-btn-ghost text-xs px-2 py-1"
                                >
                                  Annuler
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setEditing({ id: cat.id, name: cat.name, sortOrder: cat.sortOrder })}
                                  className="admin-btn-ghost p-1.5"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleting(cat.id)}
                                  className="admin-btn-ghost p-1.5 text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Create dialog */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="admin-card w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-100">Nouvelle catégorie</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type d'entité</label>
                <select
                  value={newCategory.entityType}
                  onChange={(e) => setNewCategory({ ...newCategory, entityType: e.target.value })}
                  className="admin-input w-full"
                >
                  {ENTITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">ID (unique)</label>
                <input
                  type="text"
                  value={newCategory.id}
                  onChange={(e) => setNewCategory({ ...newCategory, id: e.target.value })}
                  className="admin-input w-full"
                  placeholder="ex: ship_support"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nom</label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  className="admin-input w-full"
                  placeholder="ex: Support"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ordre d'affichage</label>
                <input
                  type="number"
                  value={newCategory.sortOrder}
                  onChange={(e) => setNewCategory({ ...newCategory, sortOrder: Number(e.target.value) })}
                  className="admin-input w-20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="admin-btn-ghost text-sm px-4 py-2">
                Annuler
              </button>
              <button
                onClick={() => createMutation.mutate(newCategory as any)}
                className="admin-btn-primary text-sm px-4 py-2"
                disabled={!newCategory.id || !newCategory.name || createMutation.isPending}
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="admin-card w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-100">Supprimer la catégorie ?</h2>
            <p className="text-sm text-gray-400">
              Les entités associées ne seront pas supprimées mais n'auront plus de catégorie.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="admin-btn-ghost text-sm px-4 py-2">
                Annuler
              </button>
              <button
                onClick={() => deleteMutation.mutate({ id: deleting })}
                className="bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-2 rounded"
                disabled={deleteMutation.isPending}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getEntityCount(
  data: any,
  categoryId: string,
  entityType: string,
): number {
  const source =
    entityType === 'building' ? data.buildings :
    entityType === 'research' ? data.research :
    entityType === 'ship' ? data.ships :
    entityType === 'defense' ? data.defenses :
    {};
  return Object.values(source).filter((e: any) => e.categoryId === categoryId).length;
}
