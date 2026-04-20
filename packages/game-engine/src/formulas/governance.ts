/**
 * Calculate governance overextend and resulting penalties.
 *
 * @param colonyCount - Total planets owned (excluding homeworld)
 * @param governanceCapacity - 1 + Imperial Power Center level
 * @param harvestPenalties - Penalty per overextend step, e.g. [0.15, 0.35, 0.60]
 * @param constructionPenalties - Penalty per overextend step, e.g. [0.15, 0.35, 0.60]
 */
export function calculateGovernancePenalty(
  colonyCount: number,
  governanceCapacity: number,
  harvestPenalties: number[],
  constructionPenalties: number[],
): { overextend: number; harvestMalus: number; constructionMalus: number } {
  const overextend = Math.max(0, colonyCount - governanceCapacity);
  if (overextend === 0) {
    return { overextend: 0, harvestMalus: 0, constructionMalus: 0 };
  }

  // Clamp to the last defined penalty step
  const step = Math.min(overextend, harvestPenalties.length) - 1;
  return {
    overextend,
    harvestMalus: harvestPenalties[step] ?? harvestPenalties[harvestPenalties.length - 1] ?? 0,
    constructionMalus: constructionPenalties[step] ?? constructionPenalties[constructionPenalties.length - 1] ?? 0,
  };
}

/**
 * Calculate colonization difficulty factor from planet type and distance.
 * Lower factor = slower passive progress.
 *
 * @param distancePenaltyPerHop - Fraction subtracted per system hop (default 0.01)
 * @param distanceFloor - Minimum distance factor (default 0.90)
 */
export function calculateColonizationDifficulty(
  planetClassId: string,
  homeworldSystem: number,
  targetSystem: number,
  difficultyMap: Record<string, number>,
  distancePenaltyPerHop = 0.01,
  distanceFloor = 0.90,
): number {
  const typeFactor = difficultyMap[planetClassId] ?? 0.9;
  const systemDistance = Math.abs(targetSystem - homeworldSystem);
  const distanceFactor = Math.max(distanceFloor, 1 - systemDistance * distancePenaltyPerHop);
  return typeFactor * distanceFactor;
}
