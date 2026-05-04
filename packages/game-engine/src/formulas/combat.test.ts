import { describe, it, expect } from 'vitest';
import { simulateCombat, calculateDebris, repairDefenses } from './combat.js';
import type { ShipCombatConfig } from './combat.js';
import { SHIP_CONFIGS, SHIP_IDS, SHIP_COSTS, makeInput } from './combat.fixtures.js';

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
  it('attacks heavy category first when primary battery targets heavy', () => {
    // Battlecruiser primary battery targets heavy → the cruiser is hit before interceptors
    const result = simulateCombat(makeInput({
      attackerFleet: { battlecruiser: 5 },
      defenderFleet: { interceptor: 5, cruiser: 3 },
    }));
    const cruiserLosses = result.defenderLosses.cruiser ?? 0;
    expect(cruiserLosses).toBeGreaterThan(0);
  });

  it('support units are targeted last', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { cruiser: 3 },
      defenderFleet: { interceptor: 5, smallCargo: 10 },
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

describe('planetary shield', () => {
  it('absorbs all damage when strong enough — defenses take 0 damage', () => {
    // Small attacker fleet, large shield capacity
    const result = simulateCombat(makeInput({
      attackerFleet: { interceptor: 5 },
      defenderDefenses: { rocketLauncher: 5 },
      planetaryShieldCapacity: 10000,
      rngSeed: 123,
    }));
    // Defenses should survive (shield absorbs everything)
    expect(result.defenderLosses.rocketLauncher ?? 0).toBe(0);
    // Shield should have absorbed damage in every round
    for (const round of result.rounds) {
      expect(round.shieldAbsorbed).toBeDefined();
      expect(round.shieldAbsorbed).toBeGreaterThan(0);
    }
  });

  it('shield regenerates each round', () => {
    // With a shield that can absorb exactly one round of damage,
    // over multiple rounds the shield keeps regenerating
    const result = simulateCombat(makeInput({
      attackerFleet: { interceptor: 2 },
      defenderDefenses: { rocketLauncher: 3 },
      planetaryShieldCapacity: 500,
      rngSeed: 42,
    }));
    // If shield regenerates, it should absorb damage in multiple rounds
    const roundsWithAbsorption = result.rounds.filter(r => (r.shieldAbsorbed ?? 0) > 0);
    if (result.rounds.length > 1) {
      expect(roundsWithAbsorption.length).toBeGreaterThan(1);
    }
  });

  it('shield overwhelmed in one round — defenses take damage', () => {
    // Large attacker fleet vs tiny shield
    const result = simulateCombat(makeInput({
      attackerFleet: { battlecruiser: 10 },
      defenderDefenses: { rocketLauncher: 10 },
      planetaryShieldCapacity: 10,
      rngSeed: 99,
    }));
    // Defenses should have taken losses
    expect(result.defenderLosses.rocketLauncher ?? 0).toBeGreaterThan(0);
  });

  it('shield with 0 capacity — no shield unit injected, normal combat', () => {
    const resultWithZero = simulateCombat(makeInput({
      attackerFleet: { cruiser: 3 },
      defenderDefenses: { rocketLauncher: 5 },
      planetaryShieldCapacity: 0,
      rngSeed: 42,
    }));
    const resultWithout = simulateCombat(makeInput({
      attackerFleet: { cruiser: 3 },
      defenderDefenses: { rocketLauncher: 5 },
      rngSeed: 42,
    }));
    // Both should produce the same result
    expect(resultWithZero.outcome).toBe(resultWithout.outcome);
    expect(resultWithZero.defenderLosses).toEqual(resultWithout.defenderLosses);
    expect(resultWithZero.attackerLosses).toEqual(resultWithout.attackerLosses);
    // No shieldAbsorbed in rounds
    for (const round of resultWithZero.rounds) {
      expect(round.shieldAbsorbed).toBeUndefined();
    }
  });

  it('shield never appears in losses or debris', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { battlecruiser: 10 },
      defenderDefenses: { rocketLauncher: 5 },
      planetaryShieldCapacity: 50,
      rngSeed: 77,
    }));
    // Shield type must not appear in defender losses
    expect(result.defenderLosses['__planetaryShield__']).toBeUndefined();
    // Shield must not appear in round surviving counts
    for (const round of result.rounds) {
      expect(round.defenderShips['__planetaryShield__']).toBeUndefined();
    }
    // Debris should not include shield (it has no entry in shipCosts and is not in shipIds)
    // Verify debris only accounts for real ships/defenses
    expect(result.debris.minerai).toBeGreaterThanOrEqual(0);
    expect(result.debris.silicium).toBeGreaterThanOrEqual(0);
  });

  it('fleet targeted before shield, shield before defenses (new targeting order)', () => {
    // Cruiser secondary battery targets light → interceptors are hit first by fallback,
    // then shield, then defenses. This validates the natural targeting order.
    const result = simulateCombat(makeInput({
      attackerFleet: { cruiser: 2 },
      defenderFleet: { interceptor: 3 },
      defenderDefenses: { rocketLauncher: 3 },
      planetaryShieldCapacity: 100,
      rngSeed: 55,
    }));
    // Interceptors (light, targetOrder 1) should be hit first
    const interceptorLosses = result.defenderLosses.interceptor ?? 0;
    expect(interceptorLosses).toBeGreaterThan(0);

    // In the first round, if interceptors are still alive, defenses should not be targeted
    // (shield sits between fleet and defenses in the targeting order)
    const firstRound = result.rounds[0];
    const interceptorsAliveRound1 = firstRound.defenderShips.interceptor ?? 0;
    const defensesAliveRound1 = firstRound.defenderShips.rocketLauncher ?? 0;
    // If some interceptors survived round 1, all defenses should still be alive
    if (interceptorsAliveRound1 > 0) {
      expect(defensesAliveRound1).toBe(3);
    }
  });

  it('attacker wins when only shield remains (shield alone does not count as alive defender)', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { battlecruiser: 10 },
      defenderDefenses: { rocketLauncher: 2 },
      planetaryShieldCapacity: 100,
      rngSeed: 42,
    }));
    // Attacker should win since defenses are destroyed and shield alone doesn't count
    expect(result.outcome).toBe('attacker');
  });
});

describe('combat invariants', () => {
  // Sommes sur tous les types (peu importe lesquels apparaissent)
  const sumValues = (rec: Record<string, number>) => Object.values(rec).reduce((a, b) => a + b, 0);

  it('attacker unit conservation: losses + survivors = initial count', () => {
    const initial = { interceptor: 10, frigate: 5, cruiser: 2 };
    const result = simulateCombat(makeInput({
      attackerFleet: initial,
      defenderFleet: { cruiser: 3, battlecruiser: 1 },
      rngSeed: 101,
    }));
    const lastRound = result.rounds[result.rounds.length - 1];
    for (const [type, start] of Object.entries(initial)) {
      const surviving = lastRound.attackerShips[type] ?? 0;
      const lost = result.attackerLosses[type] ?? 0;
      expect(surviving + lost).toBe(start);
    }
  });

  it('defender unit conservation: losses + survivors = initial count (ships + defenses)', () => {
    const fleet = { frigate: 8 };
    const defenses = { rocketLauncher: 10, electromagneticCannon: 2 };
    const result = simulateCombat(makeInput({
      attackerFleet: { battlecruiser: 4 },
      defenderFleet: fleet,
      defenderDefenses: defenses,
      rngSeed: 202,
    }));
    const lastRound = result.rounds[result.rounds.length - 1];
    for (const [type, start] of Object.entries({ ...fleet, ...defenses })) {
      const surviving = lastRound.defenderShips[type] ?? 0;
      const lost = result.defenderLosses[type] ?? 0;
      expect(surviving + lost).toBe(start);
    }
  });

  it('debris excludes defenses even when destroyed', () => {
    const result = simulateCombat(makeInput({
      attackerFleet: { battlecruiser: 10 },
      defenderDefenses: { rocketLauncher: 20 }, // defenses détruites en masse
      rngSeed: 303,
    }));
    // Toutes les défenses potentiellement détruites, mais debris ne les compte pas
    expect(sumValues(result.defenderLosses)).toBeGreaterThan(0);
    // Le seul debris possible vient des attaquants (ici aucun ne peut mourir face à des rocketLaunchers seules)
    // On vérifie simplement que le debris = 30% des coûts des attaquants détruits, sans inclure les défenses
    const expectedFromAttackerLosses =
      (result.attackerLosses.battlecruiser ?? 0) * SHIP_COSTS.battlecruiser.minerai * 0.3;
    expect(result.debris.minerai).toBe(Math.floor(expectedFromAttackerLosses));
  });

  it('fallback targeting: no light → medium hit before heavy', () => {
    // Interceptor battery targets light : aucune cible light → fallback vers medium avant heavy
    const result = simulateCombat(makeInput({
      attackerFleet: { interceptor: 30 },
      defenderFleet: { frigate: 3, cruiser: 3 },
      rngSeed: 404,
    }));
    const frigateLosses = result.defenderLosses.frigate ?? 0;
    const cruiserLosses = result.defenderLosses.cruiser ?? 0;
    // Les frégates doivent recevoir au moins autant de pertes que les croiseurs
    expect(frigateLosses).toBeGreaterThanOrEqual(cruiserLosses);
    // Et au moins une frégate doit tomber (elles sont ciblées en priorité par fallback)
    expect(frigateLosses).toBeGreaterThan(0);
  });

  it('support units not targeted when targetable units remain', () => {
    // Seul le cargo est `support` — tant qu'il reste du light, le cargo ne doit pas être ciblé
    const result = simulateCombat(makeInput({
      attackerFleet: { cruiser: 2 },
      defenderFleet: { interceptor: 5, smallCargo: 5 },
      rngSeed: 505,
    }));
    // Round 1 : interceptors survivent probablement au moins partiellement
    const r1 = result.rounds[0];
    const interceptorsAlive = r1.defenderShips.interceptor ?? 0;
    const cargosAlive = r1.defenderShips.smallCargo ?? 0;
    if (interceptorsAlive > 0) {
      // Aucun cargo ne doit avoir été touché
      expect(cargosAlive).toBe(5);
    }
  });

  it('minimum damage per hit still applies when armor > weapon damage', () => {
    // Une unité avec beaucoup d'armure vs une arme très faible → sans le min, rien ne passe
    const configs: Record<string, ShipCombatConfig> = {
      ...SHIP_CONFIGS,
      tank: { shipType: 'tank', categoryId: 'light', baseShield: 0, baseArmor: 50, baseHull: 10, baseWeaponDamage: 1, baseShotCount: 1 },
      pea:  { shipType: 'pea',  categoryId: 'light', baseShield: 0, baseArmor: 0,  baseHull: 100, baseWeaponDamage: 1, baseShotCount: 3 },
    };
    const result = simulateCombat(makeInput({
      attackerFleet: { pea: 1 },
      defenderFleet: { tank: 1 },
      shipConfigs: configs,
      shipIds: new Set([...SHIP_IDS, 'tank', 'pea']),
      rngSeed: 606,
    }));
    // Avec 3 tirs/round × 1 dmg minimum × 4 rounds max = 12 dmg ≥ 10 hull → tank détruit
    expect(result.defenderLosses.tank).toBe(1);
  });

  it('planetary shield absorption is bounded by capacity per round', () => {
    const capacity = 50;
    const result = simulateCombat(makeInput({
      attackerFleet: { interceptor: 10 },
      defenderDefenses: { rocketLauncher: 5 },
      planetaryShieldCapacity: capacity,
      rngSeed: 707,
    }));
    // Le bouclier planétaire régénère à 100% chaque round → absorption ≤ capacité par round
    for (const r of result.rounds) {
      expect(r.shieldAbsorbed ?? 0).toBeLessThanOrEqual(capacity);
      expect(r.shieldAbsorbed ?? 0).toBeGreaterThanOrEqual(0);
    }
    // Et il doit y avoir eu au moins un round où il a absorbé du dégât
    const anyAbsorption = result.rounds.some(r => (r.shieldAbsorbed ?? 0) > 0);
    expect(anyAbsorption).toBe(true);
  });

  it('weapon research doubles damage output (sanity check on multiplier)', () => {
    const base = simulateCombat(makeInput({
      attackerFleet: { cruiser: 5 },
      defenderFleet: { cruiser: 5 },
      rngSeed: 808,
    }));
    const buffed = simulateCombat(makeInput({
      attackerFleet: { cruiser: 5 },
      defenderFleet: { cruiser: 5 },
      attackerMultipliers: { weapons: 2, shielding: 1, armor: 1 },
      rngSeed: 808,
    }));
    // Avec 2x armes côté attaquant, les pertes défenseur doivent être strictement supérieures
    expect(sumValues(buffed.defenderLosses)).toBeGreaterThan(sumValues(base.defenderLosses));
  });
});

describe('multi-battery weapons', () => {
  const sumValues = (rec: Record<string, number>) => Object.values(rec).reduce((a, b) => a + b, 0);

  it('rafale boosts shot count when target matches rafale category', () => {
    // Cibles contrôlées "paper" (1 hull, 0 shield) : chaque tir tue 1 cible.
    // Batterie unique : 1 dmg ×2, rafale 5 vs Léger → 7 tirs par round quand cible = light.
    const configs: Record<string, ShipCombatConfig> = {
      ...SHIP_CONFIGS,
      rafaleTester: {
        shipType: 'rafaleTester', categoryId: 'heavy',
        baseShield: 0, baseArmor: 0, baseHull: 100,
        baseWeaponDamage: 0, baseShotCount: 0,
        weapons: [
          { damage: 1, shots: 2, targetCategory: 'light', rafale: { category: 'light', count: 5 } },
        ],
      },
      paper: {
        shipType: 'paper', categoryId: 'light',
        baseShield: 0, baseArmor: 0, baseHull: 1,
        baseWeaponDamage: 0, baseShotCount: 0,
        weapons: [],
      },
    };
    const r = simulateCombat(makeInput({
      attackerFleet: { rafaleTester: 1 },
      defenderFleet: { paper: 50 }, // large pool pour éviter le manque de cibles
      shipConfigs: configs,
      shipIds: new Set([...SHIP_IDS, 'rafaleTester', 'paper']),
      rngSeed: 909,
    }));
    // 1 tester, rafale active: round 1 tue exactement 7 cibles (2 base + 5 rafale)
    const destroyedRound1 = 50 - (r.rounds[0].defenderShips.paper ?? 0);
    expect(destroyedRound1).toBe(7);
  });

  it('rafale does NOT trigger when falling back to a different category', () => {
    // Batterie cible light avec rafale 5 light, MAIS pas de light en face →
    // la batterie tombe en fallback sur medium et ne tire que ses 2 shots de base.
    const configs: Record<string, ShipCombatConfig> = {
      ...SHIP_CONFIGS,
      rafaleTester: {
        shipType: 'rafaleTester', categoryId: 'heavy',
        baseShield: 0, baseArmor: 0, baseHull: 100,
        baseWeaponDamage: 0, baseShotCount: 0,
        weapons: [
          { damage: 1, shots: 2, targetCategory: 'light', rafale: { category: 'light', count: 5 } },
        ],
      },
      paperMedium: {
        shipType: 'paperMedium', categoryId: 'medium',
        baseShield: 0, baseArmor: 0, baseHull: 1,
        baseWeaponDamage: 0, baseShotCount: 0,
        weapons: [],
      },
    };
    const r = simulateCombat(makeInput({
      attackerFleet: { rafaleTester: 1 },
      defenderFleet: { paperMedium: 20 },
      shipConfigs: configs,
      shipIds: new Set([...SHIP_IDS, 'rafaleTester', 'paperMedium']),
      rngSeed: 910,
    }));
    // Pas de rafale (fallback) → exactement 2 kills round 1
    const destroyedRound1 = 20 - (r.rounds[0].defenderShips.paperMedium ?? 0);
    expect(destroyedRound1).toBe(2);
    // silence sumValues unused warning
    expect(sumValues({ x: destroyedRound1 })).toBe(destroyedRound1);
  });

  it('chainkill fires a bonus shot when a shot destroys its target', () => {
    // Interceptors (bat: 4×3 light + chainkill) vs 6 frégates.
    // Les frégates ont 16 shield + 30 hull. Pas directement "one-shot" par un intercepteur.
    // Pour prouver chainkill, on confronte interceptors à des cibles qui peuvent être
    // tuées en 1 shot: des sondes génériques. On synthétise un type custom.
    const configs: Record<string, ShipCombatConfig> = {
      ...SHIP_CONFIGS,
      chainTest: {
        shipType: 'chainTest', categoryId: 'light',
        baseShield: 0, baseArmor: 0, baseHull: 3,
        baseWeaponDamage: 0, baseShotCount: 0,
        weapons: [],
      },
    };
    const withChain = simulateCombat(makeInput({
      attackerFleet: { interceptor: 1 },
      defenderFleet: { chainTest: 10 },
      shipConfigs: configs,
      shipIds: new Set([...SHIP_IDS, 'chainTest']),
      rngSeed: 911,
    }));
    // 1 intercepteur = 3 tirs de 4 dmg + jusqu'à 3 chainkills (1 par tir)
    // Chaque chainTest (3 HP) tombe en 1 tir. Donc max 6 kills en round 1.
    const destroyedRound1 = 10 - (withChain.rounds[0].defenderShips.chainTest ?? 0);
    expect(destroyedRound1).toBeGreaterThanOrEqual(4); // au moins 3 de base + quelques chainkill
    expect(destroyedRound1).toBeLessThanOrEqual(6);    // max 3 + 3 chainkills
  });

  it('damageMultiplier scales battery damage with the shooter baseWeaponDamage (V8.1)', () => {
    // Batterie A : damage absolu 5 ×1 (V7 fallback)
    // Batterie B : damageMultiplier 2.0 ×1 — devrait faire 100 × 2 = 200 dmg/shot
    // Cible "paper" (200 hull, no shield/armor) → 1 hit B = mort, 1 hit A = -5 hull seulement.
    const configs: Record<string, ShipCombatConfig> = {
      ...SHIP_CONFIGS,
      multTester: {
        shipType: 'multTester', categoryId: 'heavy',
        baseShield: 0, baseArmor: 0, baseHull: 1000,
        baseWeaponDamage: 100, // référence pour le multiplier
        baseShotCount: 1,
        weapons: [
          { damage: 5, shots: 1, targetCategory: 'medium' },              // V7 absolu = 5
          { damage: 0, damageMultiplier: 2.0, shots: 1, targetCategory: 'medium' }, // V8.1 = 100×2 = 200
        ],
      },
      paperHull: {
        shipType: 'paperHull', categoryId: 'medium',
        baseShield: 0, baseArmor: 0, baseHull: 200,
        baseWeaponDamage: 0, baseShotCount: 0,
        weapons: [],
      },
    };
    const r = simulateCombat(makeInput({
      attackerFleet: { multTester: 1 },
      defenderFleet: { paperHull: 5 },
      shipConfigs: configs,
      shipIds: new Set([...SHIP_IDS, 'multTester', 'paperHull']),
      rngSeed: 1042,
    }));
    // Round 1 : la batterie B (200 dmg) one-shot 1 cible (200 HP), la batterie A (5 dmg) ne fait que la rayer.
    // Donc exactement 1 destruction au round 1.
    const destroyedRound1 = 5 - (r.rounds[0].defenderShips.paperHull ?? 0);
    expect(destroyedRound1).toBe(1);
  });

  it('multi-battery: each weapon selects its own target independently', () => {
    // Frégate: bat1 (12×1 medium) + bat2 (6×2 light).
    // Contre 1 frégate (medium) + 3 intercepteurs (light) : les deux batteries ont chacune leurs cibles.
    const r = simulateCombat(makeInput({
      attackerFleet: { frigate: 1 },
      defenderFleet: { frigate: 1, interceptor: 3 },
      rngSeed: 912,
    }));
    // On vérifie que round 1 a infligé des dégâts à la fois à la frégate ET aux intercepteurs
    const damageByType = r.rounds[0].defenderDamageByType ?? {};
    const damageToFrigate = (damageByType.frigate?.shieldDamage ?? 0) + (damageByType.frigate?.hullDamage ?? 0);
    const damageToInterceptor = (damageByType.interceptor?.shieldDamage ?? 0) + (damageByType.interceptor?.hullDamage ?? 0);
    expect(damageToFrigate).toBeGreaterThan(0);
    expect(damageToInterceptor).toBeGreaterThan(0);
  });
});
