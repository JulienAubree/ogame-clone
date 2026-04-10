/**
 * OrbitalCanvas — central SVG composer for the galaxy system view.
 *
 * Renders a fixed 600x600 viewBox that auto-scales to its container via
 * `preserveAspectRatio="xMidYMid meet"`. No DOM measuring, no ResizeObserver.
 *
 * Composition order (back → front):
 *   1. <defs> for the star corona gradient.
 *   2. Deterministic decorative starfield background.
 *   3. 16 concentric orbit circles, stroke depending on slot kind.
 *   4. Belt debris rings (one per 'belt' view) sized to their orbit.
 *   5. Central clickable star (button: Enter / Space / click → onSelectStar).
 *   6. SlotMarker per non-belt slot at hash-derived angles.
 *
 * The `SlotMarker` already owns its gradients and selection overlay, so this
 * file intentionally stays small (no per-slot gradient defs here).
 */

import { useMemo, type ReactElement } from 'react';
import { BELT_DEBRIS_COLOR } from '../planetPalette';
import { OrbitalDebrisRing } from '../OrbitalDebrisRing';
import { hash01, orbitRadius, polarToCartesian, slotAngle } from './geometry';
import type { SlotView } from './slotView';
import { SlotMarker } from './SlotMarker';

const CANVAS_SIZE = 600;
const CENTER = CANVAS_SIZE / 2;
const STAR_OUTER_RADIUS = 26;
const STAR_CORE_RADIUS = 9;
const STARFIELD_COUNT = 60;
const TOTAL_POSITIONS = 16;

export interface OrbitalCanvasProps {
  views: SlotView[];
  galaxy: number;
  system: number;
  /** null when mode A (system-level) is active. */
  selectedPosition: number | null;
  hoveredPosition: number | null;
  onSelectPosition: (position: number) => void;
  /** Click on the central star → deselect everything → mode A. */
  onSelectStar: () => void;
  onHoverPosition: (position: number | null) => void;
}

interface StarfieldDot {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}

interface PlacedSlot {
  view: SlotView;
  cx: number;
  cy: number;
}

interface TooltipDescriptor {
  tooltipX: number;
  tooltipY: number;
  line1: string;
  line1Class: string;
  line2?: string;
  line2Class?: string;
}

const TOOLTIP_WIDTH = 180;
const TOOLTIP_HEIGHT = 48;

export function OrbitalCanvas({
  views,
  galaxy,
  system,
  selectedPosition,
  hoveredPosition,
  onSelectPosition,
  onSelectStar,
  onHoverPosition,
}: OrbitalCanvasProps): ReactElement {
  // Deterministic background starfield — only recomputes when the system changes.
  const starfield = useMemo<StarfieldDot[]>(() => {
    // Mix galaxy and system into a single seed so different systems look different,
    // but the same system is visually stable across re-renders.
    const seed = (galaxy * 7919) ^ (system * 104729);
    const dots: StarfieldDot[] = [];
    for (let i = 0; i < STARFIELD_COUNT; i++) {
      const cx = hash01(seed, i * 4 + 1) * CANVAS_SIZE;
      const cy = hash01(seed, i * 4 + 2) * CANVAS_SIZE;
      const r = 0.4 + hash01(seed, i * 4 + 3) * 0.5; // [0.4, 0.9]
      const opacity = 0.4 + hash01(seed, i * 4 + 4) * 0.6; // [0.4, 1.0]
      dots.push({ cx, cy, r, opacity });
    }
    return dots;
  }, [galaxy, system]);

  // Precompute placed (non-belt) slots. Recomputes only when views or the
  // system identity changes — NOT on hover / selection changes.
  const placedSlots = useMemo<PlacedSlot[]>(() => {
    const placed: PlacedSlot[] = [];
    for (const view of views) {
      if (view.kind === 'belt') continue;
      const angle = slotAngle(galaxy, system, view.position);
      const radius = orbitRadius(view.position, TOTAL_POSITIONS, CANVAS_SIZE);
      const { x, y } = polarToCartesian(CENTER, CENTER, radius, angle);
      placed.push({ view, cx: x, cy: y });
    }
    return placed;
  }, [views, galaxy, system]);

  // Hover tooltip — renders near the hovered slot. Belts are skipped because
  // SlotMarker returns null for them, so no hover events fire.
  const tooltip = useMemo<TooltipDescriptor | null>(() => {
    if (hoveredPosition == null) return null;
    const hit = placedSlots.find((s) => s.view.position === hoveredPosition);
    if (!hit) return null;
    const { view, cx, cy } = hit;

    let line1: string;
    let line1Class: string;
    let line2: string | undefined;
    let line2Class: string | undefined;

    switch (view.kind) {
      case 'planet': {
        line1 = view.planetName;
        line1Class = 'text-foreground';
        const username = view.username ?? 'Joueur';
        const tagPrefix = view.allianceTag ? `[${view.allianceTag}] ` : '';
        if (view.relation === 'mine') {
          line2 = 'Vous';
          line2Class = 'text-cyan-400';
        } else if (view.relation === 'ally') {
          line2 = `${tagPrefix}${username}`;
          line2Class = 'text-blue-400';
        } else {
          line2 = `${tagPrefix}${username}`;
          line2Class = 'text-red-400';
        }
        break;
      }
      case 'empty-discovered': {
        line1 = `Position ${view.position} · Vide`;
        line1Class = 'text-muted-foreground';
        break;
      }
      case 'undiscovered': {
        line1 = `Position ${view.position} · Inconnu`;
        line1Class = 'text-muted-foreground italic';
        break;
      }
      case 'belt':
        return null;
    }

    let tooltipX = cx + 14;
    let tooltipY = cy - 30;
    if (tooltipX + TOOLTIP_WIDTH > CANVAS_SIZE) {
      tooltipX = cx - 14 - TOOLTIP_WIDTH;
    }
    if (tooltipY < 0) {
      tooltipY = cy + 14;
    }

    return { tooltipX, tooltipY, line1, line1Class, line2, line2Class };
  }, [hoveredPosition, placedSlots]);

  // Accessibility summary.
  const discoveredCount = views.filter(
    (v) => v.kind === 'planet' || v.kind === 'empty-discovered',
  ).length;
  const myCount = views.filter((v) => v.kind === 'planet' && v.relation === 'mine').length;
  const ariaLabel = `Système ${galaxy}:${system}, ${discoveredCount} positions sur ${views.length} découvertes, ${myCount} vous appartiennent`;

  const handleStarKeyDown = (e: React.KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectStar();
    }
  };

  return (
    <svg
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full block"
      role="img"
      aria-label={ariaLabel}
      style={{
        background: 'radial-gradient(ellipse at 30% 20%, #1a1535 0%, #05070f 75%)',
      }}
    >
      <defs>
        <radialGradient id="starCorona" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffbe8" />
          <stop offset="25%" stopColor="#ffd97a" />
          <stop offset="60%" stopColor="#ff8438" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#ff5b1c" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Decorative background starfield. */}
      <g aria-hidden="true">
        {starfield.map((dot, i) => (
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            fill="white"
            opacity={dot.opacity}
          />
        ))}
      </g>

      {/* 16 concentric orbits, styled by slot kind. */}
      <g aria-hidden="true">
        {Array.from({ length: TOTAL_POSITIONS }, (_, i) => {
          const position = i + 1;
          const radius = orbitRadius(position, TOTAL_POSITIONS, CANVAS_SIZE);
          const view = views[i];
          const kind = view?.kind ?? 'undiscovered';

          let stroke: string;
          let strokeWidth: number;
          let strokeDasharray: string | undefined;
          let strokeOpacity: number | undefined;

          if (kind === 'belt') {
            stroke = BELT_DEBRIS_COLOR;
            strokeWidth = 0.6;
            strokeDasharray = '2 3';
            strokeOpacity = 0.45;
          } else if (kind === 'undiscovered') {
            stroke = '#6b7280';
            strokeOpacity = 0.18;
            strokeWidth = 0.7;
            strokeDasharray = '1 4';
          } else {
            // planet | empty-discovered
            stroke = '#94a3b8';
            strokeOpacity = 0.3;
            strokeWidth = 0.7;
          }

          return (
            <circle
              key={position}
              cx={CENTER}
              cy={CENTER}
              r={radius}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeOpacity={strokeOpacity}
            />
          );
        })}
      </g>

      {/* Belt debris rings — underneath slot markers so selection sits on top. */}
      <g aria-hidden="true">
        {views
          .filter((v): v is Extract<SlotView, { kind: 'belt' }> => v.kind === 'belt')
          .map((view) => (
            <OrbitalDebrisRing
              key={`belt-${view.position}`}
              cx={CENTER}
              cy={CENTER}
              radius={orbitRadius(view.position, TOTAL_POSITIONS, CANVAS_SIZE)}
              seed={Math.floor(hash01(galaxy, view.position) * 1_000_000)}
            />
          ))}
      </g>

      {/* Central star — clickable button that resets to system view (mode A). */}
      <g
        role="button"
        tabIndex={0}
        aria-label="Système — vue d'ensemble"
        onClick={onSelectStar}
        onKeyDown={handleStarKeyDown}
        style={{ cursor: 'pointer' }}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={STAR_OUTER_RADIUS}
          fill="url(#starCorona)"
          className="animate-star-breathe"
        />
        <circle cx={CENTER} cy={CENTER} r={STAR_CORE_RADIUS} fill="#fffbe8" />
      </g>

      {/* Slot markers — one per non-belt slot. */}
      {placedSlots.map(({ view, cx, cy }) => (
        <SlotMarker
          key={view.position}
          view={view}
          cx={cx}
          cy={cy}
          isSelected={selectedPosition === view.position}
          isHovered={hoveredPosition === view.position}
          onClick={onSelectPosition}
          onHoverChange={onHoverPosition}
        />
      ))}

      {/* Hover tooltip — sits on top of slot markers. */}
      {tooltip && (
        <foreignObject
          x={tooltip.tooltipX}
          y={tooltip.tooltipY}
          width={TOOLTIP_WIDTH}
          height={TOOLTIP_HEIGHT}
          style={{ pointerEvents: 'none' }}
        >
          <div className="w-full h-full rounded-md bg-black/85 border border-cyan-500/30 px-2 py-1 text-[10px] leading-tight backdrop-blur-sm">
            <div className={`font-semibold truncate ${tooltip.line1Class}`}>
              {tooltip.line1}
            </div>
            {tooltip.line2 && (
              <div className={`truncate ${tooltip.line2Class ?? ''}`}>
                {tooltip.line2}
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
