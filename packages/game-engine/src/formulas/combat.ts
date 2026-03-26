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

// Placeholder exports for compilation
export function simulateCombat(_input: CombatInput): CombatResult {
  throw new Error('Not implemented');
}

export function calculateDebris(
  _attackerLosses: Record<string, number>,
  _defenderLosses: Record<string, number>,
  _shipIds: Set<string>,
  _shipCosts: Record<string, { minerai: number; silicium: number }>,
  _debrisRatio?: number,
): { minerai: number; silicium: number } {
  throw new Error('Not implemented');
}

export function repairDefenses(
  _defenderLosses: Record<string, number>,
  _defenseIds: Set<string>,
  _repairProbability?: number,
  _rng?: () => number,
): Record<string, number> {
  throw new Error('Not implemented');
}
