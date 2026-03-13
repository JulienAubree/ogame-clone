import { SHIPS } from '../constants/ships.js';
import { DEFENSES } from '../constants/defenses.js';
import type { ShipId } from '../constants/ships.js';
import type { DefenseId } from '../constants/defenses.js';
import type { ResourceCost } from './building-cost.js';

export function shipCost(shipId: ShipId): ResourceCost {
  return { ...SHIPS[shipId].cost };
}

export function shipTime(shipId: ShipId, shipyardLevel: number): number {
  const cost = SHIPS[shipId].cost;
  const seconds = Math.floor(((cost.metal + cost.crystal) / (2500 * (1 + shipyardLevel))) * 3600);
  return Math.max(1, seconds);
}

export function defenseCost(defenseId: DefenseId): ResourceCost {
  return { ...DEFENSES[defenseId].cost };
}

export function defenseTime(defenseId: DefenseId, shipyardLevel: number): number {
  const cost = DEFENSES[defenseId].cost;
  const seconds = Math.floor(((cost.metal + cost.crystal) / (2500 * (1 + shipyardLevel))) * 3600);
  return Math.max(1, seconds);
}
