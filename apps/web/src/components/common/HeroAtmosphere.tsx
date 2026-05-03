interface HeroAtmosphereProps {
  /** Image to use as blurred backdrop. Falls back to the gradient if missing. */
  imageUrl?: string | null;
  /** Tint variant — controls the colored wash applied over the blurred image. */
  variant?: 'cyan-purple' | 'cyan-cyan' | 'gold-red' | 'green-cyan' | 'indigo';
  /** Fallback gradient (used when no imageUrl). Overrides the variant default. */
  fallbackGradient?: string;
}

const TINT_CLASSES: Record<NonNullable<HeroAtmosphereProps['variant']>, string> = {
  'cyan-purple': 'bg-gradient-to-br from-cyan-950/50 via-slate-950/45 to-purple-950/50',
  'cyan-cyan': 'bg-gradient-to-br from-cyan-950/50 via-slate-950/45 to-cyan-900/40',
  'gold-red': 'bg-gradient-to-br from-amber-950/50 via-slate-950/45 to-red-950/50',
  'green-cyan': 'bg-gradient-to-br from-emerald-950/45 via-slate-950/45 to-cyan-950/45',
  indigo: 'bg-gradient-to-br from-indigo-950/55 via-purple-900/30 to-slate-950/50',
};

const FALLBACK_GRADIENTS: Record<NonNullable<HeroAtmosphereProps['variant']>, string> = {
  'cyan-purple': 'bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950',
  'cyan-cyan': 'bg-gradient-to-br from-cyan-950 via-slate-900/70 to-slate-950',
  'gold-red': 'bg-gradient-to-br from-amber-950 via-red-900/50 to-slate-950',
  'green-cyan': 'bg-gradient-to-br from-emerald-950 via-cyan-900/50 to-slate-950',
  indigo: 'bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950',
};

/**
 * Atmospheric backdrop for hero sections. Lives entirely inside its parent's
 * box (no horizontal nor vertical bleed) — clipping is the parent's job
 * (it should set `overflow-hidden`).
 *
 * Three layers, top-down:
 *   1. Blurred key art (or fallback tinted gradient).
 *   2. Colored wash so the image picks up the brand.
 *   3. Vertical fade into the page surface so titles/CTAs stay legible.
 */
export function HeroAtmosphere({
  imageUrl,
  variant = 'cyan-purple',
  fallbackGradient,
}: HeroAtmosphereProps) {
  const fallback = fallbackGradient ?? FALLBACK_GRADIENTS[variant];

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full scale-110 object-cover opacity-50 blur-sm"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : (
        <div className={`h-full w-full ${fallback}`} />
      )}
      <div className={`absolute inset-0 ${TINT_CLASSES[variant]}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
    </div>
  );
}
