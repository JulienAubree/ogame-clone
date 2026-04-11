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

import type { ReactElement, ReactNode } from 'react';
import type { SlotView } from '../slotView';
import type { DetailPanelActions, DetailPanelContext } from './types';
import { BiomeChips } from './BiomeChips';
import { PlanetDot } from '../../PlanetDot';
import { PlanetVisual } from '../../PlanetVisual';

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
const BTN_ORANGE = `${BTN_BASE} bg-orange-500/15 text-orange-300 border-orange-500/30 hover:bg-orange-500/25`;
const BTN_DISABLED = `${BTN_BASE} bg-white/5 text-muted-foreground border-white/5 cursor-not-allowed opacity-50`;

function ActionButton({
  enabled,
  enabledClassName,
  disabledTitle,
  enabledTitle,
  onClick,
  children,
}: {
  enabled: boolean;
  enabledClassName: string;
  disabledTitle: string;
  enabledTitle?: string;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={!enabled}
      title={enabled ? enabledTitle : disabledTitle}
      className={enabled ? enabledClassName : BTN_DISABLED}
      onClick={enabled ? onClick : undefined}
    >
      {children}
    </button>
  );
}

function hasDebris(view: Extract<SlotView, { kind: 'planet' }>): boolean {
  return !!view.debris && (view.debris.minerai > 0 || view.debris.silicium > 0);
}

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
    const displayName = view.username ?? 'Joueur';
    return (
      <div>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <PlanetVisual
              planetClassId={view.planetClassId}
              planetImageIndex={view.planetImageIndex}
              size={96}
              aura={view.relation}
              variant="thumb"
              glow
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">{view.planetName}</h3>
            <p className="text-xs text-muted-foreground">
              Type {typeName} · Position {view.position}
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 mt-3 px-3 py-2 rounded-md ${RELATION_BANNER[view.relation]}`}
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">
              {displayName}
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

        {view.relation === 'mine' ? (
          <div className="mt-3">
            <SectionLabel>Biomes</SectionLabel>
            {view.biomes.length > 0 ? (
              <BiomeChips biomes={view.biomes} />
            ) : (
              <p className="text-xs italic text-muted-foreground">Aucun biome.</p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <SectionLabel>Biomes</SectionLabel>
            <p className="text-xs italic text-muted-foreground">
              Biomes inconnus. Espionne la planète pour en savoir plus.
            </p>
          </div>
        )}

        {view.debris &&
          (view.debris.minerai > 0 || view.debris.silicium > 0) && (
            <div className="mt-3 text-xs text-muted-foreground">
              Champ de débris : {view.debris.minerai} minerai ·{' '}
              {view.debris.silicium} silicium
            </div>
          )}

        <div className="mt-4 flex flex-wrap gap-2">
          {view.relation === 'mine' && (
            <button
              type="button"
              className={BTN_CYAN}
              onClick={() => actions.onManagePlanet(view.planetId)}
            >
              Gérer la planète
            </button>
          )}

          {view.relation !== 'mine' && (
            <ActionButton
              enabled={ctx.hasSpy}
              enabledClassName={BTN_BLUE}
              disabledTitle="Aucun vaisseau d'espionnage disponible"
              onClick={() => actions.onSpy(view.position)}
            >
              Espionner
            </ActionButton>
          )}

          {view.relation === 'enemy' && (
            <ActionButton
              enabled={ctx.hasCombatShip}
              enabledClassName={BTN_RED}
              disabledTitle="Aucun vaisseau de combat disponible"
              onClick={() => actions.onAttack(view.position)}
            >
              Attaquer
            </ActionButton>
          )}

          {view.relation !== 'mine' && (
            <button
              type="button"
              className={BTN_NEUTRAL}
              onClick={() => actions.onMessage(view.userId, displayName)}
            >
              Message
            </button>
          )}

          {hasDebris(view) && (
            <ActionButton
              enabled={ctx.hasRecycler}
              enabledClassName={BTN_ORANGE}
              disabledTitle="Aucun recycleur disponible"
              onClick={() => actions.onRecycle(view.position)}
            >
              Recycler débris
            </ActionButton>
          )}
        </div>
      </div>
    );
  }

  if (view.kind === 'empty-discovered') {
    const typeName = planetTypeName(view.planetClassId, ctx);
    return (
      <div>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <PlanetDot planetClassId={view.planetClassId} size={80} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">Position {view.position}</h3>
            <p className="text-xs text-muted-foreground">Type {typeName} — vide</p>
          </div>
        </div>

        {view.biomes.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-cyan-500/30 bg-cyan-500/5 px-3 py-3">
            <div className="text-[10px] uppercase tracking-wider text-cyan-500/70 mb-1">
              Position inexplorée
            </div>
            <p className="text-xs text-muted-foreground">
              Les biomes de cette position n&apos;ont pas encore été révélés.
              Envoie un explorateur pour découvrir ses caractéristiques.
            </p>
          </div>
        ) : view.undiscoveredCount > 0 ? (
          <div className="mt-3">
            <SectionLabel>Biomes</SectionLabel>
            <BiomeChips biomes={view.biomes} />
            <p className="text-xs text-amber-400/80 mt-2">
              Exploration incomplète
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <SectionLabel>Biomes</SectionLabel>
            <BiomeChips biomes={view.biomes} />
            <p className="text-xs text-emerald-400/80 mt-2">
              Tous les biomes ont été révélés
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <ActionButton
            enabled={ctx.hasColonizer}
            enabledClassName={BTN_EMERALD}
            disabledTitle="Aucun vaisseau de colonisation disponible"
            onClick={() => actions.onColonize(view.position)}
          >
            Coloniser
          </ActionButton>
          <ActionButton
            enabled={ctx.hasExplorer && view.undiscoveredCount > 0}
            enabledClassName={BTN_CYAN}
            disabledTitle={
              !ctx.hasExplorer
                ? "Aucun vaisseau d'exploration disponible"
                : 'Tous les biomes sont déjà découverts'
            }
            onClick={() => actions.onExplore(view.position)}
          >
            Explorer
          </ActionButton>
        </div>
      </div>
    );
  }

  // view.kind === 'undiscovered'
  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <PlanetDot planetClassId={null} size={80} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold">Position {view.position}</h3>
          <p className="text-xs text-muted-foreground italic">Inconnu</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground italic mt-2">
        Aucune donnée disponible. Envoyer un explorateur pour révéler la
        position.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <ActionButton
          enabled={ctx.hasExplorer}
          enabledClassName={BTN_CYAN}
          disabledTitle="Aucun vaisseau d'exploration disponible"
          onClick={() => actions.onExplore(view.position)}
        >
          Envoyer un explorateur
        </ActionButton>
      </div>
    </div>
  );
}
