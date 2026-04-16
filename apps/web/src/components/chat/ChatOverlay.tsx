import { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router';
import { useChatStore } from '@/stores/chat.store';
import { trpc } from '@/trpc';
import { UserAvatar } from './UserAvatar';
import { ChatOverlayWindow } from './ChatOverlayWindow';

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

function ChatFab() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const openChat = useChatStore((s) => s.openChat);

  const { data: unreadCount } = trpc.message.unreadCount.useQuery();
  const { data: conversations } = trpc.message.conversations.useQuery(undefined, {
    enabled: panelOpen,
  });
  const { data: searchResults } = trpc.user.search.useQuery(
    { query: searchQuery },
    { enabled: panelOpen && searchQuery.length >= 2 },
  );

  const nonNullConvs = conversations?.filter((c): c is NonNullable<typeof c> => c !== null);
  const isSearching = searchQuery.length >= 2;

  const handleSelectConversation = (conv: NonNullable<(typeof nonNullConvs)>[number]) => {
    openChat(conv.otherUser.id, conv.otherUser.username, conv.threadId, conv.otherUser.avatarId);
    setPanelOpen(false);
    setSearchQuery('');
  };

  const handleSelectUser = (user: { id: string; username: string; avatarId?: string | null }) => {
    openChat(user.id, user.username, null, user.avatarId);
    setPanelOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative mb-2">
      {/* Conversation panel */}
      {panelOpen && (
        <div className="absolute bottom-12 right-0 w-[280px] max-h-[400px] flex flex-col rounded-xl border border-border/30 bg-card shadow-xl overflow-hidden">
          {/* Panel header */}
          <div className="p-2.5 border-b border-border/30 flex items-center gap-2 flex-shrink-0">
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un joueur..."
              className="flex-1 bg-muted/30 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Search results */}
          {isSearching ? (
            <div className="flex-1 overflow-y-auto">
              {searchResults && searchResults.length > 0 ? (
                searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                  >
                    <UserAvatar username={user.username} avatarId={user.avatarId} size="sm" />
                    <span className="text-xs text-foreground">{user.username}</span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground p-3">Aucun joueur trouvé</p>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {!nonNullConvs || nonNullConvs.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">Aucune conversation</p>
              ) : (
                nonNullConvs.map((conv) => (
                  <button
                    key={conv.threadId}
                    onClick={() => handleSelectConversation(conv)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="relative flex-shrink-0">
                      <UserAvatar username={conv.otherUser.username} avatarId={conv.otherUser.avatarId} size="sm" />
                      {conv.unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground flex items-center justify-center">
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <Link
                          to={`/player/${conv.otherUser.id}`}
                          className={`text-xs hover:underline ${conv.unreadCount > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {conv.otherUser.username}
                        </Link>
                        <span className="text-[9px] text-muted-foreground/60 ml-1 flex-shrink-0">
                          {formatRelative(conv.lastMessage.createdAt)}
                        </span>
                      </div>
                      <p className={`text-[10px] truncate ${conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground/70'}`}>
                        {conv.lastMessage.body}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg hover:scale-105 transition-transform relative"
        aria-label="Ouvrir le chat"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {(unreadCount ?? 0) > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
            {unreadCount! > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}

function useAllianceAutoOpen() {
  const { data: myAlliance } = trpc.alliance.myAlliance.useQuery();
  const openAllianceChat = useChatStore((s) => s.openAllianceChat);
  const minimizeChat = useChatStore((s) => s.minimizeChat);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!myAlliance || openedRef.current) return;
    openedRef.current = true;
    const key = `alliance:${myAlliance.id}`;
    openAllianceChat(myAlliance.id, myAlliance.name, myAlliance.tag);
    // Start minimized
    minimizeChat(key);
  }, [myAlliance, openAllianceChat, minimizeChat]);
}

export function ChatOverlay() {
  const { pathname } = useLocation();
  const { windows, expandChat, closeChat } = useChatStore();

  useAllianceAutoOpen();

  // Hide on /messages page (page takes over) and on mobile (lg:flex)
  if (pathname === '/messages') return null;

  const expanded = windows.filter((w) => !w.minimized);
  const minimized = windows.filter((w) => w.minimized);

  return (
    <div className="hidden lg:flex fixed bottom-0 right-4 z-30 items-end gap-2">
      {/* Expanded windows */}
      {expanded.map((w) => (
        <ChatOverlayWindow
          key={w.userId}
          userId={w.userId}
          username={w.username}
          avatarId={w.avatarId}
          threadId={w.threadId}
          allianceId={w.allianceId}
          allianceTag={w.allianceTag}
        />
      ))}

      {/* Minimized bubbles */}
      {minimized.map((w) => (
        <div key={w.userId} className="relative mb-2">
          <button
            onClick={() => expandChat(w.userId)}
            title={w.username}
          >
            {w.allianceId ? (
              <div className="w-10 h-10 rounded-full bg-yellow-500/20 border-2 border-yellow-500/50 flex items-center justify-center text-xs font-bold text-yellow-400 shadow-lg cursor-pointer hover:scale-105 transition-transform">
                {w.allianceTag?.slice(0, 3)}
              </div>
            ) : (
              <UserAvatar username={w.username} avatarId={w.avatarId} size="lg" className="shadow-lg cursor-pointer hover:scale-105 transition-transform" />
            )}
          </button>
          {w.unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center pointer-events-none">
              {w.unreadCount > 9 ? '9+' : w.unreadCount}
            </span>
          )}
          <button
            onClick={() => closeChat(w.userId)}
            aria-label={`Fermer ${w.username}`}
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}

      {/* Chat FAB */}
      <ChatFab />
    </div>
  );
}
