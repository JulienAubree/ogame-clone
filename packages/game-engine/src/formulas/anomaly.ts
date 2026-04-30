/**
 * Pure formulas for the Anomalie Gravitationnelle rogue-lite.
 * All inputs/outputs are plain numbers/dicts for trivial unit testing.
 */

export interface AnomalyLoot {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

/**
 * Enemy fleet power (FP) target at depth N.
 * Scales relative to the player's currently-alive FP, encouraging the
 * roguelite tension: as the player loses ships, the ratio degrades faster.
 *
 * depth=1 → 0.5×, depth=2 → 0.65×, depth=3 → 0.845×, depth=N → 0.5 × growth^(N-1)
 */
export function anomalyEnemyFP(playerFP: number, depth: number, growth = 1.3): number {
  if (playerFP <= 0 || depth <= 0) return 0;
  return playerFP * 0.5 * Math.pow(growth, depth - 1);
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
 * Number of enemy ships recovered after a victory (pour rentrer enrichi en
 * vaisseaux ennemis vaincus). 15% par défaut, floor.
 */
export function anomalyEnemyRecoveryCount(
  defeatedShips: Record<string, number>,
  ratio = 0.15,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [shipId, count] of Object.entries(defeatedShips)) {
    const recovered = Math.floor(count * ratio);
    if (recovered > 0) out[shipId] = recovered;
  }
  return out;
}
