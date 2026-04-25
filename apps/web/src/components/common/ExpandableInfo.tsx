import { useState, type ReactNode } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Accent = 'amber' | 'emerald' | 'blue' | 'red' | 'muted';

const COLOR_MAP: Record<Accent, string> = {
  amber: 'text-amber-300 hover:text-amber-200 border-amber-500/30 bg-amber-500/5',
  emerald: 'text-emerald-300 hover:text-emerald-200 border-emerald-500/30 bg-emerald-500/5',
  blue: 'text-blue-300 hover:text-blue-200 border-blue-500/30 bg-blue-500/5',
  red: 'text-red-300 hover:text-red-200 border-red-500/30 bg-red-500/5',
  muted: 'text-muted-foreground hover:text-foreground border-border/30 bg-card/40',
};

const BTN_COLOR: Record<Accent, string> = {
  amber: 'text-amber-400/70 hover:text-amber-300',
  emerald: 'text-emerald-400/70 hover:text-emerald-300',
  blue: 'text-blue-400/70 hover:text-blue-300',
  red: 'text-red-400/70 hover:text-red-300',
  muted: 'text-muted-foreground/70 hover:text-foreground',
};

/**
 * Section repliable avec un libellé "info" coloré et un panneau dépliant.
 * Pattern utilisé pour les infos contextuelles (page colonisation, etc.).
 */
export function ExpandableInfo({
  label,
  accent,
  children,
}: {
  label: string;
  accent: Accent;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          BTN_COLOR[accent],
        )}
      >
        <Info className="h-3 w-3" />
        <span>{label}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className={cn('mt-2 rounded-lg border p-3 text-[11px] leading-relaxed space-y-2', COLOR_MAP[accent])}>
          {children}
        </div>
      )}
    </>
  );
}
