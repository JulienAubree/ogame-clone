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

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { BELT_DEBRIS_COLOR, type PlanetAura } from '../planetPalette';
import { OrbitalDebrisRing } from '../OrbitalDebrisRing';
import { PlanetVisual } from '../PlanetVisual';
import { hash01, orbitRadius, polarToCartesian, slotAngle } from './geometry';
import type { SlotView } from './slotView';
import { SlotMarker } from './SlotMarker';

const CANVAS_SIZE = 600;
const CENTER = CANVAS_SIZE / 2;
const STAR_OUTER_RADIUS = 26;
const STAR_CORE_RADIUS = 9;
const STARFIELD_COUNT = 60;
const TOTAL_POSITIONS = 16;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD_PX = 5;

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
  // Anchor in viewBox coordinates — where the slot actually is.
  anchorX: number;
  anchorY: number;
  // Offset in post-scale (screen-pixel) units, applied after translate.
  offsetX: number;
  offsetY: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  aura: PlanetAura | null;
  line1: string;
  line1Class: string;
  line2?: string;
  line2Class?: string;
}

const TOOLTIP_WIDTH = 200;
const TOOLTIP_HEIGHT = 46;

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

  // ── Zoom & pan state ─────────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panCenter, setPanCenter] = useState<{ x: number; y: number }>({
    x: CENTER,
    y: CENTER,
  });

  const viewBoxSize = CANVAS_SIZE / zoom;
  const viewBoxX = panCenter.x - viewBoxSize / 2;
  const viewBoxY = panCenter.y - viewBoxSize / 2;

  // Hover tooltip — renders near the hovered slot. Belts are skipped because
  // SlotMarker returns null for them, so no hover events fire. The descriptor
  // carries the anchor in viewBox coords plus an offset in post-scale units
  // (≈ screen pixels) so a counter-scale transform at render time keeps the
  // tooltip at constant screen size regardless of zoom.
  const tooltip = useMemo<TooltipDescriptor | null>(() => {
    if (hoveredPosition == null) return null;
    const hit = placedSlots.find((s) => s.view.position === hoveredPosition);
    if (!hit) return null;
    const { view, cx, cy } = hit;

    let line1: string;
    let line1Class: string;
    let line2: string | undefined;
    let line2Class: string | undefined;
    let planetClassId: string | null;
    let planetImageIndex: number | null = null;
    let aura: PlanetAura | null;

    switch (view.kind) {
      case 'planet': {
        line1 = view.planetName;
        line1Class = 'text-foreground';
        planetClassId = view.planetClassId;
        planetImageIndex = view.planetImageIndex;
        aura = view.relation;
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
        line1 = `Position ${view.position}`;
        line1Class = 'text-muted-foreground';
        line2 = 'Vide';
        line2Class = 'text-muted-foreground';
        planetClassId = view.planetClassId;
        aura = null;
        break;
      }
      case 'undiscovered': {
        line1 = `Position ${view.position}`;
        line1Class = 'text-muted-foreground italic';
        line2 = 'Inconnu';
        line2Class = 'text-muted-foreground italic';
        planetClassId = null;
        aura = null;
        break;
      }
      case 'belt':
        return null;
    }

    const anchorX = cx;
    const anchorY = cy;

    // Default: tooltip sits above-right of the slot.
    let offsetX = 14;
    let offsetY = -(TOOLTIP_HEIGHT + 8);

    // Edge-flip using the CURRENT visible viewBox (not the hardcoded canvas).
    const visibleSize = CANVAS_SIZE / zoom;
    const visibleTop = panCenter.y - visibleSize / 2;

    // Flip horizontally if the slot is in the right half of the visible area.
    if (anchorX > panCenter.x) {
      offsetX = -14 - TOOLTIP_WIDTH;
    }
    // Flip vertically if placing above would push above the visible top.
    // The offset is in post-scale units, so 1 unit ≈ 1/zoom viewBox units.
    if (anchorY - (TOOLTIP_HEIGHT + 8) / zoom < visibleTop) {
      offsetY = 14;
    }

    return {
      anchorX,
      anchorY,
      offsetX,
      offsetY,
      planetClassId,
      planetImageIndex,
      aura,
      line1,
      line1Class,
      line2,
      line2Class,
    };
  }, [hoveredPosition, placedSlots, zoom, panCenter]);

  const dragStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startCenterX: number;
    startCenterY: number;
    moved: boolean;
  } | null>(null);
  const swallowNextClickRef = useRef(false);

  function cursorToSvg(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  }

  // Attach wheel listener as a native non-passive listener so we can
  // preventDefault() (React's synthetic wheel handler is passive by default
  // in React 17+, which logs a warning when calling preventDefault).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cursor = cursorToSvg(e.clientX, e.clientY);
      if (!cursor) return;
      setZoom((prevZoom) => {
        const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor));
        if (nextZoom === prevZoom) return prevZoom;
        setPanCenter((prevCenter) => ({
          x: cursor.x + (prevCenter.x - cursor.x) * (prevZoom / nextZoom),
          y: cursor.y + (prevCenter.y - cursor.y) * (prevZoom / nextZoom),
        }));
        return nextZoom;
      });
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, []);

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    dragStateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCenterX: panCenter.x,
      startCenterY: panCenter.y,
      moved: false,
    };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const minSide = Math.min(rect.width, rect.height);
    if (minSide <= 0) return;
    const viewPerPixel = CANVAS_SIZE / zoom / minSide;
    setPanCenter({
      x: drag.startCenterX - dx * viewPerPixel,
      y: drag.startCenterY - dy * viewPerPixel,
    });
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    try {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (drag?.moved) {
      swallowNextClickRef.current = true;
    }
  }

  function handleClickCapture(e: React.MouseEvent<SVGSVGElement>) {
    if (swallowNextClickRef.current) {
      swallowNextClickRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  function handleReset() {
    setZoom(1);
    setPanCenter({ x: CENTER, y: CENTER });
  }

  function zoomBy(factor: number) {
    setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor)));
  }

  return (
    <div className="relative w-full h-full">
    <svg
      ref={svgRef}
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxSize} ${viewBoxSize}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full block"
      role="img"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={handleClickCapture}
      onDoubleClick={handleReset}
      style={{
        background: 'radial-gradient(ellipse at 30% 20%, #1a1535 0%, #05070f 75%)',
        cursor: zoom > 1 ? 'grab' : 'default',
        touchAction: 'none',
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

      {/* Hover tooltip — sits on top of slot markers. The outer <g> first
          translates to the slot anchor (in viewBox coords) then scales by
          1/zoom to cancel the viewBox zoom, so the foreignObject renders at
          a constant screen size. Inside the scaled coordinate system, the
          foreignObject's x/y are post-scale offsets (≈ screen pixels). */}
      {tooltip && (
        <g
          transform={`translate(${tooltip.anchorX}, ${tooltip.anchorY}) scale(${1 / zoom})`}
          style={{ pointerEvents: 'none' }}
        >
          <foreignObject
            x={tooltip.offsetX}
            y={tooltip.offsetY}
            width={TOOLTIP_WIDTH}
            height={TOOLTIP_HEIGHT}
          >
            <div className="w-full h-full rounded-md bg-black/85 border border-cyan-500/30 px-2 py-1 flex items-center gap-2 backdrop-blur-sm">
              <div className="flex-shrink-0">
                <PlanetVisual
                  planetClassId={tooltip.planetClassId}
                  planetImageIndex={tooltip.planetImageIndex}
                  size={32}
                  aura={tooltip.aura ?? undefined}
                  variant="icon"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[10px] leading-tight font-semibold truncate ${tooltip.line1Class}`}
                >
                  {tooltip.line1}
                </div>
                {tooltip.line2 && (
                  <div
                    className={`text-[10px] leading-tight truncate ${tooltip.line2Class ?? ''}`}
                  >
                    {tooltip.line2}
                  </div>
                )}
              </div>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
      <div className="absolute top-2 right-2 flex flex-col gap-1 bg-black/60 border border-cyan-500/20 rounded-md p-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => zoomBy(1.2)}
          className="w-7 h-7 flex items-center justify-center text-cyan-300 hover:bg-cyan-500/20 rounded text-sm"
          aria-label="Zoomer"
          title="Zoomer"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.2)}
          className="w-7 h-7 flex items-center justify-center text-cyan-300 hover:bg-cyan-500/20 rounded text-sm"
          aria-label="Dézoomer"
          title="Dézoomer"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="w-7 h-7 flex items-center justify-center text-cyan-300 hover:bg-cyan-500/20 rounded text-[10px]"
          aria-label="Réinitialiser la vue"
          title="Réinitialiser"
        >
          ⟲
        </button>
      </div>
    </div>
  );
}
