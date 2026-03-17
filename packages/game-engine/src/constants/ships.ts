export type ShipId =
  | 'smallCargo'
  | 'largeCargo'
  | 'lightFighter'
  | 'heavyFighter'
  | 'cruiser'
  | 'battleship'
  | 'espionageProbe'
  | 'colonyShip'
  | 'recycler'
  | 'prospector'
  | 'explorer';

export interface ShipDefinition {
  id: ShipId;
  name: string;
  description: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
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
    cost: { minerai: 2000, silicium: 2000, hydrogene: 0 },
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
    cost: { minerai: 6000, silicium: 6000, hydrogene: 0 },
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
    cost: { minerai: 3000, silicium: 1000, hydrogene: 0 },
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
    cost: { minerai: 6000, silicium: 4000, hydrogene: 0 },
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
    cost: { minerai: 20000, silicium: 7000, hydrogene: 2000 },
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
    cost: { minerai: 45000, silicium: 15000, hydrogene: 0 },
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
    cost: { minerai: 0, silicium: 1000, hydrogene: 0 },
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
    cost: { minerai: 10000, silicium: 20000, hydrogene: 10000 },
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
    cost: { minerai: 10000, silicium: 6000, hydrogene: 2000 },
    countColumn: 'recycler',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [
        { researchId: 'combustion', level: 6 },
        { researchId: 'shielding', level: 2 },
      ],
    },
  },
  prospector: {
    id: 'prospector',
    name: 'Prospecteur',
    description: 'Vaisseau minier pour l\'extraction de ressources.',
    cost: { minerai: 3000, silicium: 1000, hydrogene: 500 },
    countColumn: 'prospector',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
    },
  },
  explorer: {
    id: 'explorer',
    name: 'Explorateur',
    description: 'Vaisseau d\'exploration pour découvrir de nouveaux systèmes.',
    cost: { minerai: 5000, silicium: 2500, hydrogene: 500 },
    countColumn: 'explorer',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
    },
  },
};
