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
  /** V6-AbsoluteFP (2026-05-04) : FP enemy de base au tier 1, depth 1 (default 80). */
  tierBaseFp: number;
  /** V6-AbsoluteFP : croissance géométrique du FP enemy entre paliers (default 1.7). */
  tierFpGrowth: number;
  /** Intra-palier geometric growth applied each depth (default 1.06). */
  growth: number;
  /** Cap on the intra-tier ratio (default 3.0 = max ×3 au depth 20). */
  maxRatio: number;
}

export const DEFAULT_DIFFICULTY: AnomalyDifficulty = {
  tierBaseFp: 80,
  tierFpGrowth: 1.7,
  growth: 1.06,
  maxRatio: 3.0,
};

/**
 * Enemy fleet power (FP) target at tier T, depth N.
 *
 * V6-AbsoluteFP (2026-05-04) : décorrélé du player FP. Le FP enemy est défini
 * absolument par palier : palier 1 ≈ 80 FP (débutant), palier 10 ≈ 30k FP,
 * palier 20 ≈ 6.5M FP. Cela permet de garder le palier 1 accessible aux
 * débutants quel que soit le niveau du player, et de réserver les paliers
 * élevés aux hardcore.
 *
 * Formule : enemyFP = tierBaseFp × tierFpGrowth^(tier-1) × min(maxRatio, growth^(depth-1))
 */
export function anomalyEnemyFP(
  tier: number,
  depth: number,
  difficulty: Partial<AnomalyDifficulty> = {},
): number {
  if (tier <= 0 || depth <= 0) return 0;
  const tierBaseFp = difficulty.tierBaseFp ?? DEFAULT_DIFFICULTY.tierBaseFp;
  const tierFpGrowth = difficulty.tierFpGrowth ?? DEFAULT_DIFFICULTY.tierFpGrowth;
  const growth = difficulty.growth ?? DEFAULT_DIFFICULTY.growth;
  const maxRatio = difficulty.maxRatio ?? DEFAULT_DIFFICULTY.maxRatio;
  const tierFp = tierBaseFp * Math.pow(tierFpGrowth, tier - 1);
  const intraRatio = Math.min(maxRatio, Math.pow(growth, depth - 1));
  return tierFp * intraRatio;
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
