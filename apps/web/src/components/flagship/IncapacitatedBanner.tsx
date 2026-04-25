import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { trpc } from '@/trpc';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getFlagshipImageUrl } from '@/lib/assets';
import { useCountdownSeconds, fmtCountdown } from '@/hooks/useCountdown';

interface IncapacitatedBannerProps {
  name: string;
  repairEndsAt: Date;
  flagshipImageIndex: number | null;
  hullId: string;
  onRepaired: () => void;
  balance: number;
}

export function IncapacitatedBanner({
  name,
  repairEndsAt,
  flagshipImageIndex,
  hullId,
  onRepaired,
  balance,
}: IncapacitatedBannerProps) {
  const utils = trpc.useUtils();
  const [confirmRepair, setConfirmRepair] = useState(false);
  const repairMutation = trpc.flagship.repair.useMutation({
    onSuccess: () => {
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      onRepaired();
    },
  });
  const repairCost = 2;
  const totalDuration = useMemo(
    () => Math.max(1, Math.floor((repairEndsAt.getTime() - Date.now()) / 1000 + 7200)),
    [repairEndsAt],
  );
  const secondsLeft = useCountdownSeconds(repairEndsAt);
  const { h, m, s } = fmtCountdown(secondsLeft);
  const progress = Math.min(100, ((totalDuration - secondsLeft) / totalDuration) * 100);

  const onRepairedRef = useRef(onRepaired);
  onRepairedRef.current = onRepaired;
  const firedRef = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0 && !firedRef.current) {
      firedRef.current = true;
      setTimeout(() => onRepairedRef.current(), 500);
    }
  }, [secondsLeft]);

  return (
    <>
      <div className="relative overflow-hidden rounded-lg border border-red-500/30 bg-red-950/20">
        {/* Subtle pulse background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-red-500/5 animate-pulse" />
        </div>

        <div className="relative flex flex-col sm:flex-row items-center gap-4 p-4 lg:p-5">
          {/* Flagship image */}
          <div className="relative shrink-0">
            {flagshipImageIndex ? (
              <img
                src={getFlagshipImageUrl(hullId, flagshipImageIndex, 'thumb')}
                alt={name}
                className="h-20 w-20 rounded-xl object-cover border border-red-500/30 grayscale opacity-60"
              />
            ) : (
              <div className="h-20 w-20 rounded-xl bg-red-950/40 flex items-center justify-center text-2xl font-bold text-red-500/40 border border-red-500/30">
                VA
              </div>
            )}
            <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-red-600 border-2 border-red-400 flex items-center justify-center shadow-lg shadow-red-500/30">
              <AlertTriangle className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
            <div>
              <h2 className="text-lg font-black text-red-400 uppercase tracking-tight">Vaisseau incapacité</h2>
              <p className="text-xs text-red-300/60">
                <span className="font-semibold text-red-300/80">{name}</span> a été mis hors service au combat.
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-1000 ease-linear bg-gradient-to-r from-red-600 to-red-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground/40">
                <span>Reparation {Math.round(progress)}%</span>
                <span>{String(h).padStart(2, '0')}h {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s</span>
              </div>
            </div>
          </div>

          {/* Repair button */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <button
              onClick={() => setConfirmRepair(true)}
              disabled={balance < repairCost || repairMutation.isPending}
              className="px-4 py-2 rounded-lg font-semibold text-xs transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20 whitespace-nowrap"
            >
              {repairMutation.isPending ? 'Reparation...' : `Reparer (${repairCost} Exilium)`}
            </button>
            {balance < repairCost && (
              <p className="text-[10px] text-red-400/70">Solde insuffisant</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRepair}
        onConfirm={() => repairMutation.mutate()}
        onCancel={() => setConfirmRepair(false)}
        title="Reparer immediatement ?"
        description={`Cout : ${repairCost} Exilium. Votre vaisseau sera immediatement operationnel.`}
        confirmLabel="Reparer"
      />
    </>
  );
}
