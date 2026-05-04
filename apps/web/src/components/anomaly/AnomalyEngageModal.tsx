import { useState } from 'react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { Button } from '@/components/ui/button';
import { Zap, Sparkles, Wrench, X, Star } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AnomalyEngageModal({ open, onClose }: Props) {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const [confirming, setConfirming] = useState(false);

  const { data: flagship } = trpc.flagship.get.useQuery(undefined, { enabled: open });
  const { data: gameConfig } = useGameConfig();  // wraps trpc.gameConfig.getAll
  const { data: exilium } = trpc.exilium.getBalance.useQuery(undefined, { enabled: open });

  const cost = Number(gameConfig?.universe?.anomaly_entry_cost_exilium) || 5;
  const repairCharges = Number(gameConfig?.universe?.anomaly_repair_charges_per_run) || 3;
  const balance = exilium?.balance ?? 0;
  const insufficientFunds = balance < cost;

  const engageMutation = trpc.anomaly.engage.useMutation({
    onSuccess: () => {
      addToast(`✨ Anomaly engagée — flagship en mission`, 'success');
      utils.anomaly.current.invalidate();
      utils.exilium.getBalance.invalidate();
      utils.flagship.get.invalidate();
      onClose();
    },
    onError: (err) => addToast(err.message ?? 'Engage impossible', 'error'),
  });

  if (!open) return null;
  if (!flagship) return null;

  function handleEngage() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    engageMutation.mutate({ ships: {} });
  }

  const hullName = flagship.hullConfig?.name ?? 'Flagship';
  const effectiveStats = flagship.effectiveStats as Record<string, number | string> | null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Engager une anomalie
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-400 leading-relaxed">
          Votre <strong>{hullName}</strong> part seul dans l'anomalie. Pas d'escorte —
          vos modules équipés et vos charges réparation feront la différence.
        </p>

        <div className="rounded-md bg-panel-light/50 border border-panel-border p-3 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Hull</span><span>{effectiveStats?.hull ?? flagship.hull}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Bouclier</span><span>{effectiveStats?.shield ?? flagship.shield}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Armes</span><span>{effectiveStats?.weapons ?? flagship.weapons}</span></div>
          <div className="flex justify-between">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Star className="h-3 w-3" /> Niveau pilote
            </span>
            <span>
              {(flagship as { level?: number }).level ?? 1}
              {' '}
              (×{(1 + ((flagship as { level?: number }).level ?? 1) * 0.05).toFixed(2)} stats)
            </span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-panel-border/50">
            <span className="text-gray-500 flex items-center gap-1.5"><Wrench className="h-3 w-3" /> Charges réparation</span>
            <span>{repairCharges}/{repairCharges}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm border-t border-panel-border pt-3">
          <span className="text-gray-500 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-purple-400" /> Coût
          </span>
          <span className={insufficientFunds ? 'text-red-400 font-bold' : 'font-bold'}>
            {cost} Exilium {insufficientFunds && '(insuffisant)'}
          </span>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleEngage}
            disabled={insufficientFunds || engageMutation.isPending}
          >
            {confirming ? 'Confirmer ?' : engageMutation.isPending ? 'Engage…' : 'Engager'}
          </Button>
        </div>
      </div>
    </div>
  );
}
