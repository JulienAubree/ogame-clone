import { describe, it, expect } from 'vitest';
import { computeBaseStatsFromShips, FLAGSHIP_EXCLUDED_SHIPS, FLAGSHIP_DEFAULT_STATS } from './flagship-stats.js';

const mockShips = {
  interceptor: { weapons: 4, shield: 8, hull: 12, baseArmor: 1, shotCount: 3, baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50 },
  frigate: { weapons: 12, shield: 16, hull: 30, baseArmor: 2, shotCount: 2, baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100 },
  cruiser: { weapons: 45, shield: 28, hull: 55, baseArmor: 4, shotCount: 1, baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800 },
  smallCargo: { weapons: 1, shield: 8, hull: 12, baseArmor: 0, shotCount: 1, baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000 },
};

type ShipStats = typeof mockShips[keyof typeof mockShips];

describe('computeBaseStatsFromShips', () => {
  it('returns default stats when no ships unlocked', () => {
    expect(computeBaseStatsFromShips([], {})).toEqual(FLAGSHIP_DEFAULT_STATS);
  });

  it('returns the single ship stats when only one ship unlocked', () => {
    const result = computeBaseStatsFromShips(['frigate'], mockShips as Record<string, ShipStats>);
    expect(result).toEqual({
      weapons: 12, shield: 16, hull: 30, baseArmor: 2,
      shotCount: 2, baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100,
    });
  });

  it('takes max of each stat across multiple ships', () => {
    const result = computeBaseStatsFromShips(
      ['interceptor', 'frigate', 'cruiser'],
      mockShips as Record<string, ShipStats>,
    );
    expect(result).toEqual({
      weapons: 45,
      shield: 28,
      hull: 55,
      baseArmor: 4,
      shotCount: 3,
      baseSpeed: 15000,
      fuelConsumption: 20,
      cargoCapacity: 800,
    });
  });

  it('uses min for fuelConsumption', () => {
    const result = computeBaseStatsFromShips(
      ['cruiser', 'smallCargo'],
      mockShips as Record<string, ShipStats>,
    );
    expect(result.fuelConsumption).toBe(10);
  });

  it('skips ship IDs not found in shipDefs', () => {
    const result = computeBaseStatsFromShips(
      ['interceptor', 'nonexistent'],
      mockShips as Record<string, ShipStats>,
    );
    expect(result.weapons).toBe(4);
  });

  it('returns defaults when all unlocked ships are missing from defs', () => {
    const result = computeBaseStatsFromShips(['nonexistent'], {});
    expect(result).toEqual(FLAGSHIP_DEFAULT_STATS);
  });
});

describe('FLAGSHIP_EXCLUDED_SHIPS', () => {
  it('excludes espionageProbe, solarSatellite, recuperateur', () => {
    expect(FLAGSHIP_EXCLUDED_SHIPS).toContain('espionageProbe');
    expect(FLAGSHIP_EXCLUDED_SHIPS).toContain('solarSatellite');
    expect(FLAGSHIP_EXCLUDED_SHIPS).toContain('recuperateur');
    expect(FLAGSHIP_EXCLUDED_SHIPS).toHaveLength(3);
  });
});
