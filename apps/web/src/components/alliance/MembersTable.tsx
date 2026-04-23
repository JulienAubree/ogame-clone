import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useState } from 'react';

interface Member {
  userId: string;
  username: string;
  role: string;
  joinedAt: string;
}

interface MembersTableProps {
  members: Member[];
  myRole: string;
}

export function MembersTable({ members, myRole }: MembersTableProps) {
  const utils = trpc.useUtils();
  const [kickConfirm, setKickConfirm] = useState<string | null>(null);

  const isLeader = myRole === 'founder' || myRole === 'officer';
  const isFounder = myRole === 'founder';

  const invalidate = () => { utils.alliance.myAlliance.invalidate(); };

  const kickMutation = trpc.alliance.kick.useMutation({
    onSuccess: () => { invalidate(); setKickConfirm(null); },
  });
  const setRoleMutation = trpc.alliance.setRole.useMutation({ onSuccess: invalidate });

  return (
    <section className="glass-card space-y-3 p-4">
      <h3 className="text-base font-semibold">Membres ({members.length})</h3>

      <table className="hidden w-full text-sm lg:table">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-2 py-1">Joueur</th>
            <th className="px-2 py-1">Rôle</th>
            <th className="px-2 py-1">Depuis</th>
            {isLeader && <th className="px-2 py-1">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} className="border-b border-border/50">
              <td className="px-2 py-1">{m.username}</td>
              <td className="px-2 py-1 capitalize">{m.role}</td>
              <td className="px-2 py-1 text-xs text-muted-foreground">{new Date(m.joinedAt).toLocaleDateString('fr-FR')}</td>
              {isLeader && (
                <td className="px-2 py-1 flex gap-1">
                  {m.role !== 'founder' && isFounder && (
                    <Button size="sm" variant="outline" onClick={() => setRoleMutation.mutate({ userId: m.userId, role: m.role === 'officer' ? 'member' : 'officer' })}>
                      {m.role === 'officer' ? 'Rétrograder' : 'Promouvoir'}
                    </Button>
                  )}
                  {m.role !== 'founder' && !(m.role === 'officer' && !isFounder) && (
                    <Button size="sm" variant="destructive" onClick={() => setKickConfirm(m.userId)}>
                      Expulser
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-2 lg:hidden">
        {members.map((m) => (
          <div key={m.userId} className="space-y-2 rounded-lg p-3 transition-colors hover:bg-accent/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{m.username}</span>
              <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
            </div>
            <div className="text-xs text-muted-foreground">Depuis {new Date(m.joinedAt).toLocaleDateString('fr-FR')}</div>
            {isLeader && m.role !== 'founder' && (
              <div className="flex flex-wrap gap-1">
                {isFounder && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRoleMutation.mutate({ userId: m.userId, role: m.role === 'officer' ? 'member' : 'officer' })}>
                    {m.role === 'officer' ? 'Rétrograder' : 'Promouvoir'}
                  </Button>
                )}
                {!(m.role === 'officer' && !isFounder) && (
                  <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => setKickConfirm(m.userId)}>
                    Expulser
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!kickConfirm}
        onConfirm={() => { if (kickConfirm) kickMutation.mutate({ userId: kickConfirm }); }}
        onCancel={() => setKickConfirm(null)}
        title="Expulser ce membre ?"
        description="Le joueur sera immédiatement retiré de l'alliance."
        variant="destructive"
        confirmLabel="Expulser"
      />
    </section>
  );
}
