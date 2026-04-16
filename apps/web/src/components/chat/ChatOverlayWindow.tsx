import { useEffect } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { UserAvatar } from './UserAvatar';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

interface ChatOverlayWindowProps {
  userId: string;
  username: string;
  avatarId?: string | null;
  threadId: string | null;
  allianceId?: string;
  allianceTag?: string;
}

export function ChatOverlayWindow({ userId: otherUserId, username, avatarId, threadId, allianceId, allianceTag }: ChatOverlayWindowProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { closeChat, minimizeChat, setThreadId } = useChatStore();
  const utils = trpc.useUtils();

  const isAlliance = !!allianceId;
  const windowKey = isAlliance ? `alliance:${allianceId}` : otherUserId;

  // --- Player chat ---
  const { data: conversations } = trpc.message.conversations.useQuery(undefined, {
    enabled: !isAlliance && !threadId,
  });

  useEffect(() => {
    if (isAlliance || threadId || !conversations) return;
    const conv = conversations.find((c) => c?.otherUser.id === otherUserId);
    if (conv?.threadId) {
      setThreadId(otherUserId, conv.threadId);
    }
  }, [isAlliance, threadId, conversations, otherUserId, setThreadId]);

  const { data: thread } = trpc.message.thread.useQuery(
    { threadId: threadId! },
    { enabled: !isAlliance && !!threadId },
  );

  // Backend marks messages as read on fetch — invalidate unread counts
  useEffect(() => {
    if (thread) {
      utils.message.unreadCount.invalidate();
      utils.message.conversations.invalidate();
    }
  }, [threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const replyMutation = trpc.message.reply.useMutation({
    onSuccess: () => {
      utils.message.thread.invalidate({ threadId: threadId! });
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
    },
  });

  const sendMutation = trpc.message.send.useMutation({
    onSuccess: (msg) => {
      if (msg.threadId) {
        setThreadId(otherUserId, msg.threadId);
        utils.message.thread.invalidate({ threadId: msg.threadId });
      }
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
    },
  });

  // --- Alliance chat ---
  const { data: allianceThread } = trpc.message.allianceChat.useQuery(
    { allianceId: allianceId! },
    { enabled: isAlliance && !!allianceId },
  );

  const allianceSendMutation = trpc.message.sendAllianceChat.useMutation({
    onSuccess: () => {
      utils.message.allianceChat.invalidate({ allianceId: allianceId! });
    },
  });

  const handleSend = (body: string) => {
    if (isAlliance) {
      allianceSendMutation.mutate({ body });
    } else if (thread && thread.length > 0) {
      replyMutation.mutate({ messageId: thread[thread.length - 1].id, body });
    } else {
      sendMutation.mutate({ recipientUsername: username, body });
    }
  };

  const activeThread = isAlliance ? allianceThread : thread;
  const isPending = isAlliance ? allianceSendMutation.isPending : (replyMutation.isPending || sendMutation.isPending);

  return (
    <div className="w-[300px] h-[400px] flex flex-col rounded-t-xl overflow-hidden border border-border/30 bg-card shadow-xl">
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isAlliance ? 'bg-yellow-500/20' : 'bg-primary/20'}`}
        onClick={() => minimizeChat(windowKey)}
      >
        {isAlliance ? (
          <div className="w-7 h-7 rounded-full bg-yellow-500/30 border border-yellow-500/50 flex items-center justify-center text-[10px] font-bold text-yellow-400">
            {allianceTag?.slice(0, 2)}
          </div>
        ) : (
          <UserAvatar username={username} avatarId={avatarId} size="sm" />
        )}
        {isAlliance ? (
          <span className="text-sm font-semibold text-foreground flex-1 truncate">
            [{allianceTag}] Chat
          </span>
        ) : (
          <Link
            to={`/player/${otherUserId}`}
            className="text-sm font-semibold text-foreground flex-1 truncate hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {username}
          </Link>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); minimizeChat(windowKey); }}
          aria-label="Réduire"
          className="text-muted-foreground hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); closeChat(windowKey); }}
          aria-label="Fermer"
          className="text-muted-foreground hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages */}
      {activeThread && currentUserId ? (
        <ChatMessageList messages={activeThread} currentUserId={currentUserId} className="flex-1" showSenderName={isAlliance} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          {isAlliance ? 'Chat d\'alliance' : 'Début de conversation'}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isPending}
        placeholder="Aa"
      />
    </div>
  );
}
