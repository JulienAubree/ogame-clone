import { describe, it, expect } from 'vitest';
import { simulateCombat, calculateDebris, repairDefenses } from './combat.js';
import type { UnitCombatStats } from './combat.js';

const COMBAT_STATS: Record<string, UnitCombatStats> = {
  smallCargo:     { weapons: 5,    shield: 10,    armor: 4000 },
  largeCargo:     { weapons: 5,    shield: 25,    armor: 12000 },
  lightFighter:   { weapons: 50,   shield: 10,    armor: 4000 },
  heavyFighter:   { weapons: 150,  shield: 25,    armor: 10000 },
  cruiser:        { weapons: 400,  shield: 50,    armor: 27000 },
  battleship:     { weapons: 1000, shield: 200,   armor: 60000 },
  espionageProbe: { weapons: 0,    shield: 0,     armor: 1000 },
  colonyShip:     { weapons: 50,   shield: 100,   armor: 30000 },
  recycler:       { weapons: 1,    shield: 10,    armor: 16000 },
  rocketLauncher: { weapons: 80,   shield: 20,    armor: 2000 },
  lightLaser:     { weapons: 100,  shield: 25,    armor: 2000 },
  heavyLaser:     { weapons: 250,  shield: 100,   armor: 8000 },
  gaussCannon:    { weapons: 1100, shield: 200,   armor: 35000 },
  plasmaTurret:   { weapons: 3000, shield: 300,   armor: 100000 },
  smallShield:    { weapons: 1,    shield: 2000,  armor: 2000 },
  largeShield:    { weapons: 1,    shield: 10000, armor: 10000 },
};

const RAPID_FIRE: Record<string, Record<string, number>> = {
  smallCargo:   { espionageProbe: 5 },
  largeCargo:   { espionageProbe: 5 },
  lightFighter: { espionageProbe: 5 },
  heavyFighter: { espionageProbe: 5, smallCargo: 3 },
  cruiser:      { espionageProbe: 5, lightFighter: 6, smallCargo: 3, rocketLauncher: 10 },
  battleship:   { espionageProbe: 5, lightFighter: 4, smallCargo: 4, largeCargo: 4 },
  colonyShip:   { espionageProbe: 5 },
};

const SHIP_IDS = new Set([
  'smallCargo', 'largeCargo', 'lightFighter', 'heavyFighter',
  'cruiser', 'battleship', 'espionageProbe', 'colonyShip', 'recycler',
]);

const DEFENSE_IDS = new Set([
  'rocketLauncher', 'lightLaser', 'heavyLaser', 'gaussCannon',
  'plasmaTurret', 'smallShield', 'largeShield',
]);

const SHIP_COSTS: Record<string, { minerai: number; silicium: number }> = {
  smallCargo:     { minerai: 2000,  silicium: 2000 },
  largeCargo:     { minerai: 6000,  silicium: 6000 },
  lightFighter:   { minerai: 3000,  silicium: 1000 },
  heavyFighter:   { minerai: 6000,  silicium: 4000 },
  cruiser:        { minerai: 20000, silicium: 7000 },
  battleship:     { minerai: 45000, silicium: 15000 },
  espionageProbe: { minerai: 0,     silicium: 1000 },
  colonyShip:     { minerai: 10000, silicium: 20000 },
  recycler:       { minerai: 10000, silicium: 6000 },
};

const unitMultipliers = { weapons: 1, shielding: 1, armor: 1 };

describe('calculateDebris', () => {
  it('returns 30% minerai/silicium from destroyed ships', () => {
    const debris = calculateDebris({ lightFighter: 10 }, {}, SHIP_IDS, SHIP_COSTS);
    expect(debris.minerai).toBe(Math.floor(3000 * 10 * 0.3));
    expect(debris.silicium).toBe(Math.floor(1000 * 10 * 0.3));
  });

  it('ignores defenses in debris calculation', () => {
    const debris = calculateDebris({}, { rocketLauncher: 100 }, SHIP_IDS, SHIP_COSTS);
    expect(debris.minerai).toBe(0);
    expect(debris.silicium).toBe(0);
  });

  it('floors the result', () => {
    const debris = calculateDebris({ espionageProbe: 1 }, {}, SHIP_IDS, SHIP_COSTS);
    expect(debris.minerai).toBe(0);
    expect(debris.silicium).toBe(Math.floor(1000 * 0.3));
  });

  it('combines attacker and defender ship losses', () => {
    const debris = calculateDebris(
      { lightFighter: 5 },
      { lightFighter: 3 },
      SHIP_IDS,
      SHIP_COSTS,
    );
    expect(debris.minerai).toBe(Math.floor(3000 * 8 * 0.3));
    expect(debris.silicium).toBe(Math.floor(1000 * 8 * 0.3));
  });
});

describe('simulateCombat', () => {
  it('attacker wins asymmetric battle', () => {
    const result = simulateCombat(
      { battleship: 50 },
      { lightFighter: 10 },
      unitMultipliers,
      unitMultipliers,
      COMBAT_STATS,
      RAPID_FIRE,
      SHIP_IDS,
      SHIP_COSTS,
      DEFENSE_IDS,
    );
    expect(result.outcome).toBe('attacker');
    expect(result.rounds.length).toBeGreaterThanOrEqual(1);
    expect(result.rounds.length).toBeLessThanOrEqual(6);
  });

  it('attacker wins against empty defender', () => {
    const result = simulateCombat(
      { lightFighter: 5 },
      {},
      unitMultipliers,
      unitMultipliers,
      COMBAT_STATS,
      RAPID_FIRE,
      SHIP_IDS,
      SHIP_COSTS,
      DEFENSE_IDS,
    );
    expect(result.outcome).toBe('attacker');
    expect(result.rounds.length).toBe(1);
    expect(result.attackerLosses).toEqual({});
  });

  it('combat lasts at most 6 rounds', () => {
    const result = simulateCombat(
      { lightFighter: 1 },
      { lightFighter: 1 },
      unitMultipliers,
      unitMultipliers,
      COMBAT_STATS,
      RAPID_FIRE,
      SHIP_IDS,
      SHIP_COSTS,
      DEFENSE_IDS,
    );
    expect(result.rounds.length).toBeLessThanOrEqual(6);
  });

  it('probes bounce off battleship shields (damage < 1% shield)', () => {
    const result = simulateCombat(
      { espionageProbe: 5 },
      { battleship: 1 },
      unitMultipliers,
      unitMultipliers,
      COMBAT_STATS,
      RAPID_FIRE,
      SHIP_IDS,
      SHIP_COSTS,
      DEFENSE_IDS,
    );
    expect(result.outcome).toBe('defender');
    expect(result.attackerLosses.espionageProbe).toBe(5);
  });

  it('techs increase effective stats by 10% per level', () => {
    // weapons tech 20 with +10%/level: 1 + 0.1*20 = 3.0
    const highWeaponsMultiplier = { weapons: 3, shielding: 1, armor: 1 };
    const result = simulateCombat(
      { lightFighter: 100 },
      { battleship: 1 },
      highWeaponsMultiplier,
      unitMultipliers,
      COMBAT_STATS,
      RAPID_FIRE,
      SHIP_IDS,
      SHIP_COSTS,
      DEFENSE_IDS,
    );
    expect(result.defenderLosses.battleship ?? 0).toBe(1);
  });

  it('generates debris from destroyed ships', () => {
    const result = simulateCombat(
      { battleship: 50 },
      { lightFighter: 100 },
      unitMultipliers,
      unitMultipliers,
      COMBAT_STATS,
      RAPID_FIRE,
      SHIP_IDS,
      SHIP_COSTS,
      DEFENSE_IDS,
    );
    expect(result.debris.minerai).toBeGreaterThan(0);
    expect(result.debris.silicium).toBeGreaterThan(0);
  });

  it('repairs approximately 70% of destroyed defenses', () => {
    let totalDestroyed = 0;
    let totalRepaired = 0;
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const result = simulateCombat(
        { battleship: 50 },
        { rocketLauncher: 50 },
        unitMultipliers,
        unitMultipliers,
        COMBAT_STATS,
        RAPID_FIRE,
        SHIP_IDS,
        SHIP_COSTS,
        DEFENSE_IDS,
      );
      const destroyed = result.defenderLosses.rocketLauncher ?? 0;
      const repaired = result.repairedDefenses.rocketLauncher ?? 0;
      totalDestroyed += destroyed;
      totalRepaired += repaired;
    }

    if (totalDestroyed > 0) {
      const ratio = totalRepaired / totalDestroyed;
      expect(ratio).toBeGreaterThan(0.55);
      expect(ratio).toBeLessThan(0.85);
    }
  });

  it('rapid fire: cruisers decimate rocket launchers', () => {
    const result = simulateCombat(
      { cruiser: 10 },
      { rocketLauncher: 50 },
      unitMultipliers,
      unitMultipliers,
      COMBAT_STATS,
      RAPID_FIRE,
      SHIP_IDS,
      SHIP_COSTS,
      DEFENSE_IDS,
    );
    expect(result.outcome).toBe('attacker');
    expect(result.rounds.length).toBeLessThanOrEqual(6);
  });
});

describe('repairDefenses', () => {
  it('only repairs defense types, not ships', () => {
    const repaired = repairDefenses({ lightFighter: 10 }, DEFENSE_IDS);
    expect(repaired.lightFighter).toBeUndefined();
  });

  it('repairs approximately 70% of defenses over many runs', () => {
    let totalRepaired = 0;
    const count = 100;
    const destroyed = 1000;

    for (let i = 0; i < count; i++) {
      const repaired = repairDefenses({ rocketLauncher: destroyed }, DEFENSE_IDS);
      totalRepaired += repaired.rocketLauncher ?? 0;
    }

    const ratio = totalRepaired / (count * destroyed);
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(0.75);
  });
});
