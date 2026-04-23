import { Link } from 'react-router';
import { trpc } from '@/trpc';

export function ChatPreviewCard() {
  const { data: messages, isLoading } = trpc.message.recentAllianceChat.useQuery(
    { limit: 3 },
    { refetchInterval: 60_000, refetchIntervalInBackground: false },
  );

  return (
    <section className="glass-card flex min-w-0 flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="truncate text-base font-semibold">Chat</h3>
        <Link to="/alliance/chat" className="shrink-0 whitespace-nowrap text-xs text-primary hover:underline">
          Ouvrir →
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : !messages || messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Silence radio.</p>
      ) : (
        <ul className="min-w-0 space-y-1.5 text-sm">
          {messages.map((m) => (
            <li key={m.id} className="truncate">
              <span className="font-medium">{m.senderUsername ?? 'inconnu'} :</span>{' '}
              <span className="text-muted-foreground">{m.body}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
