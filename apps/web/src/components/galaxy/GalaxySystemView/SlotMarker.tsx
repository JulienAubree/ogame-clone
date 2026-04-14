/**
 * SlotMarker — renders ONE slot on the orbital canvas as an SVG `<g>`.
 *
 * Returns a `<g>` (not a full `<svg>`) so it composes inside a parent SVG
 * that owns the viewBox / transform stack. Do NOT swap for `<PlanetDot>` here:
 * that component returns its own `<svg>` and is meant for the ribbon / detail
 * panel, not for use inside another SVG.
 *
 * Belts return `null` — the parent (OrbitalCanvas) renders one
 * `<OrbitalDebrisRing>` per belt position, sized to the orbit, not to the slot.
 */

import { useId, type KeyboardEvent, type ReactElement } from 'react';
import { TYPE_COLORS, AURA_COLORS } from '../planetPalette';
import type { SlotView } from './slotView';

/**
 * Radii and tick offsets for the slot marker geometry, in the orbital
 * canvas coordinate system. Grouped here so the visual scale is easy to
 * tune in one place.
 */
const SLOT_RADII = {
  PLANET: 4.5,
  HALO: 14,
  HALO_HOVER: 15.4,
  UNKNOWN: 4.5,
  UNKNOWN_HOVER: 5.0,
  SELECTION: 14,
  TICK_INNER: 11,
  TICK_OUTER: 17,
} as const;

/**
 * Props for {@link SlotMarker}.
 *
 * Returns null when view.kind === 'belt' — parent renders OrbitalDebrisRing
 * at orbit scale instead.
 */
export interface SlotMarkerProps {
  view: SlotView;
  cx: number;
  cy: number;
  isSelected: boolean;
  isHovered: boolean;
  onClick: (position: number) => void;
  onHoverChange: (position: number | null) => void;
}

function ariaLabelFor(view: SlotView): string {
  switch (view.kind) {
    case 'planet': {
      const isColonizing = view.relation === 'mine' && view.status === 'colonizing';
      const rel = isColonizing
        ? 'colonisation en cours'
        : view.relation === 'mine'
          ? 'votre planète'
          : view.relation === 'ally'
            ? 'planète alliée'
            : 'planète hostile';
      return `Position ${view.position}, ${view.planetName}, ${rel}`;
    }
    case 'empty-discovered':
      return `Position ${view.position}, libre, type ${view.planetClassId}`;
    case 'undiscovered':
      return `Position ${view.position}, inconnu`;
    case 'belt':
      return `Position ${view.position}, ceinture d'astéroïdes`;
  }
}

export function SlotMarker({
  view,
  cx,
  cy,
  isSelected,
  isHovered,
  onClick,
  onHoverChange,
}: SlotMarkerProps): ReactElement | null {
  // Hooks must be called unconditionally — do the early return AFTER.
  const rawId = useId();

  // Belts are rendered by the parent as orbit-scaled debris rings.
  if (view.kind === 'belt') return null;

  const haloGradId = `slot-${rawId}-halo`;
  const planetGradId = `slot-${rawId}-planet`;
  const undiscoveredGradId = `slot-${rawId}-unknown`;

  const handleKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(view.position);
    }
  };

  const haloRadius = isHovered ? SLOT_RADII.HALO_HOVER : SLOT_RADII.HALO;

  let body: ReactElement | null = null;
  let defs: ReactElement | null = null;

  if (view.kind === 'planet') {
    const isColonizing = view.relation === 'mine' && view.status === 'colonizing';
    const colors = TYPE_COLORS[view.planetClassId ?? 'unknown'] ?? TYPE_COLORS.unknown;
    const auraColor = isColonizing ? AURA_COLORS.colonizing : AURA_COLORS[view.relation];

    defs = (
      <defs>
        <radialGradient id={haloGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={auraColor} stopOpacity={0.7} />
          <stop offset="100%" stopColor={auraColor} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={planetGradId} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={colors.accent} />
          <stop offset="50%" stopColor={colors.from} />
          <stop offset="100%" stopColor={colors.to} />
        </radialGradient>
      </defs>
    );

    body = (
      <>
        <circle
          cx={cx}
          cy={cy}
          r={haloRadius}
          fill={`url(#${haloGradId})`}
          className={isColonizing ? 'animate-colonizing-pulse' : 'animate-aura-breathe'}
        />
        <circle cx={cx} cy={cy} r={SLOT_RADII.PLANET} fill={`url(#${planetGradId})`} />
        <circle
          cx={cx}
          cy={cy}
          r={SLOT_RADII.PLANET}
          fill="none"
          stroke={isColonizing ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.15)'}
          strokeWidth={isColonizing ? 0.8 : 0.4}
        />
      </>
    );
  } else if (view.kind === 'empty-discovered') {
    const colors = TYPE_COLORS[view.planetClassId] ?? TYPE_COLORS.unknown;

    defs = (
      <defs>
        <radialGradient id={planetGradId} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={colors.accent} />
          <stop offset="50%" stopColor={colors.from} />
          <stop offset="100%" stopColor={colors.to} />
        </radialGradient>
      </defs>
    );

    body = (
      <>
        <circle cx={cx} cy={cy} r={SLOT_RADII.PLANET} fill={`url(#${planetGradId})`} />
        <circle
          cx={cx}
          cy={cy}
          r={SLOT_RADII.PLANET}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={0.4}
        />
      </>
    );
  } else {
    // undiscovered
    defs = (
      <defs>
        <radialGradient id={undiscoveredGradId} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="60%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </radialGradient>
      </defs>
    );
    body = (
      <circle
        cx={cx}
        cy={cy}
        r={isHovered ? SLOT_RADII.UNKNOWN_HOVER : SLOT_RADII.UNKNOWN}
        fill={`url(#${undiscoveredGradId})`}
      />
    );
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={ariaLabelFor(view)}
      aria-pressed={isSelected}
      style={{ cursor: 'pointer' }}
      onClick={() => onClick(view.position)}
      onMouseEnter={() => onHoverChange(view.position)}
      onMouseLeave={() => onHoverChange(null)}
      onKeyDown={handleKeyDown}
    >
      {defs}
      {body}
      {isSelected && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={SLOT_RADII.SELECTION}
            fill="none"
            stroke="#fffbe8"
            strokeWidth={0.8}
            strokeDasharray="4 4"
            className="animate-selection-rotate"
          />
          <line
            x1={cx}
            y1={cy - SLOT_RADII.TICK_OUTER}
            x2={cx}
            y2={cy - SLOT_RADII.TICK_INNER}
            stroke="#fffbe8"
            strokeWidth={0.8}
          />
          <line
            x1={cx}
            y1={cy + SLOT_RADII.TICK_INNER}
            x2={cx}
            y2={cy + SLOT_RADII.TICK_OUTER}
            stroke="#fffbe8"
            strokeWidth={0.8}
          />
          <line
            x1={cx - SLOT_RADII.TICK_OUTER}
            y1={cy}
            x2={cx - SLOT_RADII.TICK_INNER}
            y2={cy}
            stroke="#fffbe8"
            strokeWidth={0.8}
          />
          <line
            x1={cx + SLOT_RADII.TICK_INNER}
            y1={cy}
            x2={cx + SLOT_RADII.TICK_OUTER}
            y2={cy}
            stroke="#fffbe8"
            strokeWidth={0.8}
          />
        </>
      )}
    </g>
  );
}
