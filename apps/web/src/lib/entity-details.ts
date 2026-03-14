import {
  BUILDINGS, type BuildingId, type BuildingDefinition,
  RESEARCH, type ResearchId, type ResearchDefinition,
  SHIPS, type ShipId, type ShipDefinition,
  DEFENSES, type DefenseId, type DefenseDefinition,
  COMBAT_STATS, RAPID_FIRE, SHIP_STATS,
  metalProduction, crystalProduction, deuteriumProduction,
  solarPlantEnergy, metalMineEnergy, crystalMineEnergy, deutSynthEnergy,
  storageCapacity,
} from '@ogame-clone/game-engine';

// ---------------------------------------------------------------------------
// Flavor texts
// ---------------------------------------------------------------------------

const BUILDING_FLAVOR: Record<BuildingId, string> = {
  metalMine: "Creusant profondement dans la croute planetaire, les foreuses extractrices de metal constituent la colonne vertebrale de toute economie spatiale.",
  crystalMine: "Les gisements de cristal, formes sous des pressions immenses, alimentent l'ensemble des technologies avancees de la galaxie.",
  deutSynth: "Le deuterium, isotope lourd de l'hydrogene, est extrait des oceans planetaires par un processus de filtration moleculaire.",
  solarPlant: "D'immenses panneaux photovoltaiques captent l'energie de l'etoile la plus proche pour alimenter l'ensemble des infrastructures planetaires.",
  robotics: "Les chaines de montage automatisees accelerent la construction de tous les batiments et infrastructures.",
  shipyard: "Cet immense complexe orbital permet l'assemblage de vaisseaux spatiaux et de systemes de defense planetaire.",
  researchLab: "Au coeur de ce laboratoire, les meilleurs scientifiques de l'empire repoussent les frontieres de la connaissance.",
  storageMetal: "De vastes hangars blindes permettent de stocker des quantites croissantes de metal en toute securite.",
  storageCrystal: "Ces chambres a environnement controle preservent les cristaux dans des conditions optimales.",
  storageDeut: "Des reservoirs cryogeniques haute pression maintiennent le deuterium a l'etat liquide pour un stockage maximal.",
};

const RESEARCH_FLAVOR: Record<ResearchId, string> = {
  espionageTech: "Des sondes furtives equipees de capteurs toujours plus performants permettent de percer les secrets de vos adversaires.",
  computerTech: "L'augmentation de la puissance de calcul permet de coordonner un nombre croissant de flottes simultanement.",
  energyTech: "La maitrise des flux energetiques ouvre la voie aux technologies de propulsion avancees.",
  combustion: "Les moteurs a combustion interne propulsent les premiers vaisseaux a travers l'espace interstellaire.",
  impulse: "Le reacteur a impulsion utilise le principe de reaction nucleaire pour atteindre des vitesses superieures.",
  hyperspaceDrive: "En pliant l'espace-temps, la propulsion hyperespace permet de parcourir des distances autrefois inimaginables.",
  weapons: "Chaque avancee en technologie des armes augmente de 10% la puissance de feu de toutes vos unites.",
  shielding: "Les generateurs de bouclier creent des champs de force protegeant vos unites des impacts ennemis.",
  armor: "Des alliages toujours plus resistants renforcent la coque de toutes vos unites de 10% par niveau.",
};

const SHIP_FLAVOR: Record<ShipId, string> = {
  smallCargo: "Rapide et maniable, le petit transporteur est le cheval de trait de toute flotte commerciale.",
  largeCargo: "Avec sa soute massive, le grand transporteur peut deplacer d'enormes quantites de ressources en un seul voyage.",
  lightFighter: "Le chasseur leger, pilier des premieres flottes, compense sa fragilite par son faible cout de production.",
  heavyFighter: "Blindage renforce et armement superieur font du chasseur lourd un adversaire redoutable en combat rapproche.",
  cruiser: "Polyvalent et puissamment arme, le croiseur domine les escarmouches grace a son tir rapide devastateur.",
  battleship: "Le vaisseau de bataille, colosse de metal et de feu, est la piece maitresse de toute flotte d'invasion.",
  espionageProbe: "Quasiment indetectable, la sonde d'espionnage collecte des renseignements precieux sur les planetes adverses.",
  colonyShip: "Ce vaisseau transporte tout le necessaire pour etablir une nouvelle colonie sur une planete inhabite.",
  recycler: "Equipe de puissants aimants et de bras mecaniques, le recycleur collecte les debris des batailles spatiales.",
};

const DEFENSE_FLAVOR: Record<DefenseId, string> = {
  rocketLauncher: "Simple mais efficace, le lanceur de missiles constitue la premiere ligne de defense de toute planete.",
  lightLaser: "Le laser leger offre un excellent rapport cout-efficacite pour les defenses planetaires de base.",
  heavyLaser: "Concentrant une energie devastatrice, le laser lourd peut percer le blindage des vaisseaux moyens.",
  gaussCannon: "Propulsant des projectiles a une fraction de la vitesse de la lumiere, le canon de Gauss inflige des degats considerables.",
  plasmaTurret: "La tourelle a plasma genere un flux de particules ionisees capable de vaporiser les blindages les plus epais.",
  smallShield: "Un dome energetique enveloppe la planete, absorbant une partie des degats lors des attaques ennemies.",
  largeShield: "Le grand bouclier genere un champ de force puissant qui protege l'ensemble des installations planetaires.",
};

// ---------------------------------------------------------------------------
// Research effects
// ---------------------------------------------------------------------------

const RESEARCH_EFFECTS: Record<ResearchId, string> = {
  espionageTech: "Chaque niveau ameliore la quantite d'informations obtenues par sonde et la resistance au contre-espionnage.",
  computerTech: "Chaque niveau permet de controler une flotte supplementaire simultanement.",
  energyTech: "Prerequis pour les technologies de propulsion avancees.",
  combustion: "Chaque niveau augmente la vitesse des vaisseaux a combustion de 10%.",
  impulse: "Chaque niveau augmente la vitesse des vaisseaux a impulsion de 20%.",
  hyperspaceDrive: "Chaque niveau augmente la vitesse des vaisseaux hyperespace de 30%.",
  weapons: "Chaque niveau augmente les degats de toutes les unites de 10%.",
  shielding: "Chaque niveau augmente les boucliers de toutes les unites de 10%.",
  armor: "Chaque niveau augmente la coque de toutes les unites de 10%.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildingDetails {
  type: 'building';
  id: BuildingId;
  name: string;
  description: string;
  flavorText: string;
  baseCost: { metal: number; crystal: number; deuterium: number };
  costFactor: number;
  prerequisites: BuildingDefinition['prerequisites'];
  productionTable?: { level: number; value: number }[];
  productionLabel?: string;
  energyTable?: { level: number; value: number }[];
  energyLabel?: string;
  storageTable?: { level: number; value: number }[];
}

export interface ResearchDetails {
  type: 'research';
  id: ResearchId;
  name: string;
  description: string;
  flavorText: string;
  effect: string;
  baseCost: { metal: number; crystal: number; deuterium: number };
  costFactor: number;
  prerequisites: ResearchDefinition['prerequisites'];
}

export interface RapidFireEntry {
  unitId: string;
  unitName: string;
  value: number;
}

export interface ShipDetails {
  type: 'ship';
  id: ShipId;
  name: string;
  description: string;
  flavorText: string;
  cost: { metal: number; crystal: number; deuterium: number };
  prerequisites: ShipDefinition['prerequisites'];
  combat: { weapons: number; shield: number; armor: number };
  stats: { baseSpeed: number; fuelConsumption: number; cargoCapacity: number; driveType: string };
  rapidFireAgainst: RapidFireEntry[];
  rapidFireFrom: RapidFireEntry[];
}

export interface DefenseDetails {
  type: 'defense';
  id: DefenseId;
  name: string;
  description: string;
  flavorText: string;
  cost: { metal: number; crystal: number; deuterium: number };
  prerequisites: DefenseDefinition['prerequisites'];
  combat: { weapons: number; shield: number; armor: number };
  rapidFireFrom: RapidFireEntry[];
  maxPerPlanet?: number;
}

// ---------------------------------------------------------------------------
// Name resolvers
// ---------------------------------------------------------------------------

const ALL_UNIT_NAMES: Record<string, string> = {
  ...Object.fromEntries(Object.values(SHIPS).map((s) => [s.id, s.name])),
  ...Object.fromEntries(Object.values(DEFENSES).map((d) => [d.id, d.name])),
};

export function resolveBuildingName(id: string): string {
  return BUILDINGS[id as BuildingId]?.name ?? id;
}

export function resolveResearchName(id: string): string {
  return RESEARCH[id as ResearchId]?.name ?? id;
}

function resolveUnitName(id: string): string {
  return ALL_UNIT_NAMES[id] ?? id;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTable(fn: (level: number) => number, levels = 15): { level: number; value: number }[] {
  return Array.from({ length: levels }, (_, i) => ({
    level: i + 1,
    value: fn(i + 1),
  }));
}

function getRapidFireAgainst(unitId: string): RapidFireEntry[] {
  const targets = RAPID_FIRE[unitId];
  if (!targets) return [];
  return Object.entries(targets).map(([targetId, value]) => ({
    unitId: targetId,
    unitName: resolveUnitName(targetId),
    value,
  }));
}

function getRapidFireFrom(unitId: string): RapidFireEntry[] {
  const entries: RapidFireEntry[] = [];
  for (const [attackerId, targets] of Object.entries(RAPID_FIRE)) {
    if (targets[unitId]) {
      entries.push({
        unitId: attackerId,
        unitName: resolveUnitName(attackerId),
        value: targets[unitId],
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getBuildingDetails(id: BuildingId): BuildingDetails {
  const def = BUILDINGS[id];
  const details: BuildingDetails = {
    type: 'building',
    id,
    name: def.name,
    description: def.description,
    flavorText: BUILDING_FLAVOR[id],
    baseCost: def.baseCost,
    costFactor: def.costFactor,
    prerequisites: def.prerequisites,
  };

  switch (id) {
    case 'metalMine':
      details.productionTable = buildTable(metalProduction);
      details.productionLabel = 'Production metal/h';
      details.energyTable = buildTable(metalMineEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'crystalMine':
      details.productionTable = buildTable(crystalProduction);
      details.productionLabel = 'Production cristal/h';
      details.energyTable = buildTable(crystalMineEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'deutSynth':
      details.productionTable = buildTable((lvl) => deuteriumProduction(lvl, 50));
      details.productionLabel = 'Production deut/h (temp. 50)';
      details.energyTable = buildTable(deutSynthEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'solarPlant':
      details.energyTable = buildTable(solarPlantEnergy);
      details.energyLabel = 'Production energie';
      break;
    case 'storageMetal':
    case 'storageCrystal':
    case 'storageDeut':
      details.storageTable = buildTable(storageCapacity, 10);
      break;
  }

  return details;
}

export function getResearchDetails(id: ResearchId): ResearchDetails {
  const def = RESEARCH[id];
  return {
    type: 'research',
    id,
    name: def.name,
    description: def.description,
    flavorText: RESEARCH_FLAVOR[id],
    effect: RESEARCH_EFFECTS[id],
    baseCost: def.baseCost,
    costFactor: def.costFactor,
    prerequisites: def.prerequisites,
  };
}

export function getShipDetails(id: ShipId): ShipDetails {
  const def = SHIPS[id];
  const combat = COMBAT_STATS[id] ?? { weapons: 0, shield: 0, armor: 0 };
  const stats = SHIP_STATS[id];
  return {
    type: 'ship',
    id,
    name: def.name,
    description: def.description,
    flavorText: SHIP_FLAVOR[id],
    cost: def.cost,
    prerequisites: def.prerequisites,
    combat,
    stats,
    rapidFireAgainst: getRapidFireAgainst(id),
    rapidFireFrom: getRapidFireFrom(id),
  };
}

export function getDefenseDetails(id: DefenseId): DefenseDetails {
  const def = DEFENSES[id];
  const combat = COMBAT_STATS[id] ?? { weapons: 0, shield: 0, armor: 0 };
  return {
    type: 'defense',
    id,
    name: def.name,
    description: def.description,
    flavorText: DEFENSE_FLAVOR[id],
    cost: def.cost,
    prerequisites: def.prerequisites,
    combat,
    rapidFireFrom: getRapidFireFrom(id),
    maxPerPlanet: def.maxPerPlanet,
  };
}
