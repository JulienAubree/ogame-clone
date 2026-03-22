import { describe, it, expect } from 'vitest';
import { shipSpeed, fleetSpeed, travelTime, fuelConsumption, totalCargoCapacity } from './fleet.js';
import type { ShipStats } from './fleet.js';

const SHIP_STATS_MAP: Record<string, ShipStats> = {
  smallCargo: { baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000, driveType: 'combustion', miningExtraction: 0 },
  largeCargo: { baseSpeed: 7500, fuelConsumption: 50, cargoCapacity: 25000, driveType: 'combustion', miningExtraction: 0 },
  lightFighter: { baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion', miningExtraction: 0 },
  cruiser: { baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse', miningExtraction: 0 },
  battleship: { baseSpeed: 10000, fuelConsumption: 500, cargoCapacity: 1500, driveType: 'hyperspaceDrive', miningExtraction: 0 },
};

describe('shipSpeed', () => {
  it('small cargo with multiplier 1 = 5000', () => {
    expect(shipSpeed(SHIP_STATS_MAP.smallCargo, 1)).toBe(5000);
  });
  it('small cargo with multiplier 1.5 = 7500', () => {
    expect(shipSpeed(SHIP_STATS_MAP.smallCargo, 1.5)).toBe(7500);
  });
  it('cruiser with multiplier 1.8 = 27000', () => {
    expect(shipSpeed(SHIP_STATS_MAP.cruiser, 1.8)).toBe(27000);
  });
  it('battleship with multiplier 1.9 = 19000', () => {
    expect(shipSpeed(SHIP_STATS_MAP.battleship, 1.9)).toBe(19000);
  });
});

describe('fleetSpeed', () => {
  it('fleet speed is the minimum of all ships', () => {
    const ships = { smallCargo: 5, cruiser: 2 } as Record<string, number>;
    const multipliers = { smallCargo: 1.5, cruiser: 1.8 };
    expect(fleetSpeed(ships, SHIP_STATS_MAP, multipliers)).toBe(7500);
  });
  it('single ship fleet', () => {
    const ships = { lightFighter: 10 } as Record<string, number>;
    const multipliers = { lightFighter: 1.3 };
    expect(fleetSpeed(ships, SHIP_STATS_MAP, multipliers)).toBe(16250);
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
    const fuel = fuelConsumption(ships, 12200, 3600, SHIP_STATS_MAP);
    expect(fuel).toBeGreaterThan(0);
    expect(typeof fuel).toBe('number');
  });
});

describe('totalCargoCapacity', () => {
  it('small cargos have 5000 each', () => {
    expect(totalCargoCapacity({ smallCargo: 10 }, SHIP_STATS_MAP)).toBe(50000);
  });
  it('mixed fleet', () => {
    expect(totalCargoCapacity({ smallCargo: 5, largeCargo: 2 }, SHIP_STATS_MAP)).toBe(75000);
  });
  it('empty fleet = 0', () => {
    expect(totalCargoCapacity({}, SHIP_STATS_MAP)).toBe(0);
  });
});
