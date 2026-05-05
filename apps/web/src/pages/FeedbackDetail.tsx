import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { trpc } from '@/trpc';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { ThumbsUp, ArrowLeft, Send, ExternalLink } from 'lucide-react';

const TYPE_CONFIG = {
  bug: { label: 'Bug', emoji: '🐛', className: 'bg-red-500/20 text-red-400' },
  idea: { label: 'Idée', emoji: '💡', className: 'bg-amber-500/20 text-amber-400' },
  feedback: { label: 'Feedback', emoji: '💬', className: 'bg-blue-500/20 text-blue-400' },
} as const;

const STATUS_CONFIG = {
  new: { label: 'Nouveau', className: 'bg-blue-500/20 text-blue-400' },
  in_progress: { label: 'En cours', className: 'bg-orange-500/20 text-orange-400' },
  resolved: { label: 'Résolu', className: 'bg-emerald-500/20 text-emerald-400' },
  rejected: { label: 'Rejeté', className: 'bg-gray-500/20 text-gray-400' },
} as const;

export default function FeedbackDetail() {
  const { feedbackId } = useParams<{ feedbackId: string }>();
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState('');

  const utils = trpc.useUtils();
  const { data: feedback, isLoading } = trpc.feedback.getById.useQuery(
    { id: feedbackId! },
    { enabled: !!feedbackId },
  );

  const voteMutation = trpc.feedback.vote.useMutation({
    onSuccess: () => {
      utils.feedback.getById.invalidate({ id: feedbackId! });
      utils.feedback.list.invalidate();
    },
  });

  const commentMutation = trpc.feedback.comment.useMutation({
    onSuccess: () => {
      setCommentText('');
      utils.feedback.getById.invalidate({ id: feedbackId! });
      utils.feedback.list.invalidate();
    },
  });

  if (isLoading || !feedback) {
    return <div className="p-4 text-center text-muted-foreground">Chargement...</div>;
  }

  const typeConfig = TYPE_CONFIG[feedback.type];
  const statusConfig = STATUS_CONFIG[feedback.status];

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/feedback')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour
      </button>

      <div className="glass-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', typeConfig.className)}>
                {typeConfig.emoji} {typeConfig.label}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', statusConfig.className)}>
                {statusConfig.label}
              </span>
            </div>
            <h1 className="text-lg font-semibold text-foreground">{feedback.title}</h1>
          </div>
        </div>

        <p className="text-sm text-foreground/80 whitespace-pre-wrap">{feedback.description}</p>

        {feedback.pagePath && (
          <Link
            to={feedback.pagePath}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors rounded-md border border-border/40 bg-card/40 px-2.5 py-1 font-mono"
            title="Page consultée par l'auteur lors du report"
          >
            <ExternalLink className="h-3 w-3" />
            <span>{feedback.pagePath}</span>
          </Link>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <div className="text-xs text-muted-foreground">
            Par <span className="font-medium text-foreground">{feedback.username ?? 'Inconnu'}</span> · {timeAgo(feedback.createdAt)}
          </div>
          <button
            onClick={() => voteMutation.mutate({ feedbackId: feedback.id })}
            disabled={voteMutation.isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors',
              feedback.hasVoted
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            <ThumbsUp className={cn('w-4 h-4', feedback.hasVoted && 'fill-current')} />
            <span>{feedback.upvoteCount}</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Commentaires ({feedback.comments.length})
        </h2>

        {feedback.comments.map((comment) => (
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
                  Équipe
                </span>
              )}
              <span className="text-muted-foreground ml-auto">{timeAgo(comment.createdAt)}</span>
            </div>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{comment.content}</p>
          </div>
        ))}

        {feedback.comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Aucun commentaire pour le moment</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!commentText.trim()) return;
            commentMutation.mutate({ feedbackId: feedback.id, content: commentText.trim() });
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
