import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { TablePageSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

const MEDALS = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

export default function AllianceRanking() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const navigate = useNavigate();
  const location = useLocation();
  const isAllianceRanking = location.pathname === '/alliance-ranking';

  const { data: rankings, isLoading } = trpc.alliance.ranking.useQuery({ page });

  if (isLoading) return <TablePageSkeleton />;

  const totalPages = rankings && rankings.length === limit ? page + 1 : page;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Classement des alliances" />

      <div className="flex gap-2">
        <button
          onClick={() => navigate('/ranking')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${!isAllianceRanking ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
        >
          Joueurs
        </button>
        <button
          onClick={() => navigate('/alliance-ranking')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${isAllianceRanking ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
        >
          Alliances
        </button>
      </div>

      <div className="glass-card p-4">
        {/* Mobile list view */}
        <div className="space-y-1 lg:hidden">
          {rankings?.map((entry, i) => {
            const rank = (page - 1) * limit + i + 1;
            const medalIdx = rank - 1;
            return (
              <div key={entry.allianceId} className="flex items-center justify-between rounded-lg p-2">
                <div className="flex items-center gap-3">
                  <span className="w-8 text-center font-mono text-sm">
                    {medalIdx < 3 ? (
                      <span className={cn('text-lg', MEDALS[medalIdx])}>
                        {medalIdx === 0 ? '🥇' : medalIdx === 1 ? '🥈' : '🥉'}
                      </span>
                    ) : (
                      rank
                    )}
                  </span>
                  <span className="text-sm">[{entry.tag}] {entry.name}</span>
                </div>
                <span className="text-sm text-muted-foreground">{entry.totalPoints.toLocaleString('fr-FR')}</span>
              </div>
            );
          })}
          {(!rankings || rankings.length === 0) && (
            <div className="px-2 py-4 text-center text-muted-foreground">
              Aucune alliance.
            </div>
          )}
        </div>

        {/* Desktop table view */}
        <div className="hidden lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1 w-16">Rang</th>
                <th className="px-2 py-1">Alliance</th>
                <th className="px-2 py-1 text-right">Membres</th>
                <th className="px-2 py-1 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {rankings?.map((entry, i) => {
                const rank = (page - 1) * limit + i + 1;
                const medalIdx = rank - 1;
                return (
                  <tr key={entry.allianceId} className="border-b border-border/50">
                    <td className="px-2 py-1 font-mono">
                      {medalIdx < 3 ? (
                        <span className={cn('text-lg', MEDALS[medalIdx])}>
                          {medalIdx === 0 ? '🥇' : medalIdx === 1 ? '🥈' : '🥉'}
                        </span>
                      ) : (
                        rank
                      )}
                    </td>
                    <td className="px-2 py-1">[{entry.tag}] {entry.name}</td>
                    <td className="px-2 py-1 text-right">{entry.memberCount}</td>
                    <td className="px-2 py-1 text-right">{entry.totalPoints.toLocaleString('fr-FR')}</td>
                  </tr>
                );
              })}
              {(!rankings || rankings.length === 0) && (
                <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">Aucune alliance.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>Précédent</Button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
            const p = i + 1;
            return (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPage(p)}
                className="w-8 px-0"
              >
                {p}
              </Button>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={!rankings || rankings.length < limit}>Suivant</Button>
        </div>
      </div>
    </div>
  );
}
