import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { trpc } from '@/trpc';
import type { Blason } from '@exilium/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { BlasonEditor } from '@/components/alliance/BlasonEditor';
import { Button } from '@/components/ui/button';

interface AllianceManagePageProps {
  alliance: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    motto: string | null;
    blasonShape: string;
    blasonIcon: string;
    blasonColor1: string;
    blasonColor2: string;
    myRole: string;
  };
}

export function AllianceManagePage({ alliance }: AllianceManagePageProps) {
  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';
  const isFounder = alliance.myRole === 'founder';

  if (!isLeader) return <Navigate to="/alliance" replace />;

  const utils = trpc.useUtils();
  const [description, setDescription] = useState(alliance.description ?? '');

  const currentBlason: Blason = {
    shape: alliance.blasonShape as Blason['shape'],
    icon: alliance.blasonIcon as Blason['icon'],
    color1: alliance.blasonColor1,
    color2: alliance.blasonColor2,
  };
  const [editBlason, setEditBlason] = useState<Blason>(currentBlason);
  const [editMotto, setEditMotto] = useState<string | null>(alliance.motto);

  const blasonDirty = useMemo(() => {
    return editBlason.shape !== currentBlason.shape
      || editBlason.icon !== currentBlason.icon
      || editBlason.color1.toLowerCase() !== currentBlason.color1.toLowerCase()
      || editBlason.color2.toLowerCase() !== currentBlason.color2.toLowerCase()
      || (editMotto ?? '') !== (alliance.motto ?? '');
  }, [editBlason, editMotto, currentBlason, alliance.motto]);

  const invalidate = () => {
    utils.alliance.myAlliance.invalidate();
    utils.alliance.applications.invalidate();
  };

  const { data: applications } = trpc.alliance.applications.useQuery();
  const respondAppMutation = trpc.alliance.respondApplication.useMutation({ onSuccess: invalidate });
  const updateMutation = trpc.alliance.update.useMutation({ onSuccess: invalidate });
  const updateBlasonMutation = trpc.alliance.updateBlason.useMutation({ onSuccess: invalidate });

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader
        title="Gestion"
        actions={
          <Link
            to="/alliance"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
          >
            ← Alliance
          </Link>
        }
      />

      <section className="glass-card space-y-3 p-4">
        <h3 className="text-base font-semibold">
          Candidatures{applications && applications.length > 0 ? ` (${applications.length})` : ''}
        </h3>
        {!applications || applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune candidature en attente.</p>
        ) : (
          <div className="space-y-2">
            {applications.map((app) => (
              <div key={app.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2">
                <span className="text-sm">{app.applicantUsername}</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => respondAppMutation.mutate({ applicationId: app.id, accept: true })}>Accepter</Button>
                  <Button size="sm" variant="outline" onClick={() => respondAppMutation.mutate({ applicationId: app.id, accept: false })}>Décliner</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isFounder && (
        <section className="glass-card space-y-4 p-4">
          <h3 className="text-base font-semibold">Blason &amp; devise</h3>
          <BlasonEditor
            blason={editBlason}
            motto={editMotto}
            onBlasonChange={setEditBlason}
            onMottoChange={setEditMotto}
            allianceName={alliance.name}
            allianceTag={alliance.tag}
          />
          <div className="flex justify-end gap-2">
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

      <section className="glass-card space-y-3 p-4">
        <h3 className="text-base font-semibold">Description</h3>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button onClick={() => updateMutation.mutate({ description })} disabled={updateMutation.isPending}>
          Mettre à jour
        </Button>
      </section>

      <section className="glass-card space-y-3 p-4">
        <h3 className="text-base font-semibold">Membres &amp; rôles</h3>
        <p className="text-sm text-muted-foreground">
          Les actions promouvoir / rétrograder / expulser sont accessibles sur{' '}
          <Link to="/alliance/membres" className="text-primary hover:underline">la liste des membres</Link>.
        </p>
      </section>
    </div>
  );
}
