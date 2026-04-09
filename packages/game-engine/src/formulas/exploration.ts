const BASE_CHANCE = 0.20;
const SHIP_FACTOR_COEFF = 0.35;
const RESEARCH_FACTOR_COEFF = 0.12;
const MAX_PROBABILITY = 0.95;
const BASE_SCAN_DURATION = 1800;
const SCAN_RESEARCH_COEFF = 0.1;

const RARITY_PENALTY: Record<string, number> = {
  common: 1,
  uncommon: 1.8,
  rare: 3,
  epic: 5,
  legendary: 8,
};

export function biomeDiscoveryProbability(
  shipCount: number,
  researchLevel: number,
  rarity: string,
): number {
  const shipFactor = 1 + (shipCount - 1) * SHIP_FACTOR_COEFF;
  const researchFactor = 1 + researchLevel * RESEARCH_FACTOR_COEFF;
  const penalty = RARITY_PENALTY[rarity] ?? 1;
  return Math.min(MAX_PROBABILITY, BASE_CHANCE * shipFactor * researchFactor / penalty);
}

export function scanDuration(researchLevel: number): number {
  return Math.floor(BASE_SCAN_DURATION / (1 + researchLevel * SCAN_RESEARCH_COEFF));
}
