import { useState, useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import { BONUS_LABELS } from './constants';

export function HullEditModal({ hull, open, onClose, onSave, saving }: {
  hull: any;
  open: boolean;
  onClose: () => void;
  onSave: (updated: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (hull) setForm({ ...hull });
  }, [hull]);

  if (!open || !hull) return null;

  const setField = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const setBonus = (key: string, value: number) => setForm((f: any) => ({
    ...f, passiveBonuses: { ...f.passiveBonuses, [key]: value },
  }));
  const setCostField = (key: string, value: number) => setForm((f: any) => ({
    ...f, changeCost: { ...f.changeCost, [key]: value },
  }));
  const setRatio = (res: string, value: number) => setForm((f: any) => ({
    ...f, changeCost: { ...f.changeCost, resourceRatio: { ...f.changeCost?.resourceRatio, [res]: value } },
  }));
  const setBonusLabel = (i: number, value: string) => setForm((f: any) => {
    const labels = [...(f.bonusLabels ?? [])];
    labels[i] = value;
    return { ...f, bonusLabels: labels };
  });
  const addBonusLabel = () => setForm((f: any) => ({ ...f, bonusLabels: [...(f.bonusLabels ?? []), ''] }));
  const removeBonusLabel = (i: number) => setForm((f: any) => ({
    ...f, bonusLabels: (f.bonusLabels ?? []).filter((_: unknown, idx: number) => idx !== i),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
      <div className="admin-card p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto animate-slide-up shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-100">Modifier : {hull.name}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          {/* General */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
              <input value={form.name ?? ''} onChange={e => setField('name', e.target.value)} className="admin-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Playstyle</label>
              <select value={form.playstyle ?? ''} onChange={e => setField('playstyle', e.target.value)} className="admin-input">
                <option value="warrior">warrior</option>
                <option value="miner">miner</option>
                <option value="explorer">explorer</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea value={form.description ?? ''} onChange={e => setField('description', e.target.value)} className="admin-input min-h-[50px] resize-y" rows={2} />
          </div>

          {/* Passive bonuses */}
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-2">Bonus passifs</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(form.passiveBonuses ?? {}).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-[11px] text-gray-400 w-40 truncate" title={key}>{BONUS_LABELS[key] ?? key}</label>
                  <input type="number" step="any" value={val as number} onChange={e => setBonus(key, Number(e.target.value))}
                    className="admin-input w-24 text-right" />
                </div>
              ))}
            </div>
          </div>

          {/* Bonus labels */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Labels joueurs</span>
              <button type="button" onClick={addBonusLabel} className="text-[10px] text-cyan-400 hover:text-cyan-300">+ Ajouter</button>
            </div>
            <div className="space-y-1.5">
              {(form.bonusLabels ?? []).map((label: string, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={label} onChange={e => setBonusLabel(i, e.target.value)} className="admin-input flex-1" />
                  <button type="button" onClick={() => removeBonusLabel(i)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Abilities */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Capacites</span>
              <button type="button" onClick={() => {
                const newAbility = { id: '', name: '', description: '', type: 'active', cooldownSeconds: 3600, params: {} };
                setField('abilities', [...(form.abilities ?? []), newAbility]);
              }} className="text-[10px] text-cyan-400 hover:text-cyan-300">+ Ajouter</button>
            </div>
            <div className="space-y-3">
              {(form.abilities ?? []).map((ability: any, i: number) => {
                const setAbilityField = (key: string, val: any) => {
                  const abilities = [...(form.abilities ?? [])];
                  abilities[i] = { ...abilities[i], [key]: val };
                  setField('abilities', abilities);
                };
                const setParam = (key: string, val: any) => {
                  const abilities = [...(form.abilities ?? [])];
                  abilities[i] = { ...abilities[i], params: { ...(abilities[i].params ?? {}), [key]: val } };
                  setField('abilities', abilities);
                };
                const removeAbility = () => {
                  setField('abilities', (form.abilities ?? []).filter((_: unknown, idx: number) => idx !== i));
                };
                return (
                  <div key={i} className="border border-gray-700/50 rounded-lg p-3 space-y-2 bg-gray-800/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-cyan-400 font-mono">{ability.id || '(nouveau)'}</span>
                      <button type="button" onClick={removeAbility} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">ID</label>
                        <input value={ability.id ?? ''} onChange={e => setAbilityField('id', e.target.value)} className="admin-input text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Type</label>
                        <select value={ability.type ?? 'active'} onChange={e => setAbilityField('type', e.target.value)} className="admin-input text-xs">
                          <option value="active">active (pouvoir activable)</option>
                          <option value="fleet_unlock">fleet_unlock (debloque mission)</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Nom</label>
                        <input value={ability.name ?? ''} onChange={e => setAbilityField('name', e.target.value)} className="admin-input text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Description</label>
                        <input value={ability.description ?? ''} onChange={e => setAbilityField('description', e.target.value)} className="admin-input text-xs" />
                      </div>
                    </div>
                    {ability.type === 'fleet_unlock' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Missions debloquees (virgule)</label>
                          <input value={(ability.unlockedMissions ?? []).join(', ')} onChange={e => setAbilityField('unlockedMissions', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} className="admin-input text-xs" />
                        </div>
                        <div className="flex items-center gap-2 pt-4">
                          <input type="checkbox" checked={ability.miningExtractionEqualsCargo ?? false} onChange={e => setAbilityField('miningExtractionEqualsCargo', e.target.checked)} />
                          <label className="text-[10px] text-gray-400">Extraction = soute</label>
                        </div>
                      </div>
                    )}
                    {ability.type === 'active' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Cooldown (secondes)</label>
                          <input type="number" value={ability.cooldownSeconds ?? ''} onChange={e => setAbilityField('cooldownSeconds', Number(e.target.value))} className="admin-input text-xs" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Bonus espionnage</label>
                          <input type="number" value={ability.params?.espionageBonus ?? ''} onChange={e => setParam('espionageBonus', Number(e.target.value))} className="admin-input text-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Change cost */}
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-2">Cout de changement</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Multiplicateur (x totalEarned)</label>
                <input type="number" value={form.changeCost?.baseMultiplier ?? ''} onChange={e => setCostField('baseMultiplier', Number(e.target.value))} className="admin-input" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-orange-400/70 mb-1">Minerai</label>
                  <input type="number" value={form.changeCost?.resourceRatio?.minerai ?? ''} onChange={e => setRatio('minerai', Number(e.target.value))} className="admin-input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-400/70 mb-1">Silicium</label>
                  <input type="number" value={form.changeCost?.resourceRatio?.silicium ?? ''} onChange={e => setRatio('silicium', Number(e.target.value))} className="admin-input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-blue-400/70 mb-1">Hydrogene</label>
                  <input type="number" value={form.changeCost?.resourceRatio?.hydrogene ?? ''} onChange={e => setRatio('hydrogene', Number(e.target.value))} className="admin-input" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Indisponibilite (secondes)</label>
                <input type="number" value={form.unavailabilitySeconds ?? ''} onChange={e => setField('unavailabilitySeconds', Number(e.target.value))} className="admin-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cooldown changement (secondes)</label>
                <input type="number" value={form.cooldownSeconds ?? ''} onChange={e => setField('cooldownSeconds', Number(e.target.value))} className="admin-input" />
              </div>
            </div>
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
