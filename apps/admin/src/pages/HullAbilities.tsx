import { useState, useEffect } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { Pencil, Trash2, Plus, X, Zap, Ship } from 'lucide-react';

const HULL_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  combat: { text: 'text-red-400', bg: 'bg-red-900/20', border: 'border-red-800/30' },
  industrial: { text: 'text-amber-400', bg: 'bg-amber-900/20', border: 'border-amber-800/30' },
  scientific: { text: 'text-cyan-400', bg: 'bg-cyan-900/20', border: 'border-cyan-800/30' },
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Pouvoir actif', color: 'text-cyan-400 bg-cyan-900/30 border-cyan-800/30' },
  fleet_unlock: { label: 'Deblocage mission', color: 'text-amber-400 bg-amber-900/30 border-amber-800/30' },
};

function AbilityEditModal({ ability, hullId, open, onClose, onSave, saving }: {
  ability: any;
  hullId: string;
  open: boolean;
  onClose: () => void;
  onSave: (updated: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (ability) setForm({ ...ability, params: { ...(ability.params ?? {}) } });
  }, [ability]);

  if (!open || !ability) return null;

  const setField = (key: string, val: any) => setForm((f: any) => ({ ...f, [key]: val }));
  const setParam = (key: string, val: any) => setForm((f: any) => ({
    ...f, params: { ...(f.params ?? {}), [key]: val },
  }));
  const removeParam = (key: string) => setForm((f: any) => {
    const { [key]: _, ...rest } = f.params ?? {};
    return { ...f, params: rest };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
      <div className="admin-card p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto animate-slide-up shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-gray-100">Modifier la capacite</h3>
            <span className={`text-xs ${HULL_COLORS[hullId]?.text ?? 'text-gray-400'}`}>Coque : {hullId}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ID (identifiant unique)</label>
              <input value={form.id ?? ''} onChange={e => setField('id', e.target.value)} className="admin-input font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select value={form.type ?? 'active'} onChange={e => setField('type', e.target.value)} className="admin-input">
                <option value="active">Pouvoir actif (activable par le joueur)</option>
                <option value="fleet_unlock">Deblocage mission (passive)</option>
              </select>
            </div>
          </div>

          {/* Display */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom (affiche au joueur)</label>
              <input value={form.name ?? ''} onChange={e => setField('name', e.target.value)} className="admin-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input value={form.description ?? ''} onChange={e => setField('description', e.target.value)} className="admin-input" />
            </div>
          </div>

          {/* Fleet unlock fields */}
          {form.type === 'fleet_unlock' && (
            <div className="p-3 rounded-lg border border-amber-800/20 bg-amber-900/10 space-y-3">
              <div className="text-[10px] uppercase text-amber-400 font-semibold tracking-wider">Parametres deblocage</div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Missions debloquees (separees par virgule)</label>
                <input
                  value={(form.unlockedMissions ?? []).join(', ')}
                  onChange={e => setField('unlockedMissions', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                  className="admin-input"
                  placeholder="mine, recycle"
                />
                <p className="text-[10px] text-gray-600 mt-1">Types de missions que le flagship peut rejoindre grace a cette capacite</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="miningExtraction" checked={form.miningExtractionEqualsCargo ?? false} onChange={e => setField('miningExtractionEqualsCargo', e.target.checked)} />
                <label htmlFor="miningExtraction" className="text-xs text-gray-400">Extraction miniere = capacite de soute</label>
              </div>
            </div>
          )}

          {/* Active ability fields */}
          {form.type === 'active' && (
            <div className="p-3 rounded-lg border border-cyan-800/20 bg-cyan-900/10 space-y-3">
              <div className="text-[10px] uppercase text-cyan-400 font-semibold tracking-wider">Parametres activation</div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cooldown (secondes)</label>
                <input type="number" value={form.cooldownSeconds ?? ''} onChange={e => setField('cooldownSeconds', Number(e.target.value))} className="admin-input" />
                <p className="text-[10px] text-gray-600 mt-1">{form.cooldownSeconds ? `= ${Math.round((form.cooldownSeconds ?? 0) / 60)} minutes` : ''}</p>
              </div>
            </div>
          )}

          {/* Params (generic key-value) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Parametres custom</span>
              <button
                type="button"
                onClick={() => {
                  const key = prompt('Nom du parametre :');
                  if (key) setParam(key, 0);
                }}
                className="text-[10px] text-cyan-400 hover:text-cyan-300"
              >+ Ajouter</button>
            </div>
            {Object.keys(form.params ?? {}).length === 0 ? (
              <p className="text-[10px] text-gray-600 italic">Aucun parametre custom</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(form.params ?? {}).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400 font-mono w-40 truncate" title={key}>{key}</span>
                    <input
                      type="number"
                      step="any"
                      value={val as number}
                      onChange={e => setParam(key, Number(e.target.value))}
                      className="admin-input w-24 text-right"
                    />
                    <button type="button" onClick={() => removeParam(key)} className="text-red-400 hover:text-red-300">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-600 mt-1">Ces parametres sont lus par le code backend (ex: espionageBonus pour le scan)</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="admin-btn-ghost">Annuler</button>
          <button onClick={() => onSave(form)} disabled={saving} className="admin-btn-primary">
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HullAbilities() {
  const { data, isLoading, refetch } = useGameConfig();
  const [editingAbility, setEditingAbility] = useState<{ ability: any; hullId: string } | null>(null);

  const updateMutation = trpc.gameConfig.admin.updateUniverseConfig.useMutation({
    onSuccess: () => {
      setEditingAbility(null);
      refetch();
    },
  });

  if (isLoading || !data) return <PageSkeleton />;

  const hulls = data.hulls ?? {};
  const hullList = Object.values(hulls) as any[];

  const saveAbility = (hullId: string, updatedAbility: any, originalId?: string) => {
    const hull = hulls[hullId];
    if (!hull) return;
    const newAbilities = (hull.abilities ?? []).map((a: any) =>
      a.id === (originalId ?? updatedAbility.id) ? updatedAbility : a
    );
    const newHull = { ...hull, abilities: newAbilities };
    const newHulls = hullList.map((h: any) => h.id === hullId ? newHull : h);
    updateMutation.mutate({ key: 'hulls', value: newHulls });
  };

  const addAbility = (hullId: string) => {
    const hull = hulls[hullId];
    if (!hull) return;
    const newAbility = {
      id: `new_ability_${Date.now()}`,
      name: 'Nouvelle capacite',
      description: '',
      type: 'active',
      cooldownSeconds: 3600,
      params: {},
    };
    const newHull = { ...hull, abilities: [...(hull.abilities ?? []), newAbility] };
    const newHulls = hullList.map((h: any) => h.id === hullId ? newHull : h);
    updateMutation.mutate({ key: 'hulls', value: newHulls });
  };

  const deleteAbility = (hullId: string, abilityId: string) => {
    const hull = hulls[hullId];
    if (!hull) return;
    const newHull = { ...hull, abilities: (hull.abilities ?? []).filter((a: any) => a.id !== abilityId) };
    const newHulls = hullList.map((h: any) => h.id === hullId ? newHull : h);
    updateMutation.mutate({ key: 'hulls', value: newHulls });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-semibold text-gray-100">Capacites Flagship</h1>
        </div>
      </div>

      <p className="text-sm text-gray-400 mb-6">
        Gerez les capacites actives et passives de chaque coque. Les modifications prennent effet immediatement.
      </p>

      {hullList.map((hull: any) => {
        const colors = HULL_COLORS[hull.id] ?? HULL_COLORS.combat;
        const abilities = hull.abilities ?? [];

        return (
          <div key={hull.id} className="admin-card mb-6">
            <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
              <div className="flex items-center gap-2">
                <Ship className={`w-4 h-4 ${colors.text}`} />
                <span className={`font-semibold ${colors.text}`}>{hull.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 font-mono">{hull.id}</span>
                <span className="text-xs text-gray-500">{abilities.length} capacite{abilities.length > 1 ? 's' : ''}</span>
              </div>
              <button
                onClick={() => addAbility(hull.id)}
                disabled={updateMutation.isPending}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </button>
            </div>

            {abilities.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-600 italic">
                Aucune capacite configuree pour cette coque.
              </div>
            ) : (
              <div className="divide-y divide-panel-border">
                {abilities.map((ability: any) => {
                  const typeStyle = TYPE_LABELS[ability.type] ?? TYPE_LABELS.active;
                  return (
                    <div key={ability.id} className="p-4 hover:bg-gray-800/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Header */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${typeStyle.color}`}>
                              {typeStyle.label}
                            </span>
                            <span className="text-sm font-semibold text-gray-200">{ability.name}</span>
                            <span className="text-[10px] text-gray-600 font-mono">{ability.id}</span>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-gray-400">{ability.description}</p>

                          {/* Details */}
                          <div className="flex flex-wrap gap-3 text-[11px]">
                            {ability.type === 'fleet_unlock' && ability.unlockedMissions && (
                              <span className="text-amber-400">
                                Missions : {ability.unlockedMissions.join(', ')}
                              </span>
                            )}
                            {ability.type === 'fleet_unlock' && ability.miningExtractionEqualsCargo && (
                              <span className="text-amber-400">Extraction = soute</span>
                            )}
                            {ability.type === 'active' && ability.cooldownSeconds && (
                              <span className="text-cyan-400 font-mono">
                                CD : {ability.cooldownSeconds}s ({Math.round(ability.cooldownSeconds / 60)}min)
                              </span>
                            )}
                            {ability.params && Object.entries(ability.params).map(([k, v]) => (
                              <span key={k} className="text-gray-400 font-mono">
                                {k}: <span className="text-gray-200">{String(v)}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setEditingAbility({ ability, hullId: hull.id })}
                            className="p-1.5 text-gray-500 hover:text-cyan-400 transition-colors"
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Supprimer la capacite "${ability.name}" ?`)) {
                                deleteAbility(hull.id, ability.id);
                              }
                            }}
                            disabled={updateMutation.isPending}
                            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <AbilityEditModal
        ability={editingAbility?.ability}
        hullId={editingAbility?.hullId ?? ''}
        open={!!editingAbility}
        onClose={() => setEditingAbility(null)}
        onSave={(updated) => {
          if (editingAbility) {
            saveAbility(editingAbility.hullId, updated, editingAbility.ability.id);
          }
        }}
        saving={updateMutation.isPending}
      />
    </div>
  );
}
