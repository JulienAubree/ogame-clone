import type { ShipId } from './ships.js';

export interface ShipStats {
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
  driveType: 'combustion' | 'impulse' | 'hyperspaceDrive';
  miningExtraction: number;
}

export const SHIP_STATS: Record<ShipId, ShipStats> = {
  smallCargo: { baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000, driveType: 'combustion', miningExtraction: 0 },
  largeCargo: { baseSpeed: 7500, fuelConsumption: 50, cargoCapacity: 25000, driveType: 'combustion', miningExtraction: 0 },
  lightFighter: { baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion', miningExtraction: 0 },
  heavyFighter: { baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100, driveType: 'impulse', miningExtraction: 0 },
  cruiser: { baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse', miningExtraction: 0 },
  battleship: { baseSpeed: 10000, fuelConsumption: 500, cargoCapacity: 1500, driveType: 'hyperspaceDrive', miningExtraction: 0 },
  espionageProbe: { baseSpeed: 100000000, fuelConsumption: 1, cargoCapacity: 0, driveType: 'combustion', miningExtraction: 0 },
  colonyShip: { baseSpeed: 2500, fuelConsumption: 1000, cargoCapacity: 7500, driveType: 'impulse', miningExtraction: 0 },
  recycler: { baseSpeed: 2000, fuelConsumption: 300, cargoCapacity: 20000, driveType: 'combustion', miningExtraction: 0 },
  prospector: { baseSpeed: 3000, fuelConsumption: 50, cargoCapacity: 750, driveType: 'combustion', miningExtraction: 2500 },
  explorer: { baseSpeed: 8000, fuelConsumption: 100, cargoCapacity: 2000, driveType: 'combustion', miningExtraction: 0 },
  solarSatellite: { baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion', miningExtraction: 0 },
};
