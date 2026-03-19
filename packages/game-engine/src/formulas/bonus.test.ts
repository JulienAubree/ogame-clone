import { describe, it, expect } from 'vitest';
import { resolveBonus, type BonusDefinition } from './bonus.js';

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

  it('computes single negative bonus (robotics level 3)', () => {
    const result = resolveBonus('building_time', null, { robotics: 3 }, bonusDefs);
    expect(result).toBeCloseTo(0.55, 10);
  });

  it('clamps modifier to 0.01 minimum per source', () => {
    const result = resolveBonus('building_time', null, { robotics: 10 }, bonusDefs);
    expect(result).toBeCloseTo(0.01, 10);
  });

  it('computes positive bonus (weapons level 5)', () => {
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

  it('multiplies multiple matching bonuses', () => {
    const defs: BonusDefinition[] = [
      { sourceType: 'building', sourceId: 'a', stat: 'building_time', percentPerLevel: -10, category: null },
      { sourceType: 'building', sourceId: 'b', stat: 'building_time', percentPerLevel: -20, category: null },
    ];
    const result = resolveBonus('building_time', null, { a: 2, b: 1 }, defs);
    expect(result).toBeCloseTo(0.64, 10);
  });

  it('fleet_count +100%/level at level 5 gives 6.0', () => {
    const result = resolveBonus('fleet_count', null, { computerTech: 5 }, bonusDefs);
    expect(result).toBeCloseTo(6, 10);
  });

  it('clamps combined result to 0.01 minimum', () => {
    const defs: BonusDefinition[] = [
      { sourceType: 'building', sourceId: 'a', stat: 'building_time', percentPerLevel: -80, category: null },
      { sourceType: 'building', sourceId: 'b', stat: 'building_time', percentPerLevel: -80, category: null },
    ];
    const result = resolveBonus('building_time', null, { a: 1, b: 1 }, defs);
    expect(result).toBeCloseTo(0.04, 10);
  });

  it('ignores sources not present in userLevels', () => {
    const result = resolveBonus('building_time', null, {}, bonusDefs);
    expect(result).toBe(1);
  });
});
