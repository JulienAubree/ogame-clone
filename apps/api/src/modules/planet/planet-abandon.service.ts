export interface ResourceBundle {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

export interface CargoLoadResult {
  loaded: ResourceBundle;
  overflow: ResourceBundle;
}

export function computeCargoLoad(stock: ResourceBundle, capacity: number): CargoLoadResult {
  const remaining = Math.max(0, capacity);
  const loadedMinerai = Math.min(stock.minerai, remaining);
  const afterMinerai = remaining - loadedMinerai;
  const loadedSilicium = Math.min(stock.silicium, afterMinerai);
  const afterSilicium = afterMinerai - loadedSilicium;
  const loadedHydrogene = Math.min(stock.hydrogene, afterSilicium);
  return {
    loaded: {
      minerai: loadedMinerai,
      silicium: loadedSilicium,
      hydrogene: loadedHydrogene,
    },
    overflow: {
      minerai: stock.minerai - loadedMinerai,
      silicium: stock.silicium - loadedSilicium,
      hydrogene: stock.hydrogene - loadedHydrogene,
    },
  };
}

export type AbandonBlocker =
  | 'homeworld'
  | 'colonizing'
  | 'inbound_hostile'
  | 'outbound_active'
  | 'market_offers'
  | 'destination_invalid';

export interface AbandonContext {
  planet: {
    id: string;
    userId: string;
    status: string;
    planetClassId: string | null;
  };
  destinationPlanet: {
    id: string;
    userId: string;
    status: string;
  } | null;
  inboundHostile: number;
  outboundActive: number;
  activeMarketOffers: number;
}

export function detectBlockers(ctx: AbandonContext): AbandonBlocker[] {
  const blockers: AbandonBlocker[] = [];
  if (ctx.planet.planetClassId === 'homeworld') blockers.push('homeworld');
  if (ctx.planet.status === 'colonizing') blockers.push('colonizing');
  if (ctx.inboundHostile > 0) blockers.push('inbound_hostile');
  if (ctx.outboundActive > 0) blockers.push('outbound_active');
  if (ctx.activeMarketOffers > 0) blockers.push('market_offers');
  const dest = ctx.destinationPlanet;
  if (
    !dest ||
    dest.id === ctx.planet.id ||
    dest.userId !== ctx.planet.userId ||
    dest.status !== 'active'
  ) {
    blockers.push('destination_invalid');
  }
  return blockers;
}
