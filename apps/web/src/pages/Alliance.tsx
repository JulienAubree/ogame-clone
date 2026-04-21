import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/trpc';
import { generateDefaultBlason, type Blason } from '@exilium/shared';
import { BlasonPicker } from '@/components/alliance/BlasonPicker';
import { AllianceBlason } from '@/components/alliance/AllianceBlason';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';

export default function Alliance() {
  const { data: myAlliance, isLoading } = trpc.alliance.myAlliance.useQuery();
  const { data: invitations } = trpc.alliance.myInvitations.useQuery();

  if (isLoading) return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Alliance" />
      <CardGridSkeleton count={2} />
    </div>
  );

  if (!myAlliance) return <NoAllianceView invitations={invitations ?? []} />;
  return <AllianceView alliance={myAlliance} />;
}

function NoAllianceView({ invitations }: { invitations: { id: string; allianceName: string; allianceTag: string; invitedByUsername: string }[] }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [blason, setBlason] = useState<Blason>(() => generateDefaultBlason('XXXX'));
  const [motto, setMotto] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Regenerate the default blason whenever the tag changes (user can still customize after).
  const lastAutoTagRef = useRef<string>('');
  useEffect(() => {
    if (tag.length >= 2 && tag !== lastAutoTagRef.current) {
      lastAutoTagRef.current = tag;
      setBlason(generateDefaultBlason(tag));
    }
  }, [tag]);

  const createMutation = trpc.alliance.create.useMutation({
    onSuccess: () => { utils.alliance.myAlliance.invalidate(); },
  });

  const { data: searchResults } = trpc.alliance.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 },
  );

  const applyMutation = trpc.alliance.submitApplication.useMutation({
    onSuccess: () => { utils.alliance.myAlliance.invalidate(); },
  });

  const respondMutation = trpc.alliance.respondInvitation.useMutation({
    onSuccess: () => {
      utils.alliance.myAlliance.invalidate();
      utils.alliance.myInvitations.invalidate();
    },
  });

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Alliance" />

      <div className="flex gap-2">
        <Button
          variant={tab === 'create' ? 'default' : 'outline'}
          size="sm"
          className="rounded-full"
          onClick={() => setTab('create')}
        >
          Créer
        </Button>
        <Button
          variant={tab === 'join' ? 'default' : 'outline'}
          size="sm"
          className="rounded-full"
          onClick={() => setTab('join')}
        >
          Rejoindre
        </Button>
      </div>

      {tab === 'create' && (
        <section className="glass-card p-4">
          <h3 className="text-base font-semibold mb-3">Créer une alliance</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nom (3-30 caractères)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l'alliance" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tag (2-8 caractères)</label>
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="TAG" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Blason & devise</label>
              <BlasonPicker
                blason={blason}
                motto={motto}
                onBlasonChange={setBlason}
                onMottoChange={setMotto}
                allianceName={name || 'Alliance'}
                allianceTag={tag || 'TAG'}
              />
            </div>
            {createMutation.error && <p className="text-sm text-destructive">{createMutation.error.message}</p>}
            <Button onClick={() => createMutation.mutate({ name, tag, blason, motto })} disabled={createMutation.isPending || name.length < 3 || tag.length < 2}>
              Créer
            </Button>
          </div>
        </section>
      )}

      {tab === 'join' && (
        <section className="glass-card p-4">
          <h3 className="text-base font-semibold mb-3">Rechercher une alliance</h3>
          <div className="space-y-3">
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
          </div>
        </section>
      )}

      {invitations.length > 0 && (
        <section className="glass-card p-4">
          <h3 className="text-base font-semibold mb-3">Invitations reçues</h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between border-b border-border/50 py-2 gap-2">
                <span className="text-sm">[{inv.allianceTag}] {inv.allianceName} — invité par {inv.invitedByUsername}</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => respondMutation.mutate({ invitationId: inv.id, accept: true })}>Accepter</Button>
                  <Button size="sm" variant="outline" onClick={() => respondMutation.mutate({ invitationId: inv.id, accept: false })}>Décliner</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AllianceView({ alliance }: {
  alliance: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    myRole: string;
    members: { userId: string; username: string; role: string; joinedAt: string }[];
    blasonShape: string;
    blasonIcon: string;
    blasonColor1: string;
    blasonColor2: string;
    motto: string | null;
  };
}) {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'manage'>('info');
  const [inviteUsername, setInviteUsername] = useState('');
  const [description, setDescription] = useState(alliance.description ?? '');
  const [showApplications, setShowApplications] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [kickConfirm, setKickConfirm] = useState<string | null>(null);

  const currentBlason: Blason = {
    shape: alliance.blasonShape as Blason['shape'],
    icon: alliance.blasonIcon as Blason['icon'],
    color1: alliance.blasonColor1,
    color2: alliance.blasonColor2,
  };
  const [editBlason, setEditBlason] = useState<Blason>(currentBlason);
  const [editMotto, setEditMotto] = useState<string | null>(alliance.motto);

  useEffect(() => {
    setEditBlason({
      shape: alliance.blasonShape as Blason['shape'],
      icon: alliance.blasonIcon as Blason['icon'],
      color1: alliance.blasonColor1,
      color2: alliance.blasonColor2,
    });
    setEditMotto(alliance.motto);
  }, [alliance.blasonShape, alliance.blasonIcon, alliance.blasonColor1, alliance.blasonColor2, alliance.motto]);

  const { data: applications } = trpc.alliance.applications.useQuery(undefined, {
    enabled: showApplications && (alliance.myRole === 'founder' || alliance.myRole === 'officer'),
  });

  const invalidateAll = () => {
    utils.alliance.myAlliance.invalidate();
    utils.alliance.applications.invalidate();
  };

  const leaveMutation = trpc.alliance.leave.useMutation({
    onSuccess: () => { invalidateAll(); setLeaveConfirm(false); },
  });
  const kickMutation = trpc.alliance.kick.useMutation({
    onSuccess: () => { invalidateAll(); setKickConfirm(null); },
  });
  const setRoleMutation = trpc.alliance.setRole.useMutation({ onSuccess: invalidateAll });
  const inviteMutation = trpc.alliance.invite.useMutation({ onSuccess: () => setInviteUsername('') });
  const updateMutation = trpc.alliance.update.useMutation({ onSuccess: invalidateAll });
  const respondAppMutation = trpc.alliance.respondApplication.useMutation({ onSuccess: invalidateAll });
  const updateBlasonMutation = trpc.alliance.updateBlason.useMutation({
    onSuccess: invalidateAll,
  });

  const blasonDirty = useMemo(() => {
    return editBlason.shape !== (alliance.blasonShape as Blason['shape'])
      || editBlason.icon !== (alliance.blasonIcon as Blason['icon'])
      || editBlason.color1.toLowerCase() !== alliance.blasonColor1.toLowerCase()
      || editBlason.color2.toLowerCase() !== alliance.blasonColor2.toLowerCase()
      || (editMotto ?? '') !== (alliance.motto ?? '');
  }, [editBlason, editMotto, alliance.blasonShape, alliance.blasonIcon, alliance.blasonColor1, alliance.blasonColor2, alliance.motto]);

  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';
  const isFounder = alliance.myRole === 'founder';

  const tabs: { id: 'info' | 'members' | 'manage'; label: string; show: boolean }[] = [
    { id: 'info', label: 'Infos', show: true },
    { id: 'members', label: 'Membres', show: true },
    { id: 'manage', label: 'Gestion', show: isLeader },
  ];

  /* --- Section renderers --- */

  const renderInfoSection = () => (
    <>
      <section className="glass-card p-6">
        <div className="flex flex-wrap items-start gap-5">
          <AllianceBlason blason={currentBlason} size={96} />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold">{alliance.name}</h2>
            <div className="text-sm font-semibold text-primary mt-0.5">[{alliance.tag}]</div>
            {alliance.description && (
              <p className="text-sm text-muted-foreground mt-2">{alliance.description}</p>
            )}
            {alliance.motto && (
              <p className="mt-3 border-l-2 border-primary/60 pl-3 italic text-sm text-foreground/90">
                {alliance.motto}
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="glass-card p-4 space-y-3">
        <h3 className="text-base font-semibold">Informations</h3>
        <Button variant="destructive" size="sm" onClick={() => setLeaveConfirm(true)} disabled={leaveMutation.isPending}>
          Quitter l&apos;alliance
        </Button>
      </section>
    </>
  );

  const renderMembersSection = () => (
    <section className="glass-card p-4 space-y-3">
      <h3 className="text-base font-semibold">Membres ({alliance.members.length})</h3>

      {/* Desktop table */}
      <table className="hidden lg:table w-full text-sm">
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

      {/* Mobile/tablet cards */}
      <div className="lg:hidden space-y-2">
        {alliance.members.map((m) => (
          <div key={m.userId} className="rounded-lg p-3 space-y-2 hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{m.username}</span>
              <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
            </div>
            <div className="text-xs text-muted-foreground">Depuis {new Date(m.joinedAt).toLocaleDateString('fr-FR')}</div>
            {isLeader && m.role !== 'founder' && (
              <div className="flex gap-1 flex-wrap">
                {isFounder && (
                  <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setRoleMutation.mutate({ userId: m.userId, role: m.role === 'officer' ? 'member' : 'officer' })}>
                    {m.role === 'officer' ? 'Rétrograder' : 'Promouvoir'}
                  </Button>
                )}
                {!(m.role === 'officer' && !isFounder) && (
                  <Button size="sm" variant="destructive" className="text-xs h-7 px-2" onClick={() => setKickConfirm(m.userId)}>
                    Expulser
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );

  const renderManageSection = () => (
    <>
      {isFounder && (
        <section className="glass-card p-4 space-y-4">
          <h3 className="text-base font-semibold">Blason &amp; devise</h3>
          <BlasonPicker
            blason={editBlason}
            motto={editMotto}
            onBlasonChange={setEditBlason}
            onMottoChange={setEditMotto}
            allianceName={alliance.name}
            allianceTag={alliance.tag}
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => { setEditBlason(currentBlason); setEditMotto(alliance.motto); }}
              disabled={!blasonDirty || updateBlasonMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              onClick={() => updateBlasonMutation.mutate({ blason: editBlason, motto: editMotto })}
              disabled={!blasonDirty || updateBlasonMutation.isPending}
            >
              Enregistrer
            </Button>
          </div>
          {updateBlasonMutation.error && (
            <p className="text-sm text-destructive">{updateBlasonMutation.error.message}</p>
          )}
        </section>
      )}

      <section className="glass-card p-4 space-y-3">
        <h3 className="text-base font-semibold">Inviter un joueur</h3>
        <div className="flex flex-wrap gap-2">
          <Input value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="Nom du joueur" className="w-60" />
          <Button onClick={() => inviteMutation.mutate({ username: inviteUsername })} disabled={inviteMutation.isPending || !inviteUsername}>
            Inviter
          </Button>
          {inviteMutation.error && <span className="text-sm text-destructive self-center">{inviteMutation.error.message}</span>}
        </div>
      </section>

      <section className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Candidatures</h3>
          <Button size="sm" variant="outline" onClick={() => setShowApplications(!showApplications)}>
            {showApplications ? 'Masquer' : 'Afficher'}
          </Button>
        </div>
        {showApplications && (
          <div className="space-y-2">
            {(!applications || applications.length === 0) ? (
              <p className="text-sm text-muted-foreground">Aucune candidature en attente.</p>
            ) : (
              applications.map((app) => (
                <div key={app.id} className="flex flex-wrap items-center justify-between border-b border-border/50 py-2 gap-2">
                  <span className="text-sm">{app.applicantUsername}</span>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => respondAppMutation.mutate({ applicationId: app.id, accept: true })}>Accepter</Button>
                    <Button size="sm" variant="outline" onClick={() => respondAppMutation.mutate({ applicationId: app.id, accept: false })}>Décliner</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <section className="glass-card p-4 space-y-3">
        <h3 className="text-base font-semibold">Description</h3>
        <div className="space-y-2">
          <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button onClick={() => updateMutation.mutate({ description })} disabled={updateMutation.isPending}>
            Mettre à jour
          </Button>
        </div>
      </section>
    </>
  );

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title={`[${alliance.tag}] ${alliance.name}`} />

      {/* Mobile tab navigation */}
      <div className="flex gap-2 lg:hidden">
        {tabs.filter((t) => t.show).map((t) => (
          <Button
            key={t.id}
            variant={activeTab === t.id ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {/* Mobile: show only active tab content */}
      <div className="lg:hidden space-y-4">
        {activeTab === 'info' && renderInfoSection()}
        {activeTab === 'members' && renderMembersSection()}
        {activeTab === 'manage' && isLeader && renderManageSection()}
      </div>

      {/* Desktop: show all sections stacked */}
      <div className="hidden lg:block space-y-6">
        {renderInfoSection()}
        {renderMembersSection()}
        {isLeader && renderManageSection()}
      </div>

      <ConfirmDialog
        open={leaveConfirm}
        onConfirm={() => leaveMutation.mutate()}
        onCancel={() => setLeaveConfirm(false)}
        title="Quitter l'alliance ?"
        description="Vous ne pourrez pas revenir sans nouvelle invitation ou candidature."
        variant="destructive"
        confirmLabel="Quitter"
      />

      <ConfirmDialog
        open={!!kickConfirm}
        onConfirm={() => { if (kickConfirm) kickMutation.mutate({ userId: kickConfirm }); }}
        onCancel={() => setKickConfirm(null)}
        title="Expulser ce membre ?"
        description="Le joueur sera immédiatement retiré de l'alliance."
        variant="destructive"
        confirmLabel="Expulser"
      />
    </div>
  );
}
