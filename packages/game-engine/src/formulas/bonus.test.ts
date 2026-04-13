import { describe, it, expect } from 'vitest';
import { resolveBonus, buildingBonusAtLevel, researchAnnexBonus, researchBiomeBonus, type BonusDefinition } from './bonus.js';

const bonusDefs: BonusDefinition[] = [
  { sourceType: 'building', sourceId: 'robotics', stat: 'building_time', percentPerLevel: -15, category: null },
  { sourceType: 'building', sourceId: 'researchLab', stat: 'research_time', percentPerLevel: -15, category: null },
  { sourceType: 'research', sourceId: 'combustion', stat: 'ship_speed', percentPerLevel: 10, category: 'combustion' },
  { sourceType: 'research', sourceId: 'impulse', stat: 'ship_speed', percentPerLevel: 20, category: 'impulse' },
  { sourceType: 'research', sourceId: 'weapons', stat: 'weapons', percentPerLevel: 10, category: null },
  { sourceType: 'research', sourceId: 'computerTech', stat: 'fleet_count', percentPerLevel: 100, category: null },
];

describe('resolveBonus', () => {
  it('returns 1.0 when no bonus matches', () => {
    expect(resolveBonus('cargo_capacity', null, {}, bonusDefs)).toBe(1);
  });

  it('returns 1.0 when source level is 0', () => {
    expect(resolveBonus('building_time', null, { robotics: 0 }, bonusDefs)).toBe(1);
  });

  it('building bonus uses 1/(1+n) formula (robotics level 1)', () => {
    const result = resolveBonus('building_time', null, { robotics: 1 }, bonusDefs);
    expect(result).toBeCloseTo(0.5, 10); // 1/(1+1) = 0.5
  });

  it('building bonus uses 1/(1+n) formula (robotics level 3)', () => {
    const result = resolveBonus('building_time', null, { robotics: 3 }, bonusDefs);
    expect(result).toBeCloseTo(0.25, 10); // 1/(1+3) = 0.25
  });

  it('building bonus uses 1/(1+n) formula (robotics level 10)', () => {
    const result = resolveBonus('building_time', null, { robotics: 10 }, bonusDefs);
    expect(result).toBeCloseTo(1 / 11, 10); // ~0.0909
  });

  it('computes positive research bonus (weapons level 5)', () => {
    const result = resolveBonus('weapons', null, { weapons: 5 }, bonusDefs);
    expect(result).toBeCloseTo(1.5, 10);
  });

  it('matches category filter (combustion speed)', () => {
    const result = resolveBonus('ship_speed', 'combustion', { combustion: 5 }, bonusDefs);
    expect(result).toBeCloseTo(1.5, 10);
  });

  it('does not match wrong category', () => {
    const result = resolveBonus('ship_speed', 'combustion', { impulse: 5 }, bonusDefs);
    expect(result).toBe(1);
  });

  it('null category on bonus matches any category query', () => {
    const result = resolveBonus('weapons', 'someCategory', { weapons: 5 }, bonusDefs);
    expect(result).toBeCloseTo(1.5, 10);
  });

  it('multiplies multiple matching building bonuses', () => {
    const defs: BonusDefinition[] = [
      { sourceType: 'building', sourceId: 'a', stat: 'building_time', percentPerLevel: -10, category: null },
      { sourceType: 'building', sourceId: 'b', stat: 'building_time', percentPerLevel: -20, category: null },
    ];
    // 1/(1+2) * 1/(1+1) = 1/3 * 1/2 = 1/6
    const result = resolveBonus('building_time', null, { a: 2, b: 1 }, defs);
    expect(result).toBeCloseTo(1 / 6, 10);
  });

  it('fleet_count +100%/level at level 5 gives 6.0', () => {
    const result = resolveBonus('fleet_count', null, { computerTech: 5 }, bonusDefs);
    expect(result).toBeCloseTo(6, 10);
  });

  it('ignores sources not present in userLevels', () => {
    const result = resolveBonus('building_time', null, {}, bonusDefs);
    expect(result).toBe(1);
  });
});

describe('buildingBonusAtLevel', () => {
  it('returns 1.0 at level 0', () => {
    expect(buildingBonusAtLevel(0)).toBe(1);
  });

  it('returns 0.5 at level 1', () => {
    expect(buildingBonusAtLevel(1)).toBeCloseTo(0.5);
  });

  it('returns 1/11 at level 10', () => {
    expect(buildingBonusAtLevel(10)).toBeCloseTo(1 / 11);
  });
});

describe('researchAnnexBonus', () => {
  it('returns 1 when no annex levels', () => {
    expect(researchAnnexBonus(0)).toBe(1);
  });

  it('applies -5% per annex level', () => {
    expect(researchAnnexBonus(1)).toBeCloseTo(0.95);
    expect(researchAnnexBonus(5)).toBeCloseTo(0.75);
    expect(researchAnnexBonus(10)).toBeCloseTo(0.50);
  });

  it('clamps to minimum 0.01', () => {
    expect(researchAnnexBonus(25)).toBe(0.01);
    expect(researchAnnexBonus(100)).toBe(0.01);
  });
});

describe('researchBiomeBonus', () => {
  it('returns 1 when no biomes discovered', () => {
    expect(researchBiomeBonus(0)).toBe(1);
  });

  it('applies -1% per discovered biome', () => {
    expect(researchBiomeBonus(1)).toBeCloseTo(0.99);
    expect(researchBiomeBonus(12)).toBeCloseTo(0.88);
    expect(researchBiomeBonus(35)).toBeCloseTo(0.65);
  });

  it('clamps to minimum 0.01', () => {
    expect(researchBiomeBonus(200)).toBe(0.01);
  });
});
