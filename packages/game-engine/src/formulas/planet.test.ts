import { describe, it, expect } from 'vitest';
import {
  calculateMaxTemp,
  calculateMinTemp,
  calculateDiameter,
} from './planet.js';

describe('calculateMaxTemp', () => {
  it('position 1 (closest to sun) has temp 250 with no offset', () => {
    expect(calculateMaxTemp(1, 0)).toBe(250);
  });
  it('position 8 (middle) has temp 40 with no offset', () => {
    expect(calculateMaxTemp(8, 0)).toBe(40);
  });
  it('position 15 (farthest) has temp -170 with no offset', () => {
    expect(calculateMaxTemp(15, 0)).toBe(-170);
  });
  it('applies random offset', () => {
    expect(calculateMaxTemp(8, 15)).toBe(55);
  });
});

describe('calculateMinTemp', () => {
  it('is maxTemp - 40', () => {
    expect(calculateMinTemp(250)).toBe(210);
    expect(calculateMinTemp(-170)).toBe(-210);
  });
});

describe('calculateDiameter', () => {
  it('returns min of range when randomFactor is 0', () => {
    expect(calculateDiameter(8, 0)).toBe(10000);
  });
  it('returns max-1 of range when randomFactor is ~1', () => {
    expect(calculateDiameter(8, 0.999)).toBe(15594);
  });
  it('position 1 has smaller range than position 8', () => {
    expect(calculateDiameter(1, 0.5)).toBeLessThan(calculateDiameter(8, 0.5));
  });
});
