/**
 * OrbitalDebrisRing — decorative ring of tiny debris dots on a circular orbit.
 *
 * Renders a `<g>` (NOT a full `<svg>`), so it is meant to be embedded inside
 * a parent SVG that provides the viewBox.
 *
 * Position jitter is deterministic given `seed`, so two belts in the same
 * system (different seeds) will look different, but every re-render of the
 * same belt looks identical.
 */

export interface OrbitalDebrisRingProps {
  cx: number;
  cy: number;
  radius: number;
  count?: number;
  color?: string;
  seed?: number;
}

/** Tiny inline xorshift-ish hash → float in [0, 1). Deterministic. */
function hash01(seed: number, i: number): number {
  let h = Math.imul(seed | 0, 0x27d4eb2d) ^ 0x9e3779b9;
  h = Math.imul(h ^ (i | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

export function OrbitalDebrisRing({
  cx,
  cy,
  radius,
  count = 22,
  color = '#fb923c',
  seed = 1,
}: OrbitalDebrisRingProps) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const baseAngleDeg = (360 / count) * i;
    // ±~3° angular jitter, ±2px radial jitter, r in [0.6, 0.9].
    const angleJitter = (hash01(seed, i * 3 + 1) - 0.5) * 6;
    const radiusJitter = (hash01(seed, i * 3 + 2) - 0.5) * 4;
    const rDot = 0.6 + hash01(seed, i * 3 + 3) * 0.3;

    const angleRad = ((baseAngleDeg + angleJitter) * Math.PI) / 180;
    const r = radius + radiusJitter;
    const x = cx + r * Math.cos(angleRad);
    const y = cy + r * Math.sin(angleRad);

    dots.push(<circle key={i} cx={x} cy={y} r={rDot} fill={color} />);
  }

  return <g aria-hidden="true">{dots}</g>;
}
