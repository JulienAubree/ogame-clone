/**
 * Planetary shield capacity based on building level.
 * Formula: round(30 * 1.3^(level-1))
 */
export function calculateShieldCapacity(level: number): number {
  if (level <= 0) return 0;
  return Math.round(30 * Math.pow(1.3, level - 1));
}

/**
 * Planetary shield energy consumption at 100% power.
 * Formula: ceil(30 * 1.5^(level-1))
 */
export function calculateShieldEnergy(level: number): number {
  if (level <= 0) return 0;
  return Math.ceil(30 * Math.pow(1.5, level - 1));
}
