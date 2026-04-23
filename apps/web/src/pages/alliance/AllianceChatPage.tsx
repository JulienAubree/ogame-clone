import { Link } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { ChatView } from '@/components/chat/ChatView';

interface AllianceChatPageProps {
  alliance: { id: string; name: string; tag: string };
}

export function AllianceChatPage({ alliance }: AllianceChatPageProps) {
  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col p-4 lg:p-6">
      <PageHeader
        title="Chat d'alliance"
        description={`Discussion de [${alliance.tag}] ${alliance.name}`}
        actions={
          <Link
            to="/alliance"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
          >
            ← Alliance
          </Link>
        }
      />
      <div className="mt-4 flex-1 overflow-hidden">
        <ChatView
          threadId={alliance.id}
          otherUsername={`[${alliance.tag}] ${alliance.name}`}
          className="h-full"
        />
      </div>
    </div>
  );
}
