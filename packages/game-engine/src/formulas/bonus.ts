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
 * Per-source: max(0.01, 1 + percentPerLevel / 100 * sourceLevel).
 * Combined: max(0.01, product of all matching modifiers).
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
    const modifier = Math.max(0.01, 1 + (def.percentPerLevel / 100) * level);
    result *= modifier;
  }

  if (!hasMatch) return 1;
  return Math.max(0.01, result);
}
