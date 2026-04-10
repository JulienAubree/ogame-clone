import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { trpc } from '@/trpc';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { ArrowLeft, Send } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function inlineFormat(text: string): React.ReactNode {
  // Order matters: longer/more specific patterns first
  // Process in passes to handle nested formats
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text**
    let match = remaining.match(/^\*\*(.+?)\*\*/);
    if (match) {
      tokens.push(<strong key={key++} className="text-foreground font-semibold">{match[1]}</strong>);
      remaining = remaining.slice(match[0].length);
      continue;
    }
    // Italic *text*
    match = remaining.match(/^\*(.+?)\*/);
    if (match) {
      tokens.push(<em key={key++} className="text-foreground/70 italic">{match[1]}</em>);
      remaining = remaining.slice(match[0].length);
      continue;
    }
    // Inline code `code`
    match = remaining.match(/^`([^`]+)`/);
    if (match) {
      tokens.push(
        <code key={key++} className="rounded bg-muted/60 px-1 py-px text-[0.85em] font-mono text-primary">
          {match[1]}
        </code>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }
    // Link [text](url)
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      tokens.push(
        <a
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary/80"
        >
          {match[1]}
        </a>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }
    // Find next special char or end
    const nextSpecial = remaining.search(/[\*`\[]/);
    if (nextSpecial === -1) {
      tokens.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (nextSpecial > 0) {
      tokens.push(<span key={key++}>{remaining.slice(0, nextSpecial)}</span>);
      remaining = remaining.slice(nextSpecial);
    } else {
      // Special char that didn't match a pattern — emit as text
      tokens.push(<span key={key++}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    }
  }
  return tokens;
}

function renderMarkdown(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let orderedListItems: string[] = [];
  let codeBlockLines: string[] = [];
  let inCodeBlock = false;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-1 mb-3 ml-1">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 flex gap-2">
              <span className="text-muted-foreground shrink-0">•</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
    if (orderedListItems.length > 0) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="space-y-1 mb-3 ml-1">
          {orderedListItems.map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 flex gap-2">
              <span className="text-muted-foreground shrink-0 tabular-nums">{i + 1}.</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ol>
      );
      orderedListItems = [];
    }
  };

  for (const line of lines) {
    // Code block fence
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`pre-${elements.length}`} className="rounded-md bg-muted/50 border border-border/50 p-3 mb-3 overflow-x-auto">
            <code className="text-xs font-mono text-foreground/90">{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Headings — check longest prefix first
    if (line.startsWith('##### ')) {
      flushList();
      elements.push(
        <h5 key={`h5-${elements.length}`} className="text-xs font-medium text-foreground/70 mt-2 mb-0.5">
          {inlineFormat(line.slice(6))}
        </h5>
      );
    } else if (line.startsWith('#### ')) {
      flushList();
      elements.push(
        <h4 key={`h4-${elements.length}`} className="text-sm font-medium text-foreground/90 mt-2.5 mb-0.5">
          {inlineFormat(line.slice(5))}
        </h4>
      );
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${elements.length}`} className="text-sm font-semibold text-foreground mt-3 mb-1">
          {inlineFormat(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${elements.length}`} className="text-base font-semibold text-foreground mt-4 mb-1.5 border-b border-border/30 pb-1">
          {inlineFormat(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={`h1-${elements.length}`} className="text-lg font-bold text-foreground mt-4 mb-2 border-b border-border/40 pb-1.5">
          {inlineFormat(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote key={`bq-${elements.length}`} className="border-l-2 border-primary/40 bg-primary/5 pl-3 py-1 mb-3 text-sm text-foreground/80 italic">
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === '---' || line.trim() === '***') {
      flushList();
      elements.push(
        <hr key={`hr-${elements.length}`} className="border-border/40 my-3" />
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      // Flush ordered list if we were in one
      if (orderedListItems.length > 0) flushList();
      listItems.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      // Flush unordered list if we were in one
      if (listItems.length > 0) flushList();
      orderedListItems.push(line.replace(/^\d+\.\s/, ''));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={`p-${elements.length}`} className="text-sm text-foreground/80 mb-1">{inlineFormat(line)}</p>
      );
    }
  }
  flushList();
  // Close any unterminated code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre key={`pre-${elements.length}`} className="rounded-md bg-muted/50 border border-border/50 p-3 mb-3 overflow-x-auto">
        <code className="text-xs font-mono text-foreground/90">{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }
  return elements;
}

export default function ChangelogDetail() {
  const { changelogId } = useParams<{ changelogId: string }>();
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState('');
  const userId = useAuthStore((s) => s.user?.id);

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

  const deleteMutation = trpc.changelog.deleteComment.useMutation({
    onSuccess: () => {
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
        <div className="glass-card p-4">
          {renderMarkdown(changelog.content)}
        </div>
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
              {comment.userId === userId && (
                <button
                  onClick={() => deleteMutation.mutate({ commentId: comment.id })}
                  className="text-muted-foreground hover:text-destructive text-xs ml-2"
                  disabled={deleteMutation.isPending}
                >
                  supprimer
                </button>
              )}
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
