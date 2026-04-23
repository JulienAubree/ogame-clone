import { useState } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { MembersTable } from '@/components/alliance/MembersTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AllianceMembersPageProps {
  alliance: {
    myRole: string;
    members: { userId: string; username: string; role: string; joinedAt: string }[];
  };
}

export function AllianceMembersPage({ alliance }: AllianceMembersPageProps) {
  const [inviteUsername, setInviteUsername] = useState('');
  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';

  const inviteMutation = trpc.alliance.invite.useMutation({
    onSuccess: () => setInviteUsername(''),
  });

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader
        title="Membres"
        actions={
          <Link
            to="/alliance"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
          >
            ← Alliance
          </Link>
        }
      />

      {isLeader && (
        <section className="glass-card space-y-3 p-4">
          <h3 className="text-base font-semibold">Inviter un joueur</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder="Nom du joueur"
              className="w-60"
            />
            <Button
              onClick={() => inviteMutation.mutate({ username: inviteUsername })}
              disabled={inviteMutation.isPending || !inviteUsername}
            >
              Inviter
            </Button>
            {inviteMutation.error && (
              <span className="self-center text-sm text-destructive">{inviteMutation.error.message}</span>
            )}
          </div>
        </section>
      )}

      <MembersTable members={alliance.members} myRole={alliance.myRole} />
    </div>
  );
}
