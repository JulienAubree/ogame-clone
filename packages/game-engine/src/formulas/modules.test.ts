import { describe, it, expect } from 'vitest';
import { parseLoadout, applyModulesToStats, getMaxCharges, resolveActiveAbility, type ModuleDefinitionLite } from './modules.js';

const POOL: ModuleDefinitionLite[] = [
  { id: 'm1', hullId: 'combat', rarity: 'common', enabled: true, effect: { type: 'stat', stat: 'damage', value: 0.05 } },
  { id: 'm2', hullId: 'combat', rarity: 'rare', enabled: true, effect: { type: 'stat', stat: 'hull', value: 0.20 } },
  { id: 'm3', hullId: 'combat', rarity: 'epic', enabled: true, effect: { type: 'active', ability: 'repair', magnitude: 0.50 } },
  { id: 'm4', hullId: 'combat', rarity: 'rare', enabled: true, effect: { type: 'stat', stat: 'epic_charges_max', value: 1 } },
  { id: 'disabled', hullId: 'combat', rarity: 'common', enabled: false, effect: { type: 'stat', stat: 'damage', value: 0.10 } },
];

describe('parseLoadout', () => {
  it('résout les ids vers les définitions complètes', () => {
    const loadout = { combat: { epic: 'm3', rare: ['m2'], common: ['m1'] } };
    const result = parseLoadout(loadout, 'combat', POOL);
    expect(result.equipped.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('ignore les ids inconnus (silencieux)', () => {
    const loadout = { combat: { epic: 'unknown', rare: ['m2'], common: [] } };
    const result = parseLoadout(loadout, 'combat', POOL);
    expect(result.equipped.map((m) => m.id)).toEqual(['m2']);
  });

  it('ignore les modules disabled', () => {
    const loadout = { combat: { epic: null, rare: [], common: ['disabled', 'm1'] } };
    const result = parseLoadout(loadout, 'combat', POOL);
    expect(result.equipped.map((m) => m.id)).toEqual(['m1']);
  });

  it('retourne loadout vide pour coque inconnue', () => {
    const result = parseLoadout({ combat: { epic: 'm3', rare: [], common: [] } }, 'scientific', POOL);
    expect(result.equipped).toEqual([]);
  });
});

describe('applyModulesToStats', () => {
  const baseStats = { damage: 100, hull: 1000, shield: 200, armor: 50, cargo: 5000, speed: 100, regen: 0 };
  const ctx = { roundIndex: 1, currentHullPercent: 1.0, enemyFP: 500, pendingEpicEffect: null };

  it('applique stat passive additif', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'a', hullId: 'combat', rarity: 'common', enabled: true, effect: { type: 'stat', stat: 'damage', value: 0.10 } },
    ], ctx);
    expect(r.damage).toBeCloseTo(110); // +10%
  });

  it('stack additif simple', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'a', hullId: 'combat', rarity: 'common', enabled: true, effect: { type: 'stat', stat: 'damage', value: 0.05 } },
      { id: 'b', hullId: 'combat', rarity: 'common', enabled: true, effect: { type: 'stat', stat: 'damage', value: 0.05 } },
      { id: 'c', hullId: 'combat', rarity: 'rare', enabled: true, effect: { type: 'stat', stat: 'damage', value: 0.20 } },
    ], ctx);
    expect(r.damage).toBeCloseTo(130); // 100 × (1 + 0.05+0.05+0.20)
  });

  it('conditional first_round déclenché à round 1', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'fr', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'conditional', trigger: 'first_round',
          effect: { stat: 'damage', value: 0.50 } } },
    ], { ...ctx, roundIndex: 1 });
    expect(r.damage).toBeCloseTo(150);
  });

  it('conditional first_round NON déclenché à round 2', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'fr', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'conditional', trigger: 'first_round',
          effect: { stat: 'damage', value: 0.50 } } },
    ], { ...ctx, roundIndex: 2 });
    expect(r.damage).toBe(100);
  });

  it('conditional low_hull avec threshold déclenché', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'lh', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'conditional', trigger: 'low_hull', threshold: 0.30,
          effect: { stat: 'shield', value: 0.20 } } },
    ], { ...ctx, currentHullPercent: 0.25 });
    expect(r.shield).toBeCloseTo(240); // +20%
  });

  it('conditional low_hull NON déclenché si hull > threshold', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'lh', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'conditional', trigger: 'low_hull', threshold: 0.30,
          effect: { stat: 'shield', value: 0.20 } } },
    ], { ...ctx, currentHullPercent: 0.50 });
    expect(r.shield).toBe(200);
  });

  it('active effect ignoré (utilisé seulement via resolveActiveAbility)', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'ac', hullId: 'combat', rarity: 'epic', enabled: true,
        effect: { type: 'active', ability: 'repair', magnitude: 0.50 } },
    ], ctx);
    expect(r).toEqual(baseStats); // no change from active alone
  });

  it('épique pending overcharge appliqué via context', () => {
    const r = applyModulesToStats(baseStats, [], {
      ...ctx,
      pendingEpicEffect: { ability: 'overcharge', magnitude: 1.0 },
    });
    expect(r.damage).toBeCloseTo(200); // +100%
  });
});

describe('getMaxCharges', () => {
  it('baseline 1 sans bonus', () => {
    expect(getMaxCharges([])).toBe(1);
  });
  it('+1 par module epic_charges_max', () => {
    const r = getMaxCharges([
      { id: 's', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'stat', stat: 'epic_charges_max', value: 1 } },
    ]);
    expect(r).toBe(2);
  });
  it('cap à 3 même avec stack', () => {
    const r = getMaxCharges([
      { id: 's1', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'stat', stat: 'epic_charges_max', value: 1 } },
      { id: 's2', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'stat', stat: 'epic_charges_max', value: 1 } },
      { id: 's3', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'stat', stat: 'epic_charges_max', value: 1 } },
    ]);
    expect(r).toBe(3); // cap, not 4
  });
});

describe('resolveActiveAbility', () => {
  it('repair / scan / skip → applied immediate', () => {
    expect(resolveActiveAbility('repair', 0.50)).toEqual({ ability: 'repair', magnitude: 0.50, applied: 'immediate' });
    expect(resolveActiveAbility('scan', 1.0)).toEqual({ ability: 'scan', magnitude: 1.0, applied: 'immediate' });
    expect(resolveActiveAbility('skip', 1.0)).toEqual({ ability: 'skip', magnitude: 1.0, applied: 'immediate' });
  });
  it('overcharge / shield_burst / damage_burst → applied pending', () => {
    expect(resolveActiveAbility('overcharge', 1.0)).toEqual({ ability: 'overcharge', magnitude: 1.0, applied: 'pending' });
    expect(resolveActiveAbility('shield_burst', 2.0)).toEqual({ ability: 'shield_burst', magnitude: 2.0, applied: 'pending' });
    expect(resolveActiveAbility('damage_burst', 1.5)).toEqual({ ability: 'damage_burst', magnitude: 1.5, applied: 'pending' });
  });
});

describe('applyModulesToStats — additional triggers and pending abilities', () => {
  const baseStats = { damage: 100, hull: 1000, shield: 200, armor: 50, cargo: 5000, speed: 100, regen: 0 };
  const ctx = { roundIndex: 1, currentHullPercent: 1.0, enemyFP: 500, pendingEpicEffect: null };

  it('pending damage_burst applique +damage comme overcharge', () => {
    const r = applyModulesToStats(baseStats, [], {
      ...ctx,
      pendingEpicEffect: { ability: 'damage_burst', magnitude: 0.50 },
    });
    expect(r.damage).toBeCloseTo(150);
  });

  it('pending shield_burst applique +shield', () => {
    const r = applyModulesToStats(baseStats, [], {
      ...ctx,
      pendingEpicEffect: { ability: 'shield_burst', magnitude: 1.5 },
    });
    expect(r.shield).toBeCloseTo(500); // 200 × (1 + 1.5)
  });

  it('conditional enemy_fp_above déclenché si enemyFP > threshold', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'efa', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'conditional', trigger: 'enemy_fp_above', threshold: 1000,
          effect: { stat: 'damage', value: 0.20 } } },
    ], { ...ctx, enemyFP: 1500 });
    expect(r.damage).toBeCloseTo(120);
  });

  it('conditional enemy_fp_above NON déclenché si enemyFP ≤ threshold', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'efa', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'conditional', trigger: 'enemy_fp_above', threshold: 1000,
          effect: { stat: 'damage', value: 0.20 } } },
    ], { ...ctx, enemyFP: 800 });
    expect(r.damage).toBe(100);
  });

  it('conditional last_round déclenché à roundIndex >= 4', () => {
    const r = applyModulesToStats(baseStats, [
      { id: 'lr', hullId: 'combat', rarity: 'rare', enabled: true,
        effect: { type: 'conditional', trigger: 'last_round',
          effect: { stat: 'damage', value: 0.30 } } },
    ], { ...ctx, roundIndex: 4 });
    expect(r.damage).toBeCloseTo(130);
  });
});
