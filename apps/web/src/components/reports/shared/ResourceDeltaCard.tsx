import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { cn } from '@/lib/utils';

type Variant = 'loss' | 'gain' | 'debris' | 'neutral';

interface ResourceDeltaCardProps {
  title: string;
  cargo: { minerai?: number; silicium?: number; hydrogene?: number };
  variant: Variant;
  explainer?: string;
}

const VARIANT_STYLES: Record<Variant, { text: string; border: string; bg: string; prefix: string }> = {
  gain: { text: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', prefix: '+' },
  loss: { text: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5', prefix: '−' },
  debris: { text: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5', prefix: '' },
  neutral: { text: 'text-foreground', border: 'border-border', bg: '', prefix: '' },
};

const fmt = (n: number) => Math.floor(n).toLocaleString('fr-FR');

export function ResourceDeltaCard({ title, cargo, variant, explainer }: ResourceDeltaCardProps) {
  const styles = VARIANT_STYLES[variant];
  const minerai = cargo.minerai ?? 0;
  const silicium = cargo.silicium ?? 0;
  const hydrogene = cargo.hydrogene ?? 0;
  if (minerai <= 0 && silicium <= 0 && hydrogene <= 0) return null;

  return (
    <div className={cn('glass-card p-4 border', styles.border, styles.bg)}>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h3>
      <div className="flex flex-wrap gap-4 text-sm">
        {minerai > 0 && (
          <span className="flex items-center gap-1.5">
            <MineraiIcon size={14} className="text-minerai" />
            <span className={cn('tabular-nums font-medium', styles.text)}>
              {styles.prefix}{fmt(minerai)}
            </span>
          </span>
        )}
        {silicium > 0 && (
          <span className="flex items-center gap-1.5">
            <SiliciumIcon size={14} className="text-silicium" />
            <span className={cn('tabular-nums font-medium', styles.text)}>
              {styles.prefix}{fmt(silicium)}
            </span>
          </span>
        )}
        {hydrogene > 0 && (
          <span className="flex items-center gap-1.5">
            <HydrogeneIcon size={14} className="text-hydrogene" />
            <span className={cn('tabular-nums font-medium', styles.text)}>
              {styles.prefix}{fmt(hydrogene)}
            </span>
          </span>
        )}
      </div>
      {explainer && <p className="text-[11px] text-muted-foreground mt-2 italic">{explainer}</p>}
    </div>
  );
}
