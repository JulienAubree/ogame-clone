import { useState } from 'react';
import { getAssetUrl, type AssetCategory, type AssetSize } from '@/lib/assets';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

interface GameImageProps {
  category: AssetCategory;
  id: string;
  size?: AssetSize;
  alt: string;
  className?: string;
}

const FALLBACK_COLORS = [
  'bg-primary/20 text-primary',
  'bg-minerai/20 text-minerai',
  'bg-silicium/20 text-silicium',
  'bg-hydrogene/20 text-hydrogene',
  'bg-energy/20 text-energy',
];

function getFallbackColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export function GameImage({ category, id, size = 'full', alt, className }: GameImageProps) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (error) {
    const initial = alt.charAt(0).toUpperCase();
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded font-semibold font-mono border border-dashed border-border',
          getFallbackColor(id),
          className,
        )}
      >
        {initial}
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {loading && <Skeleton className={cn('absolute inset-0', className)} />}
      <img
        src={getAssetUrl(category, id, size)}
        alt={alt}
        className={cn(className, loading && 'opacity-0')}
        onError={() => { setError(true); setLoading(false); }}
        onLoad={() => setLoading(false)}
        loading="lazy"
      />
    </div>
  );
}
