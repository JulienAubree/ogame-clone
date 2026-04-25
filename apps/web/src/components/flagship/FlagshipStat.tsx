import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const STAT_VARIANTS: Record<string, { iconBg: string; valueColor: string; iconColor: string }> = {
  shield: { iconBg: 'bg-sky-400/10', valueColor: 'text-sky-400', iconColor: 'text-sky-400' },
  armor: { iconBg: 'bg-amber-400/10', valueColor: 'text-amber-400', iconColor: 'text-amber-400' },
  hull: { iconBg: 'bg-slate-400/10', valueColor: 'text-slate-200', iconColor: 'text-slate-400' },
  weapons: { iconBg: 'bg-red-400/10', valueColor: 'text-red-400', iconColor: 'text-red-400' },
  shots: { iconBg: 'bg-purple-400/10', valueColor: 'text-purple-400', iconColor: 'text-purple-400' },
};

const fmt = (n: number) => n.toLocaleString('fr-FR');

interface FlagshipStatProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  base?: number;
  bonus?: number;
  variant: string;
  wide?: boolean;
}

export function FlagshipStat({ icon, label, value, base, bonus, variant, wide }: FlagshipStatProps) {
  const v = STAT_VARIANTS[variant] ?? STAT_VARIANTS.hull;
  const hasBonus = bonus != null && bonus !== 0 && typeof bonus === 'number';
  return (
    <div className={cn(
      'flex items-center gap-2.5 bg-[#0f172a] rounded-lg p-2.5 border border-transparent hover:border-[#334155] transition-colors',
      wide && 'col-span-2',
    )}>
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', v.iconBg)}>
        <span className={v.iconColor}>{icon}</span>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
        <div className={cn('text-base font-bold font-mono leading-tight', v.valueColor)}>
          {typeof value === 'number' ? fmt(value) : value}
        </div>
        {hasBonus && (
          <div className="text-[9px] text-emerald-500">
            base {fmt(base!)} · {bonus > 0 ? '+' : ''}{fmt(bonus)}
          </div>
        )}
      </div>
    </div>
  );
}
