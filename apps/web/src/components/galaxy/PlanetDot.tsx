const TYPE_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  volcanic:  { from: '#ef4444', to: '#f97316', accent: '#fbbf24' },
  arid:      { from: '#d97706', to: '#92400e', accent: '#fbbf24' },
  temperate: { from: '#22c55e', to: '#3b82f6', accent: '#86efac' },
  glacial:   { from: '#93c5fd', to: '#e0f2fe', accent: '#ffffff' },
  gaseous:   { from: '#a855f7', to: '#ec4899', accent: '#e879f9' },
  homeworld: { from: '#22d3ee', to: '#10b981', accent: '#a7f3d0' },
  unknown:   { from: '#52525b', to: '#27272a', accent: '#a1a1aa' },
};

export function PlanetDot({ planetClassId, size = 20 }: { planetClassId: string | null; size?: number }) {
  const colors = TYPE_COLORS[planetClassId ?? 'unknown'] ?? TYPE_COLORS.unknown;
  const id = `planet-${planetClassId ?? 'unknown'}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="planet-dot"
    >
      <defs>
        <radialGradient id={id} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={colors.accent} />
          <stop offset="50%" stopColor={colors.from} />
          <stop offset="100%" stopColor={colors.to} />
        </radialGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill={`url(#${id})`} />
      <circle cx="10" cy="10" r="9" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
    </svg>
  );
}
