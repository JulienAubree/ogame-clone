export interface ShipStats {
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
  driveType: 'combustion' | 'impulse' | 'hyperspaceDrive';
  miningExtraction: number;
}

interface Coordinates {
  galaxy: number;
  system: number;
  position: number;
}

export function shipSpeed(stats: ShipStats, speedMultiplier: number): number {
  return Math.floor(stats.baseSpeed * speedMultiplier);
}

export function fleetSpeed(
  ships: Record<string, number>,
  shipStatsMap: Record<string, ShipStats>,
  speedMultipliers: Record<string, number>,
): number {
  let minSpeed = Infinity;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = shipStatsMap[shipId];
      if (!stats) continue;
      const multiplier = speedMultipliers[shipId] ?? 1;
      const speed = shipSpeed(stats, multiplier);
      if (speed < minSpeed) minSpeed = speed;
    }
  }
  return minSpeed === Infinity ? 0 : minSpeed;
}

export function distance(origin: Coordinates, target: Coordinates): number {
  if (origin.galaxy !== target.galaxy) {
    return 20000 * Math.abs(origin.galaxy - target.galaxy);
  }
  if (origin.system !== target.system) {
    return 2700 + 95 * Math.abs(origin.system - target.system);
  }
  if (origin.position !== target.position) {
    return 1000 + 5 * Math.abs(origin.position - target.position);
  }
  return 5;
}

export function travelTime(
  origin: Coordinates,
  target: Coordinates,
  speed: number,
  universeSpeed: number,
): number {
  const dist = distance(origin, target);
  return Math.round(10 + (35000 / speed) * Math.sqrt((dist * 10) / universeSpeed));
}

export function fuelConsumption(
  ships: Record<string, number>,
  dist: number,
  duration: number,
  shipStatsMap: Record<string, ShipStats>,
): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = shipStatsMap[shipId];
      if (!stats) continue;
      const speedFactor = duration <= 10 ? 1 : (duration + 10) / (duration - 10);
      const consumption = stats.fuelConsumption * count * (dist / 35000) * speedFactor;
      total += Math.max(1, Math.round(consumption));
    }
  }
  return Math.max(1, Math.ceil(total));
}

export function totalCargoCapacity(
  ships: Record<string, number>,
  shipStatsMap: Record<string, ShipStats>,
): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = shipStatsMap[shipId];
      if (stats) total += stats.cargoCapacity * count;
    }
  }
  return total;
}

/**
 * Compute the total mining extraction capacity of a fleet.
 * Only ships with miningExtraction > 0 contribute (e.g. prospectors).
 */
export function totalMiningExtraction(
  ships: Record<string, number>,
  shipStatsMap: Record<string, ShipStats>,
): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = shipStatsMap[shipId];
      if (stats && stats.miningExtraction > 0) total += stats.miningExtraction * count;
    }
  }
  return total;
}
