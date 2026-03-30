import { describe, it, expect } from 'vitest';
import { calculateSellerCommission, maxMarketOffers } from './market.js';

describe('calculateSellerCommission', () => {
  it('returns 5% of quantity rounded up', () => {
    expect(calculateSellerCommission(10000, 5)).toBe(500);
  });

  it('rounds up fractional results', () => {
    expect(calculateSellerCommission(101, 5)).toBe(6);
  });

  it('returns 0 for zero quantity', () => {
    expect(calculateSellerCommission(0, 5)).toBe(0);
  });

  it('returns 0 for zero percent', () => {
    expect(calculateSellerCommission(10000, 0)).toBe(0);
  });

  it('handles reduced commission from talent', () => {
    const adjusted = 5 / (1 + 0.5);
    expect(calculateSellerCommission(10000, adjusted)).toBe(334);
  });
});

describe('maxMarketOffers', () => {
  it('returns level * 2', () => {
    expect(maxMarketOffers(1)).toBe(2);
    expect(maxMarketOffers(5)).toBe(10);
  });
});
