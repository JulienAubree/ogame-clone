import { describe, it, expect } from 'vitest';
import { findShipByRole, findBuildingByRole, findPlanetTypeByRole } from './config-helpers.js';
import type { GameConfig } from '../modules/admin/game-config.service.js';

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    categories: [],
    buildings: {},
    research: {},
    ships: {},
    defenses: {},
    production: {},
    universe: {},
    planetTypes: [],
    pirateTemplates: [],
    tutorialQuests: [],
    bonuses: [],
    missions: {},
    labels: {},
    talentBranches: [],
    talents: {},
    ...overrides,
  };
}

describe('findShipByRole', () => {
  it('returns the ship definition matching the role', () => {
    const config = makeConfig({
      ships: {
        recycler: { id: 'recycler', name: 'Recycleur', role: 'recycling' } as any,
        smallCargo: { id: 'smallCargo', name: 'Petit transporteur', role: null } as any,
      },
    });
    const result = findShipByRole(config, 'recycling');
    expect(result.id).toBe('recycler');
  });

  it('throws if no ship has the requested role', () => {
    const config = makeConfig({ ships: {} });
    expect(() => findShipByRole(config, 'recycling')).toThrow('No ship with role "recycling"');
  });
});

describe('findBuildingByRole', () => {
  it('returns the building matching the role', () => {
    const config = makeConfig({
      buildings: {
        mineraiMine: { id: 'mineraiMine', name: 'Mine de minerai', role: 'producer_minerai' } as any,
      },
    });
    const result = findBuildingByRole(config, 'producer_minerai');
    expect(result.id).toBe('mineraiMine');
  });

  it('throws if no building has the requested role', () => {
    const config = makeConfig({ buildings: {} });
    expect(() => findBuildingByRole(config, 'producer_minerai')).toThrow('No building with role "producer_minerai"');
  });
});

describe('findPlanetTypeByRole', () => {
  it('returns the planet type matching the role', () => {
    const config = makeConfig({
      planetTypes: [
        { id: 'homeworld', name: 'Planète mère', role: 'homeworld' } as any,
        { id: 'desert', name: 'Désert', role: null } as any,
      ],
    });
    const result = findPlanetTypeByRole(config, 'homeworld');
    expect(result.id).toBe('homeworld');
  });

  it('throws if no planet type has the requested role', () => {
    const config = makeConfig({ planetTypes: [] });
    expect(() => findPlanetTypeByRole(config, 'homeworld')).toThrow('No planet type with role "homeworld"');
  });
});
