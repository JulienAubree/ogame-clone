import { describe, it, expect } from 'vitest';
import { shipCost, shipTime, defenseCost, defenseTime } from './shipyard-cost.js';

const lightFighterDef = { cost: { minerai: 3000, silicium: 1000, hydrogene: 0 } };
const cruiserDef = { cost: { minerai: 20000, silicium: 7000, hydrogene: 2000 } };
const espionageProbeDef = { cost: { minerai: 0, silicium: 1000, hydrogene: 0 } };
const rocketLauncherDef = { cost: { minerai: 2000, silicium: 0, hydrogene: 0 } };
const gaussCannonDef = { cost: { minerai: 20000, silicium: 15000, hydrogene: 2000 } };

describe('shipCost', () => {
  it('light fighter costs 3000/1000/0', () => {
    expect(shipCost(lightFighterDef)).toEqual({ minerai: 3000, silicium: 1000, hydrogene: 0 });
  });

  it('cruiser costs 20000/7000/2000', () => {
    expect(shipCost(cruiserDef)).toEqual({ minerai: 20000, silicium: 7000, hydrogene: 2000 });
  });
});

describe('shipTime', () => {
  it('light fighter, shipyard 1 = 2880s', () => {
    expect(shipTime(lightFighterDef, 1)).toBe(2880);
  });

  it('light fighter, shipyard 5 = 960s', () => {
    expect(shipTime(lightFighterDef, 5)).toBe(960);
  });

  it('cruiser, shipyard 5 = 6480s', () => {
    expect(shipTime(cruiserDef, 5)).toBe(6480);
  });

  it('minimum time is 1 second', () => {
    expect(shipTime(espionageProbeDef, 1000)).toBeGreaterThanOrEqual(1);
  });
});

describe('defenseCost', () => {
  it('rocket launcher costs 2000/0/0', () => {
    expect(defenseCost(rocketLauncherDef)).toEqual({ minerai: 2000, silicium: 0, hydrogene: 0 });
  });

  it('gauss cannon costs 20000/15000/2000', () => {
    expect(defenseCost(gaussCannonDef)).toEqual({ minerai: 20000, silicium: 15000, hydrogene: 2000 });
  });
});

describe('defenseTime', () => {
  it('rocket launcher, shipyard 1 = 1440s', () => {
    expect(defenseTime(rocketLauncherDef, 1)).toBe(1440);
  });

  it('gauss cannon, shipyard 6 = 7200s', () => {
    expect(defenseTime(gaussCannonDef, 6)).toBe(7200);
  });
});
