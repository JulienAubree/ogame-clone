import { describe, it, expect } from 'vitest';
import { shipSpeed, fleetSpeed, travelTime, fuelConsumption, totalCargoCapacity } from './fleet.js';

describe('shipSpeed', () => {
  it('small cargo with combustion 0 = 5000', () => {
    expect(shipSpeed('smallCargo', { combustion: 0, impulse: 0, hyperspaceDrive: 0 })).toBe(5000);
  });
  it('small cargo with combustion 5 = 7500', () => {
    expect(shipSpeed('smallCargo', { combustion: 5, impulse: 0, hyperspaceDrive: 0 })).toBe(7500);
  });
  it('cruiser with impulse 4 = 27000', () => {
    expect(shipSpeed('cruiser', { combustion: 0, impulse: 4, hyperspaceDrive: 0 })).toBe(27000);
  });
  it('battleship with hyperspace 3 = 19000', () => {
    expect(shipSpeed('battleship', { combustion: 0, impulse: 0, hyperspaceDrive: 3 })).toBe(19000);
  });
});

describe('fleetSpeed', () => {
  it('fleet speed is the minimum of all ships', () => {
    const ships = { smallCargo: 5, cruiser: 2 } as Record<string, number>;
    const techs = { combustion: 5, impulse: 4, hyperspaceDrive: 0 };
    expect(fleetSpeed(ships, techs)).toBe(7500);
  });
  it('single ship fleet', () => {
    const ships = { lightFighter: 10 } as Record<string, number>;
    const techs = { combustion: 3, impulse: 0, hyperspaceDrive: 0 };
    expect(fleetSpeed(ships, techs)).toBe(16250);
  });
});

describe('travelTime', () => {
  it('same system different position', () => {
    const origin = { galaxy: 1, system: 100, position: 4 };
    const target = { galaxy: 1, system: 100, position: 8 };
    const time = travelTime(origin, target, 10000, 1);
    expect(time).toBeGreaterThan(0);
    expect(typeof time).toBe('number');
  });
  it('different systems same galaxy', () => {
    const origin = { galaxy: 1, system: 100, position: 4 };
    const target = { galaxy: 1, system: 200, position: 4 };
    const time = travelTime(origin, target, 10000, 1);
    expect(time).toBeGreaterThan(0);
  });
  it('different galaxies', () => {
    const origin = { galaxy: 1, system: 100, position: 4 };
    const target = { galaxy: 3, system: 200, position: 8 };
    const time = travelTime(origin, target, 10000, 1);
    expect(time).toBeGreaterThan(0);
  });
  it('higher universe speed = faster', () => {
    const origin = { galaxy: 1, system: 100, position: 4 };
    const target = { galaxy: 1, system: 200, position: 4 };
    const t1 = travelTime(origin, target, 10000, 1);
    const t2 = travelTime(origin, target, 10000, 2);
    expect(t2).toBeLessThan(t1);
  });
});

describe('fuelConsumption', () => {
  it('calculates total fuel for a fleet', () => {
    const ships = { smallCargo: 10 } as Record<string, number>;
    const fuel = fuelConsumption(ships, 12200, 3600);
    expect(fuel).toBeGreaterThan(0);
    expect(typeof fuel).toBe('number');
  });
});

describe('totalCargoCapacity', () => {
  it('small cargos have 5000 each', () => {
    expect(totalCargoCapacity({ smallCargo: 10 })).toBe(50000);
  });
  it('mixed fleet', () => {
    expect(totalCargoCapacity({ smallCargo: 5, largeCargo: 2 })).toBe(75000);
  });
  it('empty fleet = 0', () => {
    expect(totalCargoCapacity({})).toBe(0);
  });
});
