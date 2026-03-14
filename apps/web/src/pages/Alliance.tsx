import { useState } from 'react';
import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Alliance() {
  const { data: myAlliance, isLoading } = trpc.alliance.myAlliance.useQuery();
  const { data: invitations } = trpc.alliance.myInvitations.useQuery();

  if (isLoading) return <div className="p-6 text-muted-foreground">Chargement...</div>;

  if (!myAlliance) return <NoAllianceView invitations={invitations ?? []} />;
  return <AllianceView alliance={myAlliance} />;
}

function NoAllianceView({ invitations }: { invitations: { id: string; allianceName: string; allianceTag: string; invitedByUsername: string }[] }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const createMutation = trpc.alliance.create.useMutation({
    onSuccess: () => { utils.alliance.myAlliance.invalidate(); },
  });

  const { data: searchResults } = trpc.alliance.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 },
  );

  const applyMutation = trpc.alliance.apply.useMutation({
    onSuccess: () => { utils.alliance.myAlliance.invalidate(); },
  });

  const respondMutation = trpc.alliance.respondInvitation.useMutation({
    onSuccess: () => {
      utils.alliance.myAlliance.invalidate();
      utils.alliance.myInvitations.invalidate();
    },
  });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Alliance</h1>

      <div className="flex gap-2">
        <Button variant={tab === 'create' ? 'default' : 'outline'} size="sm" onClick={() => setTab('create')}>Créer</Button>
        <Button variant={tab === 'join' ? 'default' : 'outline'} size="sm" onClick={() => setTab('join')}>Rejoindre</Button>
      </div>

      {tab === 'create' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Créer une alliance</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nom (3-30 caractères)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l'alliance" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tag (2-8 caractères)</label>
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="TAG" />
            </div>
            {createMutation.error && <p className="text-sm text-destructive">{createMutation.error.message}</p>}
            <Button onClick={() => createMutation.mutate({ name, tag })} disabled={createMutation.isPending || name.length < 3 || tag.length < 2}>
              Créer
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'join' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Rechercher une alliance</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Nom ou tag..." />
            {searchResults?.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-border/50 py-2">
                <span className="text-sm">[{a.tag}] {a.name} <span className="text-xs text-muted-foreground">({a.memberCount} membres)</span></span>
                <Button size="sm" variant="outline" onClick={() => applyMutation.mutate({ allianceId: a.id })} disabled={applyMutation.isPending}>
                  Postuler
                </Button>
              </div>
            ))}
            {applyMutation.error && <p className="text-sm text-destructive">{applyMutation.error.message}</p>}
          </CardContent>
        </Card>
      )}

      {invitations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Invitations reçues</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between border-b border-border/50 py-2">
                <span className="text-sm">[{inv.allianceTag}] {inv.allianceName} — invité par {inv.invitedByUsername}</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => respondMutation.mutate({ invitationId: inv.id, accept: true })}>Accepter</Button>
                  <Button size="sm" variant="outline" onClick={() => respondMutation.mutate({ invitationId: inv.id, accept: false })}>Décliner</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AllianceView({ alliance }: { alliance: { id: string; name: string; tag: string; description: string | null; myRole: string; members: { userId: string; username: string; role: string; joinedAt: Date }[] } }) {
  const utils = trpc.useUtils();
  const [inviteUsername, setInviteUsername] = useState('');
  const [circularSubject, setCircularSubject] = useState('');
  const [circularBody, setCircularBody] = useState('');
  const [description, setDescription] = useState(alliance.description ?? '');
  const [showApplications, setShowApplications] = useState(false);

  const { data: applications } = trpc.alliance.applications.useQuery(undefined, {
    enabled: showApplications && (alliance.myRole === 'founder' || alliance.myRole === 'officer'),
  });

  const invalidateAll = () => {
    utils.alliance.myAlliance.invalidate();
    utils.alliance.applications.invalidate();
  };

  const leaveMutation = trpc.alliance.leave.useMutation({ onSuccess: invalidateAll });
  const kickMutation = trpc.alliance.kick.useMutation({ onSuccess: invalidateAll });
  const setRoleMutation = trpc.alliance.setRole.useMutation({ onSuccess: invalidateAll });
  const inviteMutation = trpc.alliance.invite.useMutation({ onSuccess: () => setInviteUsername('') });
  const circularMutation = trpc.alliance.sendCircular.useMutation({ onSuccess: () => { setCircularSubject(''); setCircularBody(''); } });
  const updateMutation = trpc.alliance.update.useMutation({ onSuccess: invalidateAll });
  const respondAppMutation = trpc.alliance.respondApplication.useMutation({ onSuccess: invalidateAll });

  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';
  const isFounder = alliance.myRole === 'founder';

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">[{alliance.tag}] {alliance.name}</h1>
        <Button variant="destructive" size="sm" onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending}>
          Quitter
        </Button>
      </div>

      {alliance.description && <p className="text-sm text-muted-foreground">{alliance.description}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Membres ({alliance.members.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-1">Joueur</th>
                <th className="px-2 py-1">Rôle</th>
                <th className="px-2 py-1">Depuis</th>
                {isLeader && <th className="px-2 py-1">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {alliance.members.map((m) => (
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
                        <Button size="sm" variant="destructive" onClick={() => kickMutation.mutate({ userId: m.userId })}>
                          Expulser
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {isLeader && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Inviter un joueur</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Input value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="Nom du joueur" className="w-60" />
              <Button onClick={() => inviteMutation.mutate({ username: inviteUsername })} disabled={inviteMutation.isPending || !inviteUsername}>
                Inviter
              </Button>
              {inviteMutation.error && <span className="text-sm text-destructive self-center">{inviteMutation.error.message}</span>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Message circulaire</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input value={circularSubject} onChange={(e) => setCircularSubject(e.target.value)} placeholder="Sujet" />
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={circularBody} onChange={(e) => setCircularBody(e.target.value)} placeholder="Message..." />
              <Button onClick={() => circularMutation.mutate({ subject: circularSubject, body: circularBody })} disabled={circularMutation.isPending || !circularSubject || !circularBody}>
                Envoyer à tous
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Candidatures</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowApplications(!showApplications)}>
                  {showApplications ? 'Masquer' : 'Afficher'}
                </Button>
              </div>
            </CardHeader>
            {showApplications && (
              <CardContent className="space-y-2">
                {(!applications || applications.length === 0) ? (
                  <p className="text-sm text-muted-foreground">Aucune candidature en attente.</p>
                ) : (
                  applications.map((app) => (
                    <div key={app.id} className="flex items-center justify-between border-b border-border/50 py-2">
                      <span className="text-sm">{app.applicantUsername}</span>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => respondAppMutation.mutate({ applicationId: app.id, accept: true })}>Accepter</Button>
                        <Button size="sm" variant="outline" onClick={() => respondAppMutation.mutate({ applicationId: app.id, accept: false })}>Décliner</Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              <Button onClick={() => updateMutation.mutate({ description })} disabled={updateMutation.isPending}>
                Mettre à jour
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
