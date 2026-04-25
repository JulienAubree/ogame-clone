import { useState, useMemo, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { trpc } from '@/trpc';
import { cn } from '@/lib/utils';
import { ClockIcon } from '@/components/icons/utility-icons';
import { useGameConfig } from '../../hooks/useGameConfig';

interface HullChangeModalProps {
  open: boolean;
  onClose: () => void;
  flagship: {
    hullId: string | null;
    hullChangedAt: string | Date | null;
    hullChangeAvailableAt: string | Date | null;
  };
}

const HULL_STYLES: Record<string, { border: string; ring: string; icon: string; accent: string }> = {
  combat: { border: 'border-red-500/60', ring: 'ring-red-500/30', icon: 'text-red-400', accent: 'text-red-400' },
  industrial: { border: 'border-amber-500/60', ring: 'ring-amber-500/30', icon: 'text-amber-400', accent: 'text-amber-400' },
  scientific: { border: 'border-cyan-500/60', ring: 'ring-cyan-500/30', icon: 'text-cyan-400', accent: 'text-cyan-400' },
};

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

const RESOURCE_LABELS: Record<string, string> = {
  minerai: 'minerai',
  silicium: 'silicium',
  hydrogene: 'hydrogene',
};

const fmt = (n: number) => n.toLocaleString('fr-FR');

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

function formatDays(seconds: number) {
  const d = Math.round(seconds / 86400);
  return `${d} jour${d > 1 ? 's' : ''}`;
}

export function HullChangeModal({ open, onClose, flagship }: HullChangeModalProps) {
  const [selectedHull, setSelectedHull] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: config } = useGameConfig();
  const hulls = config?.hulls ? Object.values(config.hulls) : [];

  const { data: exiliumData } = trpc.exilium.getBalance.useQuery();
  const totalEarned = exiliumData?.totalEarned ?? 0;

  // Reset state when modal closes/reopens
  useEffect(() => {
    if (!open) { setSelectedHull(null); setShowConfirm(false); }
  }, [open]);

  const utils = trpc.useUtils();
  const changeHullMutation = trpc.flagship.changeHull.useMutation({
    onSuccess: () => {
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      onClose();
    },
  });

  const isFirstChange = flagship.hullChangedAt === null || flagship.hullChangedAt === undefined;

  const selectedHullConfig = useMemo(() => {
    if (!selectedHull || !config?.hulls) return null;
    return config.hulls[selectedHull] ?? null;
  }, [selectedHull, config]);

  const cost = useMemo(() => {
    if (isFirstChange || !selectedHullConfig) return null;
    const changeCost = selectedHullConfig.changeCost;
    const totalCost = Number(totalEarned) * changeCost.baseMultiplier;
    const ratioSum = changeCost.resourceRatio.minerai + changeCost.resourceRatio.silicium + changeCost.resourceRatio.hydrogene;
    if (ratioSum === 0) return null;
    return {
      minerai: Math.floor(totalCost * changeCost.resourceRatio.minerai / ratioSum),
      silicium: Math.floor(totalCost * changeCost.resourceRatio.silicium / ratioSum),
      hydrogene: Math.floor(totalCost * changeCost.resourceRatio.hydrogene / ratioSum),
    };
  }, [isFirstChange, selectedHullConfig, totalEarned]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!selectedHull) return;
    changeHullMutation.mutate({ hullId: selectedHull as 'combat' | 'industrial' | 'scientific' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-slate-600 bg-slate-800/95 p-6 shadow-xl max-h-[90vh] overflow-y-auto mx-4">
        <h2 className="text-lg font-bold text-slate-100">Changer de coque</h2>
        <p className="mt-1 text-sm text-slate-400">
          Choisissez une nouvelle coque pour votre vaisseau amiral.
        </p>

        {/* Hull cards */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {hulls.map((hull: any) => {
            const isCurrent = hull.id === flagship.hullId;
            const isSelected = selectedHull === hull.id;
            const styles = HULL_STYLES[hull.id] ?? HULL_STYLES.combat;

            return (
              <button
                key={hull.id}
                type="button"
                disabled={isCurrent}
                onClick={() => { setSelectedHull(hull.id); setShowConfirm(false); }}
                className={cn(
                  'rounded-lg border-2 p-3 text-left transition-all',
                  isCurrent
                    ? 'border-emerald-500/50 bg-emerald-500/5 cursor-default'
                    : isSelected
                      ? cn(styles.border, 'ring-2', styles.ring, 'bg-blue-500/10')
                      : 'border-slate-600 bg-slate-800/60 hover:border-slate-500 hover:bg-slate-700/40',
                )}
              >
                {isCurrent && (
                  <span className="inline-block mb-1.5 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
                    Coque actuelle
                  </span>
                )}
                <div className={cn(
                  'text-sm font-semibold',
                  isCurrent ? 'text-emerald-300' : isSelected ? styles.accent : 'text-slate-200',
                )}>
                  {hull.name}
                </div>
                <p className="mt-1 text-[11px] text-slate-400 leading-snug">{hull.description}</p>
                <ul className="mt-2 space-y-0.5">
                  {(hull.bonusLabels ?? []).map((bonus: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-400">
                      <span className={cn(
                        'mt-0.5 shrink-0',
                        isCurrent ? 'text-emerald-400/60' : isSelected ? styles.icon : 'text-slate-500',
                      )}>+</span>
                      <span>{bonus}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Cost & info */}
        {selectedHull && selectedHullConfig && (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-600/50 bg-slate-900/50 p-4">
            {/* Cost display */}
            <div>
              <div className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1">Cout</div>
              {isFirstChange ? (
                <p className="text-sm font-semibold text-emerald-400">
                  Premier changement gratuit
                </p>
              ) : cost ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {(['minerai', 'silicium', 'hydrogene'] as const).map((res) => (
                    <span key={res} className={cn('font-mono font-semibold', RESOURCE_COLORS[res])}>
                      {fmt(cost[res])} <span className="text-xs font-normal">{RESOURCE_LABELS[res]}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Refit & cooldown info */}
            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <ClockIcon className="h-3 w-3 text-amber-400/70 shrink-0" />
                <span>Le vaisseau sera indisponible pendant <span className="text-amber-300 font-medium">{formatDuration(selectedHullConfig.unavailabilitySeconds)}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wrench className="h-3 w-3 text-slate-500 shrink-0" />
                <span>Prochain changement possible dans <span className="text-slate-300 font-medium">{formatDays(selectedHullConfig.cooldownSeconds)}</span></span>
              </div>
            </div>

            {/* Error display */}
            {changeHullMutation.error && (
              <p className="text-xs text-red-400">{changeHullMutation.error.message}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Annuler
          </button>

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!selectedHull}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Changer de coque
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400">Confirmer le changement ?</span>
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Non
              </button>
              <button
                onClick={handleConfirm}
                disabled={changeHullMutation.isPending}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {changeHullMutation.isPending ? 'En cours...' : 'Oui, confirmer'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
