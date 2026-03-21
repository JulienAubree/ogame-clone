export interface BonusDefinition {
  sourceType: 'building' | 'research';
  sourceId: string;
  stat: string;
  percentPerLevel: number;
  category: string | null;
}

/**
 * Resolves the combined multiplier for a given stat + optional category.
 *
 * Matching: bonus.stat === stat AND (bonus.category is null OR bonus.category === category).
 * Buildings: 1 / (1 + level) — diminishing returns (OGame classic).
 * Research: 1 + percentPerLevel / 100 * level — linear scaling.
 * Combined: product of all matching modifiers, clamped to min 0.01.
 * Returns 1.0 if no bonus matches or all source levels are 0.
 */
export function resolveBonus(
  stat: string,
  category: string | null,
  userLevels: Record<string, number>,
  bonusDefs: BonusDefinition[],
): number {
  let result = 1;
  let hasMatch = false;

  for (const def of bonusDefs) {
    if (def.stat !== stat) continue;
    if (def.category !== null && def.category !== category) continue;

    const level = userLevels[def.sourceId] ?? 0;
    if (level === 0) continue;

    hasMatch = true;
    let modifier: number;
    if (def.sourceType === 'building') {
      modifier = 1 / (1 + level);
    } else {
      modifier = Math.max(0.01, 1 + (def.percentPerLevel / 100) * level);
    }
    result *= modifier;
  }

  if (!hasMatch) return 1;
  return Math.max(0.01, result);
}

/**
 * Compute the building bonus multiplier for a single level.
 * Used for UI display of bonus progression.
 */
export function buildingBonusAtLevel(level: number): number {
  if (level <= 0) return 1;
  return 1 / (1 + level);
}
