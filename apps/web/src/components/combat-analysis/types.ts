// Local types for the detailed combat log — backend endpoint may not exist yet.
// Also mirrors game-engine types locally so this module compiles even when
// @exilium/game-engine package resolution fails in the worktree.

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
  /** Snapshots indexed by round number */
  snapshots: UnitSnapshot[][];
  initialUnits: UnitSnapshot[];
}

// Mirrors of game-engine types used by analysis components
export interface CombatSideStats {
  damageDealtByCategory: Record<string, number>;
  damageReceivedByCategory: Record<string, number>;
  shieldAbsorbed: number;
  armorBlocked: number;
  overkillWasted: number;
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
  attackerDamageByType?: Record<string, { shieldDamage: number; hullDamage: number; destroyed: number }>;
  defenderDamageByType?: Record<string, { shieldDamage: number; hullDamage: number; destroyed: number }>;
  attackerHPByType?: Record<string, UnitTypeHP>;
  defenderHPByType?: Record<string, UnitTypeHP>;
}
