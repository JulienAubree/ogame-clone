import { useState } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { UserAvatar } from './UserAvatar';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface ConversationListProps {
  activeThreadId: string | null;
  onSelectThread: (threadId: string, otherUsername: string, otherUserId: string, otherAvatarId?: string | null) => void;
  onNewConversation: (username: string) => void;
}

function formatRelative(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "A l'instant";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Hier';
  if (diffD < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function ConversationList({ activeThreadId, onSelectThread, onNewConversation }: ConversationListProps) {
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: conversations } = trpc.message.conversations.useQuery();
  const deleteMutation = trpc.message.deleteThread.useMutation({
    onSuccess: () => {
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
      setDeleteConfirm(null);
    },
  });
  const { data: searchResults } = trpc.user.search.useQuery(
    { query: searchQuery },
    { enabled: searchMode && searchQuery.length >= 2 },
  );

  const nonNullConversations = conversations?.filter((c): c is NonNullable<typeof c> => c !== null);

  const filtered = filter
    ? nonNullConversations?.filter((c) => c.otherUser.username.toLowerCase().includes(filter.toLowerCase()))
    : nonNullConversations;

  return (
    <div className="flex flex-col h-full min-h-0 border-r border-border/30">
      {/* Header */}
      <div className="p-3 border-b border-border/30 flex items-center gap-2 flex-shrink-0">
        {searchMode ? (
          <>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un joueur..."
              className="flex-1 bg-muted/30 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => { setSearchMode(false); setSearchQuery(''); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
          </>
        ) : (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer..."
              className="flex-1 bg-muted/30 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              onClick={() => setSearchMode(true)}
              className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary hover:bg-primary/30 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </>
        )}
      </div>

      {/* Search results */}
      {searchMode && searchQuery.length >= 2 && (
        <div className="overflow-y-auto">
          {searchResults && searchResults.length > 0 ? (
            searchResults.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  onNewConversation(user.username);
                  setSearchMode(false);
                  setSearchQuery('');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <UserAvatar username={user.username} avatarId={user.avatarId} size="md" />
                <span className="text-sm text-foreground">{user.username}</span>
              </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground p-4">Aucun joueur trouvé</p>
          )}
        </div>
      )}

      {/* Conversation list */}
      {!searchMode && (
        <div className="flex-1 overflow-y-auto">
          {!filtered || filtered.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Aucune conversation</p>
              <button
                onClick={() => setSearchMode(true)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Nouveau message
              </button>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.threadId}
                onClick={() => onSelectThread(conv.threadId, conv.otherUser.username, conv.otherUser.id, conv.otherUser.avatarId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setDeleteConfirm(conv.threadId);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left group ${
                  activeThreadId === conv.threadId ? 'bg-primary/10' : 'hover:bg-muted/30'
                }`}
              >
                <div className="relative">
                  <UserAvatar username={conv.otherUser.username} avatarId={conv.otherUser.avatarId} size="md" />
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <Link
                      to={`/player/${conv.otherUser.id}`}
                      className={`text-sm hover:underline ${conv.unreadCount > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {conv.otherUser.username}
                    </Link>
                    <span className="text-[10px] text-muted-foreground/60 ml-2 flex-shrink-0">
                      {formatRelative(conv.lastMessage.createdAt)}
                    </span>
                  </div>
                  <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {conv.lastMessage.body}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onConfirm={() => { if (deleteConfirm) deleteMutation.mutate({ threadId: deleteConfirm }); }}
        onCancel={() => setDeleteConfirm(null)}
        title="Supprimer cette conversation ?"
        description="Tous les messages de cette conversation seront supprimés. Cette action est irréversible."
        variant="destructive"
        confirmLabel="Supprimer"
      />
    </div>
  );
}
