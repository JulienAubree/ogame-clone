import { useState } from 'react';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pencil, Trash2, X } from 'lucide-react';

type Variant = 'info' | 'warning' | 'success';

const VARIANT_LABELS: Record<Variant, string> = {
  info: 'Info',
  warning: 'Avertissement',
  success: 'Succès',
};

const VARIANT_PILL_CLASSES: Record<Variant, string> = {
  info: 'bg-hull-900/40 text-hull-400',
  warning: 'bg-amber-900/40 text-amber-400',
  success: 'bg-green-900/40 text-green-400',
};

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

interface FormState {
  message: string;
  variant: Variant;
  changelogId: string;
  activate: boolean;
}

const EMPTY_FORM: FormState = {
  message: '',
  variant: 'info',
  changelogId: '',
  activate: false,
};

export default function Announcements() {
  // Modal state: null = closed, 'create' = creating, object = editing that item
  const [modalItem, setModalItem] = useState<'create' | any | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.announcement.admin.list.useQuery();
  const { data: changelogsData } = trpc.changelog.admin.list.useQuery();

  const closeModal = () => {
    setModalItem(null);
    setForm(EMPTY_FORM);
  };

  const createMutation = trpc.announcement.admin.create.useMutation({
    onSuccess: async () => {
      await refetch();
      closeModal();
    },
  });

  const updateMutation = trpc.announcement.admin.update.useMutation({
    onSuccess: async () => {
      await refetch();
      closeModal();
    },
  });

  const setActiveMutation = trpc.announcement.admin.setActive.useMutation({
    onSuccess: () => refetch(),
  });

  const deleteMutation = trpc.announcement.admin.delete.useMutation({
    onSuccess: async () => {
      await refetch();
    },
  });

  const publishedChangelogs = (changelogsData ?? []).filter((c: any) => c.published === true);

  const handleOpenCreate = () => {
    setForm(EMPTY_FORM);
    setModalItem('create');
  };

  const handleOpenEdit = (item: any) => {
    setForm({
      message: item.message ?? '',
      variant: (item.variant ?? 'info') as Variant,
      changelogId: item.changelogId ?? '',
      activate: false,
    });
    setModalItem(item);
  };

  const isEditing = modalItem !== null && modalItem !== 'create';
  const isCreating = modalItem === 'create';

  const handleSubmit = () => {
    if (isCreating) {
      createMutation.mutate({
        message: form.message,
        variant: form.variant,
        changelogId: form.changelogId || undefined,
        activate: form.activate,
      });
    } else if (isEditing) {
      updateMutation.mutate({
        id: modalItem.id,
        message: form.message,
        variant: form.variant,
        changelogId: form.changelogId === '' ? null : form.changelogId,
      });
    }
  };

  const handleToggleActive = (item: any) => {
    setActiveMutation.mutate({ id: item.id, active: !item.active });
  };

  if (isLoading) return <PageSkeleton />;

  const items = data ?? [];
  const modalOpen = modalItem !== null;
  const submitPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Annonces</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {items.length} annonce{items.length > 1 ? 's' : ''}
          </span>
          <button onClick={handleOpenCreate} className="admin-btn-primary text-xs">
            + Nouvelle annonce
          </button>
        </div>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Message</th>
              <th>Variant</th>
              <th>Lien</th>
              <th>Statut</th>
              <th>Créé le</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => {
              const variant = (item.variant ?? 'info') as Variant;
              const linkedChangelog = item.changelogId
                ? (changelogsData ?? []).find((c: any) => c.id === item.changelogId)
                : null;
              return (
                <tr key={item.id}>
                  <td className="max-w-[320px]" title={item.message ?? ''}>
                    {truncate(item.message ?? '', 80)}
                  </td>
                  <td>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${VARIANT_PILL_CLASSES[variant]}`}
                    >
                      {VARIANT_LABELS[variant]}
                    </span>
                  </td>
                  <td className="text-sm text-gray-400 max-w-[200px] truncate">
                    {linkedChangelog ? linkedChangelog.title : '—'}
                  </td>
                  <td>
                    <button
                      onClick={() => handleToggleActive(item)}
                      disabled={setActiveMutation.isPending}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        item.active
                          ? 'bg-green-900/40 text-green-400 hover:bg-green-900/60'
                          : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700/80'
                      }`}
                    >
                      {item.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="text-sm text-gray-400 whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="admin-btn-ghost p-1.5"
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
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
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-8">
                  Aucune annonce.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="admin-card p-6 max-w-xl w-full mx-4 animate-slide-up shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-100">
                {isCreating ? 'Nouvelle annonce' : "Modifier l'annonce"}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="admin-input"
                  rows={3}
                  maxLength={280}
                />
                <div className="text-right text-[10px] text-gray-500 mt-1">
                  {form.message.length} / 280
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Variant</label>
                <select
                  value={form.variant}
                  onChange={(e) => setForm({ ...form, variant: e.target.value as Variant })}
                  className="admin-input"
                >
                  <option value="info">Info</option>
                  <option value="warning">Avertissement</option>
                  <option value="success">Succès</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Changelog lié</label>
                <select
                  value={form.changelogId}
                  onChange={(e) => setForm({ ...form, changelogId: e.target.value })}
                  className="admin-input"
                >
                  <option value="">Aucun</option>
                  {publishedChangelogs.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.title} — {formatDate(c.date ?? c.createdAt)}
                    </option>
                  ))}
                </select>
              </div>
              {isCreating && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="activate-toggle"
                    checked={form.activate}
                    onChange={(e) => setForm({ ...form, activate: e.target.checked })}
                    className="rounded border-gray-600 bg-panel-dark text-hull-500 focus:ring-hull-500"
                  />
                  <label htmlFor="activate-toggle" className="text-sm text-gray-400">
                    Activer immédiatement
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={closeModal} className="admin-btn-ghost">
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitPending || form.message.trim().length === 0}
                className="admin-btn-primary"
              >
                {isCreating
                  ? submitPending
                    ? 'Création...'
                    : 'Créer'
                  : submitPending
                    ? 'Sauvegarde...'
                    : 'Sauvegarder'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer cette annonce ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => {
          if (!deleteId) return;
          const id = deleteId;
          setDeleteId(null);
          deleteMutation.mutate({ id });
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
