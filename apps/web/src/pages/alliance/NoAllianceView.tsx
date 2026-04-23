import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/trpc';
import { generateDefaultBlason, type Blason } from '@exilium/shared';
import { BlasonEditor } from '@/components/alliance/BlasonEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/common/PageHeader';

interface Invitation {
  id: string;
  allianceName: string;
  allianceTag: string;
  invitedByUsername: string;
}

export function NoAllianceView({ invitations }: { invitations: Invitation[] }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [blason, setBlason] = useState<Blason>(() => generateDefaultBlason('XXXX'));
  const [motto, setMotto] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
              <label className="text-xs text-muted-foreground mb-1 block">Blason &amp; devise</label>
              <BlasonEditor
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
