import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCountdownString } from '@/hooks/useCountdown';

/** Convoy countdown — vert qui clignote quand l'arrivée est proche. */
export function ConvoyCountdown({ arrivalTime }: { arrivalTime: string }) {
  const display = useCountdownString(new Date(arrivalTime));
  const hoursLeft = (new Date(arrivalTime).getTime() - Date.now()) / (1000 * 60 * 60);
  return (
    <span className={cn(
      'font-mono text-sm tabular-nums font-bold',
      hoursLeft < 0.25 ? 'text-emerald-300' : 'text-emerald-400',
    )}>
      {display}
    </span>
  );
}

/** Raid countdown — passe au rouge urgent quand l'arrivée approche. */
export function RaidCountdown({ arrivalTime }: { arrivalTime: string }) {
  const display = useCountdownString(new Date(arrivalTime));
  const hoursLeft = (new Date(arrivalTime).getTime() - Date.now()) / (1000 * 60 * 60);
  return (
    <span className={cn(
      'font-mono text-sm tabular-nums font-bold',
      hoursLeft < 0.5 ? 'text-red-400 animate-pulse' : hoursLeft < 1 ? 'text-red-400' : hoursLeft < 2 ? 'text-orange-400' : 'text-amber-400',
    )}>
      {display}
    </span>
  );
}

/** Bonus countdown compact — sans coloration spéciale. */
export function BonusCountdown({ target }: { target: Date }) {
  const display = useCountdownString(target);
  return <span className="font-mono tabular-nums">{display}</span>;
}

/** Deadline countdown — pour les délais grace period / outpost timeout. */
export function DeadlineCountdown({ target, tone }: { target: Date; tone: 'warn' | 'info' }) {
  const display = useCountdownString(target);
  const hoursLeft = (target.getTime() - Date.now()) / (1000 * 60 * 60);
  const urgent = hoursLeft < 4;
  const colorClass = tone === 'warn'
    ? urgent ? 'text-red-400' : hoursLeft < 12 ? 'text-orange-400' : 'text-amber-400'
    : hoursLeft < 0.25 ? 'text-orange-400' : 'text-emerald-400';
  return (
    <span className={cn('font-mono text-sm tabular-nums font-bold', colorClass)}>
      {display}
    </span>
  );
}

/** Petit chevron rotatif pour les sections expandable. */
export function IconChevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180', className)} />;
}
