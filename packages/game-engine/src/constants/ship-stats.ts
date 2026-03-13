import type { ShipId } from './ships.js';

export interface ShipStats {
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
  driveType: 'combustion' | 'impulse' | 'hyperspaceDrive';
}

export const SHIP_STATS: Record<ShipId, ShipStats> = {
  smallCargo: { baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000, driveType: 'combustion' },
  largeCargo: { baseSpeed: 7500, fuelConsumption: 50, cargoCapacity: 25000, driveType: 'combustion' },
  lightFighter: { baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion' },
  heavyFighter: { baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100, driveType: 'impulse' },
  cruiser: { baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse' },
  battleship: { baseSpeed: 10000, fuelConsumption: 500, cargoCapacity: 1500, driveType: 'hyperspaceDrive' },
  espionageProbe: { baseSpeed: 100000000, fuelConsumption: 1, cargoCapacity: 0, driveType: 'combustion' },
  colonyShip: { baseSpeed: 2500, fuelConsumption: 1000, cargoCapacity: 7500, driveType: 'impulse' },
  recycler: { baseSpeed: 2000, fuelConsumption: 300, cargoCapacity: 20000, driveType: 'combustion' },
};
