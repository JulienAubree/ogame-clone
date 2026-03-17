import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, isNull, sql } from 'drizzle-orm';
import {
  entityCategories,
  buildingDefinitions,
  buildingPrerequisites,
  researchDefinitions,
  researchPrerequisites,
  shipDefinitions,
  shipPrerequisites,
  defenseDefinitions,
  defensePrerequisites,
  rapidFire,
  productionConfig,
  universeConfig,
  planetTypes,
} from './schema/game-config.js';
import { planets } from './schema/planets.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://ogame:ogame@localhost:5432/ogame';
const client = postgres(DATABASE_URL);
const db = drizzle(client);

// ── Entity Categories ──

const CATEGORIES = [
  // Buildings
  { id: 'building_industrie', entityType: 'building', name: 'Industrie', sortOrder: 0 },
  { id: 'building_stockage', entityType: 'building', name: 'Stockage', sortOrder: 1 },
  { id: 'building_defense', entityType: 'building', name: 'Défense et armement', sortOrder: 2 },
  { id: 'building_recherche', entityType: 'building', name: 'Recherche', sortOrder: 3 },
  // Research
  { id: 'research_propulsion', entityType: 'research', name: 'Propulsion', sortOrder: 0 },
  { id: 'research_combat', entityType: 'research', name: 'Combat', sortOrder: 1 },
  { id: 'research_sciences', entityType: 'research', name: 'Sciences', sortOrder: 2 },
  // Ships
  { id: 'ship_combat', entityType: 'ship', name: 'Combat', sortOrder: 0 },
  { id: 'ship_transport', entityType: 'ship', name: 'Transport', sortOrder: 1 },
  { id: 'ship_utilitaire', entityType: 'ship', name: 'Utilitaire', sortOrder: 2 },
  // Defenses
  { id: 'defense_tourelles', entityType: 'defense', name: 'Tourelles', sortOrder: 0 },
  { id: 'defense_boucliers', entityType: 'defense', name: 'Boucliers', sortOrder: 1 },
  // Build time reduction categories
  { id: 'build_industrial', entityType: 'build', name: 'Vaisseaux industriels', sortOrder: 0 },
  { id: 'build_military', entityType: 'build', name: 'Vaisseaux militaires', sortOrder: 1 },
  { id: 'build_defense', entityType: 'build', name: 'Défenses', sortOrder: 2 },
];

// ── Building data ──

const BUILDINGS = [
  { id: 'mineraiMine', name: 'Mine de minerai', description: 'Produit du minerai, ressource de base.', baseCostMinerai: 60, baseCostSilicium: 15, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 60, categoryId: 'building_industrie', sortOrder: 0, buildTimeReductionFactor: null as number | null, reducesTimeForCategory: null as string | null, prerequisites: [] as { buildingId: string; level: number }[] },
  { id: 'siliciumMine', name: 'Mine de silicium', description: 'Produit du silicium.', baseCostMinerai: 48, baseCostSilicium: 24, baseCostHydrogene: 0, costFactor: 1.6, baseTime: 60, categoryId: 'building_industrie', sortOrder: 1, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'hydrogeneSynth', name: "Synthétiseur d'hydrogène", description: "Produit de l'hydrogène.", baseCostMinerai: 225, baseCostSilicium: 75, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 60, categoryId: 'building_industrie', sortOrder: 2, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'solarPlant', name: 'Centrale solaire', description: "Produit de l'énergie.", baseCostMinerai: 75, baseCostSilicium: 30, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 60, categoryId: 'building_industrie', sortOrder: 3, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'robotics', name: 'Usine de robots', description: 'Réduit le temps de construction des bâtiments.', baseCostMinerai: 400, baseCostSilicium: 120, baseCostHydrogene: 200, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 4, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'shipyard', name: 'Chantier spatial', description: 'Débloque et construit les vaisseaux industriels.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 5, buildTimeReductionFactor: 1.0, reducesTimeForCategory: 'build_industrial', prerequisites: [{ buildingId: 'robotics', level: 1 }] },
  { id: 'arsenal', name: 'Arsenal planétaire', description: 'Débloque et construit les défenses planétaires.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 6, buildTimeReductionFactor: 1.0, reducesTimeForCategory: 'build_defense', prerequisites: [{ buildingId: 'robotics', level: 2 }] },
  { id: 'commandCenter', name: 'Centre de commandement', description: 'Débloque et construit les vaisseaux militaires.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 7, buildTimeReductionFactor: 1.0, reducesTimeForCategory: 'build_military', prerequisites: [{ buildingId: 'robotics', level: 4 }, { buildingId: 'shipyard', level: 2 }] },
  { id: 'researchLab', name: 'Laboratoire de recherche', description: 'Permet les recherches.', baseCostMinerai: 200, baseCostSilicium: 400, baseCostHydrogene: 200, costFactor: 2, baseTime: 60, categoryId: 'building_recherche', sortOrder: 8, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'storageMinerai', name: 'Entrepôt de minerai', description: 'Augmente le stockage de minerai.', baseCostMinerai: 1000, baseCostSilicium: 0, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 9, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'storageSilicium', name: 'Entrepôt de silicium', description: 'Augmente le stockage de silicium.', baseCostMinerai: 1000, baseCostSilicium: 500, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 10, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
  { id: 'storageHydrogene', name: "Réservoir d'hydrogène", description: "Augmente le stockage d'hydrogène.", baseCostMinerai: 1000, baseCostSilicium: 1000, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 11, buildTimeReductionFactor: null, reducesTimeForCategory: null, prerequisites: [] },
];

// ── Research data ──

const RESEARCH = [
  { id: 'espionageTech', name: 'Technologie Espionnage', description: "Améliore les sondes d'espionnage.", baseCostMinerai: 200, baseCostSilicium: 1000, baseCostHydrogene: 200, costFactor: 2, levelColumn: 'espionageTech', categoryId: 'research_sciences', sortOrder: 0, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 3 }], research: [] as { researchId: string; level: number }[] } },
  { id: 'computerTech', name: 'Technologie Ordinateur', description: 'Augmente le nombre de flottes simultanées.', baseCostMinerai: 0, baseCostSilicium: 400, baseCostHydrogene: 600, costFactor: 2, levelColumn: 'computerTech', categoryId: 'research_sciences', sortOrder: 1, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [] } },
  { id: 'energyTech', name: 'Technologie Énergie', description: 'Recherche fondamentale en énergie.', baseCostMinerai: 0, baseCostSilicium: 800, baseCostHydrogene: 400, costFactor: 2, levelColumn: 'energyTech', categoryId: 'research_sciences', sortOrder: 2, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [] } },
  { id: 'combustion', name: 'Réacteur à combustion', description: 'Propulsion de base pour les vaisseaux.', baseCostMinerai: 400, baseCostSilicium: 0, baseCostHydrogene: 600, costFactor: 2, levelColumn: 'combustion', categoryId: 'research_propulsion', sortOrder: 3, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'impulse', name: 'Réacteur à impulsion', description: 'Propulsion avancée.', baseCostMinerai: 2000, baseCostSilicium: 4000, baseCostHydrogene: 600, costFactor: 2, levelColumn: 'impulse', categoryId: 'research_propulsion', sortOrder: 4, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'hyperspaceDrive', name: 'Propulsion hyperespace', description: 'Propulsion la plus rapide.', baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 6000, costFactor: 2, levelColumn: 'hyperspaceDrive', categoryId: 'research_propulsion', sortOrder: 5, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 7 }], research: [{ researchId: 'energyTech', level: 5 }, { researchId: 'shielding', level: 5 }] } },
  { id: 'weapons', name: 'Technologie Armes', description: 'Augmente les dégâts de 10% par niveau.', baseCostMinerai: 800, baseCostSilicium: 200, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'weapons', categoryId: 'research_combat', sortOrder: 6, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 4 }], research: [] } },
  { id: 'shielding', name: 'Technologie Bouclier', description: 'Augmente les boucliers de 10% par niveau.', baseCostMinerai: 200, baseCostSilicium: 600, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'shielding', categoryId: 'research_combat', sortOrder: 7, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 6 }], research: [{ researchId: 'energyTech', level: 3 }] } },
  { id: 'armor', name: 'Technologie Protection', description: 'Augmente la coque de 10% par niveau.', baseCostMinerai: 1000, baseCostSilicium: 0, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'armor', categoryId: 'research_combat', sortOrder: 8, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }], research: [] } },
];

// ── Ship data (merged: ships + combat-stats + ship-stats) ──

const SHIPS = [
  // Industrial ships → shipyard
  { id: 'prospector', name: 'Prospecteur', description: 'Vaisseau de minage early-game.', costMinerai: 1500, costSilicium: 500, costHydrogene: 0, countColumn: 'prospector', baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 500, driveType: 'combustion', weapons: 2, shield: 5, armor: 2000, categoryId: 'ship_utilitaire', sortOrder: 0, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'explorer', name: 'Explorateur', description: "Sonde d'exploration spatiale pour missions lointaines.", costMinerai: 0, costSilicium: 1500, costHydrogene: 0, countColumn: 'explorer', baseSpeed: 80000, fuelConsumption: 1, cargoCapacity: 100, driveType: 'combustion', weapons: 0, shield: 0, armor: 1000, categoryId: 'ship_utilitaire', sortOrder: 1, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'smallCargo', name: 'Petit transporteur', description: 'Transport léger de ressources.', costMinerai: 2000, costSilicium: 2000, costHydrogene: 0, countColumn: 'smallCargo', baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000, driveType: 'combustion', weapons: 5, shield: 10, armor: 4000, categoryId: 'ship_transport', sortOrder: 2, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [{ researchId: 'combustion', level: 2 }] } },
  { id: 'largeCargo', name: 'Grand transporteur', description: 'Transport lourd de ressources.', costMinerai: 6000, costSilicium: 6000, costHydrogene: 0, countColumn: 'largeCargo', baseSpeed: 7500, fuelConsumption: 50, cargoCapacity: 25000, driveType: 'combustion', weapons: 5, shield: 25, armor: 12000, categoryId: 'ship_transport', sortOrder: 3, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }] } },
  { id: 'espionageProbe', name: "Sonde d'espionnage", description: 'Sonde rapide pour espionner.', costMinerai: 0, costSilicium: 1000, costHydrogene: 0, countColumn: 'espionageProbe', baseSpeed: 100000000, fuelConsumption: 1, cargoCapacity: 0, driveType: 'combustion', weapons: 0, shield: 0, armor: 1000, categoryId: 'ship_utilitaire', sortOrder: 4, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 3 }], research: [{ researchId: 'combustion', level: 3 }, { researchId: 'espionageTech', level: 2 }] } },
  { id: 'colonyShip', name: 'Vaisseau de colonisation', description: 'Colonise de nouvelles planètes.', costMinerai: 10000, costSilicium: 20000, costHydrogene: 10000, countColumn: 'colonyShip', baseSpeed: 2500, fuelConsumption: 1000, cargoCapacity: 7500, driveType: 'impulse', weapons: 50, shield: 100, armor: 30000, categoryId: 'ship_utilitaire', sortOrder: 5, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'impulse', level: 3 }] } },
  { id: 'recycler', name: 'Recycleur', description: 'Collecte les champs de débris.', costMinerai: 10000, costSilicium: 6000, costHydrogene: 2000, countColumn: 'recycler', baseSpeed: 2000, fuelConsumption: 300, cargoCapacity: 20000, driveType: 'combustion', weapons: 1, shield: 10, armor: 16000, categoryId: 'ship_utilitaire', sortOrder: 6, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }, { researchId: 'shielding', level: 2 }] } },
  // Military ships → commandCenter
  { id: 'lightFighter', name: 'Chasseur léger', description: 'Vaisseau de combat de base.', costMinerai: 3000, costSilicium: 1000, costHydrogene: 0, countColumn: 'lightFighter', baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion', weapons: 50, shield: 10, armor: 4000, categoryId: 'ship_combat', sortOrder: 7, prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'heavyFighter', name: 'Chasseur lourd', description: 'Vaisseau de combat amélioré.', costMinerai: 6000, costSilicium: 4000, costHydrogene: 0, countColumn: 'heavyFighter', baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100, driveType: 'impulse', weapons: 150, shield: 25, armor: 10000, categoryId: 'ship_combat', sortOrder: 8, prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 3 }], research: [{ researchId: 'armor', level: 2 }, { researchId: 'impulse', level: 2 }] } },
  { id: 'cruiser', name: 'Croiseur', description: 'Vaisseau de guerre polyvalent.', costMinerai: 20000, costSilicium: 7000, costHydrogene: 2000, countColumn: 'cruiser', baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse', weapons: 400, shield: 50, armor: 27000, categoryId: 'ship_combat', sortOrder: 9, prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 5 }], research: [{ researchId: 'impulse', level: 4 }, { researchId: 'weapons', level: 3 }] } },
  { id: 'battleship', name: 'Vaisseau de bataille', description: 'Puissant navire de guerre.', costMinerai: 45000, costSilicium: 15000, costHydrogene: 0, countColumn: 'battleship', baseSpeed: 10000, fuelConsumption: 500, cargoCapacity: 1500, driveType: 'hyperspaceDrive', weapons: 1000, shield: 200, armor: 60000, categoryId: 'ship_combat', sortOrder: 10, prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 7 }], research: [{ researchId: 'hyperspaceDrive', level: 4 }] } },
];

// ── Defense data (merged: defenses + combat-stats) ──

const DEFENSES = [
  { id: 'rocketLauncher', name: 'Lanceur de missiles', description: 'Défense de base, peu coûteuse.', costMinerai: 2000, costSilicium: 0, costHydrogene: 0, countColumn: 'rocketLauncher', weapons: 80, shield: 20, armor: 2000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 0, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 1 }], research: [] as { researchId: string; level: number }[] } },
  { id: 'lightLaser', name: 'Artillerie laser légère', description: 'Défense laser de base.', costMinerai: 1500, costSilicium: 500, costHydrogene: 0, countColumn: 'lightLaser', weapons: 100, shield: 25, armor: 2000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 1, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 2 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'heavyLaser', name: 'Artillerie laser lourde', description: 'Défense laser puissante.', costMinerai: 6000, costSilicium: 2000, costHydrogene: 0, countColumn: 'heavyLaser', weapons: 250, shield: 100, armor: 8000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 2, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 4 }], research: [{ researchId: 'energyTech', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'gaussCannon', name: 'Canon de Gauss', description: 'Défense balistique puissante.', costMinerai: 20000, costSilicium: 15000, costHydrogene: 2000, countColumn: 'gaussCannon', weapons: 1100, shield: 200, armor: 35000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 3, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 6 }], research: [{ researchId: 'energyTech', level: 6 }, { researchId: 'weapons', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'plasmaTurret', name: 'Artillerie à ions', description: 'Défense plasma dévastatrice.', costMinerai: 50000, costSilicium: 50000, costHydrogene: 30000, countColumn: 'plasmaTurret', weapons: 3000, shield: 300, armor: 100000, maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 4, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 8 }], research: [{ researchId: 'energyTech', level: 8 }, { researchId: 'weapons', level: 7 }] } },
  { id: 'smallShield', name: 'Petit bouclier', description: 'Bouclier planétaire de base.', costMinerai: 10000, costSilicium: 10000, costHydrogene: 0, countColumn: 'smallShield', weapons: 1, shield: 2000, armor: 2000, maxPerPlanet: 1, categoryId: 'defense_boucliers', sortOrder: 5, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 1 }], research: [{ researchId: 'shielding', level: 2 }] } },
  { id: 'largeShield', name: 'Grand bouclier', description: 'Bouclier planétaire avancé.', costMinerai: 50000, costSilicium: 50000, costHydrogene: 0, countColumn: 'largeShield', weapons: 1, shield: 10000, armor: 10000, maxPerPlanet: 1, categoryId: 'defense_boucliers', sortOrder: 6, prerequisites: { buildings: [{ buildingId: 'arsenal', level: 4 }], research: [{ researchId: 'shielding', level: 6 }] } },
];

// ── Rapid fire data ──

const RAPID_FIRE_DATA = [
  { attackerId: 'smallCargo', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'smallCargo', targetId: 'prospector', value: 5 },
  { attackerId: 'smallCargo', targetId: 'explorer', value: 5 },
  { attackerId: 'largeCargo', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'largeCargo', targetId: 'prospector', value: 5 },
  { attackerId: 'largeCargo', targetId: 'explorer', value: 5 },
  { attackerId: 'lightFighter', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'lightFighter', targetId: 'prospector', value: 5 },
  { attackerId: 'lightFighter', targetId: 'explorer', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'prospector', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'explorer', value: 5 },
  { attackerId: 'heavyFighter', targetId: 'smallCargo', value: 3 },
  { attackerId: 'cruiser', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'cruiser', targetId: 'prospector', value: 5 },
  { attackerId: 'cruiser', targetId: 'explorer', value: 5 },
  { attackerId: 'cruiser', targetId: 'lightFighter', value: 6 },
  { attackerId: 'cruiser', targetId: 'smallCargo', value: 3 },
  { attackerId: 'cruiser', targetId: 'rocketLauncher', value: 10 },
  { attackerId: 'battleship', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'battleship', targetId: 'prospector', value: 5 },
  { attackerId: 'battleship', targetId: 'explorer', value: 5 },
  { attackerId: 'battleship', targetId: 'lightFighter', value: 4 },
  { attackerId: 'battleship', targetId: 'smallCargo', value: 4 },
  { attackerId: 'battleship', targetId: 'largeCargo', value: 4 },
  { attackerId: 'colonyShip', targetId: 'espionageProbe', value: 5 },
  { attackerId: 'colonyShip', targetId: 'prospector', value: 5 },
  { attackerId: 'colonyShip', targetId: 'explorer', value: 5 },
];

// ── Production config data ──

const PRODUCTION_CONFIG = [
  { id: 'mineraiMine', baseProduction: 30, exponentBase: 1.1, energyConsumption: 10, storageBase: null },
  { id: 'siliciumMine', baseProduction: 20, exponentBase: 1.1, energyConsumption: 10, storageBase: null },
  { id: 'hydrogeneSynth', baseProduction: 10, exponentBase: 1.1, energyConsumption: 20, storageBase: null },
  { id: 'solarPlant', baseProduction: 20, exponentBase: 1.1, energyConsumption: null, storageBase: null },
  { id: 'storage', baseProduction: 5000, exponentBase: 1.1, energyConsumption: null, storageBase: 5000 },
];

// ── Planet types data ──

const PLANET_TYPES = [
  { id: 'volcanic', name: 'Volcanique', description: 'Planète volcanique aux sols riches en silicium.', positions: [1, 2, 3], mineraiBonus: 1.0, siliciumBonus: 1.2, hydrogeneBonus: 0.7, diameterMin: 5800, diameterMax: 9800, fieldsBonus: 1.1, sortOrder: 0 },
  { id: 'arid', name: 'Aride', description: 'Planète aride riche en minerai.', positions: [4, 5, 6], mineraiBonus: 1.2, siliciumBonus: 1.1, hydrogeneBonus: 0.8, diameterMin: 9000, diameterMax: 13000, fieldsBonus: 0.9, sortOrder: 1 },
  { id: 'temperate', name: 'Tempérée', description: 'Planète équilibrée sans bonus ni malus.', positions: [7, 8, 9], mineraiBonus: 1.0, siliciumBonus: 1.0, hydrogeneBonus: 1.0, diameterMin: 10000, diameterMax: 15600, fieldsBonus: 1.0, sortOrder: 2 },
  { id: 'glacial', name: 'Glaciale', description: "Planète glaciale propice à la synthèse d'hydrogène.", positions: [10, 11, 12], mineraiBonus: 0.8, siliciumBonus: 1.0, hydrogeneBonus: 1.3, diameterMin: 7500, diameterMax: 12200, fieldsBonus: 0.9, sortOrder: 3 },
  { id: 'gaseous', name: 'Gazeuse', description: "Géante gazeuse avec d'abondantes ressources en hydrogène.", positions: [13, 14, 15], mineraiBonus: 0.9, siliciumBonus: 0.9, hydrogeneBonus: 1.1, diameterMin: 8000, diameterMax: 14000, fieldsBonus: 1.1, sortOrder: 4 },
  { id: 'homeworld', name: 'Planète mère', description: 'Planète de départ neutre.', positions: [], mineraiBonus: 1.0, siliciumBonus: 1.0, hydrogeneBonus: 1.0, diameterMin: 12000, diameterMax: 12000, fieldsBonus: 1.0, sortOrder: 5 },
];

// ── Universe config data ──

const UNIVERSE_CONFIG = [
  { key: 'name', value: 'Universe 1' },
  { key: 'speed', value: 1 },
  { key: 'galaxies', value: 9 },
  { key: 'systems', value: 499 },
  { key: 'positions', value: 15 },
  { key: 'maxPlanetsPerPlayer', value: 9 },
  { key: 'debrisRatio', value: 0.3 },
  { key: 'lootRatio', value: 0.5 },
  { key: 'startingMinerai', value: 1200 },
  { key: 'startingSilicium', value: 750 },
  { key: 'startingHydrogene', value: 100 },
];

async function seed() {
  console.log('Seeding game config...');

  // 0. Entity categories (upsert)
  for (const c of CATEGORIES) {
    await db.insert(entityCategories).values(c)
      .onConflictDoUpdate({ target: entityCategories.id, set: { ...c } });
  }
  console.log(`  ✓ ${CATEGORIES.length} entity categories`);

  // 1. Building definitions (upsert)
  for (const b of BUILDINGS) {
    const { prerequisites: _bp, ...row } = b;
    await db.insert(buildingDefinitions).values(row)
      .onConflictDoUpdate({ target: buildingDefinitions.id, set: { ...row } });
  }
  console.log(`  ✓ ${BUILDINGS.length} building definitions`);

  // 2. Building prerequisites (delete + re-insert for simplicity)
  await db.delete(buildingPrerequisites);
  const bPrereqs = BUILDINGS.flatMap(b =>
    b.prerequisites.map(p => ({
      buildingId: b.id,
      requiredBuildingId: p.buildingId,
      requiredLevel: p.level,
    }))
  );
  if (bPrereqs.length > 0) {
    await db.insert(buildingPrerequisites).values(bPrereqs);
  }
  console.log(`  ✓ ${bPrereqs.length} building prerequisites`);

  // 3. Research definitions
  for (const r of RESEARCH) {
    const { prerequisites: _rp, ...row } = r;
    await db.insert(researchDefinitions).values(row)
      .onConflictDoUpdate({ target: researchDefinitions.id, set: { ...row } });
  }
  console.log(`  ✓ ${RESEARCH.length} research definitions`);

  // 4. Research prerequisites
  await db.delete(researchPrerequisites);
  const rPrereqs: { researchId: string; requiredBuildingId: string | null; requiredResearchId: string | null; requiredLevel: number }[] = [];
  for (const r of RESEARCH) {
    for (const b of r.prerequisites.buildings) {
      rPrereqs.push({ researchId: r.id, requiredBuildingId: b.buildingId, requiredResearchId: null, requiredLevel: b.level });
    }
    for (const res of r.prerequisites.research) {
      rPrereqs.push({ researchId: r.id, requiredBuildingId: null, requiredResearchId: res.researchId, requiredLevel: res.level });
    }
  }
  if (rPrereqs.length > 0) {
    await db.insert(researchPrerequisites).values(rPrereqs);
  }
  console.log(`  ✓ ${rPrereqs.length} research prerequisites`);

  // 5. Ship definitions
  for (const s of SHIPS) {
    const { prerequisites: _sp, ...row } = s;
    await db.insert(shipDefinitions).values(row)
      .onConflictDoUpdate({ target: shipDefinitions.id, set: { ...row } });
  }
  console.log(`  ✓ ${SHIPS.length} ship definitions`);

  // 6. Ship prerequisites
  await db.delete(shipPrerequisites);
  const sPrereqs: { shipId: string; requiredBuildingId: string | null; requiredResearchId: string | null; requiredLevel: number }[] = [];
  for (const s of SHIPS) {
    for (const b of s.prerequisites.buildings) {
      sPrereqs.push({ shipId: s.id, requiredBuildingId: b.buildingId, requiredResearchId: null, requiredLevel: b.level });
    }
    for (const r of s.prerequisites.research) {
      sPrereqs.push({ shipId: s.id, requiredBuildingId: null, requiredResearchId: r.researchId, requiredLevel: r.level });
    }
  }
  if (sPrereqs.length > 0) {
    await db.insert(shipPrerequisites).values(sPrereqs);
  }
  console.log(`  ✓ ${sPrereqs.length} ship prerequisites`);

  // 7. Defense definitions
  for (const d of DEFENSES) {
    const { prerequisites: _dp, ...row } = d;
    await db.insert(defenseDefinitions).values(row)
      .onConflictDoUpdate({ target: defenseDefinitions.id, set: { ...row } });
  }
  console.log(`  ✓ ${DEFENSES.length} defense definitions`);

  // 8. Defense prerequisites
  await db.delete(defensePrerequisites);
  const dPrereqs: { defenseId: string; requiredBuildingId: string | null; requiredResearchId: string | null; requiredLevel: number }[] = [];
  for (const d of DEFENSES) {
    for (const b of d.prerequisites.buildings) {
      dPrereqs.push({ defenseId: d.id, requiredBuildingId: b.buildingId, requiredResearchId: null, requiredLevel: b.level });
    }
    for (const r of d.prerequisites.research) {
      dPrereqs.push({ defenseId: d.id, requiredBuildingId: null, requiredResearchId: r.researchId, requiredLevel: r.level });
    }
  }
  if (dPrereqs.length > 0) {
    await db.insert(defensePrerequisites).values(dPrereqs);
  }
  console.log(`  ✓ ${dPrereqs.length} defense prerequisites`);

  // 9. Rapid fire
  await db.delete(rapidFire);
  if (RAPID_FIRE_DATA.length > 0) {
    await db.insert(rapidFire).values(RAPID_FIRE_DATA);
  }
  console.log(`  ✓ ${RAPID_FIRE_DATA.length} rapid fire entries`);

  // 10. Production config
  for (const p of PRODUCTION_CONFIG) {
    await db.insert(productionConfig).values(p)
      .onConflictDoUpdate({ target: productionConfig.id, set: { ...p } });
  }
  console.log(`  ✓ ${PRODUCTION_CONFIG.length} production configs`);

  // 11. Planet types
  for (const pt of PLANET_TYPES) {
    await db.insert(planetTypes).values(pt)
      .onConflictDoUpdate({ target: planetTypes.id, set: { ...pt } });
  }
  console.log(`  ✓ ${PLANET_TYPES.length} planet types`);

  // 12. Universe config
  for (const u of UNIVERSE_CONFIG) {
    await db.insert(universeConfig).values(u)
      .onConflictDoUpdate({ target: universeConfig.key, set: { value: u.value } });
  }
  console.log(`  ✓ ${UNIVERSE_CONFIG.length} universe config entries`);

  // 13. Migrate existing planets: set homeworld type on first planet of each user
  const homePlanets = await db.execute(sql`
    UPDATE planets SET planet_class_id = 'homeworld'
    WHERE planet_class_id IS NULL
    AND id IN (
      SELECT DISTINCT ON (user_id) id
      FROM planets
      ORDER BY user_id, created_at ASC
    )
  `);
  console.log(`  ✓ Migrated home planets to homeworld type`);

  console.log('Seed complete!');
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
