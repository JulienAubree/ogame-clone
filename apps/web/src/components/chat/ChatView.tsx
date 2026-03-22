import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';
import { UserAvatar } from './UserAvatar';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

interface ChatViewProps {
  threadId: string | null;
  otherUsername: string | null;
  onBack?: () => void;
  onThreadCreated?: (threadId: string) => void;
  className?: string;
}

export function ChatView({ threadId, otherUsername, onBack, onThreadCreated, className = '' }: ChatViewProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const utils = trpc.useUtils();

  const { data: thread } = trpc.message.thread.useQuery(
    { threadId: threadId! },
    { enabled: !!threadId },
  );

  const replyMutation = trpc.message.reply.useMutation({
    onSuccess: () => {
      utils.message.thread.invalidate({ threadId: threadId! });
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
    },
  });

  const sendMutation = trpc.message.send.useMutation({
    onSuccess: (msg) => {
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
      if (msg.threadId) {
        utils.message.thread.invalidate({ threadId: msg.threadId });
        onThreadCreated?.(msg.threadId);
      }
    },
  });

  if (!threadId || !otherUsername) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <p className="text-sm text-muted-foreground">Sélectionnez une conversation</p>
      </div>
    );
  }

  const handleSend = (body: string) => {
    if (thread && thread.length > 0) {
      replyMutation.mutate({ messageId: thread[thread.length - 1].id, body });
    } else {
      sendMutation.mutate({ recipientUsername: otherUsername, body });
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
        {onBack && (
          <button onClick={onBack} aria-label="Retour" className="text-muted-foreground hover:text-foreground mr-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
        )}
        <UserAvatar username={otherUsername} size="md" />
        <div>
          <div className="text-sm font-semibold text-foreground">{otherUsername}</div>
        </div>
      </div>

      {/* Messages */}
      {thread && userId ? (
        <ChatMessageList messages={thread} currentUserId={userId} className="flex-1" />
      ) : (
        <div className="flex-1" />
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={replyMutation.isPending || sendMutation.isPending}
      />
    </div>
  );
}
