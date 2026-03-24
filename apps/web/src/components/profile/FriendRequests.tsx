import { Link } from 'react-router';
import { trpc } from '@/trpc';

export function FriendRequests() {
  const utils = trpc.useUtils();
  const { data: received } = trpc.friend.pendingReceived.useQuery();
  const { data: sent } = trpc.friend.pendingSent.useQuery();
  const acceptMut = trpc.friend.accept.useMutation({ onSuccess: () => { utils.friend.invalidate(); } });
  const declineMut = trpc.friend.decline.useMutation({ onSuccess: () => { utils.friend.invalidate(); } });
  const cancelMut = trpc.friend.cancel.useMutation({ onSuccess: () => { utils.friend.invalidate(); } });

  return (
    <div className="space-y-4">
      {received && received.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Demandes recues</h4>
          <ul className="space-y-2">
            {received.map(r => (
              <li key={r.friendshipId} className="flex items-center justify-between gap-2">
                <Link to={`/player/${r.userId}`} className="text-sm hover:text-primary">{r.username}</Link>
                <div className="flex gap-1">
                  <button onClick={() => acceptMut.mutate({ friendshipId: r.friendshipId })} className="text-xs px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30">Accepter</button>
                  <button onClick={() => declineMut.mutate({ friendshipId: r.friendshipId })} className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive hover:bg-destructive/30">Refuser</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sent && sent.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Demandes envoyees</h4>
          <ul className="space-y-2">
            {sent.map(s => (
              <li key={s.friendshipId} className="flex items-center justify-between gap-2">
                <Link to={`/player/${s.userId}`} className="text-sm hover:text-primary">{s.username}</Link>
                <button onClick={() => cancelMut.mutate({ friendshipId: s.friendshipId })} className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/80">Annuler</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(!received?.length && !sent?.length) && (
        <div className="text-muted-foreground text-sm">Aucune demande en attente</div>
      )}
    </div>
  );
}
