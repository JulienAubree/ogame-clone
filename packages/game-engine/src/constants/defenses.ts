export type DefenseId =
  | 'rocketLauncher'
  | 'lightLaser'
  | 'heavyLaser'
  | 'gaussCannon'
  | 'plasmaTurret'
  | 'smallShield'
  | 'largeShield';

export interface DefenseDefinition {
  id: DefenseId;
  name: string;
  description: string;
  cost: { metal: number; crystal: number; deuterium: number };
  countColumn: string;
  maxPerPlanet?: number;
  prerequisites: {
    buildings?: { buildingId: string; level: number }[];
    research?: { researchId: string; level: number }[];
  };
}

export const DEFENSES: Record<DefenseId, DefenseDefinition> = {
  rocketLauncher: {
    id: 'rocketLauncher',
    name: 'Lanceur de missiles',
    description: 'Défense de base, peu coûteuse.',
    cost: { metal: 2000, crystal: 0, deuterium: 0 },
    countColumn: 'rocketLauncher',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
    },
  },
  lightLaser: {
    id: 'lightLaser',
    name: 'Artillerie laser légère',
    description: 'Défense laser de base.',
    cost: { metal: 1500, crystal: 500, deuterium: 0 },
    countColumn: 'lightLaser',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 2 }],
      research: [{ researchId: 'energyTech', level: 1 }],
    },
  },
  heavyLaser: {
    id: 'heavyLaser',
    name: 'Artillerie laser lourde',
    description: 'Défense laser puissante.',
    cost: { metal: 6000, crystal: 2000, deuterium: 0 },
    countColumn: 'heavyLaser',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [
        { researchId: 'energyTech', level: 3 },
        { researchId: 'shielding', level: 1 },
      ],
    },
  },
  gaussCannon: {
    id: 'gaussCannon',
    name: 'Canon de Gauss',
    description: 'Défense balistique puissante.',
    cost: { metal: 20000, crystal: 15000, deuterium: 2000 },
    countColumn: 'gaussCannon',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 6 }],
      research: [
        { researchId: 'energyTech', level: 6 },
        { researchId: 'weapons', level: 3 },
        { researchId: 'shielding', level: 1 },
      ],
    },
  },
  plasmaTurret: {
    id: 'plasmaTurret',
    name: 'Artillerie à ions',
    description: 'Défense plasma dévastatrice.',
    cost: { metal: 50000, crystal: 50000, deuterium: 30000 },
    countColumn: 'plasmaTurret',
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 8 }],
      research: [
        { researchId: 'energyTech', level: 8 },
        { researchId: 'weapons', level: 7 },
      ],
    },
  },
  smallShield: {
    id: 'smallShield',
    name: 'Petit bouclier',
    description: 'Bouclier planétaire de base.',
    cost: { metal: 10000, crystal: 10000, deuterium: 0 },
    countColumn: 'smallShield',
    maxPerPlanet: 1,
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 1 }],
      research: [{ researchId: 'shielding', level: 2 }],
    },
  },
  largeShield: {
    id: 'largeShield',
    name: 'Grand bouclier',
    description: 'Bouclier planétaire avancé.',
    cost: { metal: 50000, crystal: 50000, deuterium: 0 },
    countColumn: 'largeShield',
    maxPerPlanet: 1,
    prerequisites: {
      buildings: [{ buildingId: 'shipyard', level: 4 }],
      research: [{ researchId: 'shielding', level: 6 }],
    },
  },
};
