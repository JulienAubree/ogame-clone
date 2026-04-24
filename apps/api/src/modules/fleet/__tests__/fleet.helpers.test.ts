import { describe, it, expect } from 'vitest';
import { buildFleetConfig, buildSpeedMultipliers } from '../fleet.helpers.js';
import type { BonusDefinition, ShipStats } from '@exilium/game-engine';

describe('buildFleetConfig', () => {
  it('reads values from universe config', () => {
    const cfg = buildFleetConfig({
      universe: {
        fleet_distance_galaxy_factor: 25000,
        fleet_distance_system_base: 3000,
        fleet_distance_system_factor: 100,
        fleet_distance_position_base: 1200,
        fleet_distance_position_factor: 6,
        fleet_same_position_distance: 7,
        fleet_speed_factor: 40000,
      },
    });
    expect(cfg).toEqual({
      galaxyFactor: 25000,
      systemBase: 3000,
      systemFactor: 100,
      positionBase: 1200,
      positionFactor: 6,
      samePositionDistance: 7,
      speedFactor: 40000,
    });
  });

  it('falls back to defaults when keys are missing', () => {
    const cfg = buildFleetConfig({ universe: {} });
    expect(cfg).toEqual({
      galaxyFactor: 20000,
      systemBase: 2700,
      systemFactor: 95,
      positionBase: 1000,
      positionFactor: 5,
      samePositionDistance: 5,
      speedFactor: 35000,
    });
  });
});

describe('buildSpeedMultipliers', () => {
  const stats: Record<string, ShipStats> = {
    fighter: { baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion' },
    cruiser: { baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse' },
  };

  const bonuses: BonusDefinition[] = [
    { id: 'ship_speed', type: 'ship_speed', target: 'combustion', source: { type: 'research', researchId: 'combustionTech' }, multiplierPerLevel: 0.1, baseMultiplier: 1 } as unknown as BonusDefinition,
    { id: 'ship_speed', type: 'ship_speed', target: 'impulse', source: { type: 'research', researchId: 'impulseTech' }, multiplierPerLevel: 0.2, baseMultiplier: 1 } as unknown as BonusDefinition,
  ];

  it('returns a multiplier for each ship present in stats', () => {
    const m = buildSpeedMultipliers(
      { fighter: 10, cruiser: 3 },
      stats,
      { combustionTech: 5, impulseTech: 2 },
      bonuses,
    );
    expect(Object.keys(m).sort()).toEqual(['cruiser', 'fighter']);
    expect(m.fighter).toBeGreaterThan(0);
    expect(m.cruiser).toBeGreaterThan(0);
  });

  it('skips ship IDs that are missing from the stats map (legacy references)', () => {
    const m = buildSpeedMultipliers(
      { fighter: 10, ghostShip: 5 },
      stats,
      {},
      bonuses,
    );
    expect(m.ghostShip).toBeUndefined();
    expect(m.fighter).toBeDefined();
  });
});
