import { useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { EditModal } from '@/components/ui/EditModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { PrerequisitesEditor, type MixedPrereq } from '@/components/ui/PrerequisitesEditor';
import { Pencil, Plus, Trash2, Link } from 'lucide-react';
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';

const FIELDS = [
  { key: 'name', label: 'Nom', type: 'text' as const },
  { key: 'description', label: 'Description', type: 'textarea' as const },
  { key: 'costMinerai', label: 'Coût Minerai', type: 'number' as const },
  { key: 'costSilicium', label: 'Coût Silicium', type: 'number' as const },
  { key: 'costHydrogene', label: 'Coût Hydrogène', type: 'number' as const },
  { key: 'weapons', label: 'Armes', type: 'number' as const },
  { key: 'shield', label: 'Bouclier', type: 'number' as const },
  { key: 'armor', label: 'Coque', type: 'number' as const },
  { key: 'baseSpeed', label: 'Vitesse', type: 'number' as const },
  { key: 'fuelConsumption', label: 'Carburant', type: 'number' as const },
  { key: 'cargoCapacity', label: 'Cargo', type: 'number' as const },
  { key: 'flavorText', label: "Texte d'ambiance", type: 'textarea' as const },
  { key: 'sortOrder', label: 'Ordre', type: 'number' as const },
  { key: 'role', label: 'Rôle', type: 'text' as const },
];

const CREATE_FIELDS = [
  { key: 'id', label: 'ID (identifiant unique)', type: 'text' as const },
  { key: 'countColumn', label: 'Colonne compteur (DB)', type: 'text' as const },
  { key: 'driveType', label: 'Type de moteur', type: 'text' as const },
  ...FIELDS,
];

export default function Ships() {
  const { data, isLoading, refetch } = useGameConfig();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingPrereqs, setEditingPrereqs] = useState<string | null>(null);

  const updateMutation = trpc.gameConfig.admin.updateShip.useMutation({
    onSuccess: () => {
      refetch();
      setEditing(null);
    },
  });

  const createMutation = trpc.gameConfig.admin.createShip.useMutation({
    onSuccess: () => {
      refetch();
      setCreating(false);
    },
  });

  const prereqsMutation = trpc.gameConfig.admin.updateShipPrerequisites.useMutation({
    onSuccess: () => {
      refetch();
      setEditingPrereqs(null);
    },
  });

  const deleteMutation = trpc.gameConfig.admin.deleteShip.useMutation({
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

  const ships = Object.values(data.ships).sort((a, b) => a.sortOrder - b.sortOrder);
  const editingShip = editing ? data.ships[editing] : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Vaisseaux</h1>
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
              <th>Vitesse</th>
              <th>Cargo</th>
              <th>Moteur</th>
              <th>Rôle</th>
              <th>Prerequis</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ships.map((s) => (
              <tr key={s.id}>
                <td className="!px-2">
                  <AdminImageUpload category="ships" entityId={s.id} entityName={s.name} />
                </td>
                <td className="font-mono text-xs text-gray-500">{s.id}</td>
                <td className="font-medium">{s.name}</td>
                <td className="font-mono text-sm">{s.cost.minerai}</td>
                <td className="font-mono text-sm">{s.cost.silicium}</td>
                <td className="font-mono text-sm">{s.cost.hydrogene}</td>
                <td className="font-mono text-sm text-red-400">{s.weapons}</td>
                <td className="font-mono text-sm text-blue-400">{s.shield}</td>
                <td className="font-mono text-sm text-yellow-400">{s.armor}</td>
                <td className="font-mono text-sm">{s.baseSpeed}</td>
                <td className="font-mono text-sm">{s.cargoCapacity}</td>
                <td className="text-xs text-gray-500">{s.driveType}</td>
                <td className="text-xs text-gray-500">{s.role ?? '-'}</td>
                <td className="text-xs text-gray-500">
                  <button
                    onClick={() => setEditingPrereqs(s.id)}
                    className="admin-btn-ghost p-1 inline-flex items-center gap-1 hover:text-hull-400"
                    title="Modifier les prérequis"
                  >
                    <Link className="w-3 h-3" />
                    {[
                      ...s.prerequisites.buildings.map((p) => `${p.buildingId} ${p.level}`),
                      ...s.prerequisites.research.map((p) => `${p.researchId} ${p.level}`),
                    ].join(', ') || '-'}
                  </button>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(s.id)} className="admin-btn-ghost p-1.5" title="Modifier">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(s.id)}
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

      {editingShip && (
        <EditModal
          open={!!editing}
          title={`Modifier: ${editingShip.name}`}
          fields={FIELDS}
          values={{
            name: editingShip.name,
            description: editingShip.description,
            costMinerai: editingShip.cost.minerai,
            costSilicium: editingShip.cost.silicium,
            costHydrogene: editingShip.cost.hydrogene,
            weapons: editingShip.weapons,
            shield: editingShip.shield,
            armor: editingShip.armor,
            baseSpeed: editingShip.baseSpeed,
            fuelConsumption: editingShip.fuelConsumption,
            cargoCapacity: editingShip.cargoCapacity,
            sortOrder: editingShip.sortOrder,
            role: editingShip.role ?? '',
          }}
          onSave={(values) => {
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
                armor: values.armor as number,
                baseSpeed: values.baseSpeed as number,
                fuelConsumption: values.fuelConsumption as number,
                cargoCapacity: values.cargoCapacity as number,
                sortOrder: values.sortOrder as number,
                role: (values.role as string) || null,
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
          title="Nouveau vaisseau"
          fields={CREATE_FIELDS}
          values={{
            id: '',
            countColumn: '',
            driveType: 'combustion',
            name: '',
            description: '',
            costMinerai: 0,
            costSilicium: 0,
            costHydrogene: 0,
            weapons: 0,
            shield: 0,
            armor: 0,
            baseSpeed: 0,
            fuelConsumption: 0,
            cargoCapacity: 0,
            sortOrder: 0,
            role: '',
          }}
          onSave={(values) => {
            createMutation.mutate({
              id: values.id as string,
              name: values.name as string,
              description: values.description as string,
              costMinerai: values.costMinerai as number,
              costSilicium: values.costSilicium as number,
              costHydrogene: values.costHydrogene as number,
              countColumn: values.countColumn as string,
              driveType: values.driveType as string,
              weapons: values.weapons as number,
              shield: values.shield as number,
              armor: values.armor as number,
              baseSpeed: values.baseSpeed as number,
              fuelConsumption: values.fuelConsumption as number,
              cargoCapacity: values.cargoCapacity as number,
              sortOrder: values.sortOrder as number,
              role: (values.role as string) || null,
            });
          }}
          onClose={() => setCreating(false)}
          saving={createMutation.isPending}
        />
      )}

      {editingPrereqs && data.ships[editingPrereqs] && (
        <PrerequisitesEditor
          open={!!editingPrereqs}
          title={`Prérequis: ${data.ships[editingPrereqs].name}`}
          mode="mixed"
          mixedPrereqs={[
            ...data.ships[editingPrereqs].prerequisites.buildings.map((p) => ({
              requiredBuildingId: p.buildingId,
              requiredLevel: p.level,
            })),
            ...data.ships[editingPrereqs].prerequisites.research.map((p) => ({
              requiredResearchId: p.researchId,
              requiredLevel: p.level,
            })),
          ]}
          buildings={Object.values(data.buildings).map((b) => ({ id: b.id, name: b.name }))}
          research={Object.values(data.research).map((r) => ({ id: r.id, name: r.name }))}
          onSave={(prereqs) => {
            prereqsMutation.mutate({
              shipId: editingPrereqs,
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
        title="Supprimer le vaisseau"
        message={`Êtes-vous sûr de vouloir supprimer "${deleting ? data.ships[deleting]?.name : ''}" ? Cette action est irréversible.`}
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
