import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { flagships } from '@exilium/db';
import type { Database } from '@exilium/db';
import { DEFAULT_HULL_ID } from '@exilium/shared';
import {
  simulateCombat,
  computeFleetFP,
  scaleFleetToFP,
  anomalyEnemyFP,
  applyModulesToStats,
  parseLoadout,
  levelMultiplier,
  type CombatInput,
  type ShipCombatConfig,
  type CombatMultipliers,
  type UnitCombatStats,
  type FPConfig,
  type ModuleDefinitionLite,
  type CombatContext,
} from '@exilium/game-engine';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createModulesService } from '../modules/modules.service.js';
import {
  buildShipCombatConfigs,
  buildShipCosts,
  buildShipStatsMap,
  getCombatMultipliers,
} from '../fleet/fleet.types.js';
import { buildCombatConfig } from '@exilium/game-engine';

/**
 * Robust parser for game-config numbers : preserves intentional 0 values
 * (kill-switch). `Number(x) || default` would clobber 0 with `default`.
 */
function parseConfigNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Loads the flagship's combat config including:
 *  - baseStats from DB row
 *  - +hull passive bonuses (bonus_weapons / bonus_armor / bonus_shot_count) when status='active'
 *  - ×level multiplier (V4-XP : 1 + level × 0.05) on weapons/shield/hull/baseArmor
 *  - ×hullPercent on the (multiplied) hull
 *  - modules applied via applyModulesToStats on the (effective) stats
 *
 * Forces categoryId='capital' so the flagship is targeted last in V3 logic
 * (V4 flagship-only : irrelevant since no escort, but cohérent).
 */
async function loadFlagshipCombatConfig(
  db: Database,
  gameConfigService: GameConfigService,
  userId: string,
  hullPercent: number,
  modulesContext?: {
    equippedModules: ModuleDefinitionLite[];
    weaponModules?: ModuleDefinitionLite[];
    combatContext: CombatContext;
  },
): Promise<ShipCombatConfig | null> {
  const [flagship] = await db.select().from(flagships).where(eq(flagships.userId, userId)).limit(1);
  if (!flagship) return null;

  const config = await gameConfigService.getFullConfig();
  const hullConfig = flagship.hullId ? (config.hulls[flagship.hullId] ?? null) : null;

  // Compute level multiplier (V4-XP)
  const rawLevelPct = Number(config.universe.flagship_xp_level_multiplier_pct);
  const levelPct = Number.isFinite(rawLevelPct) ? rawLevelPct : 0.05;
  const levelMult = levelMultiplier(flagship.level, levelPct);

  // Apply hull passive bonuses (only when stationed) BEFORE level mult
  const hullBonusWeapons = (hullConfig && flagship.status === 'active') ? (hullConfig.passiveBonuses.bonus_weapons ?? 0) : 0;
  const hullBonusArmor = (hullConfig && flagship.status === 'active') ? (hullConfig.passiveBonuses.bonus_armor ?? 0) : 0;
  const hullBonusShotCount = (hullConfig && flagship.status === 'active') ? (hullConfig.passiveBonuses.bonus_shot_count ?? 0) : 0;

  // Effective stats with level mult applied (weapons/shield/hull/armor only)
  let baseDamage = Math.round((flagship.weapons + hullBonusWeapons) * levelMult);
  let baseShield = Math.round(flagship.shield * levelMult);
  let baseHull = Math.max(1, Math.floor(Math.round(flagship.hull * levelMult) * hullPercent));
  let baseArmor = Math.round((flagship.baseArmor + hullBonusArmor) * levelMult);
  // shotCount = base + hull bonus (NOT multiplied by level — count entier)
  const baseShotCount = (flagship.shotCount ?? 1) + hullBonusShotCount;

  if (modulesContext) {
    const modified = applyModulesToStats(
      { damage: baseDamage, hull: baseHull, shield: baseShield, armor: baseArmor, cargo: 0, speed: 0, regen: 0 },
      modulesContext.equippedModules,
      modulesContext.combatContext,
    );
    baseDamage = Math.round(modified.damage);
    baseShield = Math.round(modified.shield);
    baseHull = Math.max(1, Math.round(modified.hull));
    baseArmor = Math.round(modified.armor);
  }

  // V7-WeaponProfiles : build the flagship weapon batteries.
  //  - 1 base profile from the hull's defaultWeaponProfile (damage/shots
  //    derived from the post-mods baseDamage / baseShotCount)
  //  - +1 profile per equipped weapon module (effect.profile)
  // ShipCombatConfig's `weapons` field (NOT `weaponProfiles`) is what the
  // combat engine consumes — see combat.ts line ~183 where it maps over
  // `config.weapons` and falls back to a single synthetic battery if absent.
  type WeaponBattery = NonNullable<ShipCombatConfig['weapons']>[number];
  const hullDefaultProfile = (hullConfig as { defaultWeaponProfile?: {
    targetCategory?: string;
    rafale?: { category?: string; count: number };
    hasChainKill?: boolean;
  } } | null)?.defaultWeaponProfile;
  const baseWeaponProfile: WeaponBattery = {
    damage: baseDamage,
    shots: baseShotCount,
    targetCategory: hullDefaultProfile?.targetCategory ?? 'medium',
    ...(hullDefaultProfile?.rafale && hullDefaultProfile.rafale.category
      ? { rafale: { category: hullDefaultProfile.rafale.category, count: hullDefaultProfile.rafale.count } }
      : {}),
    ...(hullDefaultProfile?.hasChainKill ? { hasChainKill: true } : {}),
  };
  const moduleBatteries: WeaponBattery[] = [];
  for (const m of modulesContext?.weaponModules ?? []) {
    if (m.effect.type !== 'weapon') continue;
    const p = m.effect.profile;
    moduleBatteries.push({
      damage: p.damage,
      shots: p.shots,
      targetCategory: p.targetCategory ?? 'medium',
      ...(p.rafale && p.rafale.category
        ? { rafale: { category: p.rafale.category, count: p.rafale.count } }
        : {}),
      ...(p.hasChainKill ? { hasChainKill: true } : {}),
    });
  }
  const weapons: WeaponBattery[] = [baseWeaponProfile, ...moduleBatteries];

  return {
    shipType: 'flagship',
    categoryId: 'capital', // Toujours targeté en dernier ressort
    baseShield,
    baseArmor,
    baseHull,
    baseWeaponDamage: baseDamage,
    baseShotCount,
    weapons,
  };
}

/**
 * Helper: build a `CombatContext` for the flagship — used both by
 * `generateAnomalyEnemy` (with neutral defaults so FP scaling stays
 * consistent with the actual combat) and by `runAnomalyNode`.
 */
function buildCombatContext(args: {
  roundIndex?: number;
  currentHullPercent: number;
  enemyFP: number;
  pendingEpicEffect?: { ability: string; magnitude: number } | null;
}): CombatContext {
  return {
    roundIndex: args.roundIndex ?? 1,
    currentHullPercent: args.currentHullPercent,
    enemyFP: args.enemyFP,
    pendingEpicEffect: args.pendingEpicEffect
      ? (args.pendingEpicEffect as CombatContext['pendingEpicEffect'])
      : null,
  };
}

/**
 * Resolve a raw equippedModules snapshot (Record<hullId, slot>) into the
 * pool-validated module list for the flagship's current hull. Returns
 * passive + weapon modules separately. Empty arrays if the loadout is
 * empty or the hull is unknown.
 *
 * V7-WeaponProfiles : `weapons` contient les modules d'arme équipés
 * (slots weaponEpic/weaponRare/weaponCommon).
 */
async function resolveEquippedModules(
  db: Database,
  modulesService: ReturnType<typeof createModulesService>,
  args: { userId: string; equippedModules?: unknown },
): Promise<{ passives: ModuleDefinitionLite[]; weapons: ModuleDefinitionLite[] }> {
  if (!args.equippedModules) return { passives: [], weapons: [] };
  const [flagshipRow] = await db.select({ hullId: flagships.hullId })
    .from(flagships).where(eq(flagships.userId, args.userId)).limit(1);
  const hullId = flagshipRow?.hullId ?? DEFAULT_HULL_ID;
  const pool = await modulesService._getPool(db);
  const equippedSnapshot = (args.equippedModules ?? {}) as Parameters<typeof parseLoadout>[0];
  const parsed = parseLoadout(equippedSnapshot, hullId, pool);
  return { passives: parsed.equipped, weapons: parsed.weapons };
}

export interface FleetEntry {
  count: number;
  hullPercent: number;
}

/**
 * Pyramid weights for the anomaly enemy composition. Tuned manually so the
 * resulting fleet "feels" like a balanced pirate raid : many lights, few
 * capital threats. Any combat ship not listed here gets a fallback weight
 * of 2, so admin-added units automatically appear in anomaly fights.
 */
const ANOMALY_FLEET_WEIGHTS: Record<string, number> = {
  interceptor: 6,
  frigate: 4,
  cruiser: 2,
  battlecruiser: 1,
};

/**
 * Build the synthetic enemy composition from ALL combat ships in the
 * config. Returns a `templateShips` map (shipId → count) that
 * `scaleFleetToFP` will then scale to the desired FP target.
 */
function buildAnomalyTemplateShips(
  config: Awaited<ReturnType<GameConfigService['getFullConfig']>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, def] of Object.entries(config.ships)) {
    if (id === 'flagship') continue;
    if ((def as { role?: string }).role !== 'combat') continue;
    out[id] = ANOMALY_FLEET_WEIGHTS[id] ?? 2;
  }
  return out;
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
 *
 * Modules are applied to the flagship's stats with a *neutral* combat
 * context (round 1, full hull, no enemy FP yet, no pending epic) so the
 * scaling stays consistent with what the actual combat will use. If the
 * caller doesn't pass `equippedModules`, the flagship's vanilla stats are
 * used (legacy behavior).
 */
export async function generateAnomalyEnemy(
  db: Database,
  gameConfigService: GameConfigService,
  modulesService: ReturnType<typeof createModulesService>,
  args: {
    userId: string;
    fleet: Record<string, FleetEntry>;
    depth: number;
    /** V5-Tiers (2026-05-04) : palier pour scaling enemy FP. Default 1. */
    tier: number;
    equippedModules?: unknown;
  },
): Promise<{ enemyFleet: Record<string, number>; enemyFP: number; playerFP: number }> {
  const config = await gameConfigService.getFullConfig();

  const baseShipConfigs = buildShipCombatConfigs(config);

  // Inject flagship config so its FP is included in the player's total. We
  // resolve the equipped modules and pass a neutral CombatContext so the FP
  // estimate matches the actual combat baseline (no pending epic, round 1).
  const flagshipEntry = args.fleet['flagship'];
  if (flagshipEntry && flagshipEntry.count > 0) {
    const { passives, weapons } = await resolveEquippedModules(db, modulesService, {
      userId: args.userId,
      equippedModules: args.equippedModules,
    });
    // V7-WeaponProfiles : on charge toujours le config flagship (même sans
    // passives) pour que le hull defaultWeaponProfile + weapon modules soient
    // bien intégrés dans le FP préview.
    const flagshipConfig = await loadFlagshipCombatConfig(
      db,
      gameConfigService,
      args.userId,
      flagshipEntry.hullPercent,
      {
        equippedModules: passives,
        weaponModules: weapons,
        combatContext: buildCombatContext({
          currentHullPercent: flagshipEntry.hullPercent,
          enemyFP: 0,
          pendingEpicEffect: null,
        }),
      },
    );
    if (flagshipConfig) baseShipConfigs['flagship'] = flagshipConfig;
  }

  const playerShipCounts: Record<string, number> = {};
  for (const [shipId, entry] of Object.entries(args.fleet)) {
    if (entry.count > 0) playerShipCounts[shipId] = entry.count;
  }

  // Apply hullPercent to the player's effective stats so enemy scaling is
  // proportional to the *real* current power, not pristine values.
  // Pass full ship config (weaponProfiles, armor, categoryId) so the V2 FP
  // formula can apply rafale/chainKill bonuses, armor durability and the
  // capital ship multiplier.
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
      armor: sc.baseArmor,
      weaponProfiles: sc.weapons,
      categoryId: sc.categoryId,
    };
  }
  const fpConfig: FPConfig = {
    shotcountExponent: Number(config.universe.fp_shotcount_exponent) || 1.5,
    divisor: Number(config.universe.fp_divisor) || 100,
  };
  const playerFP = computeFleetFP(playerShipCounts, shipStatsForFP, fpConfig);

  // V6-AbsoluteFP (2026-05-04) : enemy FP est désormais ABSOLU par palier,
  // décorrélé du player FP. Palier 1 ≈ 80 FP (débutant), palier 10 ≈ 30k FP,
  // palier 20 ≈ 6.5M FP. Le player apporte ce qu'il veut — palier 1 reste
  // accessible aux débutants, paliers élevés réservés aux hardcore.
  // playerFP reste calculé pour les logs/observability mais ne pilote plus
  // le scaling enemy.
  const targetEnemyFP = anomalyEnemyFP(args.tier, args.depth, {
    tierBaseFp: parseConfigNumber(config.universe.anomaly_tier_base_fp, 80),
    tierFpGrowth: parseConfigNumber(config.universe.anomaly_tier_fp_growth, 1.7),
    growth: parseConfigNumber(config.universe.anomaly_difficulty_growth, 1.06),
    maxRatio: parseConfigNumber(config.universe.anomaly_enemy_max_ratio, 3.0),
  });

  // Anomaly compositions include EVERY combat ship type (interceptor,
  // frigate, cruiser, battlecruiser, …) in a pyramid ratio so the player
  // always faces a mixed-arms opposition. The scaling logic adjusts the
  // counts to match the FP target — at depth 1 you might face 3 of each,
  // at depth 15 dozens.
  //
  // Pyramid weights : light units are common, heavy units are rare.
  // Unknown ships (admin-added) default to weight 2.
  const templateShips = buildAnomalyTemplateShips(config);
  if (Object.keys(templateShips).length === 0) {
    throw new Error('No combat ships available for anomaly composition');
  }

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
  modulesService: ReturnType<typeof createModulesService>,
  args: {
    userId: string;
    fleet: Record<string, FleetEntry>;
    depth: number;
    predefinedEnemy: { fleet: Record<string, number>; fp: number };
    /** V5-Tiers (2026-05-04) : palier de la run en cours. Le predefinedEnemy a
     * déjà été scaled au moment de la génération (engage ou advance précédent),
     * donc cette valeur est conservée pour cohérence/futur usage (audit). */
    tier: number;
    /** Snapshot of the equipped modules (taken at engage). */
    equippedModules?: unknown;
    /** Pending epic effect persisted by a previous activateEpic call. */
    pendingEpicEffect?: { ability: string; magnitude: number } | null;
  },
): Promise<AnomalyCombatResult> {
  const config = await gameConfigService.getFullConfig();

  // 1. V4 : flagship-only. Tout autre ship dans args.fleet est ignoré (legacy data).
  const flagshipEntry = args.fleet['flagship'];
  if (!flagshipEntry || flagshipEntry.count <= 0) {
    // Cas impossible si engage V4 a fait son job, mais défensif. Utilise TRPCError
    // pour que le front puisse afficher un message propre plutôt qu'un 500.
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Anomalie incompatible (flagship manquant) — abandonnez la run pour réinitialiser',
    });
  }
  const playerShipCounts: Record<string, number> = { flagship: 1 };

  // 2. Build base ship configs, then override hull with current hullPercent.
  //    Le flagship est ajouté manuellement avec catégorie 'capital' (ciblé en
  //    dernier) — sans ça, il n'aurait aucune stat dans le combat.
  const baseShipConfigs = buildShipCombatConfigs(config);
  {
    // Resolve modules + build a CombatContext for the active fight.
    const { passives, weapons } = await resolveEquippedModules(db, modulesService, {
      userId: args.userId,
      equippedModules: args.equippedModules,
    });
    const combatContext = buildCombatContext({
      roundIndex: 1,
      currentHullPercent: flagshipEntry.hullPercent,
      enemyFP: args.predefinedEnemy.fp,
      pendingEpicEffect: args.pendingEpicEffect ?? null,
    });
    // V7-WeaponProfiles : on charge toujours le config flagship pour que le
    // hull defaultWeaponProfile + weapon modules soient intégrés au combat.
    const flagshipConfig = await loadFlagshipCombatConfig(
      db,
      gameConfigService,
      args.userId,
      flagshipEntry.hullPercent,
      {
        equippedModules: passives,
        weaponModules: weapons,
        combatContext,
      },
    );
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

  // 8. V4 : seul le flagship est tracké côté player
  const lastRound = result.rounds[result.rounds.length - 1];
  const attackerSurvivors: Record<string, FleetEntry> = {};
  const flagshipFinalCount = lastRound?.attackerShips['flagship'] ?? 0;
  if (flagshipFinalCount > 0) {
    const hp = lastRound?.attackerHPByType?.['flagship'];
    let newHullPercent = flagshipEntry.hullPercent;
    if (hp && hp.hullMax > 0) {
      newHullPercent = Math.max(0.05, hp.hullRemaining / hp.hullMax);
    }
    attackerSurvivors['flagship'] = { count: 1, hullPercent: newHullPercent };
  }
  // Si flagshipFinalCount = 0 → attackerSurvivors = {} → wipe

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
