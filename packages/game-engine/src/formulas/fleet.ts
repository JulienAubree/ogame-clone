import { SHIP_STATS } from '../constants/ship-stats.js';
import type { ShipId } from '../constants/ships.js';

interface DriveTechs {
  combustion: number;
  impulse: number;
  hyperspaceDrive: number;
}

interface Coordinates {
  galaxy: number;
  system: number;
  position: number;
}

const DRIVE_BONUS: Record<string, number> = {
  combustion: 0.1,
  impulse: 0.2,
  hyperspaceDrive: 0.3,
};

export function shipSpeed(shipId: ShipId, techs: DriveTechs): number {
  const stats = SHIP_STATS[shipId];
  const techLevel = techs[stats.driveType];
  const bonus = DRIVE_BONUS[stats.driveType];
  return Math.floor(stats.baseSpeed * (1 + bonus * techLevel));
}

export function fleetSpeed(ships: Record<string, number>, techs: DriveTechs): number {
  let minSpeed = Infinity;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const speed = shipSpeed(shipId as ShipId, techs);
      if (speed < minSpeed) minSpeed = speed;
    }
  }
  return minSpeed === Infinity ? 0 : minSpeed;
}

export function distance(origin: Coordinates, target: Coordinates): number {
  if (origin.galaxy !== target.galaxy) {
    return 20000 * Math.abs(origin.galaxy - target.galaxy);
  }
  if (origin.system !== target.system) {
    return 2700 + 95 * Math.abs(origin.system - target.system);
  }
  if (origin.position !== target.position) {
    return 1000 + 5 * Math.abs(origin.position - target.position);
  }
  return 5;
}

export function travelTime(
  origin: Coordinates,
  target: Coordinates,
  speed: number,
  universeSpeed: number,
): number {
  const dist = distance(origin, target);
  return Math.round(10 + (35000 / speed) * Math.sqrt((dist * 10) / universeSpeed));
}

export function fuelConsumption(
  ships: Record<string, number>,
  dist: number,
  duration: number,
): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = SHIP_STATS[shipId as ShipId];
      if (!stats) continue;
      const consumption = stats.fuelConsumption * count * (dist / 35000) * ((duration + 10) / (duration - 10));
      total += Math.max(1, Math.round(consumption));
    }
  }
  return Math.max(1, Math.ceil(total));
}

export function totalCargoCapacity(ships: Record<string, number>): number {
  let total = 0;
  for (const [shipId, count] of Object.entries(ships)) {
    if (count > 0) {
      const stats = SHIP_STATS[shipId as ShipId];
      if (stats) total += stats.cargoCapacity * count;
    }
  }
  return total;
}
