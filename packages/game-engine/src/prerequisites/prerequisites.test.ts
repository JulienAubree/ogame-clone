import { describe, it, expect } from 'vitest';
import { checkResearchPrerequisites, checkShipPrerequisites, checkDefensePrerequisites } from './prerequisites.js';

describe('checkResearchPrerequisites', () => {
  it('espionage tech requires research lab 3', () => {
    const result = checkResearchPrerequisites('espionageTech', { researchLabLevel: 2 }, {});
    expect(result.met).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('espionage tech passes with lab 3', () => {
    const result = checkResearchPrerequisites('espionageTech', { researchLabLevel: 3 }, {});
    expect(result.met).toBe(true);
  });

  it('combustion requires energy tech 1 + lab 1', () => {
    const result = checkResearchPrerequisites('combustion', { researchLabLevel: 1 }, { energyTech: 0 });
    expect(result.met).toBe(false);
  });

  it('combustion passes with energy tech 1 + lab 1', () => {
    const result = checkResearchPrerequisites('combustion', { researchLabLevel: 1 }, { energyTech: 1 });
    expect(result.met).toBe(true);
  });
});

describe('checkShipPrerequisites', () => {
  it('light fighter requires shipyard 1 + combustion 1', () => {
    const result = checkShipPrerequisites('lightFighter', { shipyardLevel: 0 }, {});
    expect(result.met).toBe(false);
  });

  it('light fighter passes', () => {
    const result = checkShipPrerequisites('lightFighter', { shipyardLevel: 1 }, { combustion: 1 });
    expect(result.met).toBe(true);
  });

  it('cruiser needs shipyard 5 + impulse 4 + weapons 3', () => {
    const result = checkShipPrerequisites('cruiser', { shipyardLevel: 5 }, { impulse: 3, weapons: 3 });
    expect(result.met).toBe(false);
  });

  it('cruiser passes', () => {
    const result = checkShipPrerequisites('cruiser', { shipyardLevel: 5 }, { impulse: 4, weapons: 3 });
    expect(result.met).toBe(true);
  });
});

describe('checkDefensePrerequisites', () => {
  it('rocket launcher requires shipyard 1', () => {
    const result = checkDefensePrerequisites('rocketLauncher', { shipyardLevel: 0 }, {});
    expect(result.met).toBe(false);
  });

  it('rocket launcher passes', () => {
    const result = checkDefensePrerequisites('rocketLauncher', { shipyardLevel: 1 }, {});
    expect(result.met).toBe(true);
  });

  it('gauss cannon needs shipyard 6 + energy 6 + weapons 3 + shielding 1', () => {
    const result = checkDefensePrerequisites('gaussCannon', { shipyardLevel: 6 }, { energyTech: 6, weapons: 2, shielding: 1 });
    expect(result.met).toBe(false);
  });
});
