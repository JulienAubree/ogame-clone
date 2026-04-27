export type EmpireViewMode = 'resources' | 'fleet';

export interface PlanetShipEntry {
  id: string;
  name: string;
  count: number;
  role: string | null;
  cargoCapacity: number;
  isStationary: boolean;
}

export interface PlanetFleetData {
  ships: PlanetShipEntry[];
  totalShips: number;
  totalFP: number;
  totalCargo: number;
}
