import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { flagships } from '@exilium/db';
import type { Database } from '@exilium/db';
import { DEFAULT_HULL_ID } from '@exilium/shared';
import {
  simulateCombat,
  computeUnitFP,
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
  type BossSkillRuntime,
} from '@exilium/game-engine';
import type { ActiveBossBuff, BossEntry, BossStats, BossWeaponProfile } from '../anomaly-content/anomaly-bosses.types.js';
import { bossUnitId } from '../anomaly-content/anomaly-bosses.types.js';
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
  /** V9 Boss — buffs actifs accordés par les boss vaincus dans la run.
   *  Appliqués APRES les modules pour scaler les stats déjà mod-boostées. */
  activeBuffs?: ActiveBossBuff[],
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

  // V9 Boss — applique les buffs actifs (cumulatifs) APRES les modules.
  // damage_boost / shield_amp / armor_amp sont des multiplicateurs sur la
  // stat correspondante. hull_repair / extra_charge / module_unlock sont
  // gérés one-time ailleurs (au moment de l'apply du buff dans le service).
  if (activeBuffs && activeBuffs.length > 0) {
    let damageMult = 1;
    let shieldMult = 1;
    let armorMult = 1;
    for (const buff of activeBuffs) {
      if (buff.type === 'damage_boost') damageMult *= 1 + buff.magnitude;
      else if (buff.type === 'shield_amp') shieldMult *= 1 + buff.magnitude;
      else if (buff.type === 'armor_amp') armorMult *= 1 + buff.magnitude;
    }
    baseDamage = Math.round(baseDamage * damageMult);
    baseShield = Math.round(baseShield * shieldMult);
    baseArmor = Math.round(baseArmor * armorMult);
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
    const p = m.effect.profile as {
      damage: number;
      damageMultiplier?: number;
      shots: number;
      targetCategory?: string;
      rafale?: { category?: string; count: number };
      hasChainKill?: boolean;
    };
    moduleBatteries.push({
      damage: p.damage, // fallback absolu (V7) — utilisé si damageMultiplier absent
      // V8.1 — propagation du multiplicateur. Si présent, le combat consomme
      // baseWeaponDamage × damageMultiplier au lieu du `damage` absolu.
      ...(p.damageMultiplier !== undefined ? { damageMultiplier: p.damageMultiplier } : {}),
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

/**
 * V9.2 — Construit la `ShipCombatConfig` d'un boss-as-unit à partir de ses
 * `bossStats`. Toujours `categoryId='boss'` pour qu'il soit ciblé en dernier
 * (cf. COMBAT_CATEGORIES). Si `weaponProfiles` non défini, un profile unique
 * est synthétisé depuis weapons / shotCount.
 */
export function buildBossShipConfig(boss: BossEntry, stats: BossStats): ShipCombatConfig {
  const profiles: NonNullable<ShipCombatConfig['weapons']> = stats.weaponProfiles && stats.weaponProfiles.length > 0
    ? stats.weaponProfiles.map((p: BossWeaponProfile) => {
        // V8.1 — un profile peut déclarer damageMultiplier (× baseWeaponDamage)
        // OU damage absolu. On propage les deux ; combat.ts choisit lequel
        // appliquer (priorité au multiplicateur si présent).
        const baseEntry: NonNullable<ShipCombatConfig['weapons']>[number] = {
          damage: p.damage ?? 0,
          shots: p.shots,
          targetCategory: p.targetCategory ?? 'medium',
        };
        if (p.damageMultiplier !== undefined) baseEntry.damageMultiplier = p.damageMultiplier;
        if (p.rafale && p.rafale.count > 0) {
          baseEntry.rafale = {
            category: p.rafale.category ?? 'medium',
            count: p.rafale.count,
          };
        }
        if (p.hasChainKill) baseEntry.hasChainKill = true;
        return baseEntry;
      })
    : [{
        damage: stats.weapons,
        shots: stats.shotCount,
        targetCategory: 'medium',
      }];
  return {
    shipType: bossUnitId(boss.id),
    categoryId: 'boss',
    baseShield: stats.shield,
    baseArmor: stats.armor,
    baseHull: stats.hull,
    baseWeaponDamage: stats.weapons,
    baseShotCount: stats.shotCount,
    weapons: profiles,
  };
}

/**
 * V9.2 — Convertit une ShipCombatConfig en UnitCombatStats (pour computeUnitFP /
 * computeFleetFP). DRY helper utilisé dans le code anomaly et qui pourrait
 * monter dans game-engine plus tard.
 */
function shipConfigToUnitStats(sc: ShipCombatConfig): UnitCombatStats {
  return {
    weapons: sc.baseWeaponDamage,
    shotCount: sc.baseShotCount,
    shield: sc.baseShield,
    hull: sc.baseHull,
    armor: sc.baseArmor,
    weaponProfiles: sc.weapons,
    categoryId: sc.categoryId,
  };
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
    /** V9 Boss — buffs actifs (passé en lecture seule pour cohérence FP preview). */
    activeBuffs?: ActiveBossBuff[];
    /** V9 Boss — fpMultiplier additionnel appliqué au FP target (boss = 1.5×
     *  un combat normal de la même depth). */
    bossFpMultiplier?: number;
    /**
     * V9.2 — Boss à injecter dans la flotte. Si défini ET que `boss.bossStats`
     * existe, l'unité boss apparaît dans `enemyFleet` avec id `boss:{id}` et
     * count=1, et le FP target est réparti entre boss et escortes selon
     * `boss.escortFpRatio`. Si `bossStats` absent, comportement V9 (FP
     * boost diffus, pas de visuel boss en combat).
     */
    boss?: BossEntry | null;
  },
): Promise<{
  enemyFleet: Record<string, number>;
  enemyFP: number;
  playerFP: number;
  /** V9.2 — Stats du boss-as-unit injecté (si applicable), pour que le caller
   *  puisse les passer à `runAnomalyNode` (qui les attache à shipConfigs). */
  bossShipConfig?: ShipCombatConfig;
}> {
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
      args.activeBuffs,
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
  const baseTargetFP = anomalyEnemyFP(args.tier, args.depth, {
    tierBaseFp: parseConfigNumber(config.universe.anomaly_tier_base_fp, 80),
    tierFpGrowth: parseConfigNumber(config.universe.anomaly_tier_fp_growth, 1.7),
    growth: parseConfigNumber(config.universe.anomaly_difficulty_growth, 1.06),
    maxRatio: parseConfigNumber(config.universe.anomaly_enemy_max_ratio, 3.0),
  });
  // V9 Boss — multiplicateur additionnel appliqué au FP target (default 1.0
  // = comportement régulier ; un boss seedé est ~1.3 à 2.0×).
  const targetEnemyFP = baseTargetFP * (args.bossFpMultiplier ?? 1.0);

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

  // V9.2 — Boss-as-unit : si le boss a des bossStats, on l'injecte comme
  // une vraie unité dans la flotte ennemie. Le FP target restant après
  // déduction du FP boss est utilisé pour scaler les escortes (gardant
  // la cohérence avec `targetEnemyFP`).
  let bossShipConfig: ShipCombatConfig | undefined;
  let bossUnitFP = 0;
  if (args.boss && args.boss.bossStats) {
    bossShipConfig = buildBossShipConfig(args.boss, args.boss.bossStats);
    const bossStats = shipConfigToUnitStats(bossShipConfig);
    bossUnitFP = computeUnitFP(bossStats, fpConfig);
    // Inject le shipStats du boss pour que computeFleetFP le voie.
    shipStatsForFP[bossShipConfig.shipType] = bossStats;
  }

  // FP target des escortes : le reste du target après déduction du FP boss,
  // multiplié par `escortFpRatio` (default 0.4 = boss prend 60%, escortes 40%).
  // Floor à 50 FP pour garantir au moins une petite escorte (sinon le boss
  // en solo signifie pas de progression de combat = trop facile/dur selon
  // les stats). Si bossUnitFP > targetEnemyFP, on n'a pas d'escorte (cas
  // extrême : un boss sur-statué).
  const escortRatio = args.boss?.escortFpRatio ?? 0.4;
  const escortBudget = bossShipConfig
    ? Math.max(50, Math.round((targetEnemyFP - bossUnitFP) * escortRatio))
    : Math.max(1, Math.round(targetEnemyFP));

  const enemyFleet = scaleFleetToFP(
    templateShips,
    escortBudget,
    shipStatsForFP,
    fpConfig,
  );
  // V9.2 — Inject le boss avec count=1 dans la flotte enemy.
  if (bossShipConfig) {
    enemyFleet[bossShipConfig.shipType] = 1;
  }
  const enemyFP = computeFleetFP(enemyFleet, shipStatsForFP, fpConfig);

  return {
    enemyFleet,
    enemyFP,
    playerFP,
    ...(bossShipConfig ? { bossShipConfig } : {}),
  };
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
    /** V9 Boss — buffs actifs accordés par les boss vaincus dans cette run. */
    activeBuffs?: ActiveBossBuff[];
    /** V9 Boss — skills runtime injectés au combat quand le node est un boss. */
    bossSkills?: BossSkillRuntime[];
    /**
     * V9.2 — Boss à injecter dans la flotte ennemie. Si défini, son
     * `bossStats` est convertie en `ShipCombatConfig` et merge dans
     * `shipConfigs` pour que la simulation reconnaisse l'unité boss
     * (id `boss:{id}`, count=1, category='boss').
     */
    boss?: BossEntry | null;
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
      args.activeBuffs,
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

  // V9.2 — Boss-as-unit : inject la ShipCombatConfig du boss s'il a des
  // bossStats. Le combat reconnaît alors `boss:{id}` comme une unité full
  // (hull/shield/armor/weapons) côté défender. Si bossStats absent, on
  // skip et la fight reste en mode V9 (FP boost diffus).
  if (args.boss && args.boss.bossStats) {
    const bossConfig = buildBossShipConfig(args.boss, args.boss.bossStats);
    shipConfigs[bossConfig.shipType] = bossConfig;
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
  // V7.3 : anomaly = pas de combat indécis. On override maxRounds très haut
  // (vs ~4 par défaut en PvP) pour qu'un camp meure systématiquement avant
  // le timeout. Avec minDamagePerHit=1, un combat termine toujours en max
  // ~hull rounds (donc 9999 couvre tous les cas réalistes). Si malgré tout
  // le résultat est 'draw' (très edge), on force un winner via les counts
  // de survivants juste après simulateCombat.
  const combatConfig = buildCombatConfig(config.universe, {
    pillageRatio: 0,
    maxRounds: 9999,
  });
  const playerMultipliers: CombatMultipliers = await getCombatMultipliers(db, args.userId, config.bonuses);
  const enemyMultipliers: CombatMultipliers = { weapons: 1, shielding: 1, armor: 1 };

  const shipStatsMap = buildShipStatsMap(config);
  void shipStatsMap; // built for future use; not needed for combat input

  const shipCosts = buildShipCosts(config);
  shipCosts['flagship'] = { minerai: 0, silicium: 0 }; // No debris from flagship
  const shipIdSet = new Set(Object.keys(config.ships));
  shipIdSet.add('flagship');
  // V9.2 — Boss-as-unit : déclare l'unité boss dans shipIds + shipCosts pour
  // que les phases d'analyse (debris, recovery) ne bronchent pas. Pas de
  // debris ni de recovery sur un boss : c'est une entité unique.
  if (args.boss && args.boss.bossStats) {
    const bossId = bossUnitId(args.boss.id);
    shipIdSet.add(bossId);
    shipCosts[bossId] = { minerai: 0, silicium: 0 };
  }

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
    ...(args.bossSkills && args.bossSkills.length > 0 ? { bossSkills: args.bossSkills } : {}),
  };
  const rawResult = simulateCombat(combatInput);

  // V7.3 : safety net si malgré maxRounds=9999 le combat reste indécis.
  // En anomaly, "draw" n'a pas de sens (rogue-lite : tu gagnes ou tu meurs),
  // donc on force le winner via le hull% du flagship :
  //   - flagship détruit (count 0) → defender (impossible ici car déjà géré)
  //   - flagship vivant à >50% hull → attacker (player wins)
  //   - flagship vivant à ≤50% hull → defender (player perd la run)
  // Choix conservateur : un combat qui n'aboutit pas en 9999 rounds est
  // mathématiquement bloqué — on tranche en faveur du camp dominant.
  let outcome = rawResult.outcome;
  if (outcome === 'draw') {
    const lastRoundFinal = rawResult.rounds[rawResult.rounds.length - 1];
    const flagshipHP = lastRoundFinal?.attackerHPByType?.['flagship'];
    const flagshipHullPct = (flagshipHP && flagshipHP.hullMax > 0)
      ? flagshipHP.hullRemaining / flagshipHP.hullMax
      : 0;
    outcome = flagshipHullPct > 0.5 ? 'attacker' : 'defender';
  }
  const result = { ...rawResult, outcome };

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
