import { useState } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { EditModal } from '@/components/ui/EditModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { PrerequisitesEditor, type MixedPrereq } from '@/components/ui/PrerequisitesEditor';
import { Pencil, Plus, Trash2, Link } from 'lucide-react';
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';

const STAT_OPTIONS = [
  { value: 'building_time', label: 'Temps construction' },
  { value: 'research_time', label: 'Temps recherche' },
  { value: 'ship_build_time', label: 'Temps vaisseau' },
  { value: 'defense_build_time', label: 'Temps défense' },
  { value: 'ship_speed', label: 'Vitesse vaisseau' },
  { value: 'weapons', label: 'Armes' },
  { value: 'shielding', label: 'Boucliers' },
  { value: 'armor', label: 'Blindage' },
  { value: 'mining_duration', label: 'Durée minage' },
  { value: 'cargo_capacity', label: 'Capacité cargo' },
  { value: 'fuel_consumption', label: 'Conso carburant' },
  { value: 'resource_production', label: 'Production' },
  { value: 'fleet_count', label: 'Nb flottes' },
  { value: 'spy_range', label: 'Portée espionnage' },
];

const FIELDS = [
  { key: 'name', label: 'Nom', type: 'text' as const },
  { key: 'description', label: 'Description', type: 'textarea' as const },
  { key: 'baseCostMinerai', label: 'Coût Minerai (base)', type: 'number' as const },
  { key: 'baseCostSilicium', label: 'Coût Silicium (base)', type: 'number' as const },
  { key: 'baseCostHydrogene', label: 'Coût Hydrogène (base)', type: 'number' as const },
  { key: 'costFactor', label: 'Facteur de cout', type: 'number' as const, step: '0.1' },
  { key: 'flavorText', label: "Texte d'ambiance", type: 'textarea' as const },
  { key: 'effectDescription', label: "Description d'effet", type: 'textarea' as const },
  { key: 'sortOrder', label: 'Ordre', type: 'number' as const },
];

const CREATE_FIELDS = [
  { key: 'id', label: 'ID (identifiant unique)', type: 'text' as const },
  { key: 'levelColumn', label: 'Colonne niveau (DB)', type: 'text' as const },
  ...FIELDS,
];

export default function Research() {
  const { data, isLoading, refetch } = useGameConfig();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingPrereqs, setEditingPrereqs] = useState<string | null>(null);

  const updateMutation = trpc.gameConfig.admin.updateResearch.useMutation({
    onSuccess: () => {
      refetch();
      setEditing(null);
    },
  });

  const createMutation = trpc.gameConfig.admin.createResearch.useMutation({
    onSuccess: () => {
      refetch();
      setCreating(false);
    },
  });

  const prereqsMutation = trpc.gameConfig.admin.updateResearchPrerequisites.useMutation({
    onSuccess: () => {
      refetch();
      setEditingPrereqs(null);
    },
  });

  const deleteMutation = trpc.gameConfig.admin.deleteResearch.useMutation({
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

  const createBonusMutation = trpc.gameConfig.admin.createBonus.useMutation({
    onSuccess: () => refetch(),
  });
  const deleteBonusMutation = trpc.gameConfig.admin.deleteBonus.useMutation({
    onSuccess: () => refetch(),
  });

  const [addingBonusFor, setAddingBonusFor] = useState<string | null>(null);
  const [newBonusStat, setNewBonusStat] = useState('weapons');
  const [newBonusPct, setNewBonusPct] = useState(10);
  const [newBonusCategory, setNewBonusCategory] = useState('');

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const research = Object.values(data.research).sort((a, b) => a.sortOrder - b.sortOrder);
  const editingResearch = editing ? data.research[editing] : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Recherches</h1>
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
              <th>Facteur</th>
              <th>Bonus</th>
              <th>Prerequis</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {research.map((r) => (
              <tr key={r.id}>
                <td className="!px-2">
                  <AdminImageUpload category="research" entityId={r.id} entityName={r.name} />
                </td>
                <td className="font-mono text-xs text-gray-500">{r.id}</td>
                <td className="font-medium">{r.name}</td>
                <td className="font-mono text-sm">{r.baseCost.minerai}</td>
                <td className="font-mono text-sm">{r.baseCost.silicium}</td>
                <td className="font-mono text-sm">{r.baseCost.hydrogene}</td>
                <td className="font-mono text-sm">{r.costFactor}</td>
                <td className="text-xs">
                  {(() => {
                    const researchBonuses = data.bonuses?.filter(
                      (bn) => bn.sourceType === 'research' && bn.sourceId === r.id
                    ) ?? [];
                    return (
                      <div className="space-y-1">
                        {researchBonuses.map((bn) => (
                          <div key={bn.id} className="flex items-center gap-1 text-gray-300">
                            <span>{STAT_OPTIONS.find(s => s.value === bn.stat)?.label ?? bn.stat}</span>
                            <span className={bn.percentPerLevel < 0 ? 'text-emerald-400' : 'text-sky-400'}>
                              {bn.percentPerLevel > 0 ? '+' : ''}{bn.percentPerLevel}%/niv
                            </span>
                            {bn.category && <span className="text-gray-500">({bn.category})</span>}
                            <button
                              onClick={() => deleteBonusMutation.mutate({ id: bn.id })}
                              className="admin-btn-ghost p-0.5 text-red-400 hover:text-red-300 ml-1"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {addingBonusFor === r.id ? (
                          <div className="flex items-center gap-1 mt-1">
                            <select
                              value={newBonusStat}
                              onChange={(e) => setNewBonusStat(e.target.value)}
                              className="bg-panel border border-panel-border rounded px-1 py-0.5 text-xs"
                            >
                              {STAT_OPTIONS.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={newBonusPct}
                              onChange={(e) => setNewBonusPct(Number(e.target.value))}
                              className="bg-panel border border-panel-border rounded px-1 py-0.5 text-xs w-16"
                              placeholder="%/niv"
                            />
                            <input
                              type="text"
                              value={newBonusCategory}
                              onChange={(e) => setNewBonusCategory(e.target.value)}
                              className="bg-panel border border-panel-border rounded px-1 py-0.5 text-xs w-20"
                              placeholder="catégorie"
                            />
                            <button
                              onClick={() => {
                                const cat = newBonusCategory || null;
                                const id = cat
                                  ? `${r.id}__${newBonusStat}__${cat}`
                                  : `${r.id}__${newBonusStat}`;
                                createBonusMutation.mutate({
                                  id,
                                  sourceType: 'research',
                                  sourceId: r.id,
                                  stat: newBonusStat,
                                  percentPerLevel: newBonusPct,
                                  category: cat,
                                });
                                setAddingBonusFor(null);
                              }}
                              className="admin-btn-primary text-xs px-1.5 py-0.5"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => setAddingBonusFor(null)}
                              className="admin-btn-ghost text-xs px-1 py-0.5"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddingBonusFor(r.id);
                              setNewBonusStat('weapons');
                              setNewBonusPct(10);
                              setNewBonusCategory('');
                            }}
                            className="admin-btn-ghost text-xs text-hull-400 hover:text-hull-300 flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" /> bonus
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="text-xs text-gray-500">
                  <button
                    onClick={() => setEditingPrereqs(r.id)}
                    className="admin-btn-ghost p-1 inline-flex items-center gap-1 hover:text-hull-400"
                    title="Modifier les prérequis"
                  >
                    <Link className="w-3 h-3" />
                    {[
                      ...r.prerequisites.buildings.map((p) => `${p.buildingId} ${p.level}`),
                      ...r.prerequisites.research.map((p) => `${p.researchId} ${p.level}`),
                    ].join(', ') || '-'}
                  </button>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing(r.id)}
                      className="admin-btn-ghost p-1.5"
                      title="Modifier"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(r.id)}
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

      {editingResearch && (
        <EditModal
          open={!!editing}
          title={`Modifier: ${editingResearch.name}`}
          fields={FIELDS}
          values={{
            name: editingResearch.name,
            description: editingResearch.description,
            baseCostMinerai: editingResearch.baseCost.minerai,
            baseCostSilicium: editingResearch.baseCost.silicium,
            baseCostHydrogene: editingResearch.baseCost.hydrogene,
            costFactor: editingResearch.costFactor,
            sortOrder: editingResearch.sortOrder,
          }}
          onSave={(values) => {
            updateMutation.mutate({
              id: editing!,
              data: {
                name: values.name as string,
                description: values.description as string,
                baseCostMinerai: values.baseCostMinerai as number,
                baseCostSilicium: values.baseCostSilicium as number,
                baseCostHydrogene: values.baseCostHydrogene as number,
                costFactor: values.costFactor as number,
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
          title="Nouvelle recherche"
          fields={CREATE_FIELDS}
          values={{
            id: '',
            levelColumn: '',
            name: '',
            description: '',
            baseCostMinerai: 0,
            baseCostSilicium: 0,
            baseCostHydrogene: 0,
            costFactor: 2,
            sortOrder: 0,
          }}
          onSave={(values) => {
            createMutation.mutate({
              id: values.id as string,
              name: values.name as string,
              description: values.description as string,
              baseCostMinerai: values.baseCostMinerai as number,
              baseCostSilicium: values.baseCostSilicium as number,
              baseCostHydrogene: values.baseCostHydrogene as number,
              costFactor: values.costFactor as number,
              levelColumn: values.levelColumn as string,
              sortOrder: values.sortOrder as number,
            });
          }}
          onClose={() => setCreating(false)}
          saving={createMutation.isPending}
        />
      )}

      {editingPrereqs && data.research[editingPrereqs] && (
        <PrerequisitesEditor
          open={!!editingPrereqs}
          title={`Prérequis: ${data.research[editingPrereqs].name}`}
          mode="mixed"
          mixedPrereqs={[
            ...data.research[editingPrereqs].prerequisites.buildings.map((p) => ({
              requiredBuildingId: p.buildingId,
              requiredLevel: p.level,
            })),
            ...data.research[editingPrereqs].prerequisites.research.map((p) => ({
              requiredResearchId: p.researchId,
              requiredLevel: p.level,
            })),
          ]}
          buildings={Object.values(data.buildings).map((b) => ({ id: b.id, name: b.name }))}
          research={research.map((r) => ({ id: r.id, name: r.name }))}
          onSave={(prereqs) => {
            prereqsMutation.mutate({
              researchId: editingPrereqs,
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
        title="Supprimer la recherche"
        message={`Êtes-vous sûr de vouloir supprimer "${deleting ? data.research[deleting]?.name : ''}" ? Cette action est irréversible.`}
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
