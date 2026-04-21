import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

interface AllianceTagBadgeProps {
  tag: string;
  size?: Size;
  className?: string;
}

const SIZE_STYLES: Record<Size, { box: string; text: string; maxChars: number }> = {
  sm: { box: 'w-7 h-8', text: 'text-[10px]', maxChars: 2 },
  md: { box: 'w-10 h-11', text: 'text-xs', maxChars: 3 },
  lg: { box: 'w-12 h-14', text: 'text-sm', maxChars: 3 },
};

export function AllianceTagBadge({ tag, size = 'md', className }: AllianceTagBadgeProps) {
  const styles = SIZE_STYLES[size];
  const label = tag.slice(0, styles.maxChars).toUpperCase();
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-slate-900/70 border border-amber-500/40',
        styles.box,
        className,
      )}
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%)' }}
      title={tag}
    >
      <span className={cn('font-bold text-amber-400 tracking-wider', styles.text)}>{label}</span>
    </div>
  );
}
