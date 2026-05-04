// ── Types ──

export interface ShipCategory {
  id: string;
  name: string;
  targetable: boolean;
  targetOrder: number;
}

/**
 * A weapon battery on a combat unit. Each battery has its own damage/shots
 * and a preferred target category. Optional traits:
 * - `rafale`: bonus shots when the current target matches a given category
 *            (deterministic, on top of the base `shots`).
 * - `hasChainKill`: when a shot destroys its target, fires 1 bonus shot on
 *                  another unit of the same category as the one just killed.
 */
export interface WeaponProfile {
  damage: number;
  shots: number;
  /**
   * V8.1 — multiplicateur du damage du tireur. Quand présent, le damage
   * effectif d'une battery devient `tireur.baseWeaponDamage × damageMultiplier`
   * (cf. createUnits ci-dessous). Permet aux weapon modules du flagship de
   * scaler automatiquement avec l'armement principal (level / research /
   * passive boost) sans hardcoder une valeur absolue par module.
   * Si absent, comportement V7 : `damage` est utilisé tel quel.
   */
  damageMultiplier?: number;
  targetCategory: string;
  rafale?: { category: string; count: number };
  hasChainKill?: boolean;
}

export interface ShipCombatConfig {
  shipType: string;
  categoryId: string;
  baseShield: number;
  baseArmor: number;       // flat damage reduction — scaled by the armor research multiplier
  baseHull: number;
  baseWeaponDamage: number;
  baseShotCount: number;
  /** Multi-battery profile. If absent, a single battery is synthesized from
   *  baseWeaponDamage/baseShotCount + the side's fallback target priority. */
  weapons?: WeaponProfile[];
}

export interface CombatConfig {
  maxRounds: number;
  debrisRatio: number;
  defenseRepairRate: number;
  pillageRatio: number;
  minDamagePerHit: number;
  researchBonusPerLevel: number;
  categories: ShipCategory[];
}

export interface CombatMultipliers {
  weapons: number;
  shielding: number;
  armor: number;
}

export interface CombatInput {
  attackerFleet: Record<string, number>;
  defenderFleet: Record<string, number>;
  defenderDefenses: Record<string, number>;
  attackerMultipliers: CombatMultipliers;
  defenderMultipliers: CombatMultipliers;
  combatConfig: CombatConfig;
  shipConfigs: Record<string, ShipCombatConfig>;
  shipCosts: Record<string, { minerai: number; silicium: number }>;
  shipIds: Set<string>;
  defenseIds: Set<string>;
  rngSeed?: number;
  planetaryShieldCapacity?: number;
  detailedLog?: boolean;
}

interface CombatUnit {
  id: string;
  shipType: string;
  category: string;
  shield: number;
  maxShield: number;
  armor: number;
  hull: number;
  maxHull: number;
  weapons: WeaponProfile[];
  destroyed: boolean;
}

export interface CombatSideStats {
  damageDealtByCategory: Record<string, number>;
  damageReceivedByCategory: Record<string, number>;
  shieldAbsorbed: number;
  armorBlocked: number;
  overkillWasted: number;
}

export interface UnitTypeDamageReceived {
  shieldDamage: number;
  hullDamage: number;
  destroyed: number;
}

export interface UnitTypeHP {
  shieldRemaining: number;
  shieldMax: number;
  hullRemaining: number;
  hullMax: number;
}

export interface RoundResult {
  round: number;
  attackerShips: Record<string, number>;
  defenderShips: Record<string, number>;
  attackerStats: CombatSideStats;
  defenderStats: CombatSideStats;
  shieldAbsorbed?: number;
  /** Damage received by each unit type on attacker side this round */
  attackerDamageByType?: Record<string, UnitTypeDamageReceived>;
  /** Damage received by each unit type on defender side this round */
  defenderDamageByType?: Record<string, UnitTypeDamageReceived>;
  /** HP remaining/max per unit type on attacker side after this round */
  attackerHPByType?: Record<string, UnitTypeHP>;
  /** HP remaining/max per unit type on defender side after this round */
  defenderHPByType?: Record<string, UnitTypeHP>;
}

export interface CombatResult {
  rounds: RoundResult[];
  outcome: 'attacker' | 'defender' | 'draw';
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
  debris: { minerai: number; silicium: number };
  repairedDefenses: Record<string, number>;
  attackerStats: CombatSideStats;
  defenderStats: CombatSideStats;
  detailedLog?: DetailedCombatLog;
}

export interface CombatEvent {
  round: number;
  shooterId: string;
  shooterType: string;
  targetId: string;
  targetType: string;
  damage: number;
  shieldAbsorbed: number;
  armorBlocked: number;
  hullDamage: number;
  targetDestroyed: boolean;
}

export interface UnitSnapshot {
  unitId: string;
  unitType: string;
  side: 'attacker' | 'defender';
  shield: number;
  hull: number;
  destroyed: boolean;
}

export interface DetailedCombatLog {
  events: CombatEvent[];
  snapshots: UnitSnapshot[][];
  initialUnits: UnitSnapshot[];
}

// ── Private helpers ──

/** Default target category for unit types that don't yet have an explicit
 *  weapon profile (single-battery legacy units). Once every unit declares its
 *  own `weapons: WeaponProfile[]`, this constant becomes unused. */
const DEFAULT_FALLBACK_CATEGORY = 'light';

function createUnits(
  fleet: Record<string, number>,
  multipliers: CombatMultipliers,
  shipConfigs: Record<string, ShipCombatConfig>,
  idOffset: number,
): CombatUnit[] {
  const units: CombatUnit[] = [];
  let counter = idOffset;
  for (const [type, count] of Object.entries(fleet)) {
    const config = shipConfigs[type];
    if (!config || count <= 0) continue;
    // Build the weapon profile list. If the config has explicit batteries, use them
    // (applying the weapons research multiplier to each battery's damage). Otherwise
    // synthesize a single battery from the legacy baseWeaponDamage/baseShotCount fields.
    //
    // V8.1 : si une battery déclare un `damageMultiplier`, son damage effectif
    // est `config.baseWeaponDamage × damageMultiplier` au lieu du `damage` absolu.
    // Ça permet aux weapon modules du flagship de suivre la progression de
    // l'armement principal (level × hull bonus × passives × research) sans
    // re-tuner les valeurs absolues à chaque palier.
    const profiles: WeaponProfile[] = config.weapons && config.weapons.length > 0
      ? config.weapons.map(w => {
          const baseDamage = w.damageMultiplier !== undefined
            ? config.baseWeaponDamage * w.damageMultiplier
            : w.damage;
          return { ...w, damage: baseDamage * multipliers.weapons };
        })
      : [{
          damage: config.baseWeaponDamage * multipliers.weapons,
          shots: config.baseShotCount,
          targetCategory: DEFAULT_FALLBACK_CATEGORY,
        }];
    for (let i = 0; i < count; i++) {
      const maxShield = config.baseShield * multipliers.shielding;
      const maxHull = config.baseHull * multipliers.armor;
      units.push({
        id: `${type}-${counter++}`,
        shipType: type,
        category: config.categoryId,
        shield: maxShield,
        maxShield,
        armor: config.baseArmor * multipliers.armor,
        hull: maxHull,
        maxHull,
        weapons: profiles,
        destroyed: false,
      });
    }
  }
  return units;
}

function selectTarget(
  units: CombatUnit[],
  priorityCategoryId: string,
  sortedCategories: ShipCategory[],
  rng: () => number,
): CombatUnit | null {
  // Priority category first (only if targetable or used as explicit priority)
  const priorityTargets = units.filter(u => !u.destroyed && u.category === priorityCategoryId);
  if (priorityTargets.length > 0) {
    return priorityTargets[Math.floor(rng() * priorityTargets.length)];
  }
  // Fallback: iterate by targetOrder, skip non-targetable categories
  for (const cat of sortedCategories) {
    if (cat.id === priorityCategoryId) continue;
    if (!cat.targetable) continue;
    const targets = units.filter(u => !u.destroyed && u.category === cat.id);
    if (targets.length > 0) {
      return targets[Math.floor(rng() * targets.length)];
    }
  }
  // Last resort: non-targetable categories (support)
  for (const cat of sortedCategories) {
    if (cat.id === priorityCategoryId || cat.targetable) continue;
    const targets = units.filter(u => !u.destroyed && u.category === cat.id);
    if (targets.length > 0) {
      return targets[Math.floor(rng() * targets.length)];
    }
  }
  return null;
}

// Seeded PRNG (mulberry32) for deterministic replay
function createRng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptySideStats(): CombatSideStats {
  return {
    damageDealtByCategory: {},
    damageReceivedByCategory: {},
    shieldAbsorbed: 0,
    armorBlocked: 0,
    overkillWasted: 0,
  };
}

function fireShot(
  attacker: CombatUnit,
  target: CombatUnit,
  damage: number,
  minDamage: number,
  attackerStats: CombatSideStats,
  defenderStats: CombatSideStats,
  targetDamageByType: Record<string, UnitTypeDamageReceived>,
  round?: number,
  eventAccumulator?: CombatEvent[],
): boolean {
  // Track per-type damage
  const entry = targetDamageByType[target.shipType] ??= { shieldDamage: 0, hullDamage: 0, destroyed: 0 };

  // Shield absorbs first
  if (target.shield >= damage) {
    target.shield -= damage;
    defenderStats.shieldAbsorbed += damage;
    entry.shieldDamage += damage;
    if (eventAccumulator && round !== undefined) {
      eventAccumulator.push({
        round,
        shooterId: attacker.id,
        shooterType: attacker.shipType,
        targetId: target.id,
        targetType: target.shipType,
        damage,
        shieldAbsorbed: damage,
        armorBlocked: 0,
        hullDamage: 0,
        targetDestroyed: false,
      });
    }
    return false;
  }

  let surplus = damage;
  let shotShieldAbsorbed = 0;
  if (target.shield > 0) {
    surplus = damage - target.shield;
    defenderStats.shieldAbsorbed += target.shield;
    entry.shieldDamage += target.shield;
    shotShieldAbsorbed = target.shield;
    target.shield = 0;
  }

  // Armor reduces surplus, minimum 1 damage if shot reaches hull
  const hullDamage = Math.max(surplus - target.armor, minDamage);
  const shotArmorBlocked = surplus - hullDamage;
  defenderStats.armorBlocked += shotArmorBlocked;

  target.hull -= hullDamage;
  entry.hullDamage += hullDamage;

  // Track damage by category
  attackerStats.damageDealtByCategory[target.category] =
    (attackerStats.damageDealtByCategory[target.category] ?? 0) + hullDamage;
  defenderStats.damageReceivedByCategory[attacker.category] =
    (defenderStats.damageReceivedByCategory[attacker.category] ?? 0) + hullDamage;

  let destroyed = false;
  if (target.hull <= 0) {
    if (target.hull < 0) attackerStats.overkillWasted += Math.abs(target.hull);
    target.hull = 0;
    target.destroyed = true;
    entry.destroyed += 1;
    destroyed = true;
  }

  if (eventAccumulator && round !== undefined) {
    eventAccumulator.push({
      round,
      shooterId: attacker.id,
      shooterType: attacker.shipType,
      targetId: target.id,
      targetType: target.shipType,
      damage,
      shieldAbsorbed: shotShieldAbsorbed,
      armorBlocked: shotArmorBlocked,
      hullDamage,
      targetDestroyed: destroyed,
    });
  }
  return destroyed;
}

function fireSalvo(
  attacker: CombatUnit,
  enemies: CombatUnit[],
  categories: ShipCategory[],
  minDamage: number,
  attackerStats: CombatSideStats,
  defenderStats: CombatSideStats,
  rng: () => number,
  targetDamageByType: Record<string, UnitTypeDamageReceived>,
  round?: number,
  eventAccumulator?: CombatEvent[],
): void {
  for (const weapon of attacker.weapons) {
    // Pick the first target to know whether rafale should trigger.
    const firstTarget = selectTarget(enemies, weapon.targetCategory, categories, rng);
    if (!firstTarget) continue;

    const rafaleTriggered = weapon.rafale !== undefined && firstTarget.category === weapon.rafale.category;
    const totalShots = weapon.shots + (rafaleTriggered ? weapon.rafale!.count : 0);

    for (let shot = 0; shot < totalShots; shot++) {
      const target = shot === 0
        ? firstTarget
        : selectTarget(enemies, weapon.targetCategory, categories, rng);
      if (!target) break;

      const destroyed = fireShot(
        attacker, target, weapon.damage, minDamage,
        attackerStats, defenderStats, targetDamageByType, round, eventAccumulator,
      );

      // Enchaînement: on kill, fire one bonus shot on another unit of the same
      // category as the one just destroyed. Not chainable (max 1 per base shot).
      if (destroyed && weapon.hasChainKill) {
        const sameCategoryTargets = enemies.filter(u => !u.destroyed && u.category === target.category);
        if (sameCategoryTargets.length > 0) {
          const bonus = sameCategoryTargets[Math.floor(rng() * sameCategoryTargets.length)];
          fireShot(
            attacker, bonus, weapon.damage, minDamage,
            attackerStats, defenderStats, targetDamageByType, round, eventAccumulator,
          );
        }
      }
    }
  }
}

function countSurvivingByType(units: CombatUnit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of units) {
    if (!unit.destroyed) counts[unit.shipType] = (counts[unit.shipType] ?? 0) + 1;
  }
  return counts;
}

function countDestroyedByType(units: CombatUnit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of units) {
    if (unit.destroyed) counts[unit.shipType] = (counts[unit.shipType] ?? 0) + 1;
  }
  return counts;
}

function mergeStats(target: CombatSideStats, source: CombatSideStats): void {
  for (const [k, v] of Object.entries(source.damageDealtByCategory)) {
    target.damageDealtByCategory[k] = (target.damageDealtByCategory[k] ?? 0) + v;
  }
  for (const [k, v] of Object.entries(source.damageReceivedByCategory)) {
    target.damageReceivedByCategory[k] = (target.damageReceivedByCategory[k] ?? 0) + v;
  }
  target.shieldAbsorbed += source.shieldAbsorbed;
  target.armorBlocked += source.armorBlocked;
  target.overkillWasted += source.overkillWasted;
}

function cloneUnits(units: CombatUnit[]): CombatUnit[] {
  return units.map(u => ({ ...u }));
}

function applyDamage(originals: CombatUnit[], damaged: CombatUnit[]): void {
  const damageMap = new Map(damaged.map(u => [u.id, u]));
  for (const unit of originals) {
    const d = damageMap.get(unit.id);
    if (d) {
      unit.hull = d.hull;
      unit.shield = d.shield;
      unit.destroyed = d.destroyed;
    }
  }
}

function aggregateHPByType(units: CombatUnit[]): Record<string, UnitTypeHP> {
  const result: Record<string, UnitTypeHP> = {};
  for (const unit of units) {
    if (unit.destroyed) continue;
    const entry = result[unit.shipType] ??= { shieldRemaining: 0, shieldMax: 0, hullRemaining: 0, hullMax: 0 };
    entry.shieldRemaining += unit.shield;
    entry.shieldMax += unit.maxShield;
    entry.hullRemaining += unit.hull;
    entry.hullMax += unit.maxHull;
  }
  return result;
}

// ── Exports ──

export function simulateCombat(input: CombatInput): CombatResult {
  const {
    attackerFleet, defenderFleet, defenderDefenses,
    attackerMultipliers, defenderMultipliers,
    combatConfig, shipConfigs, shipCosts, shipIds, defenseIds,
    rngSeed, planetaryShieldCapacity,
  } = input;

  const rng = createRng(rngSeed);
  const sortedCategories = [...combatConfig.categories].sort((a, b) => a.targetOrder - b.targetOrder);

  const attackers = createUnits(attackerFleet, attackerMultipliers, shipConfigs, 0);
  const defenderShipUnits = createUnits(defenderFleet, defenderMultipliers, shipConfigs, attackers.length);
  const defenderDefenseUnits = createUnits(defenderDefenses, defenderMultipliers, shipConfigs, attackers.length + defenderShipUnits.length);
  const defenders = [...defenderShipUnits, ...defenderDefenseUnits];

  // Inject planetary shield as a special defender unit.
  // Hull is set to 1 so that once shield HP is depleted, the unit is "destroyed" for the
  // remainder of the round (letting damage pass through to defenses). It is revived each
  // round during shield regeneration.
  if (planetaryShieldCapacity && planetaryShieldCapacity > 0) {
    defenders.push({
      id: 'planetary-shield-0',
      shipType: '__planetaryShield__',
      category: 'shield',
      shield: planetaryShieldCapacity,
      maxShield: planetaryShieldCapacity,
      armor: 0,
      hull: 1,
      maxHull: 1,
      weapons: [],
      destroyed: false,
    });
  }

  const rounds: RoundResult[] = [];
  const totalAttackerStats = emptySideStats();
  const totalDefenderStats = emptySideStats();

  // Detailed logging accumulators (opt-in)
  const eventAccumulator: CombatEvent[] | undefined = input.detailedLog ? [] : undefined;
  const snapshotsPerRound: UnitSnapshot[][] | undefined = input.detailedLog ? [] : undefined;

  function snapshotUnits(attackerUnits: CombatUnit[], defenderUnits: CombatUnit[]): UnitSnapshot[] {
    const snapshots: UnitSnapshot[] = [];
    for (const u of attackerUnits) {
      snapshots.push({ unitId: u.id, unitType: u.shipType, side: 'attacker', shield: u.shield, hull: u.hull, destroyed: u.destroyed });
    }
    for (const u of defenderUnits) {
      if (u.shipType === '__planetaryShield__') continue;
      snapshots.push({ unitId: u.id, unitType: u.shipType, side: 'defender', shield: u.shield, hull: u.hull, destroyed: u.destroyed });
    }
    return snapshots;
  }

  const initialUnits = input.detailedLog ? snapshotUnits(attackers, defenders) : undefined;

  // Filter helper: exclude the planetary shield from gameplay-affecting checks
  const isNotShield = (u: CombatUnit) => u.shipType !== '__planetaryShield__';

  for (let round = 1; round <= combatConfig.maxRounds; round++) {
    const aliveAttackers = attackers.filter(u => !u.destroyed);
    const aliveDefenders = defenders.filter(u => !u.destroyed && isNotShield(u));

    if (aliveDefenders.length === 0 || aliveAttackers.length === 0) break;

    const roundAttackerStats = emptySideStats();
    const roundDefenderStats = emptySideStats();
    const defenderDamageByType: Record<string, UnitTypeDamageReceived> = {};
    const attackerDamageByType: Record<string, UnitTypeDamageReceived> = {};

    // SIMULTANEOUS: both sides fire on clones of start-of-round state
    const defendersForAttackerFire = cloneUnits(defenders);
    const attackersForDefenderFire = cloneUnits(attackers);

    // Attackers fire at defender clones
    for (const attacker of aliveAttackers) {
      fireSalvo(attacker, defendersForAttackerFire,
        sortedCategories, combatConfig.minDamagePerHit, roundAttackerStats, roundDefenderStats, rng, defenderDamageByType, round, eventAccumulator);
    }

    // Track planetary shield absorption before defenders fire
    let roundShieldAbsorbed: number | undefined;
    const shieldClone = defendersForAttackerFire.find(u => u.shipType === '__planetaryShield__');
    const shieldUnit = defenders.find(u => u.shipType === '__planetaryShield__');
    if (shieldClone && shieldUnit) {
      roundShieldAbsorbed = shieldUnit.maxShield - Math.max(0, shieldClone.shield);
    }

    // Defenders fire at attacker clones
    for (const defender of aliveDefenders) {
      fireSalvo(defender, attackersForDefenderFire,
        sortedCategories, combatConfig.minDamagePerHit, roundDefenderStats, roundAttackerStats, rng, attackerDamageByType, round, eventAccumulator);
    }

    // Apply damage from both phases back to real units
    applyDamage(defenders, defendersForAttackerFire);
    applyDamage(attackers, attackersForDefenderFire);

    // Snapshot after damage, before shield regen
    if (snapshotsPerRound) {
      snapshotsPerRound.push(snapshotUnits(attackers, defenders));
    }

    // Regenerate shields for survivors
    for (const unit of [...attackers, ...defenders]) {
      if (!unit.destroyed) unit.shield = unit.maxShield;
    }

    // Revive the planetary shield for the next round (it regenerates fully each round)
    for (const unit of defenders) {
      if (unit.shipType === '__planetaryShield__' && unit.destroyed) {
        unit.destroyed = false;
        unit.hull = unit.maxHull;
        unit.shield = unit.maxShield;
      }
    }

    mergeStats(totalAttackerStats, roundAttackerStats);
    mergeStats(totalDefenderStats, roundDefenderStats);

    const attackerHPByType = aggregateHPByType(attackers);
    const defenderHPByType = aggregateHPByType(defenders);

    const roundResult: RoundResult = {
      round,
      attackerShips: countSurvivingByType(attackers),
      defenderShips: countSurvivingByType(defenders.filter(isNotShield)),
      attackerStats: roundAttackerStats,
      defenderStats: roundDefenderStats,
      attackerDamageByType,
      defenderDamageByType,
      attackerHPByType,
      defenderHPByType,
    };
    if (roundShieldAbsorbed !== undefined) {
      roundResult.shieldAbsorbed = roundShieldAbsorbed;
    }
    rounds.push(roundResult);

    if (!attackers.some(u => !u.destroyed) || !defenders.some(u => !u.destroyed && isNotShield(u))) break;
  }

  // Handle case where combat ends before any rounds (e.g., empty defender)
  if (rounds.length === 0) {
    rounds.push({
      round: 1,
      attackerShips: countSurvivingByType(attackers),
      defenderShips: countSurvivingByType(defenders.filter(isNotShield)),
      attackerStats: emptySideStats(),
      defenderStats: emptySideStats(),
    });
  }

  const attackersAlive = attackers.some(u => !u.destroyed);
  const defendersAlive = defenders.some(u => !u.destroyed && isNotShield(u));
  let outcome: 'attacker' | 'defender' | 'draw';
  if (attackersAlive && !defendersAlive) outcome = 'attacker';
  else if (!attackersAlive && defendersAlive) outcome = 'defender';
  else outcome = 'draw';

  const attackerLosses = countDestroyedByType(attackers);
  // Filter out the planetary shield from defender losses (it has hull: Infinity and is never destroyed,
  // but be defensive about it)
  const defenderLosses = countDestroyedByType(defenders.filter(isNotShield));
  const debris = calculateDebris(attackerLosses, defenderLosses, shipIds, shipCosts, combatConfig.debrisRatio);
  const repairedDefenses = repairDefenses(defenderLosses, defenseIds, combatConfig.defenseRepairRate, rng);

  return {
    rounds, outcome, attackerLosses, defenderLosses, debris, repairedDefenses,
    attackerStats: totalAttackerStats, defenderStats: totalDefenderStats,
    ...(input.detailedLog && initialUnits && snapshotsPerRound && eventAccumulator ? {
      detailedLog: {
        events: eventAccumulator,
        snapshots: snapshotsPerRound,
        initialUnits,
      },
    } : {}),
  };
}

export function calculateDebris(
  attackerLosses: Record<string, number>,
  defenderLosses: Record<string, number>,
  shipIds: Set<string>,
  shipCosts: Record<string, { minerai: number; silicium: number }>,
  debrisRatio = 0.3,
): { minerai: number; silicium: number } {
  let minerai = 0;
  let silicium = 0;
  for (const losses of [attackerLosses, defenderLosses]) {
    for (const [type, count] of Object.entries(losses)) {
      if (shipIds.has(type)) {
        const cost = shipCosts[type];
        if (cost) {
          minerai += cost.minerai * count;
          silicium += cost.silicium * count;
        }
      }
    }
  }
  return {
    minerai: Math.floor(minerai * debrisRatio),
    silicium: Math.floor(silicium * debrisRatio),
  };
}

export function repairDefenses(
  defenderLosses: Record<string, number>,
  defenseIds: Set<string>,
  repairProbability = 0.7,
  rng: () => number = Math.random,
): Record<string, number> {
  const repaired: Record<string, number> = {};
  for (const [type, count] of Object.entries(defenderLosses)) {
    if (defenseIds.has(type)) {
      let repairedCount = 0;
      for (let i = 0; i < count; i++) {
        if (rng() < repairProbability) repairedCount++;
      }
      if (repairedCount > 0) repaired[type] = repairedCount;
    }
  }
  return repaired;
}
