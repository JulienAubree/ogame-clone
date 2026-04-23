import { cn } from '@/lib/utils';

interface KpiTileProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}

export function KpiTile({ label, value, icon, color, onClick }: KpiTileProps) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-xl border border-border/30 bg-card/60 px-4 py-3 text-left transition-colors',
        interactive && 'hover:bg-card/80 hover:border-primary/20 cursor-pointer',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-white/5', color)}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={cn('text-lg font-bold tabular-nums leading-tight', color)}>{value}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
        </div>
      </div>
    </Tag>
  );
}
