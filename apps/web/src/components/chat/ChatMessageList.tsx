import { useLayoutEffect, useRef } from 'react';
import type { Blason } from '@exilium/shared';
import { ChatBubble } from './ChatBubble';

interface Message {
  id: string;
  senderId: string | null;
  senderUsername: string | null;
  senderAvatarId?: string | null;
  body: string;
  createdAt: Date | string;
  allianceBlason?: Blason | null;
}

interface ChatMessageListProps {
  messages: Message[];
  currentUserId: string;
  className?: string;
  showSenderName?: boolean;
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function ChatMessageList({ messages, currentUserId, className = '', showSenderName = false }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledInitialRef = useRef(false);

  useLayoutEffect(() => {
    if (messages.length === 0) return;
    bottomRef.current?.scrollIntoView({
      behavior: hasScrolledInitialRef.current ? 'smooth' : 'auto',
      block: 'end',
    });
    hasScrolledInitialRef.current = true;
  }, [messages.length]);

  const enriched = messages.map((msg, i) => {
    const date = new Date(msg.createdAt);
    const dateKey = getDateKey(date);
    const showSeparator = i === 0 || dateKey !== getDateKey(new Date(messages[i - 1].createdAt));
    return { ...msg, date, showSeparator };
  });

  return (
    <div ref={containerRef} className={`flex-1 overflow-y-auto p-4 space-y-2 ${className}`}>
      {enriched.map((msg) => (
          <div key={msg.id}>
            {msg.showSeparator && (
              <div className="text-center text-[10px] text-muted-foreground/60 my-3">
                {formatDateSeparator(msg.date)}
              </div>
            )}
            <ChatBubble
              body={msg.body}
              isSent={msg.senderId === currentUserId}
              senderUsername={msg.senderId !== currentUserId ? (msg.senderUsername ?? undefined) : undefined}
              senderAvatarId={msg.senderId !== currentUserId ? (msg.senderAvatarId ?? undefined) : undefined}
              allianceBlason={msg.senderId !== currentUserId ? (msg.allianceBlason ?? undefined) : undefined}
              createdAt={msg.createdAt}
              showName={showSenderName}
            />
          </div>
        ))}
      <div ref={bottomRef} />
    </div>
  );
}
