type PlanetTypeId = 'volcanic' | 'arid' | 'temperate' | 'glacial' | 'gaseous';

interface TempBracket {
  maxTemp: number; // upper bound (inclusive)
  weights: Array<[PlanetTypeId, number]>;
}

const TEMP_BRACKETS: TempBracket[] = [
  // Order: lowest maxTemp first
  { maxTemp: -100, weights: [['volcanic', 0], ['arid', 0], ['temperate', 0.05], ['glacial', 0.60], ['gaseous', 0.35]] },
  { maxTemp: -20,  weights: [['volcanic', 0], ['arid', 0.05], ['temperate', 0.20], ['glacial', 0.55], ['gaseous', 0.20]] },
  { maxTemp: 50,   weights: [['volcanic', 0.05], ['arid', 0.20], ['temperate', 0.50], ['glacial', 0.10], ['gaseous', 0.15]] },
  { maxTemp: 150,  weights: [['volcanic', 0.25], ['arid', 0.45], ['temperate', 0.20], ['glacial', 0], ['gaseous', 0.10]] },
  { maxTemp: Infinity, weights: [['volcanic', 0.60], ['arid', 0.25], ['temperate', 0.10], ['glacial', 0], ['gaseous', 0.05]] },
];

/**
 * Pick a planet type id based on the position's max temperature.
 * Uses weighted random selection. Pass a seeded RNG for deterministic results.
 */
export function pickPlanetTypeForPosition(maxTemp: number, rng: () => number): PlanetTypeId {
  const bracket = TEMP_BRACKETS.find((b) => maxTemp <= b.maxTemp) ?? TEMP_BRACKETS[TEMP_BRACKETS.length - 1];
  const totalWeight = bracket.weights.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight <= 0) return 'temperate';

  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const [type, weight] of bracket.weights) {
    cumulative += weight;
    if (roll < cumulative) return type;
  }
  return bracket.weights[bracket.weights.length - 1][0];
}
