import { describe, it, expect } from 'vitest';
import { shipCost, shipTime, defenseCost, defenseTime } from './shipyard-cost.js';

const interceptorDef = { cost: { minerai: 3000, silicium: 1000, hydrogene: 0 } };
const cruiserDef = { cost: { minerai: 20000, silicium: 7000, hydrogene: 2000 } };
const espionageProbeDef = { cost: { minerai: 0, silicium: 1000, hydrogene: 0 } };
const rocketLauncherDef = { cost: { minerai: 2000, silicium: 0, hydrogene: 0 } };
const electromagneticCannonDef = { cost: { minerai: 20000, silicium: 15000, hydrogene: 2000 } };

describe('shipCost', () => {
  it('interceptor costs 3000/1000/0', () => {
    expect(shipCost(interceptorDef)).toEqual({ minerai: 3000, silicium: 1000, hydrogene: 0 });
  });

  it('cruiser costs 20000/7000/2000', () => {
    expect(shipCost(cruiserDef)).toEqual({ minerai: 20000, silicium: 7000, hydrogene: 2000 });
  });
});

describe('shipTime', () => {
  it('interceptor, no bonus (multiplier=1)', () => {
    // (3000 + 1000) / 2500 * 3600 * 1 = 5760
    expect(shipTime(interceptorDef, 1)).toBe(5760);
  });

  it('interceptor, 0.5 multiplier', () => {
    // (3000 + 1000) / 2500 * 3600 * 0.5 = 2880
    expect(shipTime(interceptorDef, 0.5)).toBe(2880);
  });

  it('cruiser, 0.5 multiplier', () => {
    // (20000 + 7000) / 2500 * 3600 * 0.5 = 19440
    expect(shipTime(cruiserDef, 0.5)).toBe(19440);
  });

  it('minimum time is 1 second', () => {
    expect(shipTime(espionageProbeDef, 0.001)).toBeGreaterThanOrEqual(1);
  });
});

describe('defenseCost', () => {
  it('rocket launcher costs 2000/0/0', () => {
    expect(defenseCost(rocketLauncherDef)).toEqual({ minerai: 2000, silicium: 0, hydrogene: 0 });
  });

  it('electromagnetic cannon costs 20000/15000/2000', () => {
    expect(defenseCost(electromagneticCannonDef)).toEqual({ minerai: 20000, silicium: 15000, hydrogene: 2000 });
  });
});

describe('defenseTime', () => {
  it('rocket launcher, no bonus (multiplier=1)', () => {
    // (2000 + 0) / 2500 * 3600 * 1 = 2880
    expect(defenseTime(rocketLauncherDef, 1)).toBe(2880);
  });

  it('electromagnetic cannon, 0.5 multiplier', () => {
    // (20000 + 15000) / 2500 * 3600 * 0.5 = 25200
    expect(defenseTime(electromagneticCannonDef, 0.5)).toBe(25200);
  });
});
