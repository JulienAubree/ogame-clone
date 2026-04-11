/**
 * Mode E — asteroid belt detail.
 *
 * Embeds the existing procedural AsteroidBelt animation as the hero visual
 * and surfaces a mining mission CTA when one is available for this position.
 */

import type { ReactElement } from 'react';
import { AsteroidBelt } from '@/components/galaxy/AsteroidBelt';
import type { SlotView } from '../slotView';
import type { DetailPanelActions, DetailPanelContext } from './types';

interface ModeBeltProps {
  view: Extract<SlotView, { kind: 'belt' }>;
  ctx: Pick<DetailPanelContext, 'beltMissions' | 'hasMiner'>;
  actions: Pick<DetailPanelActions, 'onMine'>;
}

const BTN_BASE =
  'inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs border transition-colors';
const BTN_ORANGE = `${BTN_BASE} bg-orange-500/15 text-orange-300 border-orange-500/30 hover:bg-orange-500/25`;
const BTN_DISABLED = `${BTN_BASE} bg-white/5 text-muted-foreground border-white/5 cursor-not-allowed opacity-50`;

export function ModeBelt({ view, ctx, actions }: ModeBeltProps): ReactElement {
  const mission = ctx.beltMissions[view.position];

  return (
    <div>
      <h3 className="text-base font-semibold">Position {view.position}</h3>
      <p className="text-xs text-muted-foreground">Ceinture d'astéroïdes</p>

      <div className="mt-3 relative h-32 rounded-md overflow-hidden bg-black/40 border border-orange-500/20">
        <AsteroidBelt className="absolute inset-0 w-full h-full" />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {mission ? (
          <button
            type="button"
            disabled={!ctx.hasMiner}
            title={ctx.hasMiner ? undefined : 'Aucun prospecteur disponible'}
            className={ctx.hasMiner ? BTN_ORANGE : BTN_DISABLED}
            onClick={
              ctx.hasMiner
                ? () => actions.onMine(view.position, mission.id)
                : undefined
            }
          >
            Lancer une mission de minage
          </button>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Aucune mission de minage disponible.
          </p>
        )}
      </div>
    </div>
  );
}
