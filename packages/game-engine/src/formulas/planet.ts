/**
 * OGame planet temperature formula.
 * max_temp = 40 + (8 - position) * 30 + randomOffset
 * randomOffset should be in range [-20, 20]
 */
export function calculateMaxTemp(position: number, randomOffset: number = 0): number {
  return 40 + (8 - position) * 30 + randomOffset;
}

/**
 * Min temperature is always maxTemp - 40.
 */
export function calculateMinTemp(maxTemp: number): number {
  return maxTemp - 40;
}

/**
 * Planet diameter based on position.
 * Middle positions (4-8) get larger planets.
 * randomFactor: 0-1, used to vary within the range.
 */
export function calculateDiameter(position: number, randomFactor: number): number {
  const ranges: Record<number, [number, number]> = {
    1: [5800, 9800], 2: [5800, 9800], 3: [5800, 9800],
    4: [9000, 14400], 5: [9000, 14400], 6: [9000, 14400],
    7: [10000, 15600], 8: [10000, 15600], 9: [10000, 15600],
    10: [7500, 12200], 11: [7500, 12200], 12: [7500, 12200],
    13: [5000, 9400], 14: [5000, 9400], 15: [5000, 9400],
  };
  const [min, max] = ranges[position] ?? [5000, 9400];
  return Math.floor(min + (max - min) * randomFactor);
}

/**
 * Max fields (building slots) from diameter.
 * max_fields = floor((diameter / 1000)^2)
 */
export function calculateMaxFields(diameter: number): number {
  return Math.floor(Math.pow(diameter / 1000, 2));
}
