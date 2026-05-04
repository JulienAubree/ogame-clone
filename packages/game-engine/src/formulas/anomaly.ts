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
  /** Base ratio at depth 1 (default 0.5). */
  baseRatio: number;
  /** Geometric growth applied each depth (default 1.15). */
  growth: number;
  /** Cap on the intra-tier ratio (default 1.3). */
  maxRatio: number;
  /** V5-Tiers (2026-05-04) : multiplier appliqué APRÈS le cap intra-palier (default 1.0 = palier 1). */
  tierMultiplier?: number;
}

export const DEFAULT_DIFFICULTY: AnomalyDifficulty = {
  baseRatio: 0.5,
  growth: 1.15,
  maxRatio: 1.3,
  tierMultiplier: 1.0,
};

/**
 * Enemy fleet power (FP) target at depth N.
 * Scales relative to the player's currently-alive FP. The hard cap on
 * `maxRatio` keeps late-game attrition steady (no exponential cliff that
 * one-shots the run at depth 7).
 *
 * V5-Tiers : tierMultiplier applied post-cap so each tier multiplies the
 * intra-tier ratio (tier 1 = 1.0×, tier N linear = N×).
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
  const tierMult = difficulty.tierMultiplier ?? DEFAULT_DIFFICULTY.tierMultiplier!;
  const rawRatio = baseRatio * Math.pow(growth, depth - 1);
  const ratio = Math.min(maxRatio, rawRatio);
  // V5-Tiers : tierMultiplier appliqué post-cap pour différencier les paliers
  return playerFP * ratio * tierMult;
}

/**
 * V5-Tiers (2026-05-04) : compute the difficulty multiplier for a given tier.
 * Linear by default (factor=1.0) : tier N → multiplier = N.
 * For exponential progression, increase factor : tier N → 1 + (N-1) × factor.
 */
export function tierMultiplier(tier: number, factor: number = 1.0): number {
  return 1 + (tier - 1) * factor;
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

import { computeUnitFP, type UnitCombatStats, type FPConfig } from './fp.js';

export interface RecoveryConfig {
  /** Baseline percentage applied to every ship type. */
  baseRatio: number;
  /** Per-FP boost: ratio = baseRatio + unitFP × fpFactor.
   *  0.001 means a 100-FP ship gets +10 percentage points. */
  fpFactor: number;
  /** Hard ceiling on the resulting ratio (cap rare units' recovery). */
  maxRatio: number;
}

export const DEFAULT_RECOVERY: RecoveryConfig = {
  baseRatio: 0.05,
  fpFactor: 0.001,
  maxRatio: 0.25,
};

/**
 * Number of enemy ships recovered after a victory, weighted by ship value.
 *
 * Per-type ratio = clamp( baseRatio + unitFP × fpFactor , 0 , maxRatio )
 *
 * With defaults (5% base, +0.1% per FP point, 25% cap), known ships :
 *   interceptor   (FP   2) → 5.2%
 *   frigate       (FP  11) → 6.1%
 *   cruiser       (FP  57) → 10.7%
 *   battlecruiser (FP 144) → 19.4%
 *
 * Heavy ships are rare on the battlefield but recovered more often, so the
 * investment/reward balance feels right : losing 1000 cruisers in a deep
 * run can now realistically be offset by the recovered haul.
 */
export function anomalyEnemyRecoveryCount(
  defeatedShips: Record<string, number>,
  shipStats: Record<string, UnitCombatStats>,
  fpConfig: FPConfig,
  recovery: Partial<RecoveryConfig> = {},
): Record<string, number> {
  const baseRatio = recovery.baseRatio ?? DEFAULT_RECOVERY.baseRatio;
  const fpFactor = recovery.fpFactor ?? DEFAULT_RECOVERY.fpFactor;
  const maxRatio = recovery.maxRatio ?? DEFAULT_RECOVERY.maxRatio;

  const out: Record<string, number> = {};
  for (const [shipId, count] of Object.entries(defeatedShips)) {
    if (count <= 0) continue;
    const stats = shipStats[shipId];
    const unitFP = stats ? computeUnitFP(stats, fpConfig) : 0;
    const ratio = Math.max(0, Math.min(maxRatio, baseRatio + unitFP * fpFactor));
    const recovered = Math.floor(count * ratio);
    if (recovered > 0) out[shipId] = recovered;
  }
  return out;
}
