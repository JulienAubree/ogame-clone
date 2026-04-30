import { eq } from 'drizzle-orm';
import { pirateTemplates } from '@exilium/db';
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

export interface FleetEntry {
  count: number;
  hullPercent: number;
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
 * Resolve a single anomaly node combat. Builds a custom shipConfigs where each
 * player ship type has baseHull = original × hullPercent[type] (the cumulative
 * damage carried over from previous nodes). Picks an enemy from the pirate
 * templates, scaled to the target FP via the standard scaleFleetToFP helper.
 */
export async function runAnomalyNode(
  db: Database,
  gameConfigService: GameConfigService,
  args: {
    userId: string;
    fleet: Record<string, FleetEntry>;
    depth: number;
  },
): Promise<AnomalyCombatResult> {
  const config = await gameConfigService.getFullConfig();

  // 1. Build player ship counts (count only, hull is applied via shipConfigs override)
  const playerShipCounts: Record<string, number> = {};
  for (const [shipId, entry] of Object.entries(args.fleet)) {
    if (entry.count > 0) playerShipCounts[shipId] = entry.count;
  }

  // 2. Build base ship configs, then override hull with current hullPercent
  const baseShipConfigs = buildShipCombatConfigs(config);
  const shipConfigs: Record<string, ShipCombatConfig> = { ...baseShipConfigs };
  for (const [shipId, entry] of Object.entries(args.fleet)) {
    const base = baseShipConfigs[shipId];
    if (!base) continue;
    shipConfigs[shipId] = {
      ...base,
      baseHull: Math.max(1, Math.floor(base.baseHull * entry.hullPercent)),
    };
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

  // 4. Target enemy FP from formula
  const growth = Number(config.universe.anomaly_difficulty_growth) || 1.3;
  const targetEnemyFP = anomalyEnemyFP(playerFP, args.depth, growth);

  // 5. Pick an enemy template (mid tier — anomalies are an endgame activity)
  const templates = await db.select().from(pirateTemplates).where(eq(pirateTemplates.tier, 'medium'));
  const fallbackTemplates = templates.length > 0
    ? templates
    : await db.select().from(pirateTemplates).where(eq(pirateTemplates.tier, 'easy'));
  if (fallbackTemplates.length === 0) {
    throw new Error('No pirate templates available for anomaly combat');
  }
  const template = fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
  const templateShips = template.ships as Record<string, number>;

  // 6. Scale enemy to target FP
  const enemyFleet = scaleFleetToFP(templateShips, Math.max(1, Math.round(targetEnemyFP)), shipStatsForFP, fpConfig);
  const enemyFP = computeFleetFP(enemyFleet, shipStatsForFP, fpConfig);

  // 7. Combat
  const combatConfig = buildCombatConfig(config.universe, { pillageRatio: 0 });
  const playerMultipliers: CombatMultipliers = await getCombatMultipliers(db, args.userId, config.bonuses);
  const enemyMultipliers: CombatMultipliers = { weapons: 1, shielding: 1, armor: 1 };

  const shipStatsMap = buildShipStatsMap(config);
  void shipStatsMap; // built for future use; not needed for combat input

  const combatInput: CombatInput = {
    attackerFleet: playerShipCounts,
    defenderFleet: enemyFleet,
    defenderDefenses: {},
    attackerMultipliers: playerMultipliers,
    defenderMultipliers: enemyMultipliers,
    combatConfig,
    shipConfigs,
    shipCosts: buildShipCosts(config),
    shipIds: new Set(Object.keys(config.ships)),
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
