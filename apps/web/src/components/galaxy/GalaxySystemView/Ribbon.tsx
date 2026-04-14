/**
 * Ribbon — left vertical sidebar listing all 16 slots.
 *
 * Uses `<PlanetDot>` for the mini markers (PlanetDot returns its own `<svg>`,
 * which is exactly what we want here). The belt cells render a tiny inline
 * arc of 3 orange dots instead.
 *
 * Bidirectional hover is achieved by accepting `hoveredPosition` as a prop:
 * when the canvas highlights a slot, the matching ribbon row highlights too.
 */

import type { ReactElement } from 'react';
import { PlanetDot } from '../PlanetDot';
import { PlanetVisual } from '../PlanetVisual';
import { DebrisFieldIcon } from '../DebrisFieldIcon';
import { BELT_DEBRIS_COLOR } from '../planetPalette';
import type { SlotView } from './slotView';

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

function hasDebris(view: SlotView): boolean {
  if (view.kind !== 'planet') return false;
  const d = view.debris;
  return !!d && (d.minerai > 0 || d.silicium > 0);
}

export interface RibbonProps {
  views: SlotView[];
  selectedPosition: number | null;
  hoveredPosition: number | null;
  onSelectPosition: (position: number) => void;
  onHoverPosition: (position: number | null) => void;
}

function MiniMarker({ view }: { view: SlotView }) {
  switch (view.kind) {
    case 'planet':
      return (
        <PlanetVisual
          planetClassId={view.planetClassId}
          planetImageIndex={view.planetImageIndex}
          size={18}
          aura={view.relation}
          variant="icon"
        />
      );
    case 'empty-discovered':
      return <PlanetDot planetClassId={view.planetClassId} size={14} />;
    case 'undiscovered':
      return <PlanetDot planetClassId={null} size={14} />;
    case 'belt':
      return (
        <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
          <circle cx={3} cy={7} r={1} fill={BELT_DEBRIS_COLOR} />
          <circle cx={7} cy={7} r={1.2} fill={BELT_DEBRIS_COLOR} />
          <circle cx={11} cy={7} r={1} fill={BELT_DEBRIS_COLOR} />
        </svg>
      );
  }
}

export function Ribbon({
  views,
  selectedPosition,
  hoveredPosition,
  onSelectPosition,
  onHoverPosition,
}: RibbonProps) {
  const discoverable = views.filter((v) => v.kind !== 'belt').length;
  const discoveredCount = views.filter(
    (v) => v.kind === 'planet' || v.kind === 'empty-discovered',
  ).length;

  const activeDescendantId =
    selectedPosition != null ? `ribbon-slot-${selectedPosition}` : undefined;

  return (
    <aside className="w-[168px] flex-shrink-0 flex flex-col bg-black/30 border-r border-cyan-500/10">
      <div className="px-2 py-2 border-b border-cyan-500/10">
        <div className="text-[10px] uppercase tracking-wider text-cyan-500/70">Slots</div>
        <div className="text-[11px] font-mono text-muted-foreground">
          {discoveredCount}/{discoverable}
        </div>
      </div>
      <ol
        role="listbox"
        aria-label="Liste des positions du système"
        aria-activedescendant={activeDescendantId}
        className="flex-1 flex flex-col"
      >
        {views.map((view) => {
          const position = view.position;
          const isSelected = selectedPosition === position;
          const isHovered = hoveredPosition === position;

          const stateClasses = isSelected
            ? 'bg-cyan-500/20 border-l-2 border-cyan-400'
            : isHovered
              ? 'bg-cyan-500/10 border-l-2 border-transparent'
              : 'bg-transparent border-l-2 border-transparent hover:bg-cyan-500/10';

          let displayContent: ReactElement | string;
          let textClasses: string;
          switch (view.kind) {
            case 'planet':
              if (view.relation === 'mine' && view.status === 'colonizing') {
                displayContent = (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                    </span>
                    <span className="truncate">{view.planetName}</span>
                  </span>
                );
                textClasses = 'text-amber-300';
              } else {
                displayContent = view.planetName;
                textClasses = 'text-foreground';
              }
              break;
            case 'empty-discovered':
              if (view.biomes.length > 0) {
                displayContent = (
                  <span className="inline-flex items-center gap-1">
                    {view.biomes.map((b) => (
                      <span
                        key={b.id}
                        className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                        style={{ backgroundColor: RARITY_COLORS[b.rarity] ?? '#9ca3af' }}
                        title={`${b.name} (${b.rarity})`}
                      />
                    ))}
                  </span>
                );
              } else {
                displayContent = 'Vide';
              }
              textClasses = 'text-muted-foreground';
              break;
            case 'undiscovered':
              displayContent = 'Inconnu';
              textClasses = 'text-muted-foreground italic';
              break;
            case 'belt':
              displayContent = 'Ceinture';
              textClasses = 'text-orange-400/80';
              break;
          }

          return (
            <li
              key={position}
              id={`ribbon-slot-${position}`}
              role="option"
              aria-selected={isSelected}
              className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors ${stateClasses}`}
              onClick={() => onSelectPosition(position)}
              onMouseEnter={() => onHoverPosition(position)}
              onMouseLeave={() => onHoverPosition(null)}
            >
              <div className="w-5 text-[10px] font-mono text-muted-foreground flex-shrink-0">
                {position.toString().padStart(2, '0')}
              </div>
              <div className="flex-shrink-0">
                <MiniMarker view={view} />
              </div>
              <div className={`min-w-0 flex-1 text-xs truncate ${textClasses}`}>
                {displayContent}
              </div>
              {hasDebris(view) && (
                <span
                  className="flex-shrink-0 inline-flex items-center justify-center"
                  title="Champ de débris à recycler"
                >
                  <DebrisFieldIcon size={18} title="Champ de débris présent" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
