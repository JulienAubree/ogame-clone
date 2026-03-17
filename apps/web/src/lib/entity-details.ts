import {
  BUILDINGS, type BuildingId, type BuildingDefinition,
  RESEARCH, type ResearchId, type ResearchDefinition,
  SHIPS, type ShipId, type ShipDefinition,
  DEFENSES, type DefenseId, type DefenseDefinition,
  COMBAT_STATS, RAPID_FIRE, SHIP_STATS,
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
} from '@ogame-clone/game-engine';

// GameConfig shape from the API
interface GameConfigData {
  buildings: Record<string, { id: string; name: string; description: string; baseCost: { minerai: number; silicium: number; hydrogene: number }; costFactor: number; prerequisites: { buildingId: string; level: number }[] }>;
  research: Record<string, { id: string; name: string; description: string; baseCost: { minerai: number; silicium: number; hydrogene: number }; costFactor: number; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
  ships: Record<string, { id: string; name: string; description: string; cost: { minerai: number; silicium: number; hydrogene: number }; baseSpeed: number; fuelConsumption: number; cargoCapacity: number; driveType: string; weapons: number; shield: number; armor: number; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
  defenses: Record<string, { id: string; name: string; description: string; cost: { minerai: number; silicium: number; hydrogene: number }; weapons: number; shield: number; armor: number; maxPerPlanet: number | null; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
  rapidFire: Record<string, Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Flavor texts
// ---------------------------------------------------------------------------

const BUILDING_FLAVOR: Record<BuildingId, string> = {
  mineraiMine: "Creusant profondement dans la croute planetaire, les foreuses extractrices de minerai constituent la colonne vertebrale de toute economie spatiale.",
  siliciumMine: "Les gisements de silicium, formes sous des pressions immenses, alimentent l'ensemble des technologies avancees de la galaxie.",
  hydrogeneSynth: "L'hydrogene, element fondamental de l'univers, est extrait des oceans planetaires par un processus de filtration moleculaire.",
  solarPlant: "D'immenses panneaux photovoltaiques captent l'energie de l'etoile la plus proche pour alimenter l'ensemble des infrastructures planetaires.",
  robotics: "Les chaines de montage automatisees accelerent la construction de tous les batiments et infrastructures.",
  shipyard: "Le chantier spatial assemble les vaisseaux industriels necessaires a l'expansion de votre empire.",
  arsenal: "L'arsenal planetaire fabrique les systemes de defense qui protegent vos installations contre les attaques ennemies.",
  commandCenter: "Le centre de commandement coordonne la construction des vaisseaux militaires les plus puissants de votre flotte.",
  researchLab: "Au coeur de ce laboratoire, les meilleurs scientifiques de l'empire repoussent les frontieres de la connaissance.",
  storageMinerai: "De vastes entrepots blindes permettent de stocker des quantites croissantes de minerai en toute securite.",
  storageSilicium: "Ces chambres a environnement controle preservent le silicium dans des conditions optimales.",
  storageHydrogene: "Des reservoirs cryogeniques haute pression maintiennent l'hydrogene a l'etat liquide pour un stockage maximal.",
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
  battleship: "Le vaisseau de bataille, colosse d'acier et de feu, est la piece maitresse de toute flotte d'invasion.",
  espionageProbe: "Quasiment indetectable, la sonde d'espionnage collecte des renseignements precieux sur les planetes adverses.",
  colonyShip: "Ce vaisseau transporte tout le necessaire pour etablir une nouvelle colonie sur une planete inhabite.",
  recycler: "Equipe de puissants aimants et de bras mecaniques, le recycleur collecte les debris des batailles spatiales.",
  prospector: "Le prospecteur est un vaisseau minier leger concu pour l'extraction de ressources sur les asteroides et planetes voisines.",
  explorer: "L'explorateur est un vaisseau rapide equipe de scanners avances pour cartographier les systemes stellaires inconnus.",
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
  id: string;
  name: string;
  description: string;
  flavorText: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  prerequisites: { buildingId: string; level: number }[];
  productionTable?: { level: number; value: number }[];
  productionLabel?: string;
  energyTable?: { level: number; value: number }[];
  energyLabel?: string;
  storageTable?: { level: number; value: number }[];
}

export interface ResearchDetails {
  type: 'research';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  effect: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  prerequisites: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] };
}

export interface RapidFireEntry {
  unitId: string;
  unitName: string;
  value: number;
}

export interface ShipDetails {
  type: 'ship';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  prerequisites: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] };
  combat: { weapons: number; shield: number; armor: number };
  stats: { baseSpeed: number; fuelConsumption: number; cargoCapacity: number; driveType: string };
  rapidFireAgainst: RapidFireEntry[];
  rapidFireFrom: RapidFireEntry[];
}

export interface DefenseDetails {
  type: 'defense';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  prerequisites: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] };
  combat: { weapons: number; shield: number; armor: number };
  rapidFireFrom: RapidFireEntry[];
  maxPerPlanet?: number;
}

// ---------------------------------------------------------------------------
// Name resolvers (use config if available, fall back to constants)
// ---------------------------------------------------------------------------

export function resolveBuildingName(id: string, config?: GameConfigData): string {
  if (config) return config.buildings[id]?.name ?? id;
  return BUILDINGS[id as BuildingId]?.name ?? id;
}

export function resolveResearchName(id: string, config?: GameConfigData): string {
  if (config) return config.research[id]?.name ?? id;
  return RESEARCH[id as ResearchId]?.name ?? id;
}

function resolveUnitName(id: string, config?: GameConfigData): string {
  if (config) {
    return config.ships[id]?.name ?? config.defenses[id]?.name ?? id;
  }
  return SHIPS[id as ShipId]?.name ?? DEFENSES[id as DefenseId]?.name ?? id;
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

function getRapidFireAgainst(unitId: string, config?: GameConfigData): RapidFireEntry[] {
  const rf = config?.rapidFire ?? RAPID_FIRE;
  const targets = rf[unitId];
  if (!targets) return [];
  return Object.entries(targets).map(([targetId, value]) => ({
    unitId: targetId,
    unitName: resolveUnitName(targetId, config),
    value,
  }));
}

function getRapidFireFrom(unitId: string, config?: GameConfigData): RapidFireEntry[] {
  const rf = config?.rapidFire ?? RAPID_FIRE;
  const entries: RapidFireEntry[] = [];
  for (const [attackerId, targets] of Object.entries(rf)) {
    if (targets[unitId]) {
      entries.push({
        unitId: attackerId,
        unitName: resolveUnitName(attackerId, config),
        value: targets[unitId],
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PlanetContext {
  maxTemp: number;
  productionFactor: number;
}

export function getBuildingDetails(id: string, config?: GameConfigData, planet?: PlanetContext): BuildingDetails {
  const cfgDef = config?.buildings[id];
  const def = BUILDINGS[id as BuildingId];
  const pf = planet?.productionFactor ?? 1;
  const maxTemp = planet?.maxTemp ?? 50;
  const details: BuildingDetails = {
    type: 'building',
    id,
    name: cfgDef?.name ?? def?.name ?? id,
    description: cfgDef?.description ?? def?.description ?? '',
    flavorText: BUILDING_FLAVOR[id as BuildingId] ?? '',
    baseCost: cfgDef?.baseCost ?? def?.baseCost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    costFactor: cfgDef?.costFactor ?? def?.costFactor ?? 1,
    prerequisites: cfgDef?.prerequisites ?? def?.prerequisites ?? [],
  };

  switch (id) {
    case 'mineraiMine':
      details.productionTable = buildTable((lvl) => mineraiProduction(lvl, pf));
      details.productionLabel = pf < 1 ? `Production minerai/h (energie: ${Math.round(pf * 100)}%)` : 'Production minerai/h';
      details.energyTable = buildTable(mineraiMineEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'siliciumMine':
      details.productionTable = buildTable((lvl) => siliciumProduction(lvl, pf));
      details.productionLabel = pf < 1 ? `Production silicium/h (energie: ${Math.round(pf * 100)}%)` : 'Production silicium/h';
      details.energyTable = buildTable(siliciumMineEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'hydrogeneSynth':
      details.productionTable = buildTable((lvl) => hydrogeneProduction(lvl, maxTemp, pf));
      details.productionLabel = `Production H\u2082/h (temp. ${maxTemp}${pf < 1 ? `, energie: ${Math.round(pf * 100)}%` : ''})`;
      details.energyTable = buildTable(hydrogeneSynthEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'solarPlant':
      details.energyTable = buildTable(solarPlantEnergy);
      details.energyLabel = 'Production energie';
      break;
    case 'storageMinerai':
    case 'storageSilicium':
    case 'storageHydrogene':
      details.storageTable = buildTable(storageCapacity, 10);
      break;
  }

  return details;
}

export function getResearchDetails(id: string, config?: GameConfigData): ResearchDetails {
  const cfgDef = config?.research[id];
  const def = RESEARCH[id as ResearchId];
  return {
    type: 'research',
    id,
    name: cfgDef?.name ?? def?.name ?? id,
    description: cfgDef?.description ?? def?.description ?? '',
    flavorText: RESEARCH_FLAVOR[id as ResearchId] ?? '',
    effect: RESEARCH_EFFECTS[id as ResearchId] ?? '',
    baseCost: cfgDef?.baseCost ?? def?.baseCost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    costFactor: cfgDef?.costFactor ?? def?.costFactor ?? 1,
    prerequisites: cfgDef?.prerequisites ?? def?.prerequisites ?? {},
  };
}

export function getShipDetails(id: string, config?: GameConfigData): ShipDetails {
  const cfgDef = config?.ships[id];
  const def = SHIPS[id as ShipId];
  const combat = cfgDef
    ? { weapons: cfgDef.weapons, shield: cfgDef.shield, armor: cfgDef.armor }
    : COMBAT_STATS[id] ?? { weapons: 0, shield: 0, armor: 0 };
  const stats = cfgDef
    ? { baseSpeed: cfgDef.baseSpeed, fuelConsumption: cfgDef.fuelConsumption, cargoCapacity: cfgDef.cargoCapacity, driveType: cfgDef.driveType }
    : SHIP_STATS[id as ShipId] ?? { baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion' };
  return {
    type: 'ship',
    id,
    name: cfgDef?.name ?? def?.name ?? id,
    description: cfgDef?.description ?? def?.description ?? '',
    flavorText: SHIP_FLAVOR[id as ShipId] ?? '',
    cost: cfgDef?.cost ?? def?.cost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    prerequisites: cfgDef?.prerequisites ?? def?.prerequisites ?? {},
    combat,
    stats,
    rapidFireAgainst: getRapidFireAgainst(id, config),
    rapidFireFrom: getRapidFireFrom(id, config),
  };
}

export function getDefenseDetails(id: string, config?: GameConfigData): DefenseDetails {
  const cfgDef = config?.defenses[id];
  const def = DEFENSES[id as DefenseId];
  const combat = cfgDef
    ? { weapons: cfgDef.weapons, shield: cfgDef.shield, armor: cfgDef.armor }
    : COMBAT_STATS[id] ?? { weapons: 0, shield: 0, armor: 0 };
  return {
    type: 'defense',
    id,
    name: cfgDef?.name ?? def?.name ?? id,
    description: cfgDef?.description ?? def?.description ?? '',
    flavorText: DEFENSE_FLAVOR[id as DefenseId] ?? '',
    cost: cfgDef?.cost ?? def?.cost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    prerequisites: cfgDef?.prerequisites ?? def?.prerequisites ?? {},
    combat,
    rapidFireFrom: getRapidFireFrom(id, config),
    maxPerPlanet: cfgDef?.maxPerPlanet ?? def?.maxPerPlanet,
  };
}
