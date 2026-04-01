export const FLAGSHIP_EXCLUDED_SHIPS = ['espionageProbe', 'solarSatellite', 'recuperateur'] as const;

export const FLAGSHIP_DEFAULT_STATS = {
  weapons: 12,
  shield: 16,
  hull: 30,
  baseArmor: 2,
  shotCount: 2,
  baseSpeed: 10000,
  fuelConsumption: 75,
  cargoCapacity: 5000,
} as const;

export interface FlagshipBaseStats {
  weapons: number;
  shield: number;
  hull: number;
  baseArmor: number;
  shotCount: number;
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
}

interface ShipStatInput {
  weapons: number;
  shield: number;
  hull: number;
  baseArmor: number;
  shotCount: number;
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
}

/**
 * Compute flagship base stats = max of each stat across unlocked ships.
 * fuelConsumption uses min (advantage to the player).
 * Returns defaults if no valid ships provided.
 */
export function computeBaseStatsFromShips(
  unlockedShipIds: string[],
  shipDefs: Record<string, ShipStatInput>,
): FlagshipBaseStats {
  const ships = unlockedShipIds
    .map((id) => shipDefs[id])
    .filter((s): s is ShipStatInput => s != null);

  if (ships.length === 0) return { ...FLAGSHIP_DEFAULT_STATS };

  return {
    weapons: Math.max(...ships.map((s) => s.weapons)),
    shield: Math.max(...ships.map((s) => s.shield)),
    hull: Math.max(...ships.map((s) => s.hull)),
    baseArmor: Math.max(...ships.map((s) => s.baseArmor)),
    shotCount: Math.max(...ships.map((s) => s.shotCount)),
    baseSpeed: Math.max(...ships.map((s) => s.baseSpeed)),
    fuelConsumption: Math.min(...ships.map((s) => s.fuelConsumption)),
    cargoCapacity: Math.max(...ships.map((s) => s.cargoCapacity)),
  };
}
