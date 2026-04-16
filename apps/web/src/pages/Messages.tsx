import { useState } from 'react';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatView } from '@/components/chat/ChatView';

export default function Messages() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeAvatarId, setActiveAvatarId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const handleSelectThread = (threadId: string, username: string, userId: string, avatarId?: string | null) => {
    setActiveThreadId(threadId);
    setActiveUsername(username);
    setActiveUserId(userId);
    setActiveAvatarId(avatarId ?? null);
    setMobileView('chat');
  };

  const handleNewConversation = (username: string) => {
    setActiveThreadId(null);
    setActiveUsername(username);
    setActiveUserId(null);
    setMobileView('chat');
  };

  const handleThreadCreated = (threadId: string) => {
    setActiveThreadId(threadId);
  };

  const handleBack = () => {
    setMobileView('list');
    setActiveThreadId(null);
    setActiveUsername(null);
  };

  return (
    <div className="h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-6rem)]">
      {/* Desktop: split panel */}
      <div className="hidden lg:grid grid-cols-[320px_1fr] h-full glass-card overflow-hidden rounded-xl mx-4 mt-4">
        <ConversationList
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewConversation={handleNewConversation}
        />
        <ChatView
          threadId={activeThreadId}
          otherUsername={activeUsername}
          otherUserId={activeUserId}
          otherAvatarId={activeAvatarId}
          onThreadCreated={handleThreadCreated}
        />
      </div>

      {/* Mobile: list or chat */}
      <div className="lg:hidden h-full">
        {mobileView === 'list' ? (
          <ConversationList
            activeThreadId={null}
            onSelectThread={handleSelectThread}
            onNewConversation={handleNewConversation}
          />
        ) : (
          <ChatView
            threadId={activeThreadId}
            otherUsername={activeUsername}
            otherUserId={activeUserId}
          otherAvatarId={activeAvatarId}
            onBack={handleBack}
            onThreadCreated={handleThreadCreated}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
