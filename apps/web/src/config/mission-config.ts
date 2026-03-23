import { MissionType } from '@ogame-clone/shared';

export type Mission = `${MissionType}`;

export type ShipCategory = 'required' | 'optional' | 'disabled';

interface MissionDef {
  dangerous: boolean;
  requiredShipRoles: string[] | null;
  exclusive: boolean;
  recommendedShipRoles: string[] | null;
  requiresPveMission: boolean;
}

export function getCargoCapacity(
  selectedShips: Record<string, number>,
  shipConfigs: Record<string, { cargoCapacity: number }>,
): number {
  return Object.entries(selectedShips).reduce((sum, [id, count]) => {
    const stats = shipConfigs[id];
    return sum + (stats ? stats.cargoCapacity * count : 0);
  }, 0);
}

export function categorizeShip(
  shipId: string,
  shipCount: number,
  missionDef: MissionDef | undefined,
  shipConfig?: { isStationary?: boolean },
): ShipCategory {
  if (shipConfig?.isStationary) return 'disabled';
  if (!missionDef) return 'disabled';
  if (shipCount === 0) return 'disabled';

  if (missionDef.exclusive && missionDef.requiredShipRoles) {
    return missionDef.requiredShipRoles.includes(shipId) ? 'required' : 'disabled';
  }

  if (missionDef.requiredShipRoles?.includes(shipId)) return 'required';
  if (missionDef.recommendedShipRoles?.includes(shipId)) return 'required';

  return 'optional';
}
