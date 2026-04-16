import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { UserAvatar } from '@/components/chat/UserAvatar';

export function FriendList() {
  const { data: friends, isLoading } = trpc.friend.list.useQuery();

  if (isLoading) return <div className="text-muted-foreground text-sm">Chargement...</div>;
  if (!friends?.length) return <div className="text-muted-foreground text-sm">Aucun ami</div>;

  return (
    <div className="flex flex-wrap gap-2">
      {friends.map(f => (
        <Link key={f.userId} to={`/player/${f.userId}`} title={f.username}>
          <UserAvatar username={f.username} avatarId={f.avatarId} size="sm" />
        </Link>
      ))}
    </div>
  );
}
