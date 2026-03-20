export type ResearchId =
  | 'espionageTech'
  | 'computerTech'
  | 'energyTech'
  | 'combustion'
  | 'impulse'
  | 'hyperspaceDrive'
  | 'weapons'
  | 'shielding'
  | 'armor'
  | 'rockFracturing'
  | 'deepSpaceRefining';

export interface ResearchDefinition {
  id: ResearchId;
  name: string;
  description: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  maxLevel?: number;
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
    baseCost: { minerai: 200, silicium: 1000, hydrogene: 200 },
    costFactor: 2,
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 3 }] },
  },
  computerTech: {
    id: 'computerTech',
    name: 'Technologie Ordinateur',
    description: 'Augmente le nombre de flottes simultanées.',
    baseCost: { minerai: 0, silicium: 400, hydrogene: 600 },
    costFactor: 2,
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }] },
  },
  energyTech: {
    id: 'energyTech',
    name: 'Technologie Énergie',
    description: 'Recherche fondamentale en énergie.',
    baseCost: { minerai: 0, silicium: 800, hydrogene: 400 },
    costFactor: 2,
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }] },
  },
  combustion: {
    id: 'combustion',
    name: 'Réacteur à combustion',
    description: 'Propulsion de base pour les vaisseaux.',
    baseCost: { minerai: 400, silicium: 0, hydrogene: 600 },
    costFactor: 2,
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 1 }],
      research: [{ researchId: 'energyTech', level: 1 }],
    },
  },
  impulse: {
    id: 'impulse',
    name: 'Réacteur à impulsion',
    description: 'Propulsion avancée.',
    baseCost: { minerai: 2000, silicium: 4000, hydrogene: 600 },
    costFactor: 2,
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 2 }],
      research: [{ researchId: 'energyTech', level: 1 }],
    },
  },
  hyperspaceDrive: {
    id: 'hyperspaceDrive',
    name: 'Propulsion hyperespace',
    description: 'Propulsion la plus rapide.',
    baseCost: { minerai: 10000, silicium: 20000, hydrogene: 6000 },
    costFactor: 2,
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
    baseCost: { minerai: 800, silicium: 200, hydrogene: 0 },
    costFactor: 2,
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 4 }] },
  },
  shielding: {
    id: 'shielding',
    name: 'Technologie Bouclier',
    description: 'Augmente les boucliers de 10% par niveau.',
    baseCost: { minerai: 200, silicium: 600, hydrogene: 0 },
    costFactor: 2,
    prerequisites: {
      buildings: [{ buildingId: 'researchLab', level: 6 }],
      research: [{ researchId: 'energyTech', level: 3 }],
    },
  },
  armor: {
    id: 'armor',
    name: 'Technologie Protection',
    description: 'Augmente la coque de 10% par niveau.',
    baseCost: { minerai: 1000, silicium: 0, hydrogene: 0 },
    costFactor: 2,
    prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }] },
  },
  rockFracturing: {
    id: 'rockFracturing',
    name: 'Technologie de fracturation des roches',
    description: 'Améliore les techniques d\'extraction minière, réduisant le temps de minage.',
    baseCost: { minerai: 2000, silicium: 4000, hydrogene: 1000 },
    costFactor: 2,
    prerequisites: {
      buildings: [{ buildingId: 'missionCenter', level: 1 }],
      research: [{ researchId: 'combustion', level: 3 }],
    },
  },
  deepSpaceRefining: {
    id: 'deepSpaceRefining',
    name: 'Raffinage en espace lointain',
    description: 'Développe des techniques de raffinage embarquées qui réduisent les scories lors de l\'extraction minière.',
    baseCost: { minerai: 2000, silicium: 4000, hydrogene: 1000 },
    costFactor: 2,
    maxLevel: 15,
    prerequisites: {
      buildings: [{ buildingId: 'missionCenter', level: 2 }],
      research: [{ researchId: 'rockFracturing', level: 2 }],
    },
  },
};
