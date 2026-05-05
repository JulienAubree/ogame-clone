import { useState } from 'react';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Search, Trash2, MessageSquare, Download } from 'lucide-react';

const STATUS_OPTIONS = [
  { label: 'Tous', value: undefined },
  { label: 'Nouveau', value: 'new' as const },
  { label: 'En cours', value: 'in_progress' as const },
  { label: 'Résolu', value: 'resolved' as const },
  { label: 'Rejeté', value: 'rejected' as const },
];

const TYPE_OPTIONS = [
  { label: 'Tous', value: undefined },
  { label: 'Bugs', value: 'bug' as const },
  { label: 'Idées', value: 'idea' as const },
  { label: 'Feedbacks', value: 'feedback' as const },
];

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  in_progress: 'En cours',
  resolved: 'Résolu',
  rejected: 'Rejeté',
};

const TYPE_EMOJIS: Record<string, string> = {
  bug: '🐛',
  idea: '💡',
  feedback: '💬',
};

function timeAgo(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

export default function Feedbacks() {
  const [statusFilter, setStatusFilter] = useState<'new' | 'in_progress' | 'resolved' | 'rejected' | undefined>();
  const [typeFilter, setTypeFilter] = useState<'bug' | 'idea' | 'feedback' | undefined>();
  const [offset, setOffset] = useState(0);
  const limit = 30;
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.feedback.admin.list.useQuery(
    { status: statusFilter, type: typeFilter, offset, limit },
    { placeholderData: (prev) => prev },
  );

  const updateStatusMutation = trpc.feedback.admin.updateStatus.useMutation({
    onSuccess: () => refetch(),
  });

  const deleteMutation = trpc.feedback.admin.delete.useMutation({
    onSuccess: () => { refetch(); setDeleteId(null); },
  });

  const exportQuery = trpc.feedback.admin.export.useQuery(
    { status: statusFilter, type: typeFilter },
    { enabled: false },
  );

  const handleExportCsv = async () => {
    const result = await exportQuery.refetch();
    const rows = result.data;
    if (!rows || rows.length === 0) return;

    const headers = ['Type', 'Titre', 'Description', 'Auteur', 'Statut', 'Votes', 'Commentaires', 'Note admin', 'Date'];
    const csvContent = [
      headers.join(','),
      ...rows.map((r: any) => [
        r.type,
        `"${(r.title ?? '').replace(/"/g, '""')}"`,
        `"${(r.description ?? '').replace(/"/g, '""')}"`,
        `"${(r.username ?? '').replace(/"/g, '""')}"`,
        r.status,
        r.upvoteCount,
        r.commentCount,
        `"${(r.adminNote ?? '').replace(/"/g, '""')}"`,
        new Date(r.createdAt).toISOString(),
      ].join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedbacks-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <PageSkeleton />;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const statusCounts = data?.statusCounts ?? {};

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Feedback</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{total} entrée{total > 1 ? 's' : ''}</span>
          <button
            onClick={handleExportCsv}
            disabled={exportQuery.isFetching}
            className="admin-btn-ghost flex items-center gap-1.5 text-xs"
            title="Exporter en CSV"
          >
            <Download className="w-3.5 h-3.5" />
            {exportQuery.isFetching ? 'Export...' : 'CSV'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => { setStatusFilter(s.value); setOffset(0); }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s.value
                ? 'bg-hull-500 text-black'
                : 'bg-panel-light text-gray-400 hover:text-gray-200'
            }`}
          >
            {s.label}
            {s.value && statusCounts[s.value] != null && (
              <span className="ml-1 text-[10px]">({statusCounts[s.value]})</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t.label}
            onClick={() => { setTypeFilter(t.value); setOffset(0); }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              typeFilter === t.value
                ? 'bg-hull-500 text-black'
                : 'bg-panel-light text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Titre</th>
              <th>Page</th>
              <th>Auteur</th>
              <th>Statut</th>
              <th>Votes</th>
              <th>Commentaires</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id}>
                <td className="text-center">{TYPE_EMOJIS[item.type] ?? ''}</td>
                <td className="font-medium max-w-[200px] truncate">{item.title}</td>
                <td className="text-sm text-gray-400 font-mono max-w-[160px] truncate" title={item.pagePath ?? ''}>{item.pagePath ?? '—'}</td>
                <td className="text-sm text-gray-400">{item.username ?? '-'}</td>
                <td>
                  <select
                    value={item.status}
                    onChange={(e) => updateStatusMutation.mutate({ id: item.id, status: e.target.value as any })}
                    className="admin-input text-xs py-0.5 px-1.5"
                  >
                    <option value="new">Nouveau</option>
                    <option value="in_progress">En cours</option>
                    <option value="resolved">Résolu</option>
                    <option value="rejected">Rejeté</option>
                  </select>
                </td>
                <td className="font-mono text-sm text-center">{item.upvoteCount}</td>
                <td className="font-mono text-sm text-center">{item.commentCount}</td>
                <td className="text-sm text-gray-400">{timeAgo(item.createdAt)}</td>
                <td>
                  <button
                    onClick={() => setDeleteId(item.id)}
                    className="admin-btn-ghost p-1.5 text-red-500"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-gray-500 py-8">Aucun feedback.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="admin-btn-ghost"
          >
            Précédent
          </button>
          <span className="text-sm text-gray-500">
            {offset + 1}-{Math.min(offset + limit, total)} sur {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="admin-btn-ghost"
          >
            Suivant
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer ce feedback ?"
        message="Cette action est irréversible. Le feedback et tous ses commentaires seront supprimés."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
