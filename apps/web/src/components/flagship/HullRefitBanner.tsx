import { useEffect, useMemo, useRef } from 'react';
import { Wrench } from 'lucide-react';
import { useCountdownSeconds, fmtCountdown } from '@/hooks/useCountdown';

interface HullRefitBannerProps {
  name: string;
  refitEndsAt: Date;
  onComplete: () => void;
}

export function HullRefitBanner({ name, refitEndsAt, onComplete }: HullRefitBannerProps) {
  const totalDuration = useMemo(
    () => Math.max(1, Math.floor((refitEndsAt.getTime() - Date.now()) / 1000 + 3600)),
    [refitEndsAt],
  );
  const secondsLeft = useCountdownSeconds(refitEndsAt);
  const { h, m, s } = fmtCountdown(secondsLeft);
  const progress = Math.min(100, ((totalDuration - secondsLeft) / totalDuration) * 100);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const firedRef = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0 && !firedRef.current) {
      firedRef.current = true;
      setTimeout(() => onCompleteRef.current(), 500);
    }
  }, [secondsLeft]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-500/30 bg-amber-950/20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-amber-500/5 animate-pulse" />
      </div>

      <div className="relative flex flex-col sm:flex-row items-center gap-4 p-4 lg:p-5">
        <div className="relative shrink-0">
          <div className="h-20 w-20 rounded-xl bg-amber-950/40 flex items-center justify-center text-2xl font-bold text-amber-500/40 border border-amber-500/30">
            <Wrench className="h-8 w-8 text-amber-400/60" />
          </div>
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
          <div>
            <h2 className="text-lg font-black text-amber-400 uppercase tracking-tight">Changement de coque</h2>
            <p className="text-xs text-amber-300/60">
              <span className="font-semibold text-amber-300/80">{name}</span> est en cours de modification.
            </p>
          </div>

          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-linear bg-gradient-to-r from-amber-600 to-amber-400"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground/40">
              <span>Modification {Math.round(progress)}%</span>
              <span>{String(h).padStart(2, '0')}h {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
