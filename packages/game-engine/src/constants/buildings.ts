export type BuildingId =
  | 'metalMine'
  | 'crystalMine'
  | 'deutSynth'
  | 'solarPlant'
  | 'robotics'
  | 'shipyard'
  | 'researchLab'
  | 'storageMetal'
  | 'storageCrystal'
  | 'storageDeut';

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  description: string;
  baseCost: { metal: number; crystal: number; deuterium: number };
  costFactor: number;
  baseTime: number;
  levelColumn: string;
  prerequisites: { buildingId: BuildingId; level: number }[];
}

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  metalMine: {
    id: 'metalMine',
    name: 'Mine de métal',
    description: 'Produit du métal, ressource de base.',
    baseCost: { metal: 60, crystal: 15, deuterium: 0 },
    costFactor: 1.5,
    baseTime: 60,
    levelColumn: 'metalMineLevel',
    prerequisites: [],
  },
  crystalMine: {
    id: 'crystalMine',
    name: 'Mine de cristal',
    description: 'Produit du cristal.',
    baseCost: { metal: 48, crystal: 24, deuterium: 0 },
    costFactor: 1.6,
    baseTime: 60,
    levelColumn: 'crystalMineLevel',
    prerequisites: [],
  },
  deutSynth: {
    id: 'deutSynth',
    name: 'Synthétiseur de deutérium',
    description: 'Produit du deutérium.',
    baseCost: { metal: 225, crystal: 75, deuterium: 0 },
    costFactor: 1.5,
    baseTime: 60,
    levelColumn: 'deutSynthLevel',
    prerequisites: [],
  },
  solarPlant: {
    id: 'solarPlant',
    name: 'Centrale solaire',
    description: "Produit de l'énergie.",
    baseCost: { metal: 75, crystal: 30, deuterium: 0 },
    costFactor: 1.5,
    baseTime: 60,
    levelColumn: 'solarPlantLevel',
    prerequisites: [],
  },
  robotics: {
    id: 'robotics',
    name: 'Usine de robots',
    description: 'Réduit le temps de construction.',
    baseCost: { metal: 400, crystal: 120, deuterium: 200 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'roboticsLevel',
    prerequisites: [],
  },
  shipyard: {
    id: 'shipyard',
    name: 'Chantier spatial',
    description: 'Construit vaisseaux et défenses.',
    baseCost: { metal: 400, crystal: 200, deuterium: 100 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'shipyardLevel',
    prerequisites: [{ buildingId: 'robotics', level: 2 }],
  },
  researchLab: {
    id: 'researchLab',
    name: 'Laboratoire de recherche',
    description: 'Permet les recherches.',
    baseCost: { metal: 200, crystal: 400, deuterium: 200 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'researchLabLevel',
    prerequisites: [],
  },
  storageMetal: {
    id: 'storageMetal',
    name: 'Hangar de métal',
    description: 'Augmente le stockage de métal.',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'storageMetalLevel',
    prerequisites: [],
  },
  storageCrystal: {
    id: 'storageCrystal',
    name: 'Hangar de cristal',
    description: 'Augmente le stockage de cristal.',
    baseCost: { metal: 1000, crystal: 500, deuterium: 0 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'storageCrystalLevel',
    prerequisites: [],
  },
  storageDeut: {
    id: 'storageDeut',
    name: 'Réservoir de deutérium',
    description: 'Augmente le stockage de deutérium.',
    baseCost: { metal: 1000, crystal: 1000, deuterium: 0 },
    costFactor: 2,
    baseTime: 60,
    levelColumn: 'storageDeutLevel',
    prerequisites: [],
  },
};
