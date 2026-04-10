import { useId } from 'react';

const TYPE_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  volcanic:  { from: '#ef4444', to: '#f97316', accent: '#fbbf24' },
  arid:      { from: '#d97706', to: '#92400e', accent: '#fbbf24' },
  temperate: { from: '#22c55e', to: '#3b82f6', accent: '#86efac' },
  glacial:   { from: '#93c5fd', to: '#e0f2fe', accent: '#ffffff' },
  gaseous:   { from: '#a855f7', to: '#ec4899', accent: '#e879f9' },
  homeworld: { from: '#22d3ee', to: '#10b981', accent: '#a7f3d0' },
  unknown:   { from: '#52525b', to: '#27272a', accent: '#a1a1aa' },
};

const AURA_COLORS: Record<'mine' | 'ally' | 'enemy', string> = {
  mine:  '#67e8f9', // cyan
  ally:  '#60a5fa', // blue
  enemy: '#f87171', // red
};

export type PlanetAura = 'mine' | 'ally' | 'enemy' | null;

export function PlanetDot({
  planetClassId,
  size = 20,
  aura = null,
}: {
  planetClassId: string | null;
  size?: number;
  aura?: PlanetAura;
}) {
  const colors = TYPE_COLORS[planetClassId ?? 'unknown'] ?? TYPE_COLORS.unknown;
  // Stable, unique gradient ids per instance (SSR-safe, survives re-renders).
  const reactId = useId();
  const planetGradId = `planet-${planetClassId ?? 'unknown'}-${reactId}`;
  const auraGradId = `aura-${planetClassId ?? 'unknown'}-${reactId}`;
  const auraColor = aura ? AURA_COLORS[aura] : null;

  // Design choice: keep the viewBox at 20x20 even when an aura is rendered.
  // The halo sits at r=11 (vs. planet r=9) with its radial gradient fading
  // to fully transparent at 100%, so the visible glow stays inside the box.
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="planet-dot">
      <defs>
        <radialGradient id={planetGradId} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={colors.accent} />
          <stop offset="50%" stopColor={colors.from} />
          <stop offset="100%" stopColor={colors.to} />
        </radialGradient>
        {auraColor && (
          <radialGradient id={auraGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={auraColor} stopOpacity={0.7} />
            <stop offset="100%" stopColor={auraColor} stopOpacity={0} />
          </radialGradient>
        )}
      </defs>
      {auraColor && (
        <circle
          cx="10"
          cy="10"
          r="11"
          fill={`url(#${auraGradId})`}
          className="animate-aura-breathe"
        />
      )}
      <circle cx="10" cy="10" r="9" fill={`url(#${planetGradId})`} />
      <circle cx="10" cy="10" r="9" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
    </svg>
  );
}
