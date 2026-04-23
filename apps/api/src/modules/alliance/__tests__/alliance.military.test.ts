import { describe, it, expect } from 'vitest';
import { bucketMilitaryOutcomes } from '../alliance.military.js';

describe('bucketMilitaryOutcomes', () => {
  it('returns 0/0 on empty list', () => {
    expect(bucketMilitaryOutcomes([])).toEqual({ wins: 0, losses: 0 });
  });

  it('counts victories as wins', () => {
    expect(bucketMilitaryOutcomes([{ outcome: 'victory' }, { outcome: 'victory' }])).toEqual({ wins: 2, losses: 0 });
  });

  it('counts defeats as losses', () => {
    expect(bucketMilitaryOutcomes([{ outcome: 'defeat' }, { outcome: 'defeat' }, { outcome: 'defeat' }])).toEqual({ wins: 0, losses: 3 });
  });

  it('ignores draws', () => {
    expect(bucketMilitaryOutcomes([{ outcome: 'draw' }, { outcome: 'victory' }, { outcome: 'draw' }])).toEqual({ wins: 1, losses: 0 });
  });

  it('mixes outcomes correctly', () => {
    expect(bucketMilitaryOutcomes([
      { outcome: 'victory' },
      { outcome: 'defeat' },
      { outcome: 'draw' },
      { outcome: 'victory' },
      { outcome: 'defeat' },
    ])).toEqual({ wins: 2, losses: 2 });
  });
});
