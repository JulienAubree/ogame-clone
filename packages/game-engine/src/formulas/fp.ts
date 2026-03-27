export interface UnitCombatStats {
  weapons: number;
  shotCount: number;
  shield: number;
  hull: number;
}

export interface FPConfig {
  shotcountExponent: number;
  divisor: number;
}

/**
 * Compute the Power Factor for a single unit type.
 * Formula: round((weapons * shotCount^exponent) * (shield + hull) / divisor)
 */
export function computeUnitFP(stats: UnitCombatStats, config: FPConfig): number {
  const dps = stats.weapons * Math.pow(stats.shotCount, config.shotcountExponent);
  const durability = stats.shield + stats.hull;
  return Math.round((dps * durability) / config.divisor);
}

/**
 * Compute total FP for a fleet (sum of unitFP * count for each ship type).
 */
export function computeFleetFP(
  fleet: Record<string, number>,
  shipStats: Record<string, UnitCombatStats>,
  config: FPConfig,
): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(fleet)) {
    if (count <= 0) continue;
    const stats = shipStats[shipId];
    if (!stats) continue;
    total += computeUnitFP(stats, config) * count;
  }
  return total;
}

/**
 * Scale a template fleet (ratios) to reach a target FP using incremental addition.
 * Adds ships one by one following the template ratios until FP target is reached.
 * Never scales below the template's base composition.
 */
export function scaleFleetToFP(
  templateRatios: Record<string, number>,
  targetFP: number,
  shipStats: Record<string, UnitCombatStats>,
  config: FPConfig,
): Record<string, number> {
  const types = Object.entries(templateRatios).filter(([, r]) => r > 0);
  if (types.length === 0) return {};

  // Start with the base template
  const fleet: Record<string, number> = {};
  for (const [id, count] of types) fleet[id] = count;

  let currentFP = computeFleetFP(fleet, shipStats, config);
  if (currentFP >= targetFP) return fleet;

  // Precompute FP per unit for each type
  const unitFPs = new Map<string, number>();
  for (const [id] of types) {
    const stats = shipStats[id];
    if (stats) unitFPs.set(id, computeUnitFP(stats, config));
  }

  // Total ratio for proportional addition
  const totalRatio = types.reduce((s, [, r]) => s + r, 0);

  // Incremental addition: add ships following ratios
  while (currentFP < targetFP) {
    let added = false;
    for (const [id, ratio] of types) {
      const unitFP = unitFPs.get(id) ?? 0;
      if (unitFP === 0) continue;

      const toAdd = Math.max(1, Math.round(ratio / totalRatio * types.length));
      fleet[id] = (fleet[id] ?? 0) + toAdd;
      currentFP += unitFP * toAdd;
      added = true;

      if (currentFP >= targetFP) break;
    }
    if (!added) break;
  }

  // If we overshot, try removing the last added unit if it brings us closer
  for (const [id] of [...types].reverse()) {
    const unitFP = unitFPs.get(id) ?? 0;
    if (unitFP === 0 || fleet[id] <= templateRatios[id]) continue;
    const withoutLast = currentFP - unitFP;
    if (Math.abs(withoutLast - targetFP) < Math.abs(currentFP - targetFP)) {
      fleet[id]--;
      currentFP = withoutLast;
    }
    break;
  }

  return fleet;
}
