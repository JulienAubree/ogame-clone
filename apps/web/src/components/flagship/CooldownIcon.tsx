import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CooldownIconProps {
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
  icon: ReactNode;
}

/**
 * Icône avec progression radiale (style WoW).
 * Le SVG est custom (animation stroke-dashoffset) — on garde l'inline.
 */
export function CooldownIcon({ secondsLeft, totalSeconds, size = 32, icon }: CooldownIconProps) {
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700/50" />
        {/* Sweep overlay */}
        {progress > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="text-cyan-400/80 transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        )}
      </svg>
      {/* Dark overlay when on cooldown */}
      {progress > 0 && (
        <div
          className="absolute inset-0 rounded-full bg-slate-900/60"
          style={{
            background: `conic-gradient(transparent ${(1 - progress) * 360}deg, rgba(15,23,42,0.7) ${(1 - progress) * 360}deg)`,
          }}
        />
      )}
      {/* Icon */}
      <div className={cn('relative z-10', progress > 0 ? 'opacity-50' : '')}>
        {icon}
      </div>
    </div>
  );
}
