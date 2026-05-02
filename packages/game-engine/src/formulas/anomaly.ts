/**
 * Pure formulas for the Anomalie Gravitationnelle rogue-lite.
 * All inputs/outputs are plain numbers/dicts for trivial unit testing.
 */

export interface AnomalyLoot {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

export interface AnomalyDifficulty {
  /** FP ratio at depth 1 (e.g. 0.7 = enemy is 70% of player FP). */
  baseRatio: number;
  /** Geometric growth applied each depth. */
  growth: number;
  /** Hard cap on FP ratio so the late game is brutal but not unwinnable. */
  maxRatio: number;
}

export const DEFAULT_DIFFICULTY: AnomalyDifficulty = {
  baseRatio: 0.7,
  growth: 1.15,
  maxRatio: 1.3,
};

/**
 * Enemy fleet power (FP) target at depth N.
 * Scales relative to the player's currently-alive FP. The hard cap on
 * `maxRatio` keeps late-game attrition steady (no exponential cliff that
 * one-shots the run at depth 7).
 *
 * With defaults (0.7 base, 1.15 growth, 1.3 cap):
 *   depth=1 → 0.70×, depth=3 → 0.93×, depth=5 → 1.22×,
 *   depth=7+ → 1.30× (capped).
 */
export function anomalyEnemyFP(
  playerFP: number,
  depth: number,
  difficulty: Partial<AnomalyDifficulty> = {},
): number {
  if (playerFP <= 0 || depth <= 0) return 0;
  const baseRatio = difficulty.baseRatio ?? DEFAULT_DIFFICULTY.baseRatio;
  const growth = difficulty.growth ?? DEFAULT_DIFFICULTY.growth;
  const maxRatio = difficulty.maxRatio ?? DEFAULT_DIFFICULTY.maxRatio;
  const rawRatio = baseRatio * Math.pow(growth, depth - 1);
  const ratio = Math.min(maxRatio, rawRatio);
  return playerFP * ratio;
}

/**
 * Loot bundle awarded for clearing the depth-N node.
 * Total = base × growth^(N-1), split 40/35/25 between minerai/silicium/hydrogene.
 */
export function anomalyLoot(depth: number, base = 5000, growth = 1.4): AnomalyLoot {
  if (depth <= 0) return { minerai: 0, silicium: 0, hydrogene: 0 };
  const total = base * Math.pow(growth, depth - 1);
  return {
    minerai: Math.floor(total * 0.40),
    silicium: Math.floor(total * 0.35),
    hydrogene: Math.floor(total * 0.25),
  };
}

/**
 * Number of enemy ships recovered after a victory.
 * Two-stage clamp:
 *   - `ratio` (default 8%) of defeated count, floored
 *   - hard cap per ship type = `depth` (so depth 5 = max 5 of any type)
 *
 * This prevents the late game from showering the player with dozens of
 * cruisers/battlecruisers per fight when the rebalanced difficulty makes
 * deep runs reachable.
 */
export function anomalyEnemyRecoveryCount(
  defeatedShips: Record<string, number>,
  depth: number,
  ratio = 0.08,
): Record<string, number> {
  const cap = Math.max(1, depth);
  const out: Record<string, number> = {};
  for (const [shipId, count] of Object.entries(defeatedShips)) {
    if (count <= 0) continue;
    const rawRecovered = Math.floor(count * ratio);
    const recovered = Math.min(cap, rawRecovered);
    if (recovered > 0) out[shipId] = recovered;
  }
  return out;
}
