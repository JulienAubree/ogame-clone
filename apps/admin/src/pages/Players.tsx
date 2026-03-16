import { useState } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Search, Eye, Ban, Trash2, ShieldCheck } from 'lucide-react';

export default function Players() {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading, refetch } = trpc.playerAdmin.list.useQuery(
    { offset, limit, search: search || undefined },
    { placeholderData: (prev) => prev },
  );

  const [confirmAction, setConfirmAction] = useState<{
    type: 'ban' | 'unban' | 'delete';
    userId: string;
    username: string;
  } | null>(null);

  const banMutation = trpc.playerAdmin.ban.useMutation({ onSuccess: () => { refetch(); setConfirmAction(null); } });
  const unbanMutation = trpc.playerAdmin.unban.useMutation({ onSuccess: () => { refetch(); setConfirmAction(null); } });
  const deleteMutation = trpc.playerAdmin.delete.useMutation({ onSuccess: () => { refetch(); setConfirmAction(null); } });

  if (isLoading) return <PageSkeleton />;

  const players = data?.players ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Joueurs</h1>
        <span className="text-sm text-gray-500">{total} joueur{total > 1 ? 's' : ''}</span>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Rechercher (nom, email)..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="admin-input pl-9"
        />
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Email</th>
              <th>Planetes</th>
              <th>Points</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p: any) => (
              <tr key={p.id}>
                <td className="font-medium">{p.username}</td>
                <td className="text-sm text-gray-400">{p.email}</td>
                <td className="font-mono text-sm">{p.planetsCount ?? '-'}</td>
                <td className="font-mono text-sm">{p.totalPoints ?? 0}</td>
                <td>
                  {p.bannedAt ? (
                    <span className="admin-badge-danger">Banni</span>
                  ) : (
                    <span className="admin-badge-success">Actif</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/players/${p.id}`}
                      className="admin-btn-ghost p-1.5"
                      title="Detail"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Link>
                    {p.bannedAt ? (
                      <button
                        onClick={() => setConfirmAction({ type: 'unban', userId: p.id, username: p.username })}
                        className="admin-btn-ghost p-1.5 text-emerald-500"
                        title="Debannir"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmAction({ type: 'ban', userId: p.id, username: p.username })}
                        className="admin-btn-ghost p-1.5 text-orange-500"
                        title="Bannir"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmAction({ type: 'delete', userId: p.id, username: p.username })}
                      className="admin-btn-ghost p-1.5 text-red-500"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {players.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-8">
                  Aucun joueur trouve.
                </td>
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
            Precedent
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
        open={!!confirmAction}
        title={
          confirmAction?.type === 'delete'
            ? `Supprimer ${confirmAction?.username} ?`
            : confirmAction?.type === 'ban'
              ? `Bannir ${confirmAction?.username} ?`
              : `Debannir ${confirmAction?.username} ?`
        }
        message={
          confirmAction?.type === 'delete'
            ? 'Cette action est irreversible. Toutes les donnees du joueur seront supprimees.'
            : confirmAction?.type === 'ban'
              ? 'Le joueur ne pourra plus se connecter.'
              : 'Le joueur pourra a nouveau se connecter.'
        }
        confirmLabel={
          confirmAction?.type === 'delete' ? 'Supprimer' : confirmAction?.type === 'ban' ? 'Bannir' : 'Debannir'
        }
        danger={confirmAction?.type === 'delete' || confirmAction?.type === 'ban'}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'ban') banMutation.mutate({ userId: confirmAction.userId });
          if (confirmAction.type === 'unban') unbanMutation.mutate({ userId: confirmAction.userId });
          if (confirmAction.type === 'delete') deleteMutation.mutate({ userId: confirmAction.userId });
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
