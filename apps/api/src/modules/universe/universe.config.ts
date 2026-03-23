export const UNIVERSE_CONFIG = {
  name: 'Universe 1',
  speed: 1,
  galaxies: 9,
  systems: 499,
  positions: 16,
  maxPlanetsPerPlayer: 9,
  debrisRatio: 0.3,
  lootRatio: 0.5,
  homePlanetDiameter: 12000,
  startingResources: { minerai: 500, silicium: 300, hydrogene: 100 },
} as const;

export const BELT_POSITIONS = [8, 16] as const;

/** Max refund ratio when cancelling a build/research/shipyard queue */
export const CANCEL_REFUND_RATIO = 0.7;
