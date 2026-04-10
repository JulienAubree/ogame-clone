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

import { hash01 } from './GalaxySystemView/geometry';

export interface OrbitalDebrisRingProps {
  cx: number;
  cy: number;
  radius: number;
  count?: number;
  color?: string;
  seed?: number;
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
    // ±~3° angular jitter, ±2px radial jitter, r in [0.6, 0.9).
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
