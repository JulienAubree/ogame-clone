/**
 * Base extraction per prospector, scales with Mission Center level.
 * Formula: 2000 + 800 * (centerLevel - 1)
 */
export function baseExtraction(centerLevel: number): number {
  return 2000 + 800 * (centerLevel - 1);
}

/**
 * Total resources extracted for a mining trip.
 * Capped by: 10 prospectors max, fleet cargo capacity, deposit remaining.
 */
export function totalExtracted(
  centerLevel: number,
  nbProspectors: number,
  fleetCargoCapacity: number,
  depositRemaining: number,
): number {
  const effectiveProspectors = Math.min(nbProspectors, 10);
  const extracted = baseExtraction(centerLevel) * effectiveProspectors;
  return Math.min(extracted, fleetCargoCapacity, depositRemaining);
}

/**
 * Prospection duration in minutes.
 * Formula: 5 + floor(depositTotalQuantity / 10000) * 2
 */
export function prospectionDuration(depositTotalQuantity: number): number {
  return 5 + Math.floor(depositTotalQuantity / 10000) * 2;
}

/**
 * Mining duration in minutes at the belt.
 * @param bonusMultiplier - result of resolveBonus('mining_duration', null, ...)
 */
export function miningDuration(centerLevel: number, bonusMultiplier: number): number {
  return Math.max(5, 16 - centerLevel) * Math.max(0.01, bonusMultiplier);
}

/**
 * Visible pool size based on Mission Center level.
 */
export function poolSize(centerLevel: number): number {
  if (centerLevel <= 2) return 3;
  if (centerLevel <= 4) return 4;
  if (centerLevel <= 6) return 5;
  return 6;
}

/**
 * Max accumulated missions (2x pool size).
 */
export function accumulationCap(centerLevel: number): number {
  return poolSize(centerLevel) * 2;
}
