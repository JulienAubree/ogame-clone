import { eq } from 'drizzle-orm';
import { pirateTemplates, flagships } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  simulateCombat,
  computeFleetFP,
  scaleFleetToFP,
  anomalyEnemyFP,
  type CombatInput,
  type ShipCombatConfig,
  type CombatMultipliers,
  type UnitCombatStats,
  type FPConfig,
} from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';
import {
  buildShipCombatConfigs,
  buildShipCosts,
  buildShipStatsMap,
  getCombatMultipliers,
} from '../fleet/fleet.types.js';
import { buildCombatConfig } from '@exilium/game-engine';

/**
 * Loads the flagship's combat config and forces categoryId='capital' so it
 * is targeted only as the last resort (after the whole escort has fallen).
 */
async function loadFlagshipCombatConfig(
  db: Database,
  userId: string,
  hullPercent: number,
): Promise<ShipCombatConfig | null> {
  const [flagship] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
  if (!flagship) return null;
  return {
    shipType: 'flagship',
    categoryId: 'capital', // Toujours targeté en dernier ressort
    baseShield: flagship.shield,
    baseArmor: flagship.baseArmor ?? 0,
    baseHull: Math.max(1, Math.floor(flagship.hull * hullPercent)),
    baseWeaponDamage: flagship.weapons,
    baseShotCount: flagship.shotCount ?? 1,
  };
}

export interface FleetEntry {
  count: number;
  hullPercent: number;
}

/**
 * Map an anomaly depth to a pirate template tier so the late game faces
 * heavier, more diverse compositions (battlecruisers, cruisers) instead of
 * the same scaled-up "war party of frigates".
 *   depth 1-7  → easy   (interceptors, small frigates)
 *   depth 8-14 → medium (frigates + cruisers)
 *   depth 15+  → hard   (cruisers + battlecruisers)
 */
export function anomalyTemplateTier(depth: number): 'easy' | 'medium' | 'hard' {
  if (depth <= 7) return 'easy';
  if (depth <= 14) return 'medium';
  return 'hard';
}

export interface AnomalyCombatResult {
  outcome: 'attacker' | 'defender' | 'draw';
  /** Updated player fleet after the fight. Ships dropped to 0 are removed. */
  attackerSurvivors: Record<string, FleetEntry>;
  /** Enemy ships destroyed during this fight (for recovery loot). */
  enemyDestroyed: Record<string, number>;
  /** Combat snapshot for debugging / future reports. */
  combatRounds: number;
  /** Estimated FP of the enemy fleet (for UI preview). */
  enemyFP: number;
  /** Player FP at the start of this combat (for the report). */
  playerFP: number;
  /** Initial player ships (count) — what was committed to the fight. */
  playerInitialFleet: Record<string, number>;
  /** Initial enemy fleet generated for this node. */
  enemyInitialFleet: Record<string, number>;
  /** Player losses (ships destroyed during this combat). */
  attackerLosses: Record<string, number>;
  /** Defender losses (ships destroyed = enemyDestroyed, kept here for symmetry). */
  defenderLosses: Record<string, number>;
  /** Detailed rounds, debris, stats — passed straight to buildCombatReportData. */
  rounds: import('@exilium/game-engine').CombatResult['rounds'];
  attackerStats: import('@exilium/game-engine').CombatResult['attackerStats'];
  defenderStats: import('@exilium/game-engine').CombatResult['defenderStats'];
  debris: import('@exilium/game-engine').CombatResult['debris'];
  shotsPerRound: { attacker: number; defender: number }[];
}

/**
 * Generate an enemy fleet for an anomaly node at a given depth. Returns the
 * fleet composition + estimated FP. Used both to pre-generate the next enemy
 * for UI preview and to actually run the combat.
 */
export async function generateAnomalyEnemy(
  db: Database,
  gameConfigService: GameConfigService,
  args: {
    userId: string;
    fleet: Record<string, FleetEntry>;
    depth: number;
  },
): Promise<{ enemyFleet: Record<string, number>; enemyFP: number; playerFP: number }> {
  const config = await gameConfigService.getFullConfig();

  const baseShipConfigs = buildShipCombatConfigs(config);

  // Inject flagship config so its FP is included in the player's total
  const flagshipEntry = args.fleet['flagship'];
  if (flagshipEntry && flagshipEntry.count > 0) {
    const flagshipConfig = await loadFlagshipCombatConfig(db, args.userId, flagshipEntry.hullPercent);
    if (flagshipConfig) baseShipConfigs['flagship'] = flagshipConfig;
  }

  const playerShipCounts: Record<string, number> = {};
  for (const [shipId, entry] of Object.entries(args.fleet)) {
    if (entry.count > 0) playerShipCounts[shipId] = entry.count;
  }

  // Apply hullPercent to the player's effective stats so enemy scaling is
  // proportional to the *real* current power, not pristine values.
  const shipStatsForFP: Record<string, UnitCombatStats> = {};
  for (const [id, sc] of Object.entries(baseShipConfigs)) {
    const hullPct = args.fleet[id]?.hullPercent ?? 1;
    // Flagship config is already hull-adjusted; don't double-apply.
    const hullToUse = id === 'flagship' ? sc.baseHull : Math.max(1, Math.floor(sc.baseHull * hullPct));
    shipStatsForFP[id] = {
      weapons: sc.baseWeaponDamage,
      shotCount: sc.baseShotCount,
      shield: sc.baseShield,
      hull: hullToUse,
    };
  }
  const fpConfig: FPConfig = {
    shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
    divisor: Number(config.universe.fp_divisor) || 100,
  };
  const playerFP = computeFleetFP(playerShipCounts, shipStatsForFP, fpConfig);

  // Difficulty curve: baseRatio (0.7 default) × growth^(depth-1), capped at
  // maxRatio (1.3 default). Tunable via universe_config without redeploy.
  const targetEnemyFP = anomalyEnemyFP(playerFP, args.depth, {
    baseRatio: Number(config.universe.anomaly_enemy_base_ratio) || undefined,
    growth: Number(config.universe.anomaly_difficulty_growth) || undefined,
    maxRatio: Number(config.universe.anomaly_enemy_max_ratio) || undefined,
  });

  // Tier templates by depth so the visual variety matches the difficulty
  // arc: scouts at the top, war parties in the middle, armadas at the bottom.
  const tier = anomalyTemplateTier(args.depth);
  const templates = await db.select().from(pirateTemplates).where(eq(pirateTemplates.tier, tier));
  const fallbackTemplates = templates.length > 0
    ? templates
    : await db.select().from(pirateTemplates).where(eq(pirateTemplates.tier, 'medium'));
  if (fallbackTemplates.length === 0) {
    throw new Error('No pirate templates available for anomaly combat');
  }
  const template = fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
  const templateShips = template.ships as Record<string, number>;

  const enemyFleet = scaleFleetToFP(templateShips, Math.max(1, Math.round(targetEnemyFP)), shipStatsForFP, fpConfig);
  const enemyFP = computeFleetFP(enemyFleet, shipStatsForFP, fpConfig);

  return { enemyFleet, enemyFP, playerFP };
}

/**
 * Resolve a single anomaly node combat. Builds a custom shipConfigs where each
 * player ship type has baseHull = original × hullPercent[type] (the cumulative
 * damage carried over from previous nodes). Uses a pre-defined enemy fleet
 * (passed in args) so the player can see exactly what they're fighting before
 * confirming.
 */
export async function runAnomalyNode(
  db: Database,
  gameConfigService: GameConfigService,
  args: {
    userId: string;
    fleet: Record<string, FleetEntry>;
    depth: number;
    predefinedEnemy: { fleet: Record<string, number>; fp: number };
  },
): Promise<AnomalyCombatResult> {
  const config = await gameConfigService.getFullConfig();

  // 1. Build player ship counts (count only, hull is applied via shipConfigs override)
  const playerShipCounts: Record<string, number> = {};
  for (const [shipId, entry] of Object.entries(args.fleet)) {
    if (entry.count > 0) playerShipCounts[shipId] = entry.count;
  }

  // 2. Build base ship configs, then override hull with current hullPercent.
  //    Le flagship est ajouté manuellement avec catégorie 'capital' (ciblé en
  //    dernier) — sans ça, il n'aurait aucune stat dans le combat.
  const baseShipConfigs = buildShipCombatConfigs(config);
  const flagshipEntry = args.fleet['flagship'];
  if (flagshipEntry && flagshipEntry.count > 0) {
    const flagshipConfig = await loadFlagshipCombatConfig(db, args.userId, flagshipEntry.hullPercent);
    if (flagshipConfig) baseShipConfigs['flagship'] = flagshipConfig;
  }
  const shipConfigs: Record<string, ShipCombatConfig> = { ...baseShipConfigs };
  for (const [shipId, entry] of Object.entries(args.fleet)) {
    const base = baseShipConfigs[shipId];
    if (!base) continue;
    // Flagship config is already hull-adjusted; for others, apply hullPercent here.
    if (shipId === 'flagship') {
      shipConfigs[shipId] = base;
    } else {
      shipConfigs[shipId] = {
        ...base,
        baseHull: Math.max(1, Math.floor(base.baseHull * entry.hullPercent)),
      };
    }
  }

  // 3. Compute player FP on the *current* (degraded) stats
  const shipStatsForFP: Record<string, UnitCombatStats> = {};
  for (const [id, sc] of Object.entries(shipConfigs)) {
    shipStatsForFP[id] = {
      weapons: sc.baseWeaponDamage,
      shotCount: sc.baseShotCount,
      shield: sc.baseShield,
      hull: sc.baseHull,
    };
  }
  const fpConfig: FPConfig = {
    shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
    divisor: Number(config.universe.fp_divisor) || 100,
  };
  const playerFP = computeFleetFP(playerShipCounts, shipStatsForFP, fpConfig);

  // 4. Use the pre-defined enemy (already scaled at the previous transition)
  const enemyFleet = args.predefinedEnemy.fleet;
  const enemyFP = args.predefinedEnemy.fp;

  // 7. Combat
  const combatConfig = buildCombatConfig(config.universe, { pillageRatio: 0 });
  const playerMultipliers: CombatMultipliers = await getCombatMultipliers(db, args.userId, config.bonuses);
  const enemyMultipliers: CombatMultipliers = { weapons: 1, shielding: 1, armor: 1 };

  const shipStatsMap = buildShipStatsMap(config);
  void shipStatsMap; // built for future use; not needed for combat input

  const shipCosts = buildShipCosts(config);
  shipCosts['flagship'] = { minerai: 0, silicium: 0 }; // No debris from flagship
  const shipIdSet = new Set(Object.keys(config.ships));
  shipIdSet.add('flagship');

  const combatInput: CombatInput = {
    attackerFleet: playerShipCounts,
    defenderFleet: enemyFleet,
    defenderDefenses: {},
    attackerMultipliers: playerMultipliers,
    defenderMultipliers: enemyMultipliers,
    combatConfig,
    shipConfigs,
    shipCosts,
    shipIds: shipIdSet,
    defenseIds: new Set(Object.keys(config.defenses)),
  };
  const result = simulateCombat(combatInput);

  // 8. Build attackerSurvivors with new hullPercent from final round
  const lastRound = result.rounds[result.rounds.length - 1];
  const attackerSurvivors: Record<string, FleetEntry> = {};
  for (const [shipId, entry] of Object.entries(args.fleet)) {
    const finalCount = lastRound?.attackerShips[shipId] ?? 0;
    if (finalCount <= 0) continue;
    const hp = lastRound?.attackerHPByType?.[shipId];
    let newHullPercent = entry.hullPercent;
    if (hp && hp.hullMax > 0) {
      newHullPercent = Math.max(0.05, hp.hullRemaining / hp.hullMax);
    }
    attackerSurvivors[shipId] = { count: finalCount, hullPercent: newHullPercent };
  }

  // 9. Compute enemy destroyed (initial enemy count - survivors)
  const enemyDestroyed: Record<string, number> = {};
  for (const [shipId, initial] of Object.entries(enemyFleet)) {
    const survived = lastRound?.defenderShips[shipId] ?? 0;
    const killed = initial - survived;
    if (killed > 0) enemyDestroyed[shipId] = killed;
  }

  // 10. Compute attacker losses + shots per round (for the report)
  const attackerLosses: Record<string, number> = {};
  for (const [shipId, initial] of Object.entries(playerShipCounts)) {
    const survived = lastRound?.attackerShips[shipId] ?? 0;
    const lost = initial - survived;
    if (lost > 0) attackerLosses[shipId] = lost;
  }
  const shotsPerRound = result.rounds.map((round, i) => {
    const attFleet = i === 0 ? playerShipCounts : result.rounds[i - 1].attackerShips;
    const defFleet = i === 0 ? enemyFleet : result.rounds[i - 1].defenderShips;
    const attShots = Object.entries(attFleet).reduce((sum, [id, count]) => sum + count * (config.ships[id]?.shotCount ?? 1), 0);
    const defShots = Object.entries(defFleet).reduce((sum, [id, count]) => sum + count * (config.ships[id]?.shotCount ?? 1), 0);
    return { attacker: attShots, defender: defShots };
  });

  return {
    outcome: result.outcome,
    attackerSurvivors,
    enemyDestroyed,
    combatRounds: result.rounds.length,
    enemyFP,
    playerFP,
    playerInitialFleet: playerShipCounts,
    enemyInitialFleet: enemyFleet,
    attackerLosses,
    defenderLosses: enemyDestroyed,
    rounds: result.rounds,
    attackerStats: result.attackerStats,
    defenderStats: result.defenderStats,
    debris: result.debris,
    shotsPerRound,
  };
}
