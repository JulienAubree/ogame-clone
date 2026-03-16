import { describe, it, expect } from 'vitest';
import { buildingCost, buildingTime } from './building-cost.js';

const mineraiMineDef = { baseCost: { minerai: 60, silicium: 15, hydrogene: 0 }, costFactor: 1.5 };
const siliciumMineDef = { baseCost: { minerai: 48, silicium: 24, hydrogene: 0 }, costFactor: 1.6 };
const roboticsDef = { baseCost: { minerai: 400, silicium: 120, hydrogene: 200 }, costFactor: 2 };
const hydrogeneSynthDef = { baseCost: { minerai: 225, silicium: 75, hydrogene: 0 }, costFactor: 1.5 };

describe('buildingCost', () => {
  it('minerai mine level 1 costs 60/15/0', () => {
    const cost = buildingCost(mineraiMineDef, 1);
    expect(cost).toEqual({ minerai: 60, silicium: 15, hydrogene: 0 });
  });

  it('minerai mine level 5 costs 60*1.5^4 / 15*1.5^4', () => {
    const cost = buildingCost(mineraiMineDef, 5);
    expect(cost).toEqual({ minerai: 303, silicium: 75, hydrogene: 0 });
  });

  it('minerai mine level 10', () => {
    const cost = buildingCost(mineraiMineDef, 10);
    expect(cost).toEqual({ minerai: 2306, silicium: 576, hydrogene: 0 });
  });

  it('silicium mine level 1 costs 48/24/0', () => {
    const cost = buildingCost(siliciumMineDef, 1);
    expect(cost).toEqual({ minerai: 48, silicium: 24, hydrogene: 0 });
  });

  it('silicium mine level 5', () => {
    const cost = buildingCost(siliciumMineDef, 5);
    expect(cost).toEqual({ minerai: 314, silicium: 157, hydrogene: 0 });
  });

  it('robotics level 3 costs with factor 2', () => {
    const cost = buildingCost(roboticsDef, 3);
    expect(cost).toEqual({ minerai: 1600, silicium: 480, hydrogene: 800 });
  });

  it('hydrogene synth level 1', () => {
    const cost = buildingCost(hydrogeneSynthDef, 1);
    expect(cost).toEqual({ minerai: 225, silicium: 75, hydrogene: 0 });
  });
});

describe('buildingTime', () => {
  it('minerai mine level 1, robotics 0 = 108s', () => {
    const time = buildingTime(mineraiMineDef, 1, 0);
    expect(time).toBe(108);
  });

  it('minerai mine level 1, robotics 5 = 18s', () => {
    const time = buildingTime(mineraiMineDef, 1, 5);
    expect(time).toBe(18);
  });

  it('minerai mine level 10, robotics 0', () => {
    const time = buildingTime(mineraiMineDef, 10, 0);
    expect(time).toBe(4150);
  });

  it('robotics level 3, robotics 2', () => {
    const time = buildingTime(roboticsDef, 3, 2);
    expect(time).toBe(998);
  });

  it('minimum time is 1 second', () => {
    const time = buildingTime(mineraiMineDef, 1, 1000);
    expect(time).toBeGreaterThanOrEqual(1);
  });
});
