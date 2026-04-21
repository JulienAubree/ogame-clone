import { useState } from 'react';
import { trpc } from '@/trpc';
import { useChatStore } from '@/stores/chat.store';
import { FriendList } from './FriendList';
import { FriendRequests } from './FriendRequests';

type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

type OwnProps = { kind: 'own' };
type OtherProps = {
  kind: 'other';
  userId: string;
  username: string;
  friendshipStatus: FriendshipStatus;
  friendshipId: string | null;
};

type ProfileSocialCardProps = OwnProps | OtherProps;

function OwnSocial() {
  const { data: pendingReceived } = trpc.friend.pendingReceived.useQuery();
  const [showRequests, setShowRequests] = useState(false);
  const pendingCount = pendingReceived?.length ?? 0;

  return (
    <div className="glass-card p-4 space-y-4">
      <h3 className="text-sm font-semibold">Social</h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amis</h4>
        </div>
        <FriendList />
      </div>

      <div className="space-y-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Demandes
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1.5 text-[9px] font-bold text-primary-foreground">
                {pendingCount}
              </span>
            )}
          </h4>
          <button
            type="button"
            onClick={() => setShowRequests((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRequests ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        {showRequests && <FriendRequests />}
      </div>
    </div>
  );
}

function OtherSocial({ userId, username, friendshipStatus, friendshipId }: Exclude<ProfileSocialCardProps, { kind: 'own' }>) {
  const utils = trpc.useUtils();
  const openChat = useChatStore((s) => s.openChat);

  const invalidate = () => utils.user.getProfile.invalidate({ userId });

  const requestMutation = trpc.friend.request.useMutation({ onSuccess: invalidate });
  const cancelMutation = trpc.friend.cancel.useMutation({ onSuccess: invalidate });
  const acceptMutation = trpc.friend.accept.useMutation({ onSuccess: invalidate });
  const declineMutation = trpc.friend.decline.useMutation({ onSuccess: invalidate });
  const removeMutation = trpc.friend.remove.useMutation({ onSuccess: invalidate });

  const isMutating =
    requestMutation.isPending ||
    cancelMutation.isPending ||
    acceptMutation.isPending ||
    declineMutation.isPending ||
    removeMutation.isPending;

  return (
    <div className="glass-card p-4 flex flex-wrap items-center gap-3">
      {friendshipStatus === 'none' && (
        <button
          type="button"
          onClick={() => requestMutation.mutate({ userId })}
          disabled={isMutating}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          Ajouter en ami
        </button>
      )}

      {friendshipStatus === 'pending_sent' && friendshipId && (
        <button
          type="button"
          onClick={() => cancelMutation.mutate({ friendshipId })}
          disabled={isMutating}
          className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          Annuler la demande
        </button>
      )}

      {friendshipStatus === 'pending_received' && friendshipId && (
        <>
          <button
            type="button"
            onClick={() => acceptMutation.mutate({ friendshipId })}
            disabled={isMutating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Accepter
          </button>
          <button
            type="button"
            onClick={() => declineMutation.mutate({ friendshipId })}
            disabled={isMutating}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            Refuser
          </button>
        </>
      )}

      {friendshipStatus === 'friends' && friendshipId && (
        <button
          type="button"
          onClick={() => removeMutation.mutate({ friendshipId })}
          disabled={isMutating}
          className="rounded-md bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
        >
          Retirer des amis
        </button>
      )}

      <button
        type="button"
        onClick={() => openChat(userId, username)}
        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
      >
        Envoyer un message
      </button>
    </div>
  );
}

export function ProfileSocialCard(props: ProfileSocialCardProps) {
  if (props.kind === 'own') return <OwnSocial />;
  return <OtherSocial {...props} />;
}
