export type ShipId =
  | 'smallCargo'
  | 'largeCargo'
  | 'lightFighter'
  | 'heavyFighter'
  | 'cruiser'
  | 'battleship'
  | 'espionageProbe'
  | 'colonyShip'
  | 'recycler';

export interface ShipDefinition {
  id: ShipId;
  name: string;
  description: string;
  cost: { metal: number; crystal: number; deuterium: number };
  countColumn: string;
  prerequisites: {
    buildings?: { buildingId: string; level: number }[];
    research?: { researchId: string; level: number }[];
  };
}

export const SHIPS: Record<ShipId, ShipDefinition> = {
  smallCargo: {
    id: 'smallCargo',
    name: 'Petit transporteur',
    description: 'Transport léger de ressources.',
    cost: { metal: 2000, crystal: 2000, deuterium: 0 },
    countColumn: 'smallCargo',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 2 }],
      research: [{ researchId: 'combustion', level: 2 }],
    },
  },
  largeCargo: {
    id: 'largeCargo',
    name: 'Grand transporteur',
    description: 'Transport lourd de ressources.',
    cost: { metal: 6000, crystal: 6000, deuterium: 0 },
    countColumn: 'largeCargo',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [{ researchId: 'combustion', level: 6 }],
    },
  },
  lightFighter: {
    id: 'lightFighter',
    name: 'Chasseur léger',
    description: 'Vaisseau de combat de base.',
    cost: { metal: 3000, crystal: 1000, deuterium: 0 },
    countColumn: 'lightFighter',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
      research: [{ researchId: 'combustion', level: 1 }],
    },
  },
  heavyFighter: {
    id: 'heavyFighter',
    name: 'Chasseur lourd',
    description: 'Vaisseau de combat amélioré.',
    cost: { metal: 6000, crystal: 4000, deuterium: 0 },
    countColumn: 'heavyFighter',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 3 }],
      research: [
        { researchId: 'armor', level: 2 },
        { researchId: 'impulse', level: 2 },
      ],
    },
  },
  cruiser: {
    id: 'cruiser',
    name: 'Croiseur',
    description: 'Vaisseau de guerre polyvalent.',
    cost: { metal: 20000, crystal: 7000, deuterium: 2000 },
    countColumn: 'cruiser',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 5 }],
      research: [
        { researchId: 'impulse', level: 4 },
        { researchId: 'weapons', level: 3 },
      ],
    },
  },
  battleship: {
    id: 'battleship',
    name: 'Vaisseau de bataille',
    description: 'Puissant navire de guerre.',
    cost: { metal: 45000, crystal: 15000, deuterium: 0 },
    countColumn: 'battleship',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 7 }],
      research: [{ researchId: 'hyperspaceDrive', level: 4 }],
    },
  },
  espionageProbe: {
    id: 'espionageProbe',
    name: 'Sonde d\'espionnage',
    description: 'Sonde rapide pour espionner.',
    cost: { metal: 0, crystal: 1000, deuterium: 0 },
    countColumn: 'espionageProbe',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 3 }],
      research: [
        { researchId: 'combustion', level: 3 },
        { researchId: 'espionageTech', level: 2 },
      ],
    },
  },
  colonyShip: {
    id: 'colonyShip',
    name: 'Vaisseau de colonisation',
    description: 'Colonise de nouvelles planètes.',
    cost: { metal: 10000, crystal: 20000, deuterium: 10000 },
    countColumn: 'colonyShip',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [{ researchId: 'impulse', level: 3 }],
    },
  },
  recycler: {
    id: 'recycler',
    name: 'Recycleur',
    description: 'Collecte les champs de débris.',
    cost: { metal: 10000, crystal: 6000, deuterium: 2000 },
    countColumn: 'recycler',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [
        { researchId: 'combustion', level: 6 },
        { researchId: 'shielding', level: 2 },
      ],
    },
  },
};
