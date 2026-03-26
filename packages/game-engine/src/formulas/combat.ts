// ── Types ──

export interface ShipCategory {
  id: string;
  name: string;
  targetable: boolean;
  targetOrder: number;
}

export interface ShipCombatConfig {
  shipType: string;
  categoryId: string;
  baseShield: number;
  baseArmor: number;       // flat damage reduction — no research bonus
  baseHull: number;
  baseWeaponDamage: number;
  baseShotCount: number;
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
  attackerTargetPriority: string;
  defenderTargetPriority: string;
  combatConfig: CombatConfig;
  shipConfigs: Record<string, ShipCombatConfig>;
  shipCosts: Record<string, { minerai: number; silicium: number }>;
  shipIds: Set<string>;
  defenseIds: Set<string>;
  rngSeed?: number;
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
  weaponDamage: number;
  shotCount: number;
  destroyed: boolean;
}

export interface CombatSideStats {
  damageDealtByCategory: Record<string, number>;
  damageReceivedByCategory: Record<string, number>;
  shieldAbsorbed: number;
  armorBlocked: number;
  overkillWasted: number;
}

export interface RoundResult {
  round: number;
  attackerShips: Record<string, number>;
  defenderShips: Record<string, number>;
  attackerStats: CombatSideStats;
  defenderStats: CombatSideStats;
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
}

// ── Private helpers ──

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
    for (let i = 0; i < count; i++) {
      const maxShield = config.baseShield * multipliers.shielding;
      const maxHull = config.baseHull * multipliers.armor;
      const weaponDamage = config.baseWeaponDamage * multipliers.weapons;
      units.push({
        id: `${type}-${counter++}`,
        shipType: type,
        category: config.categoryId,
        shield: maxShield,
        maxShield,
        armor: config.baseArmor,
        hull: maxHull,
        maxHull,
        weaponDamage,
        shotCount: config.baseShotCount,
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
  minDamage: number,
  attackerStats: CombatSideStats,
  defenderStats: CombatSideStats,
): void {
  const damage = attacker.weaponDamage;

  // Shield absorbs first
  if (target.shield >= damage) {
    target.shield -= damage;
    defenderStats.shieldAbsorbed += damage;
    return;
  }

  let surplus = damage;
  if (target.shield > 0) {
    surplus = damage - target.shield;
    defenderStats.shieldAbsorbed += target.shield;
    target.shield = 0;
  }

  // Armor reduces surplus, minimum 1 damage if shot reaches hull
  const hullDamage = Math.max(surplus - target.armor, minDamage);
  defenderStats.armorBlocked += surplus - hullDamage;

  target.hull -= hullDamage;

  // Track damage by category
  attackerStats.damageDealtByCategory[target.category] =
    (attackerStats.damageDealtByCategory[target.category] ?? 0) + hullDamage;
  defenderStats.damageReceivedByCategory[attacker.category] =
    (defenderStats.damageReceivedByCategory[attacker.category] ?? 0) + hullDamage;

  if (target.hull <= 0) {
    if (target.hull < 0) attackerStats.overkillWasted += Math.abs(target.hull);
    target.hull = 0;
    target.destroyed = true;
  }
}

function fireSalvo(
  attacker: CombatUnit,
  enemies: CombatUnit[],
  priorityCategoryId: string,
  categories: ShipCategory[],
  minDamage: number,
  attackerStats: CombatSideStats,
  defenderStats: CombatSideStats,
  rng: () => number,
): void {
  for (let shot = 0; shot < attacker.shotCount; shot++) {
    const target = selectTarget(enemies, priorityCategoryId, categories, rng);
    if (!target) return;
    fireShot(attacker, target, minDamage, attackerStats, defenderStats);
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

// ── Exports ──

export function simulateCombat(input: CombatInput): CombatResult {
  const {
    attackerFleet, defenderFleet, defenderDefenses,
    attackerMultipliers, defenderMultipliers,
    attackerTargetPriority, defenderTargetPriority,
    combatConfig, shipConfigs, shipCosts, shipIds, defenseIds,
    rngSeed,
  } = input;

  const rng = createRng(rngSeed);
  const sortedCategories = [...combatConfig.categories].sort((a, b) => a.targetOrder - b.targetOrder);

  const attackers = createUnits(attackerFleet, attackerMultipliers, shipConfigs, 0);
  const defenderShipUnits = createUnits(defenderFleet, defenderMultipliers, shipConfigs, attackers.length);
  const defenderDefenseUnits = createUnits(defenderDefenses, defenderMultipliers, shipConfigs, attackers.length + defenderShipUnits.length);
  const defenders = [...defenderShipUnits, ...defenderDefenseUnits];

  const rounds: RoundResult[] = [];
  const totalAttackerStats = emptySideStats();
  const totalDefenderStats = emptySideStats();

  for (let round = 1; round <= combatConfig.maxRounds; round++) {
    const aliveAttackers = attackers.filter(u => !u.destroyed);
    const aliveDefenders = defenders.filter(u => !u.destroyed);

    if (aliveDefenders.length === 0 || aliveAttackers.length === 0) break;

    const roundAttackerStats = emptySideStats();
    const roundDefenderStats = emptySideStats();

    // SIMULTANEOUS: both sides fire on clones of start-of-round state
    const defendersForAttackerFire = cloneUnits(defenders);
    const attackersForDefenderFire = cloneUnits(attackers);

    // Attackers fire at defender clones
    for (const attacker of aliveAttackers) {
      fireSalvo(attacker, defendersForAttackerFire, attackerTargetPriority,
        sortedCategories, combatConfig.minDamagePerHit, roundAttackerStats, roundDefenderStats, rng);
    }

    // Defenders fire at attacker clones
    for (const defender of aliveDefenders) {
      fireSalvo(defender, attackersForDefenderFire, defenderTargetPriority,
        sortedCategories, combatConfig.minDamagePerHit, roundDefenderStats, roundAttackerStats, rng);
    }

    // Apply damage from both phases back to real units
    applyDamage(defenders, defendersForAttackerFire);
    applyDamage(attackers, attackersForDefenderFire);

    // Regenerate shields for survivors
    for (const unit of [...attackers, ...defenders]) {
      if (!unit.destroyed) unit.shield = unit.maxShield;
    }

    mergeStats(totalAttackerStats, roundAttackerStats);
    mergeStats(totalDefenderStats, roundDefenderStats);

    rounds.push({
      round,
      attackerShips: countSurvivingByType(attackers),
      defenderShips: countSurvivingByType(defenders),
      attackerStats: roundAttackerStats,
      defenderStats: roundDefenderStats,
    });

    if (!attackers.some(u => !u.destroyed) || !defenders.some(u => !u.destroyed)) break;
  }

  // Handle case where combat ends before any rounds (e.g., empty defender)
  if (rounds.length === 0) {
    rounds.push({
      round: 1,
      attackerShips: countSurvivingByType(attackers),
      defenderShips: countSurvivingByType(defenders),
      attackerStats: emptySideStats(),
      defenderStats: emptySideStats(),
    });
  }

  const attackersAlive = attackers.some(u => !u.destroyed);
  const defendersAlive = defenders.some(u => !u.destroyed);
  let outcome: 'attacker' | 'defender' | 'draw';
  if (attackersAlive && !defendersAlive) outcome = 'attacker';
  else if (!attackersAlive && defendersAlive) outcome = 'defender';
  else outcome = 'draw';

  const attackerLosses = countDestroyedByType(attackers);
  const defenderLosses = countDestroyedByType(defenders);
  const debris = calculateDebris(attackerLosses, defenderLosses, shipIds, shipCosts, combatConfig.debrisRatio);
  const repairedDefenses = repairDefenses(defenderLosses, defenseIds, combatConfig.defenseRepairRate, rng);

  return {
    rounds, outcome, attackerLosses, defenderLosses, debris, repairedDefenses,
    attackerStats: totalAttackerStats, defenderStats: totalDefenderStats,
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
