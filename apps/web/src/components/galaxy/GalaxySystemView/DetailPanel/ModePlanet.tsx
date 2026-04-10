/**
 * Modes B + C + D — single-slot detail for any non-belt slot.
 *
 * Branches on the discriminant:
 *   - `planet`            → Mode B (occupied): owner banner + biomes + actions
 *   - `empty-discovered`  → Mode C (discovered vacant): type + biomes + colonize/explore
 *   - `undiscovered`      → Mode D (fog-of-war): placeholder + send explorer CTA
 *
 * Keeping all three kinds in one component avoids duplicating the header +
 * button layout. Actions are passed in as props; this file has no side
 * effects beyond the click handlers wired to the caller.
 */

import type { ReactElement } from 'react';
import type { SlotView } from '../slotView';
import type { DetailPanelActions, DetailPanelContext } from './types';
import { BiomeChips } from './BiomeChips';

type PlanetLikeView = Extract<
  SlotView,
  { kind: 'planet' | 'empty-discovered' | 'undiscovered' }
>;

interface Props {
  view: PlanetLikeView;
  ctx: DetailPanelContext;
  actions: DetailPanelActions;
}

// Button styles — kept inline rather than importing the project's <Button>
// to keep this panel dependency-light. Long class lists intentional.
const BTN_BASE =
  'inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs border transition-colors';
const BTN_CYAN = `${BTN_BASE} bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25`;
const BTN_EMERALD = `${BTN_BASE} bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25`;
const BTN_RED = `${BTN_BASE} bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25`;
const BTN_BLUE = `${BTN_BASE} bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25`;
const BTN_NEUTRAL = `${BTN_BASE} bg-white/5 text-foreground border-white/10 hover:bg-white/10`;

const RELATION_BANNER: Record<'mine' | 'ally' | 'enemy', string> = {
  mine: 'bg-cyan-500/10 border border-cyan-500/30',
  ally: 'bg-blue-500/10 border border-blue-500/30',
  enemy: 'bg-red-500/10 border border-red-500/30',
};

const RELATION_LABEL: Record<'mine' | 'ally' | 'enemy', string> = {
  mine: 'Vous',
  ally: 'Allié',
  enemy: 'Hostile',
};

const RELATION_TEXT: Record<'mine' | 'ally' | 'enemy', string> = {
  mine: 'text-cyan-300',
  ally: 'text-blue-300',
  enemy: 'text-red-300',
};

function planetTypeName(
  planetClassId: string | null,
  ctx: DetailPanelContext,
): string {
  if (!planetClassId) return 'Inconnu';
  return ctx.planetTypes.find((t) => t.id === planetClassId)?.name ?? 'Inconnu';
}

function SectionLabel({ children }: { children: string }): ReactElement {
  return (
    <div className="text-[10px] uppercase tracking-wider text-cyan-500/70 mb-1.5">
      {children}
    </div>
  );
}

export function ModePlanet({ view, ctx, actions }: Props): ReactElement {
  if (view.kind === 'planet') {
    const typeName = planetTypeName(view.planetClassId, ctx);
    return (
      <div>
        <h3 className="text-base font-semibold">{view.planetName}</h3>
        <p className="text-xs text-muted-foreground">
          Type {typeName} · Position {view.position}
        </p>

        <div
          className={`flex items-center gap-2 mt-3 px-3 py-2 rounded-md ${RELATION_BANNER[view.relation]}`}
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">
              {view.username ?? 'Joueur'}
              {view.allianceTag && (
                <span className="text-xs text-muted-foreground ml-1">
                  [{view.allianceTag}]
                </span>
              )}
            </div>
          </div>
          <span className={`text-xs ${RELATION_TEXT[view.relation]}`}>
            {RELATION_LABEL[view.relation]}
          </span>
        </div>

        <div className="mt-3">
          <SectionLabel>Biomes</SectionLabel>
          {view.biomes.length > 0 ? (
            <BiomeChips biomes={view.biomes} />
          ) : (
            <p className="text-xs italic text-muted-foreground">
              Biomes inconnus — explorer pour révéler.
            </p>
          )}
        </div>

        {view.debris &&
          (view.debris.minerai > 0 || view.debris.silicium > 0) && (
            <div className="mt-3 text-xs text-muted-foreground">
              Champ de débris : {view.debris.minerai} minerai ·{' '}
              {view.debris.silicium} silicium
            </div>
          )}

        <div className="mt-4 flex flex-col gap-2">
          {view.relation === 'mine' && (
            <button
              type="button"
              className={BTN_CYAN}
              onClick={() => actions.onManagePlanet(view.planetId)}
            >
              Gérer la planète
            </button>
          )}
          {view.relation === 'ally' && (
            <button
              type="button"
              className={BTN_NEUTRAL}
              onClick={() =>
                actions.onMessage(view.userId, view.username ?? 'Joueur')
              }
            >
              Message
            </button>
          )}
          {view.relation === 'enemy' && (
            <div className="flex gap-2">
              <button
                type="button"
                className={BTN_BLUE}
                onClick={() => actions.onSpy(view.position)}
              >
                Espionner
              </button>
              <button
                type="button"
                className={BTN_RED}
                onClick={() => actions.onAttack(view.position)}
              >
                Attaquer
              </button>
              <button
                type="button"
                className={BTN_NEUTRAL}
                onClick={() =>
                  actions.onMessage(view.userId, view.username ?? 'Joueur')
                }
              >
                Message
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view.kind === 'empty-discovered') {
    const typeName = planetTypeName(view.planetClassId, ctx);
    return (
      <div>
        <h3 className="text-base font-semibold">Position {view.position}</h3>
        <p className="text-xs text-muted-foreground">Type {typeName} — vide</p>

        <div className="mt-3">
          <SectionLabel>Biomes</SectionLabel>
          {view.biomes.length > 0 ? (
            <BiomeChips biomes={view.biomes} />
          ) : (
            <p className="text-xs italic text-muted-foreground">
              Explorer pour révéler les biomes.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {ctx.hasColonizer && (
            <button
              type="button"
              className={BTN_EMERALD}
              onClick={() => actions.onColonize(view.position)}
            >
              Coloniser
            </button>
          )}
          {ctx.hasExplorer && (
            <button
              type="button"
              className={BTN_CYAN}
              onClick={() => actions.onExplore(view.position)}
            >
              Explorer
            </button>
          )}
        </div>
      </div>
    );
  }

  // view.kind === 'undiscovered'
  return (
    <div>
      <h3 className="text-base font-semibold">Position {view.position}</h3>
      <p className="text-xs text-muted-foreground italic">Inconnu</p>
      <p className="text-xs text-muted-foreground italic mt-2">
        Aucune donnée disponible. Envoyer un explorateur pour révéler la
        position.
      </p>

      {ctx.hasExplorer && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className={BTN_CYAN}
            onClick={() => actions.onExplore(view.position)}
          >
            Envoyer un explorateur
          </button>
        </div>
      )}
    </div>
  );
}
