import { describe, it, expect } from 'vitest';
import { calculateShieldCapacity, calculateShieldEnergy } from './shield.js';

describe('calculateShieldCapacity', () => {
  it('returns 30 at level 1', () => {
    expect(calculateShieldCapacity(1)).toBe(30);
  });

  it('returns 39 at level 2 (floor(30 * 1.3))', () => {
    expect(calculateShieldCapacity(2)).toBe(39);
  });

  it('returns 51 at level 3', () => {
    expect(calculateShieldCapacity(3)).toBe(51);
  });

  it('returns 318 at level 10', () => {
    expect(calculateShieldCapacity(10)).toBe(318);
  });

  it('returns 0 at level 0', () => {
    expect(calculateShieldCapacity(0)).toBe(0);
  });
});

describe('calculateShieldEnergy', () => {
  it('returns 30 at level 1', () => {
    expect(calculateShieldEnergy(1)).toBe(30);
  });

  it('returns 45 at level 2 (floor(30 * 1.5))', () => {
    expect(calculateShieldEnergy(2)).toBe(45);
  });

  it('returns 68 at level 3', () => {
    expect(calculateShieldEnergy(3)).toBe(68);
  });

  it('returns 1154 at level 10', () => {
    expect(calculateShieldEnergy(10)).toBe(1154);
  });

  it('returns 0 at level 0', () => {
    expect(calculateShieldEnergy(0)).toBe(0);
  });
});
