import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { ThumbsUp, MessageSquare } from 'lucide-react';
import { trpc } from '@/trpc';

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

function timeAgo(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

interface FeedbackCardProps {
  feedback: {
    id: string;
    type: 'bug' | 'idea' | 'feedback';
    title: string;
    status: 'new' | 'in_progress' | 'resolved' | 'rejected';
    username: string | null;
    upvoteCount: number;
    commentCount: number;
    hasVoted: boolean;
    createdAt: string | Date;
  };
}

export function FeedbackCard({ feedback }: FeedbackCardProps) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const voteMutation = trpc.feedback.vote.useMutation({
    onSuccess: () => {
      utils.feedback.list.invalidate();
    },
  });

  const typeConfig = TYPE_CONFIG[feedback.type];
  const statusConfig = STATUS_CONFIG[feedback.status];

  return (
    <div className="glass-card p-3 space-y-2 transition-colors hover:bg-accent/30">
      <button
        type="button"
        onClick={() => navigate(`/feedback/${feedback.id}`)}
        className="w-full text-left space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">{typeConfig.emoji}</span>
            <span className="text-sm font-medium truncate text-foreground">{feedback.title}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', typeConfig.className)}>
              {typeConfig.label}
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', statusConfig.className)}>
              {statusConfig.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{feedback.username ?? 'Inconnu'}</span>
          <span className="ml-auto">{timeAgo(feedback.createdAt)}</span>
        </div>
      </button>
      <div className="flex items-center gap-4 pt-1 border-t border-border/30">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            voteMutation.mutate({ feedbackId: feedback.id });
          }}
          disabled={voteMutation.isPending}
          className={cn(
            'flex items-center gap-1.5 text-xs transition-colors',
            feedback.hasVoted ? 'text-primary' : 'text-muted-foreground hover:text-primary',
          )}
        >
          <ThumbsUp className={cn('w-3.5 h-3.5', feedback.hasVoted && 'fill-current')} />
          <span>{feedback.upvoteCount}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`/feedback/${feedback.id}`)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{feedback.commentCount}</span>
        </button>
      </div>
    </div>
  );
}
