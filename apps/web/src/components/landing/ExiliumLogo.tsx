interface ExiliumLogoProps {
  className?: string;
  text?: string;
}

/**
 * Stylized EXILIUM wordmark. Two-layer construction so we get the
 * "metal cut" look from the reference: a base lettering filled with a
 * vertical brushed gradient, plus a thin highlight stroke at the very top.
 *
 * Uses a system font with extreme tracking — keeps the bundle clean
 * (no webfonts) while staying legible. The stroke + gradient masks do the
 * heavy lifting visually.
 */
export function ExiliumLogo({ className = 'h-7', text = 'EXILIUM' }: ExiliumLogoProps) {
  const gradId = 'exilium-logo-grad';
  const highlightId = 'exilium-logo-highlight';
  return (
    <svg
      viewBox="0 0 360 60"
      className={className}
      role="img"
      aria-label={text}
      preserveAspectRatio="xMinYMid meet"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(210, 25%, 95%)" />
          <stop offset="40%" stopColor="hsl(210, 20%, 80%)" />
          <stop offset="55%" stopColor="hsl(210, 15%, 55%)" />
          <stop offset="100%" stopColor="hsl(210, 25%, 75%)" />
        </linearGradient>
        <linearGradient id={highlightId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(195, 100%, 95%)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(200, 85%, 65%)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <text
        x="0"
        y="42"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'"
        fontSize="40"
        fontWeight="900"
        letterSpacing="6"
        fill={`url(#${gradId})`}
      >
        {text}
      </text>
      {/* Top highlight band — gives the "rivet" / metal-cut feel */}
      <text
        x="0"
        y="42"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'"
        fontSize="40"
        fontWeight="900"
        letterSpacing="6"
        fill="none"
        stroke={`url(#${highlightId})`}
        strokeWidth="0.6"
      >
        {text}
      </text>
    </svg>
  );
}
