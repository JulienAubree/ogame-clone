export type ResearchId =
  | 'espionageTech'
  | 'computerTech'
  | 'energyTech'
  | 'combustion'
  | 'impulse'
  | 'hyperspaceDrive'
  | 'weapons'
  | 'shielding'
  | 'armor';

export interface ResearchDefinition {
  id: ResearchId;
  name: string;
  description: string;
  baseCost: { metal: number; crystal: number; deuterium: number };
  costFactor: number;
  levelColumn: string;
  prerequisites: {
    buildings?: { buildingId: string; level: number }[];
    research?: { researchId: ResearchId; level: number }[];
  };
}

export const RESEARCH: Record<ResearchId, ResearchDefinition> = {
  espionageTech: {
    id: 'espionageTech',
    name: 'Technologie Espionnage',
    description: 'Améliore les sondes d\'espionnage.',
    baseCost: { metal: 200, crystal: 1000, deuterium: 200 },
    costFactor: 2,
    levelColumn: 'espionageTech',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 3 }] },
  },
  computerTech: {
    id: 'computerTech',
    name: 'Technologie Ordinateur',
    description: 'Augmente le nombre de flottes simultanées.',
    baseCost: { metal: 0, crystal: 400, deuterium: 600 },
    costFactor: 2,
    levelColumn: 'computerTech',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }] },
  },
  energyTech: {
    id: 'energyTech',
    name: 'Technologie Énergie',
    description: 'Recherche fondamentale en énergie.',
    baseCost: { metal: 0, crystal: 800, deuterium: 400 },
    costFactor: 2,
    levelColumn: 'energyTech',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }] },
  },
  combustion: {
    id: 'combustion',
    name: 'Réacteur à combustion',
    description: 'Propulsion de base pour les vaisseaux.',
    baseCost: { metal: 400, crystal: 0, deuterium: 600 },
    costFactor: 2,
    levelColumn: 'combustion',
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 1 }],
      research: [{ researchId: 'energyTech', level: 1 }],
    },
  },
  impulse: {
    id: 'impulse',
    name: 'Réacteur à impulsion',
    description: 'Propulsion avancée.',
    baseCost: { metal: 2000, crystal: 4000, deuterium: 600 },
    costFactor: 2,
    levelColumn: 'impulse',
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 2 }],
      research: [{ researchId: 'energyTech', level: 1 }],
    },
  },
  hyperspaceDrive: {
    id: 'hyperspaceDrive',
    name: 'Propulsion hyperespace',
    description: 'Propulsion la plus rapide.',
    baseCost: { metal: 10000, crystal: 20000, deuterium: 6000 },
    costFactor: 2,
    levelColumn: 'hyperspaceDrive',
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 7 }],
      research: [
        { researchId: 'energyTech', level: 5 },
        { researchId: 'shielding', level: 5 },
      ],
    },
  },
  weapons: {
    id: 'weapons',
    name: 'Technologie Armes',
    description: 'Augmente les dégâts de 10% par niveau.',
    baseCost: { metal: 800, crystal: 200, deuterium: 0 },
    costFactor: 2,
    levelColumn: 'weapons',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 4 }] },
  },
  shielding: {
    id: 'shielding',
    name: 'Technologie Bouclier',
    description: 'Augmente les boucliers de 10% par niveau.',
    baseCost: { metal: 200, crystal: 600, deuterium: 0 },
    costFactor: 2,
    levelColumn: 'shielding',
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 6 }],
      research: [{ researchId: 'energyTech', level: 3 }],
    },
  },
  armor: {
    id: 'armor',
    name: 'Technologie Protection',
    description: 'Augmente la coque de 10% par niveau.',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 },
    costFactor: 2,
    levelColumn: 'armor',
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }] },
  },
};
