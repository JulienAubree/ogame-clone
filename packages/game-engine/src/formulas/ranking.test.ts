import { describe, it, expect } from 'vitest';
import {
  calculateBuildingPoints,
  calculateResearchPoints,
  calculateFleetPoints,
  calculateDefensePoints,
  calculateTotalPoints,
} from './ranking.js';
import type { BuildingDef, ResearchDef, UnitDef } from './ranking.js';

const BUILDING_DEFS: Record<string, BuildingDef> = {
  mineraiMine:      { id: 'mineraiMine',      baseCost: { minerai: 60,   silicium: 15,   hydrogene: 0 },   costFactor: 1.5 },
  siliciumMine:     { id: 'siliciumMine',      baseCost: { minerai: 48,   silicium: 24,   hydrogene: 0 },   costFactor: 1.6 },
  hydrogeneSynth:   { id: 'hydrogeneSynth',    baseCost: { minerai: 225,  silicium: 75,   hydrogene: 0 },   costFactor: 1.5 },
  solarPlant:       { id: 'solarPlant',        baseCost: { minerai: 75,   silicium: 30,   hydrogene: 0 },   costFactor: 1.5 },
  robotics:         { id: 'robotics',          baseCost: { minerai: 400,  silicium: 120,  hydrogene: 200 }, costFactor: 2 },
  shipyard:         { id: 'shipyard',          baseCost: { minerai: 400,  silicium: 200,  hydrogene: 100 }, costFactor: 2 },
  arsenal:          { id: 'arsenal',           baseCost: { minerai: 400,  silicium: 200,  hydrogene: 100 }, costFactor: 2 },
  commandCenter:    { id: 'commandCenter',     baseCost: { minerai: 400,  silicium: 200,  hydrogene: 100 }, costFactor: 2 },
  researchLab:      { id: 'researchLab',       baseCost: { minerai: 200,  silicium: 400,  hydrogene: 200 }, costFactor: 2 },
  storageMinerai:   { id: 'storageMinerai',    baseCost: { minerai: 1000, silicium: 0,    hydrogene: 0 },   costFactor: 2 },
  storageSilicium:  { id: 'storageSilicium',   baseCost: { minerai: 1000, silicium: 500,  hydrogene: 0 },   costFactor: 2 },
  storageHydrogene: { id: 'storageHydrogene',  baseCost: { minerai: 1000, silicium: 1000, hydrogene: 0 },   costFactor: 2 },
};

const RESEARCH_DEFS: Record<string, ResearchDef> = {
  espionageTech:  { id: 'espionageTech',   baseCost: { minerai: 200,   silicium: 1000,  hydrogene: 200 },  costFactor: 2 },
  computerTech:   { id: 'computerTech',    baseCost: { minerai: 0,     silicium: 400,   hydrogene: 600 },  costFactor: 2 },
  energyTech:     { id: 'energyTech',      baseCost: { minerai: 0,     silicium: 800,   hydrogene: 400 },  costFactor: 2 },
  combustion:     { id: 'combustion',      baseCost: { minerai: 400,   silicium: 0,     hydrogene: 600 },  costFactor: 2 },
  impulse:        { id: 'impulse',         baseCost: { minerai: 2000,  silicium: 4000,  hydrogene: 600 },  costFactor: 2 },
  hyperspaceDrive:{ id: 'hyperspaceDrive', baseCost: { minerai: 10000, silicium: 20000, hydrogene: 6000 }, costFactor: 2 },
  weapons:        { id: 'weapons',         baseCost: { minerai: 800,   silicium: 200,   hydrogene: 0 },    costFactor: 2 },
  shielding:      { id: 'shielding',       baseCost: { minerai: 200,   silicium: 600,   hydrogene: 0 },    costFactor: 2 },
  armor:          { id: 'armor',           baseCost: { minerai: 1000,  silicium: 0,     hydrogene: 0 },    costFactor: 2 },
};

const SHIP_DEFS: Record<string, UnitDef> = {
  smallCargo:     { countColumn: 'smallCargo',     cost: { minerai: 2000,  silicium: 2000,  hydrogene: 0 } },
  largeCargo:     { countColumn: 'largeCargo',     cost: { minerai: 6000,  silicium: 6000,  hydrogene: 0 } },
  lightFighter:   { countColumn: 'lightFighter',   cost: { minerai: 3000,  silicium: 1000,  hydrogene: 0 } },
  heavyFighter:   { countColumn: 'heavyFighter',   cost: { minerai: 6000,  silicium: 4000,  hydrogene: 0 } },
  cruiser:        { countColumn: 'cruiser',        cost: { minerai: 20000, silicium: 7000,  hydrogene: 2000 } },
  battleship:     { countColumn: 'battleship',     cost: { minerai: 45000, silicium: 15000, hydrogene: 0 } },
  espionageProbe: { countColumn: 'espionageProbe', cost: { minerai: 0,     silicium: 1000,  hydrogene: 0 } },
  colonyShip:     { countColumn: 'colonyShip',     cost: { minerai: 10000, silicium: 20000, hydrogene: 10000 } },
  recycler:       { countColumn: 'recycler',       cost: { minerai: 10000, silicium: 6000,  hydrogene: 2000 } },
  prospector:     { countColumn: 'prospector',     cost: { minerai: 3000,  silicium: 1000,  hydrogene: 500 } },
  explorer:       { countColumn: 'explorer',       cost: { minerai: 5000,  silicium: 2500,  hydrogene: 500 } },
};

const DEFENSE_DEFS: Record<string, UnitDef> = {
  rocketLauncher: { countColumn: 'rocketLauncher', cost: { minerai: 2000,  silicium: 0,     hydrogene: 0 } },
  lightLaser:     { countColumn: 'lightLaser',     cost: { minerai: 1500,  silicium: 500,   hydrogene: 0 } },
  heavyLaser:     { countColumn: 'heavyLaser',     cost: { minerai: 6000,  silicium: 2000,  hydrogene: 0 } },
  gaussCannon:    { countColumn: 'gaussCannon',    cost: { minerai: 20000, silicium: 15000, hydrogene: 2000 } },
  plasmaTurret:   { countColumn: 'plasmaTurret',   cost: { minerai: 50000, silicium: 50000, hydrogene: 30000 } },
  smallShield:    { countColumn: 'smallShield',    cost: { minerai: 10000, silicium: 10000, hydrogene: 0 } },
  largeShield:    { countColumn: 'largeShield',    cost: { minerai: 50000, silicium: 50000, hydrogene: 0 } },
};

describe('calculateBuildingPoints', () => {
  it('all level 0 = 0 points', () => {
    const levels: Record<string, number> = {
      mineraiMine: 0, siliciumMine: 0, hydrogeneSynth: 0,
      solarPlant: 0, robotics: 0, shipyard: 0, arsenal: 0, commandCenter: 0,
      researchLab: 0, storageMinerai: 0, storageSilicium: 0,
      storageHydrogene: 0,
    };
    expect(calculateBuildingPoints(levels, BUILDING_DEFS)).toBe(0);
  });

  it('minerai mine level 1 = floor((60+15) / 1000) = 0', () => {
    const levels: Record<string, number> = {
      mineraiMine: 1, siliciumMine: 0, hydrogeneSynth: 0,
      solarPlant: 0, robotics: 0, shipyard: 0, arsenal: 0, commandCenter: 0,
      researchLab: 0, storageMinerai: 0, storageSilicium: 0,
      storageHydrogene: 0,
    };
    expect(calculateBuildingPoints(levels, BUILDING_DEFS)).toBe(0);
  });

  it('multiple buildings have cumulative points', () => {
    const levels: Record<string, number> = {
      mineraiMine: 10, siliciumMine: 10, hydrogeneSynth: 10,
      solarPlant: 10, robotics: 5, shipyard: 5, arsenal: 3, commandCenter: 2,
      researchLab: 5, storageMinerai: 3, storageSilicium: 3,
      storageHydrogene: 3,
    };
    expect(calculateBuildingPoints(levels, BUILDING_DEFS)).toBeGreaterThan(0);
  });
});

describe('calculateResearchPoints', () => {
  it('all level 0 = 0 points', () => {
    const levels: Record<string, number> = {
      espionageTech: 0, computerTech: 0, energyTech: 0,
      combustion: 0, impulse: 0, hyperspaceDrive: 0,
      weapons: 0, shielding: 0, armor: 0,
    };
    expect(calculateResearchPoints(levels, RESEARCH_DEFS)).toBe(0);
  });

  it('weapons level 3 = 7 points', () => {
    const levels: Record<string, number> = {
      espionageTech: 0, computerTech: 0, energyTech: 0,
      combustion: 0, impulse: 0, hyperspaceDrive: 0,
      weapons: 3, shielding: 0, armor: 0,
    };
    expect(calculateResearchPoints(levels, RESEARCH_DEFS)).toBe(7);
  });
});

describe('calculateFleetPoints', () => {
  it('no ships = 0', () => {
    expect(calculateFleetPoints({
      smallCargo: 0, largeCargo: 0, lightFighter: 0, heavyFighter: 0,
      cruiser: 0, battleship: 0, espionageProbe: 0, colonyShip: 0, recycler: 0,
      prospector: 0, explorer: 0,
    }, SHIP_DEFS)).toBe(0);
  });

  it('10 small cargos = 40 points', () => {
    expect(calculateFleetPoints({
      smallCargo: 10, largeCargo: 0, lightFighter: 0, heavyFighter: 0,
      cruiser: 0, battleship: 0, espionageProbe: 0, colonyShip: 0, recycler: 0,
      prospector: 0, explorer: 0,
    }, SHIP_DEFS)).toBe(40);
  });
});

describe('calculateDefensePoints', () => {
  it('no defenses = 0', () => {
    expect(calculateDefensePoints({
      rocketLauncher: 0, lightLaser: 0, heavyLaser: 0,
      gaussCannon: 0, plasmaTurret: 0, smallShield: 0, largeShield: 0,
    }, DEFENSE_DEFS)).toBe(0);
  });

  it('5 rocket launchers = 10 points', () => {
    expect(calculateDefensePoints({
      rocketLauncher: 5, lightLaser: 0, heavyLaser: 0,
      gaussCannon: 0, plasmaTurret: 0, smallShield: 0, largeShield: 0,
    }, DEFENSE_DEFS)).toBe(10);
  });
});

describe('calculateTotalPoints', () => {
  it('sums all categories', () => {
    expect(calculateTotalPoints(10, 20, 30, 40)).toBe(100);
  });
});
