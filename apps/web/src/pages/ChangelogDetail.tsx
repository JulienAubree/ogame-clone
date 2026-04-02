import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { trpc } from '@/trpc';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { ArrowLeft, Send } from 'lucide-react';

const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function ChangelogDetail() {
  const { changelogId } = useParams<{ changelogId: string }>();
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState('');

  const utils = trpc.useUtils();
  const { data: changelog, isLoading } = trpc.changelog.detail.useQuery(
    { id: changelogId! },
    { enabled: !!changelogId },
  );

  const commentMutation = trpc.changelog.comment.useMutation({
    onSuccess: () => {
      setCommentText('');
      utils.changelog.detail.invalidate({ id: changelogId! });
    },
  });

  if (isLoading || !changelog) {
    return <div className="p-4 text-center text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/changelog')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Nouveautes
      </button>

      <div className="glass-card p-4 space-y-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">{changelog.title}</h1>
          <p className="text-xs text-muted-foreground">{formatDate(changelog.createdAt)}</p>
        </div>
        <div className="text-sm text-foreground/80 whitespace-pre-wrap">{changelog.content}</div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Commentaires ({changelog.comments.length})
        </h2>

        {changelog.comments.map((comment: any) => (
          <div
            key={comment.id}
            className={cn(
              'glass-card p-3 space-y-1',
              comment.isAdmin && 'border-l-2 border-l-primary',
            )}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-foreground">{comment.username ?? 'Inconnu'}</span>
              {comment.isAdmin && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  Equipe
                </span>
              )}
              <span className="text-muted-foreground ml-auto">{timeAgo(comment.createdAt)}</span>
            </div>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{comment.content}</p>
          </div>
        ))}

        {changelog.comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Aucun commentaire pour le moment</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!commentText.trim()) return;
            commentMutation.mutate({ changelogId: changelog.id, content: commentText.trim() });
          }}
          className="flex gap-2"
        >
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Ajouter un commentaire..."
            maxLength={2000}
            rows={2}
            className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!commentText.trim() || commentMutation.isPending}
            className="self-end"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
