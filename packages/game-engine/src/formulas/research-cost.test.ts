import { describe, it, expect } from 'vitest';
import { researchCost, researchTime } from './research-cost.js';

describe('researchCost', () => {
  it('espionage tech level 1 costs 200/1000/200', () => {
    const cost = researchCost('espionageTech', 1);
    expect(cost).toEqual({ metal: 200, crystal: 1000, deuterium: 200 });
  });

  it('espionage tech level 4 costs base * 2^3', () => {
    const cost = researchCost('espionageTech', 4);
    expect(cost).toEqual({ metal: 1600, crystal: 8000, deuterium: 1600 });
  });

  it('weapons tech level 1', () => {
    const cost = researchCost('weapons', 1);
    expect(cost).toEqual({ metal: 800, crystal: 200, deuterium: 0 });
  });

  it('computer tech level 3', () => {
    const cost = researchCost('computerTech', 3);
    expect(cost).toEqual({ metal: 0, crystal: 1600, deuterium: 2400 });
  });
});

describe('researchTime', () => {
  it('espionage tech level 1, lab 3', () => {
    const time = researchTime('espionageTech', 1, 3);
    expect(time).toBe(1080);
  });

  it('weapons tech level 1, lab 4', () => {
    const time = researchTime('weapons', 1, 4);
    expect(time).toBe(720);
  });

  it('espionage tech level 4, lab 3', () => {
    const time = researchTime('espionageTech', 4, 3);
    expect(time).toBe(8640);
  });

  it('minimum time is 1 second', () => {
    const time = researchTime('computerTech', 1, 1000);
    expect(time).toBeGreaterThanOrEqual(1);
  });
});
