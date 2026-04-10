/**
 * Pure geometry helpers for the galaxy system view.
 *
 * No React, no DOM, no imports — safe to unit test in isolation (when we have tests).
 *
 * Angle convention: 0° points east (positive X). Because this helper is
 * intended for SVG consumers (Y axis grows downward), positive angles rotate
 * CLOCKWISE on screen — i.e. 90° is south, 180° is west, 270° is north.
 * Pick this convention and do not flip it later or everything will mirror.
 */

export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

/**
 * Deterministic hash → angle in [0, 360) for a given orbital slot.
 *
 * Same (galaxy, system, position) MUST always return the same angle.
 * Uses a small Math.imul-based integer mix (xorshift-flavored).
 *
 * IMPORTANT: Stable across deploys — do not change without a migration plan,
 * otherwise every existing system will visually shuffle its planets.
 */
export function slotAngle(galaxy: number, system: number, position: number): number {
  let h = Math.imul(galaxy | 0, 0x27d4eb2d) ^ 0x9e3779b9;
  h = Math.imul(h ^ (system | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (position | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  // Force unsigned, then map to [0, 360).
  const u = h >>> 0;
  return (u % 36000) / 100;
}

/**
 * Radius of the orbit for a given position (1..totalPositions).
 *
 * Strictly monotone increasing in `position`. Inner orbits are packed slightly
 * tighter than outer ones (gentle power easing, exponent > 1) to mimic real
 * planetary systems. Guaranteed to stay within `canvasSize / 2 - margin`.
 */
export function orbitRadius(position: number, totalPositions: number, canvasSize: number): number {
  const margin = 24;
  const maxRadius = canvasSize / 2 - margin;
  const minRadius = Math.min(40, maxRadius * 0.2);
  const n = Math.max(totalPositions, 1);
  // t in (0, 1], using position so position=1 is innermost.
  const t = position / n;
  // Power easing with exponent > 1 → inner orbits packed tighter,
  // outer orbits spaced more generously.
  const eased = Math.pow(t, 1.4);
  return minRadius + (maxRadius - minRadius) * eased;
}
