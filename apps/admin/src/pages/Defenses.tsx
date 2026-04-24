import { useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { EditModal } from '@/components/ui/EditModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { PrerequisitesEditor, type MixedPrereq } from '@/components/ui/PrerequisitesEditor';
import { Pencil, Plus, Trash2, Link } from 'lucide-react';
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';
import { PlanetTypeVariantsPanel } from '@/components/ui/PlanetTypeVariantsPanel';

const FIELDS = [
  { key: 'name', label: 'Nom', type: 'text' as const },
  { key: 'description', label: 'Description', type: 'textarea' as const },
  { key: 'costMinerai', label: 'Coût Minerai', type: 'number' as const },
  { key: 'costSilicium', label: 'Coût Silicium', type: 'number' as const },
  { key: 'costHydrogene', label: 'Coût Hydrogène', type: 'number' as const },
  { key: 'weapons', label: 'Armes (legacy FP)', type: 'number' as const },
  { key: 'shield', label: 'Bouclier', type: 'number' as const },
  { key: 'hull', label: 'Coque', type: 'number' as const },
  { key: 'weaponProfilesJson', label: 'Batteries (JSON)', type: 'textarea' as const },
  { key: 'maxPerPlanet', label: 'Max par planete (0 = illimite)', type: 'number' as const },
  { key: 'flavorText', label: "Texte d'ambiance", type: 'textarea' as const },
  { key: 'sortOrder', label: 'Ordre', type: 'number' as const },
];

interface WeaponProfile {
  damage: number;
  shots: number;
  targetCategory: string;
  rafale?: { category: string; count: number };
  hasChainKill?: boolean;
}

function parseWeaponProfiles(json: string): WeaponProfile[] | null {
  const trimmed = (json ?? '').trim();
  if (trimmed === '') return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const CREATE_FIELDS = [
  { key: 'id', label: 'ID (identifiant unique)', type: 'text' as const },
  { key: 'countColumn', label: 'Colonne compteur (DB)', type: 'text' as const },
  ...FIELDS,
];

export default function Defenses() {
  const { data, isLoading, refetch } = useGameConfig();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingPrereqs, setEditingPrereqs] = useState<string | null>(null);

  const updateMutation = trpc.gameConfig.admin.updateDefense.useMutation({
    onSuccess: () => {
      refetch();
      setEditing(null);
    },
  });

  const createMutation = trpc.gameConfig.admin.createDefense.useMutation({
    onSuccess: () => {
      refetch();
      setCreating(false);
    },
  });

  const prereqsMutation = trpc.gameConfig.admin.updateDefensePrerequisites.useMutation({
    onSuccess: () => {
      refetch();
      setEditingPrereqs(null);
    },
  });

  const deleteMutation = trpc.gameConfig.admin.deleteDefense.useMutation({
    onSuccess: () => {
      refetch();
      setDeleting(null);
      setDeleteError(null);
    },
    onError: (err) => {
      setDeleting(null);
      setDeleteError(err.message);
    },
  });

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const defenses = Object.values(data.defenses).sort((a, b) => a.sortOrder - b.sortOrder);
  const editingDef = editing ? data.defenses[editing] : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Defenses</h1>
        <button onClick={() => setCreating(true)} className="admin-btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {deleteError && (
        <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">
          {deleteError}
          <button onClick={() => setDeleteError(null)} className="ml-2 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-12">Image</th>
              <th>ID</th>
              <th>Nom</th>
              <th>Minerai</th>
              <th>Silicium</th>
              <th>H₂</th>
              <th>Armes</th>
              <th>Bouclier</th>
              <th>Coque</th>
              <th>Max</th>
              <th>Prerequis</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {defenses.map((d) => (
              <tr key={d.id}>
                <td className="!px-2">
                  <AdminImageUpload category="defenses" entityId={d.id} entityName={d.name} />
                  <PlanetTypeVariantsPanel
                    category="defenses"
                    entityId={d.id}
                    variantPlanetTypes={d.variantPlanetTypes ?? []}
                    planetTypes={data.planetTypes?.map((pt) => ({ id: pt.id, name: pt.name })) ?? []}
                    onChange={() => refetch()}
                  />
                </td>
                <td className="font-mono text-xs text-gray-500">{d.id}</td>
                <td className="font-medium">{d.name}</td>
                <td className="font-mono text-sm">{d.cost.minerai}</td>
                <td className="font-mono text-sm">{d.cost.silicium}</td>
                <td className="font-mono text-sm">{d.cost.hydrogene}</td>
                <td className="font-mono text-sm text-red-400">{d.weapons}</td>
                <td className="font-mono text-sm text-blue-400">{d.shield}</td>
                <td className="font-mono text-sm text-yellow-400">{d.hull}</td>
                <td className="font-mono text-sm">{d.maxPerPlanet ?? '-'}</td>
                <td className="text-xs text-gray-500">
                  <button
                    onClick={() => setEditingPrereqs(d.id)}
                    className="admin-btn-ghost p-1 inline-flex items-center gap-1 hover:text-hull-400"
                    title="Modifier les prérequis"
                  >
                    <Link className="w-3 h-3" />
                    {[
                      ...d.prerequisites.buildings.map((p) => `${p.buildingId} ${p.level}`),
                      ...d.prerequisites.research.map((p) => `${p.researchId} ${p.level}`),
                    ].join(', ') || '-'}
                  </button>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(d.id)} className="admin-btn-ghost p-1.5" title="Modifier">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(d.id)}
                      className="admin-btn-ghost p-1.5 text-red-400 hover:text-red-300"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingDef && (
        <EditModal
          open={!!editing}
          title={`Modifier: ${editingDef.name}`}
          fields={FIELDS}
          values={{
            name: editingDef.name,
            description: editingDef.description,
            costMinerai: editingDef.cost.minerai,
            costSilicium: editingDef.cost.silicium,
            costHydrogene: editingDef.cost.hydrogene,
            weapons: editingDef.weapons,
            shield: editingDef.shield,
            hull: editingDef.hull,
            weaponProfilesJson: JSON.stringify((editingDef as { weaponProfiles?: WeaponProfile[] }).weaponProfiles ?? [], null, 2),
            maxPerPlanet: editingDef.maxPerPlanet ?? 0,
            sortOrder: editingDef.sortOrder,
          }}
          onSave={(values) => {
            const profiles = parseWeaponProfiles(values.weaponProfilesJson as string);
            if (profiles === null) {
              alert('JSON des batteries invalide — doit être un tableau de profils.');
              return;
            }
            updateMutation.mutate({
              id: editing!,
              data: {
                name: values.name as string,
                description: values.description as string,
                costMinerai: values.costMinerai as number,
                costSilicium: values.costSilicium as number,
                costHydrogene: values.costHydrogene as number,
                weapons: values.weapons as number,
                shield: values.shield as number,
                hull: values.hull as number,
                weaponProfiles: profiles,
                maxPerPlanet: (values.maxPerPlanet as number) || null,
                sortOrder: values.sortOrder as number,
              },
            });
          }}
          onClose={() => setEditing(null)}
          saving={updateMutation.isPending}
        />
      )}

      {creating && (
        <EditModal
          open={creating}
          title="Nouvelle défense"
          fields={CREATE_FIELDS}
          values={{
            id: '',
            countColumn: '',
            name: '',
            description: '',
            costMinerai: 0,
            costSilicium: 0,
            costHydrogene: 0,
            weapons: 0,
            shield: 0,
            hull: 0,
            weaponProfilesJson: '[]',
            maxPerPlanet: 0,
            sortOrder: 0,
          }}
          onSave={(values) => {
            const profiles = parseWeaponProfiles(values.weaponProfilesJson as string);
            if (profiles === null) {
              alert('JSON des batteries invalide — doit être un tableau de profils.');
              return;
            }
            createMutation.mutate({
              id: values.id as string,
              name: values.name as string,
              description: values.description as string,
              costMinerai: values.costMinerai as number,
              costSilicium: values.costSilicium as number,
              costHydrogene: values.costHydrogene as number,
              countColumn: values.countColumn as string,
              weapons: values.weapons as number,
              shield: values.shield as number,
              hull: values.hull as number,
              weaponProfiles: profiles,
              maxPerPlanet: (values.maxPerPlanet as number) || null,
              sortOrder: values.sortOrder as number,
            });
          }}
          onClose={() => setCreating(false)}
          saving={createMutation.isPending}
        />
      )}

      {editingPrereqs && data.defenses[editingPrereqs] && (
        <PrerequisitesEditor
          open={!!editingPrereqs}
          title={`Prérequis: ${data.defenses[editingPrereqs].name}`}
          mode="mixed"
          mixedPrereqs={[
            ...data.defenses[editingPrereqs].prerequisites.buildings.map((p) => ({
              requiredBuildingId: p.buildingId,
              requiredLevel: p.level,
            })),
            ...data.defenses[editingPrereqs].prerequisites.research.map((p) => ({
              requiredResearchId: p.researchId,
              requiredLevel: p.level,
            })),
          ]}
          buildings={Object.values(data.buildings).map((b) => ({ id: b.id, name: b.name }))}
          research={Object.values(data.research).map((r) => ({ id: r.id, name: r.name }))}
          onSave={(prereqs) => {
            prereqsMutation.mutate({
              defenseId: editingPrereqs,
              prerequisites: (prereqs as MixedPrereq[]).map((p) => ({
                requiredBuildingId: p.requiredBuildingId,
                requiredResearchId: p.requiredResearchId,
                requiredLevel: p.requiredLevel,
              })),
            });
          }}
          onClose={() => setEditingPrereqs(null)}
          saving={prereqsMutation.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Supprimer la défense"
        message={`Êtes-vous sûr de vouloir supprimer "${deleting ? data.defenses[deleting]?.name : ''}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => {
          if (deleting) deleteMutation.mutate({ id: deleting });
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
