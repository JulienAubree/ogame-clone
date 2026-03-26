import { describe, it, expect } from 'vitest';
import { simulateCombat, calculateDebris, repairDefenses } from './combat.js';
import type { CombatInput, ShipCombatConfig, CombatConfig, ShipCategory } from './combat.js';

const CATEGORIES: ShipCategory[] = [
  { id: 'light', name: 'Léger', targetable: true, targetOrder: 1 },
  { id: 'medium', name: 'Moyen', targetable: true, targetOrder: 2 },
  { id: 'heavy', name: 'Lourd', targetable: true, targetOrder: 3 },
  { id: 'support', name: 'Support', targetable: false, targetOrder: 4 },
];

const COMBAT_CONFIG: CombatConfig = {
  maxRounds: 4,
  debrisRatio: 0.3,
  defenseRepairRate: 0.7,
  pillageRatio: 0.33,
  minDamagePerHit: 1,
  researchBonusPerLevel: 0.1,
  categories: CATEGORIES,
};

const SHIP_CONFIGS: Record<string, ShipCombatConfig> = {
  interceptor:    { shipType: 'interceptor',    categoryId: 'light',  baseShield: 8,  baseArmor: 1, baseHull: 12,  baseWeaponDamage: 4,  baseShotCount: 3 },
  frigate:        { shipType: 'frigate',        categoryId: 'medium', baseShield: 16, baseArmor: 2, baseHull: 30,  baseWeaponDamage: 12, baseShotCount: 2 },
  cruiser:        { shipType: 'cruiser',        categoryId: 'heavy',  baseShield: 28, baseArmor: 4, baseHull: 55,  baseWeaponDamage: 45, baseShotCount: 1 },
  battlecruiser:  { shipType: 'battlecruiser',  categoryId: 'heavy',  baseShield: 40, baseArmor: 6, baseHull: 100, baseWeaponDamage: 70, baseShotCount: 1 },
  smallCargo:     { shipType: 'smallCargo',     categoryId: 'support', baseShield: 2,  baseArmor: 0, baseHull: 8,   baseWeaponDamage: 1,  baseShotCount: 1 },
};

const SHIP_IDS = new Set(['interceptor', 'frigate', 'cruiser', 'battlecruiser', 'smallCargo']);
const DEFENSE_IDS = new Set(['rocketLauncher', 'electromagneticCannon']);
const SHIP_COSTS: Record<string, { minerai: number; silicium: number }> = {
  interceptor:   { minerai: 3000,  silicium: 1000 },
  frigate:       { minerai: 6000,  silicium: 4000 },
  cruiser:       { minerai: 20000, silicium: 7000 },
  battlecruiser: { minerai: 45000, silicium: 15000 },
  smallCargo:    { minerai: 2000,  silicium: 2000 },
};

const NO_BONUS = { weapons: 1, shielding: 1, armor: 1 };

function makeInput(overrides: Partial<CombatInput> = {}): CombatInput {
  return {
    attackerFleet: {},
    defenderFleet: {},
    defenderDefenses: {},
    attackerMultipliers: NO_BONUS,
    defenderMultipliers: NO_BONUS,
    attackerTargetPriority: 'light',
    defenderTargetPriority: 'light',
    combatConfig: COMBAT_CONFIG,
    shipConfigs: SHIP_CONFIGS,
    shipCosts: SHIP_COSTS,
    shipIds: SHIP_IDS,
    defenseIds: DEFENSE_IDS,
    ...overrides,
  };
}

describe('simulateCombat', () => {
  it('attacker wins against empty defender', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { interceptor: 5 },
    }));
    expect(result.outcome).toBe('attacker');
    expect(result.rounds.length).toBe(1);
    expect(result.attackerLosses).toEqual({});
  });

  it('combat lasts at most maxRounds (4)', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { interceptor: 1 },
      defenderFleet: { interceptor: 1 },
    }));
    expect(result.rounds.length).toBeLessThanOrEqual(4);
  });
});

describe('damage resolution', () => {
  it('big shot pierces shield and deals hull damage minus armor', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { cruiser: 1 },
      defenderFleet: { interceptor: 1 },
    }));
    expect(result.outcome).toBe('attacker');
    expect(result.defenderLosses.interceptor).toBe(1);
  });

  it('small shots lose effectiveness against armor', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { interceptor: 1 },
      defenderFleet: { cruiser: 1 },
    }));
    expect(result.outcome).toBe('defender');
  });

  it('minimum 1 damage per hit that reaches hull', () => {
    const configs: Record<string, ShipCombatConfig> = {
      ...SHIP_CONFIGS,
      weakShip: { shipType: 'weakShip', categoryId: 'light', baseShield: 0, baseArmor: 5, baseHull: 2, baseWeaponDamage: 1, baseShotCount: 3 },
      tinyShip: { shipType: 'tinyShip', categoryId: 'light', baseShield: 0, baseArmor: 0, baseHull: 100, baseWeaponDamage: 1, baseShotCount: 3 },
    };
    const result = simulateCombat(makeInput({
      attackerFleet: { tinyShip: 1 },
      defenderFleet: { weakShip: 1 },
      shipConfigs: configs,
      shipIds: new Set([...SHIP_IDS, 'weakShip', 'tinyShip']),
    }));
    expect(result.defenderLosses.weakShip).toBe(1);
  });

  it('shields regenerate each round', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { interceptor: 3 },
      defenderFleet: { frigate: 1 },
    }));
    expect(result.rounds.length).toBeGreaterThan(1);
  });
});

describe('target priority', () => {
  it('attacks priority category first', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { battlecruiser: 5 },
      defenderFleet: { interceptor: 5, cruiser: 3 },
      attackerTargetPriority: 'heavy',
    }));
    const cruiserLosses = result.defenderLosses.cruiser ?? 0;
    expect(cruiserLosses).toBeGreaterThan(0);
  });

  it('support units are targeted last', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { cruiser: 3 },
      defenderFleet: { interceptor: 5, smallCargo: 10 },
      attackerTargetPriority: 'light',
    }));
    const interceptorLosses = result.defenderLosses.interceptor ?? 0;
    expect(interceptorLosses).toBeGreaterThan(0);
  });
});

describe('simultaneous combat', () => {
  it('both sides fire even if one would be destroyed', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { cruiser: 1 },
      defenderFleet: { cruiser: 1 },
    }));
    expect(['attacker', 'defender', 'draw']).toContain(result.outcome);
  });
});

describe('calculateDebris', () => {
  it('returns 30% of destroyed ship costs', () => {
    const debris = calculateDebris(
      { interceptor: 10 }, {}, SHIP_IDS, SHIP_COSTS, 0.3,
    );
    expect(debris.minerai).toBe(Math.floor(3000 * 10 * 0.3));
    expect(debris.silicium).toBe(Math.floor(1000 * 10 * 0.3));
  });

  it('ignores defenses in debris', () => {
    const debris = calculateDebris(
      {}, { rocketLauncher: 100 }, SHIP_IDS, SHIP_COSTS, 0.3,
    );
    expect(debris.minerai).toBe(0);
  });
});

describe('repairDefenses', () => {
  it('repairs approximately 70% of defenses over many runs', () => {
    let totalRepaired = 0;
    for (let i = 0; i < 100; i++) {
      const repaired = repairDefenses({ rocketLauncher: 100 }, new Set(['rocketLauncher']), 0.7);
      totalRepaired += repaired.rocketLauncher ?? 0;
    }
    const ratio = totalRepaired / (100 * 100);
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.8);
  });
});

describe('combat stats tracking', () => {
  it('tracks shield absorbed and armor blocked', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { cruiser: 3 },
      defenderFleet: { interceptor: 10 },
    }));
    expect(result.attackerStats.shieldAbsorbed).toBeGreaterThanOrEqual(0);
    expect(result.defenderStats.shieldAbsorbed).toBeGreaterThanOrEqual(0);
  });

  it('tracks overkill wasted', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { battlecruiser: 5 },
      defenderFleet: { interceptor: 20 },
    }));
    expect(result.attackerStats.overkillWasted).toBeGreaterThan(0);
  });

  it('deterministic with seed', () => {
    const input = makeInput({
      attackerFleet: { cruiser: 5 },
      defenderFleet: { frigate: 5 },
      rngSeed: 42,
    });
    const result1 = simulateCombat(input);
    const result2 = simulateCombat(input);
    expect(result1.outcome).toBe(result2.outcome);
    expect(result1.rounds.length).toBe(result2.rounds.length);
    expect(result1.attackerLosses).toEqual(result2.attackerLosses);
    expect(result1.defenderLosses).toEqual(result2.defenderLosses);
  });
});
