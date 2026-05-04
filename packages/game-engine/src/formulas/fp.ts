export interface UnitWeaponProfile {
  damage: number;
  shots: number;
  /** Target category. When all of a unit's weapons share the same category,
   *  the unit is treated as a specialist (FP penalty). */
  targetCategory?: string;
  /** Conditional bonus shots when the target matches `rafale.category`. */
  rafale?: { category?: string; count: number };
  /** When true, every kill grants a bonus shot on the same category. */
  hasChainKill?: boolean;
}

export interface UnitCombatStats {
  weapons: number;
  shotCount: number;
  shield: number;
  hull: number;
  /** Flat damage reduction per hit. Optional — defaults to 0. */
  armor?: number;
  /** Multi-battery profile. Modern combat path. When present the legacy
   *  `weapons × shotCount^exponent` is ignored. */
  weaponProfiles?: UnitWeaponProfile[];
  /**
   * Combat category id (light / medium / heavy / shield / defense /
   * capital / support). Used in V2 of the FP formula to:
   *   - apply a durability multiplier to capital ships (targeted last)
   *   - apply a soft penalty to specialist ships (single target category)
   */
  categoryId?: string;
}

export interface FPConfig {
  shotcountExponent: number;
  divisor: number;
}

/**
 * Heuristic weights for the V2 formula. Tuned against the known ship roster
 * (interceptor / frigate / cruiser / battlecruiser) so the new FP stays in
 * the same order of magnitude as the legacy formula for non-trait ships.
 *
 *   - rafaleWeight 0.5    : rafale bonus is conditional on category match,
 *                           so we count half of its raw damage.
 *   - chainKillMult 1.3   : chain kills typically trigger 30% of the time
 *                           (depends on enemy count of the right category).
 *   - armorPerPoint 4     : 1 point of armor blocks ~1 dmg per shot, and a
 *                           ship typically takes ~4 incoming shots per round
 *                           over the 4-round combat → 4 effective HP.
 *   - capitalDurabilityMult 2 : capital ships are last-targeted, so their
 *                           durability is effectively doubled in practice.
 *   - specialistDpsMult 0.7 : a ship whose ALL weapons share one target
 *                           category is dead weight against fleets without
 *                           that category — penalize 30%.
 */
export const FP_WEIGHTS = {
  rafaleWeight: 0.5,
  chainKillMult: 1.3,
  armorPerPoint: 4,
  capitalDurabilityMult: 2,
  specialistDpsMult: 0.7,
} as const;

/**
 * Compute the Power Factor for a single unit type.
 *
 * V2 formula (when weaponProfiles is provided):
 *   effectiveDPS = Σ over weapons of:
 *     (damage × shots + rafaleBonus × rafaleWeight) × (chainKillMult if hasChainKill else 1)
 *     where rafaleBonus = rafale.count × damage if rafale defined
 *   effectiveDPS *= 0.7 if all weapons share the same target category
 *
 *   effectiveDurability = shield + hull + armor × armorPerPoint
 *   effectiveDurability *= 2 if categoryId === 'capital'
 *
 *   FP = round(effectiveDPS × effectiveDurability / divisor)
 *
 * Legacy fallback (no weaponProfiles): the historical formula stays as-is
 * so older configs keep producing the same numbers.
 */
export function computeUnitFP(stats: UnitCombatStats, config: FPConfig): number {
  const profiles = stats.weaponProfiles ?? [];

  // ── DPS ──
  let dps: number;
  if (profiles.length > 0) {
    dps = profiles.reduce((sum, w) => {
      const baseDmg = w.damage * w.shots;
      const rafaleBonus = w.rafale ? w.rafale.count * w.damage * FP_WEIGHTS.rafaleWeight : 0;
      const chainMult = w.hasChainKill ? FP_WEIGHTS.chainKillMult : 1;
      return sum + (baseDmg + rafaleBonus) * chainMult;
    }, 0);

    // Specialist penalty: all weapons targeting a single category.
    const distinctCategories = new Set(
      profiles
        .map((w) => w.targetCategory)
        .filter((c): c is string => typeof c === 'string' && c.length > 0),
    );
    if (distinctCategories.size === 1) {
      dps *= FP_WEIGHTS.specialistDpsMult;
    }
  } else {
    // Legacy fallback for stats without explicit weapon profiles.
    dps = stats.weapons * Math.pow(stats.shotCount, config.shotcountExponent);
  }

  // ── Durability ──
  let durability = stats.shield + stats.hull + (stats.armor ?? 0) * FP_WEIGHTS.armorPerPoint;
  if (stats.categoryId === 'capital') {
    durability *= FP_WEIGHTS.capitalDurabilityMult;
  }

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
 * Scale a template fleet (ratios) to reach a target FP.
 *
 * Algorithm (V6, 2026-05-04) : allocate budget proportional to ratios, then
 * top up with the lightest type to close the residual gap. Avoids the V1
 * overshoot bug where the template counts were used as a *minimum floor*
 * (e.g. "always include 1 BC") which made low-FP targets impossible (a
 * target of 80 FP would always overshoot to 300+ because the BC alone costs
 * 144 FP).
 *
 * Pure ratios in : `templateRatios = {interceptor: 6, frigate: 4, cruiser: 2,
 * battlecruiser: 1}` means "for every 13 ships of FP-budget, allocate
 * 6/13 to interceptors, 4/13 to frigates, etc.". Heavy ships are absent
 * from low-FP fleets when their unit cost exceeds their proportional budget.
 */
export function scaleFleetToFP(
  templateRatios: Record<string, number>,
  targetFP: number,
  shipStats: Record<string, UnitCombatStats>,
  config: FPConfig,
): Record<string, number> {
  const types = Object.entries(templateRatios).filter(([, r]) => r > 0);
  if (types.length === 0 || targetFP <= 0) return {};

  // Precompute FP per unit; skip types we can't price.
  const unitFPs = new Map<string, number>();
  for (const [id] of types) {
    const stats = shipStats[id];
    if (stats) {
      const fp = computeUnitFP(stats, config);
      if (fp > 0) unitFPs.set(id, fp);
    }
  }
  if (unitFPs.size === 0) return {};

  const usableTypes = types.filter(([id]) => unitFPs.has(id));
  const totalRatio = usableTypes.reduce((s, [, r]) => s + r, 0);

  // Step 1 : proportional allocation, floored to integers.
  const fleet: Record<string, number> = {};
  for (const [id, ratio] of usableTypes) {
    const unitFP = unitFPs.get(id)!;
    const budget = targetFP * (ratio / totalRatio);
    const count = Math.floor(budget / unitFP);
    if (count > 0) fleet[id] = count;
  }

  // Step 2 : top up the residual with the lightest unit so we hit/just exceed
  // the target. Always pick the lightest available — guarantees we can close
  // any gap without massive overshoot.
  let lightestId = '';
  let lightestFP = Infinity;
  for (const [id] of usableTypes) {
    const fp = unitFPs.get(id)!;
    if (fp < lightestFP) {
      lightestFP = fp;
      lightestId = id;
    }
  }

  const currentFP = computeFleetFP(fleet, shipStats, config);
  if (currentFP < targetFP && lightestId) {
    const remaining = targetFP - currentFP;
    const extra = Math.ceil(remaining / lightestFP);
    fleet[lightestId] = (fleet[lightestId] ?? 0) + extra;
  }

  return fleet;
}
