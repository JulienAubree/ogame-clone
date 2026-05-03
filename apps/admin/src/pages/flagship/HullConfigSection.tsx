import { useState } from 'react';
import { trpc } from '@/trpc';
import { Pencil, Shield } from 'lucide-react';
import { BONUS_LABELS, HULL_TYPES } from './constants';
import { HullEditModal } from './HullEditModal';

export function HullConfigSection({ hulls, onUpdated }: { hulls: Record<string, any>; onUpdated: () => void }) {
  const [editingHull, setEditingHull] = useState<any>(null);
  const updateMutation = trpc.gameConfig.admin.updateUniverseConfig.useMutation({
    onSuccess: () => {
      setEditingHull(null);
      onUpdated();
    },
  });

  if (!hulls || Object.keys(hulls).length === 0) return null;

  const hullList = Object.values(hulls);

  const handleSave = (updated: { id: string }) => {
    // Replace the edited hull in the full list and save as array
    const newList = hullList.map((h: { id: string }) => h.id === updated.id ? updated : h);
    updateMutation.mutate({ key: 'hulls', value: newList });
  };

  return (
    <div className="admin-card mb-6">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-panel-border">
        <Shield className="w-4 h-4 text-cyan-400" />
        <span className="font-semibold text-gray-100">Configuration des coques</span>
        <span className="text-xs text-gray-500">({hullList.length})</span>
      </div>
      <div className="divide-y divide-panel-border">
        {hullList.map((hull) => {
          const hullStyle = HULL_TYPES.find(h => h.id === hull.id);
          return (
            <div key={hull.id} className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${hullStyle?.color ?? 'text-gray-200'}`}>{hull.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">{hull.id}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">playstyle: {hull.playstyle}</span>
                </div>
                <button onClick={() => setEditingHull(hull)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Modifier
                </button>
              </div>

              <p className="text-xs text-gray-400">{hull.description}</p>

              {/* Passive bonuses */}
              <div>
                <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Bonus passifs</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(hull.passiveBonuses ?? {}).map(([key, val]) => (
                    <span key={key} className="text-[11px] px-2 py-1 rounded bg-gray-800/80 border border-gray-700/50 text-gray-300">
                      <span className="text-gray-500">{BONUS_LABELS[key] ?? key}:</span>{' '}
                      <span className="font-semibold text-gray-200">
                        {typeof val === 'number' && val < 1 ? `${(val as number) * 100}%` : String(val)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Bonus labels */}
              {hull.bonusLabels && hull.bonusLabels.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Labels affiches aux joueurs</div>
                  <div className="flex flex-wrap gap-1.5">
                    {hull.bonusLabels.map((label: string, i: number) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-gray-800/60 text-gray-400 italic">{label}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Abilities */}
              {hull.abilities && hull.abilities.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Capacites</div>
                  <div className="space-y-1.5">
                    {hull.abilities.map((a: any) => (
                      <div key={a.id ?? a} className="flex items-center gap-2 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${a.type === 'active' ? 'bg-cyan-900/40 text-cyan-400' : 'bg-amber-900/40 text-amber-400'}`}>
                          {a.type === 'active' ? 'Actif' : 'Fleet'}
                        </span>
                        <span className="text-gray-200 font-medium">{a.name ?? a.id ?? a}</span>
                        <span className="text-gray-500">{a.description ?? ''}</span>
                        {a.cooldownSeconds && <span className="text-gray-500 font-mono">CD:{a.cooldownSeconds}s</span>}
                        {a.unlockedMissions && <span className="text-gray-500 font-mono">[{a.unlockedMissions.join(',')}]</span>}
                        {a.params?.espionageBonus && <span className="text-cyan-400 font-mono">+{a.params.espionageBonus} esp</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Change cost */}
              <div>
                <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1">Cout de changement</div>
                <div className="flex gap-3 text-[11px] text-gray-400">
                  <span>Multiplicateur: <span className="text-gray-200 font-semibold">{hull.changeCost?.baseMultiplier ?? '?'}</span> x totalEarned</span>
                  <span>Ratio: <span className="text-orange-400">{hull.changeCost?.resourceRatio?.minerai ?? 0}</span>/<span className="text-emerald-400">{hull.changeCost?.resourceRatio?.silicium ?? 0}</span>/<span className="text-blue-400">{hull.changeCost?.resourceRatio?.hydrogene ?? 0}</span></span>
                </div>
                <div className="flex gap-3 text-[11px] text-gray-400 mt-0.5">
                  <span>Indisponibilite: <span className="text-gray-200 font-semibold">{hull.unavailabilitySeconds}s</span> ({Math.round(hull.unavailabilitySeconds / 3600)}h)</span>
                  <span>Cooldown: <span className="text-gray-200 font-semibold">{hull.cooldownSeconds}s</span> ({Math.round(hull.cooldownSeconds / 86400)}j)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <HullEditModal
        hull={editingHull}
        open={!!editingHull}
        onClose={() => setEditingHull(null)}
        onSave={handleSave}
        saving={updateMutation.isPending}
      />
    </div>
  );
}
