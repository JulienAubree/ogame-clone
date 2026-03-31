import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import {
  entityCategories,
  buildingDefinitions,
  buildingPrerequisites,
  bonusDefinitions,
  researchDefinitions,
  researchPrerequisites,
  shipDefinitions,
  shipPrerequisites,
  defenseDefinitions,
  defensePrerequisites,
  productionConfig,
  universeConfig,
  planetTypes,
  talentBranchDefinitions,
  talentDefinitions,
} from './schema/game-config.js';
import { pirateTemplates } from './schema/pve-missions.js';
import { tutorialQuestDefinitions } from './schema/tutorial-quest-definitions.js';
import { missionDefinitions } from './schema/mission-definitions.js';
import { uiLabels } from './schema/ui-labels.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://exilium:exilium@localhost:5432/exilium';
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
  { id: 'mineraiMine', name: 'Mine de minerai', description: 'Produit du minerai, ressource de base.', baseCostMinerai: 60, baseCostSilicium: 15, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 45, categoryId: 'building_industrie', sortOrder: 0, role: 'producer_minerai', flavorText: "Creusant profondement dans la croute planetaire, les foreuses extractrices de minerai constituent la colonne vertebrale de toute economie spatiale.", prerequisites: [] as { buildingId: string; level: number }[] },
  { id: 'siliciumMine', name: 'Mine de silicium', description: 'Produit du silicium.', baseCostMinerai: 48, baseCostSilicium: 24, baseCostHydrogene: 0, costFactor: 1.6, baseTime: 45, categoryId: 'building_industrie', sortOrder: 1, role: 'producer_silicium', flavorText: "Les gisements de silicium, formes sous des pressions immenses, alimentent l'ensemble des technologies avancees de la galaxie.", prerequisites: [] },
  { id: 'hydrogeneSynth', name: "Synthétiseur d'hydrogène", description: "Produit de l'hydrogène.", baseCostMinerai: 225, baseCostSilicium: 75, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 45, categoryId: 'building_industrie', sortOrder: 2, role: 'producer_hydrogene', flavorText: "L'hydrogene, element fondamental de l'univers, est extrait des oceans planetaires par un processus de filtration moleculaire.", prerequisites: [] },
  { id: 'solarPlant', name: 'Centrale solaire', description: "Produit de l'énergie.", baseCostMinerai: 75, baseCostSilicium: 30, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 45, categoryId: 'building_industrie', sortOrder: 3, role: 'producer_energy', flavorText: "D'immenses panneaux photovoltaiques captent l'energie de l'etoile la plus proche pour alimenter l'ensemble des infrastructures planetaires.", prerequisites: [] },
  { id: 'robotics', name: 'Usine de robots', description: 'Réduit le temps de construction des bâtiments.', baseCostMinerai: 400, baseCostSilicium: 120, baseCostHydrogene: 200, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 4, role: null, flavorText: "Les chaines de montage automatisees accelerent la construction de tous les batiments et infrastructures.", prerequisites: [] },
  { id: 'shipyard', name: 'Chantier spatial', description: 'Débloque et construit les vaisseaux industriels.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 5, role: null, flavorText: "Le chantier spatial assemble les vaisseaux industriels necessaires a l'expansion de votre empire.", prerequisites: [{ buildingId: 'robotics', level: 1 }] },
  { id: 'arsenal', name: 'Arsenal planétaire', description: 'Débloque et construit les défenses planétaires.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 6, role: null, flavorText: "L'arsenal planetaire fabrique les systemes de defense qui protegent vos installations contre les attaques ennemies.", prerequisites: [{ buildingId: 'robotics', level: 2 }] },
  { id: 'commandCenter', name: 'Centre de commandement', description: 'Débloque et construit les vaisseaux militaires.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_defense', sortOrder: 7, role: null, flavorText: "Le centre de commandement coordonne la construction des vaisseaux militaires les plus puissants de votre flotte.", prerequisites: [{ buildingId: 'robotics', level: 4 }, { buildingId: 'shipyard', level: 2 }] },
  { id: 'researchLab', name: 'Laboratoire de recherche', description: 'Permet les recherches.', baseCostMinerai: 200, baseCostSilicium: 400, baseCostHydrogene: 200, costFactor: 2, baseTime: 60, categoryId: 'building_recherche', sortOrder: 8, role: null, flavorText: "Au coeur de ce laboratoire, les meilleurs scientifiques de l'empire repoussent les frontieres de la connaissance.", prerequisites: [] },
  { id: 'storageMinerai', name: 'Entrepôt de minerai', description: 'Augmente le stockage de minerai.', baseCostMinerai: 1000, baseCostSilicium: 0, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 9, role: 'storage_minerai', flavorText: "De vastes entrepots blindes permettent de stocker des quantites croissantes de minerai en toute securite.", prerequisites: [] },
  { id: 'storageSilicium', name: 'Entrepôt de silicium', description: 'Augmente le stockage de silicium.', baseCostMinerai: 1000, baseCostSilicium: 500, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 10, role: 'storage_silicium', flavorText: "Ces chambres a environnement controle preservent le silicium dans des conditions optimales.", prerequisites: [] },
  { id: 'storageHydrogene', name: "Réservoir d'hydrogène", description: "Augmente le stockage d'hydrogène.", baseCostMinerai: 1000, baseCostSilicium: 1000, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 11, role: 'storage_hydrogene', flavorText: "Des reservoirs cryogeniques haute pression maintiennent l'hydrogene a l'etat liquide pour un stockage maximal.", prerequisites: [] },
  { id: 'missionCenter', name: 'Centre de missions', description: "Découvre des gisements miniers toutes les 6h (−1h/niveau, min 1h). Détecte aussi les menaces pirates.", baseCostMinerai: 5000, baseCostSilicium: 3000, baseCostHydrogene: 1000, costFactor: 1.8, baseTime: 300, categoryId: 'building_defense', sortOrder: 12, role: 'mission_center', flavorText: "Le centre de missions scanne en permanence les ceintures d'asteroides a la recherche de gisements exploitables. Chaque amelioration accelere la frequence des decouvertes et la taille des gisements detectes.", prerequisites: [{ buildingId: 'shipyard', level: 2 }] },
  {
    id: 'galacticMarket',
    name: 'Marché Galactique',
    description: 'Permet les échanges de ressources avec les autres joueurs de l\'univers.',
    baseCostMinerai: 5000,
    baseCostSilicium: 5000,
    baseCostHydrogene: 1000,
    costFactor: 1.5,
    baseTime: 120,
    categoryId: 'building_industrie',
    sortOrder: 7,
    role: 'market',
    flavorText: 'Le marché galactique met en relation acheteurs et vendeurs à travers l\'univers.',
    prerequisites: [{ buildingId: 'shipyard', level: 2 }],
  },
  { id: 'planetaryShield', name: 'Bouclier planétaire', description: "Génère un champ de force protégeant la planète. Sa puissance est réglable pour économiser l'énergie.", baseCostMinerai: 2000, baseCostSilicium: 2000, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 7200, categoryId: 'building_defense', sortOrder: 20, role: 'planetaryShield', flavorText: "Un dôme d'énergie pure enveloppe la planète, absorbant les assauts ennemis tant que son générateur est alimenté.", prerequisites: [] as { buildingId: string; level: number }[] },
];

// ── Research data ──

const RESEARCH = [
  { id: 'espionageTech', name: 'Technologie Espionnage', description: "Améliore les sondes d'espionnage.", baseCostMinerai: 200, baseCostSilicium: 1000, baseCostHydrogene: 200, costFactor: 2, levelColumn: 'espionageTech', categoryId: 'research_sciences', sortOrder: 0, flavorText: "Des sondes furtives equipees de capteurs toujours plus performants permettent de percer les secrets de vos adversaires.", effectDescription: "Chaque niveau ameliore la quantite d'informations obtenues par sonde et la resistance au contre-espionnage.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 3 }], research: [] as { researchId: string; level: number }[] } },
  { id: 'computerTech', name: 'Technologie Ordinateur', description: 'Augmente le nombre de flottes simultanées.', baseCostMinerai: 0, baseCostSilicium: 400, baseCostHydrogene: 600, costFactor: 2, levelColumn: 'computerTech', categoryId: 'research_sciences', sortOrder: 1, flavorText: "L'augmentation de la puissance de calcul permet de coordonner un nombre croissant de flottes simultanement.", effectDescription: "Chaque niveau permet de controler une flotte supplementaire simultanement.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [] } },
  { id: 'energyTech', name: 'Technologie Énergie', description: 'Recherche fondamentale en énergie.', baseCostMinerai: 0, baseCostSilicium: 800, baseCostHydrogene: 400, costFactor: 2, levelColumn: 'energyTech', categoryId: 'research_sciences', sortOrder: 2, flavorText: "La maitrise des flux energetiques ouvre la voie aux technologies de propulsion avancees.", effectDescription: "Chaque niveau augmente la production d'energie de 2%. Prerequis pour les technologies de propulsion avancees.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [] } },
  { id: 'combustion', name: 'Réacteur à combustion', description: 'Propulsion de base pour les vaisseaux.', baseCostMinerai: 400, baseCostSilicium: 0, baseCostHydrogene: 600, costFactor: 2, levelColumn: 'combustion', categoryId: 'research_propulsion', sortOrder: 3, flavorText: "Les moteurs a combustion interne propulsent les premiers vaisseaux a travers l'espace interstellaire.", effectDescription: "Chaque niveau augmente la vitesse des vaisseaux a combustion de 10%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 1 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'impulse', name: 'Réacteur à impulsion', description: 'Propulsion avancée.', baseCostMinerai: 2000, baseCostSilicium: 4000, baseCostHydrogene: 600, costFactor: 2, levelColumn: 'impulse', categoryId: 'research_propulsion', sortOrder: 4, flavorText: "Le reacteur a impulsion utilise le principe de reaction nucleaire pour atteindre des vitesses superieures.", effectDescription: "Chaque niveau augmente la vitesse des vaisseaux a impulsion de 20%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'hyperspaceDrive', name: 'Propulsion hyperespace', description: 'Propulsion la plus rapide.', baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 6000, costFactor: 2, levelColumn: 'hyperspaceDrive', categoryId: 'research_propulsion', sortOrder: 5, flavorText: "En pliant l'espace-temps, la propulsion hyperespace permet de parcourir des distances autrefois inimaginables.", effectDescription: "Chaque niveau augmente la vitesse des vaisseaux hyperespace de 30%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 7 }], research: [{ researchId: 'energyTech', level: 5 }, { researchId: 'shielding', level: 5 }] } },
  { id: 'weapons', name: 'Technologie Armes', description: 'Augmente les dégâts de 10% par niveau.', baseCostMinerai: 800, baseCostSilicium: 200, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'weapons', categoryId: 'research_combat', sortOrder: 6, flavorText: "Chaque avancee en technologie des armes augmente de 10% la puissance de feu de toutes vos unites.", effectDescription: "Chaque niveau augmente les degats de toutes les unites de 10%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 4 }], research: [] } },
  { id: 'shielding', name: 'Technologie Bouclier', description: 'Augmente les boucliers de 10% par niveau.', baseCostMinerai: 200, baseCostSilicium: 600, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'shielding', categoryId: 'research_combat', sortOrder: 7, flavorText: "Les generateurs de bouclier creent des champs de force protegeant vos unites des impacts ennemis.", effectDescription: "Chaque niveau augmente les boucliers de toutes les unites de 10%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 6 }], research: [{ researchId: 'energyTech', level: 3 }] } },
  { id: 'armor', name: 'Technologie Protection', description: 'Augmente la coque de 10% par niveau.', baseCostMinerai: 1000, baseCostSilicium: 0, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'armor', categoryId: 'research_combat', sortOrder: 8, flavorText: "Des alliages toujours plus resistants renforcent la coque de toutes vos unites de 10% par niveau.", effectDescription: "Chaque niveau augmente la coque de toutes les unites de 10%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }], research: [] } },
  { id: 'rockFracturing', name: 'Technologie de fracturation des roches', description: "Ameliore les techniques d'extraction miniere, augmentant la capacite d'extraction des prospecteurs de 15% par niveau.", baseCostMinerai: 2000, baseCostSilicium: 4000, baseCostHydrogene: 1000, costFactor: 2, levelColumn: 'rockFracturing', categoryId: 'research_sciences', sortOrder: 9, flavorText: "Des ondes de choc calibrees fracturent la roche asteroidale, augmentant considerablement la quantite de minerai extraite par vos prospecteurs.", effectDescription: "Chaque niveau augmente la capacite d'extraction de tous les prospecteurs de 15%.", prerequisites: { buildings: [{ buildingId: 'missionCenter', level: 1 }], research: [{ researchId: 'combustion', level: 3 }] } },
  // NOTE: deepSpaceRefining has no bonus_definitions entry. Its reduction is multiplicative
  // (0.85^level), incompatible with resolveBonus's linear formula. Computed directly in pve.ts.
  { id: 'deepSpaceRefining', name: 'Raffinage en espace lointain', description: "Developpe des techniques de raffinage embarquees qui reduisent les scories lors de l'extraction miniere.", baseCostMinerai: 2000, baseCostSilicium: 4000, baseCostHydrogene: 1000, costFactor: 2, levelColumn: 'deepSpaceRefining', categoryId: 'research_sciences', sortOrder: 10, flavorText: "Des nanofiltres embarques separent les scories du minerai pur directement dans la soute du prospecteur, maximisant chaque voyage.", effectDescription: "Chaque niveau reduit les scories de 15% (multiplicatif). Niveau 15 : ~2.5% de scories restantes.", prerequisites: { buildings: [{ buildingId: 'missionCenter', level: 2 }], research: [{ researchId: 'rockFracturing', level: 2 }] } },
  { id: 'sensorNetwork', name: 'Réseau de capteurs', description: "Deploie un reseau de capteurs en espace profond pour detecter les flottes hostiles en approche. Plus le niveau est eleve, plus la detection est precoce et detaillee.", baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 10000, costFactor: 2, levelColumn: 'sensorNetwork', categoryId: 'research_combat', sortOrder: 11, flavorText: "Un maillage de balises furtives parseme l'espace autour de vos colonies, detectant toute perturbation gravitationnelle causee par une flotte en approche.", effectDescription: "Chaque niveau ameliore le delai et le detail de detection des attaques entrantes.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 6 }], research: [{ researchId: 'espionageTech', level: 3 }] } },
  { id: 'stealthTech', name: 'Technologie furtive', description: "Developpe des systemes de brouillage et d'occultation pour reduire la detectabilite de vos flottes d'attaque. Contrecarre le reseau de capteurs ennemi.", baseCostMinerai: 15000, baseCostSilicium: 15000, baseCostHydrogene: 10000, costFactor: 2, levelColumn: 'stealthTech', categoryId: 'research_combat', sortOrder: 12, flavorText: "Des generateurs de champ holographique et des absorbeurs d'ondes rendent vos flottes quasi-invisibles aux capteurs ennemis.", effectDescription: "Chaque niveau reduit l'efficacite du reseau de capteurs ennemi, retardant la detection et masquant les informations.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 6 }], research: [{ researchId: 'espionageTech', level: 3 }] } },
];

// ── Ship data (merged: ships + combat-stats + ship-stats) ──

const SHIPS = [
  // Industrial ships → shipyard
  { id: 'prospector', name: 'Prospecteur', description: "Vaisseau minier pour l'extraction de ressources.", costMinerai: 3000, costSilicium: 1000, costHydrogene: 500, countColumn: 'prospector', baseSpeed: 3000, fuelConsumption: 50, cargoCapacity: 750, driveType: 'combustion', weapons: 1, shield: 8, hull: 15, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', miningExtraction: 3000, categoryId: 'ship_utilitaire', sortOrder: 0, role: 'prospector', flavorText: "Le prospecteur est un vaisseau minier leger concu pour l'extraction de ressources sur les asteroides et planetes voisines.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [] } },
  { id: 'explorer', name: 'Explorateur', description: "Sonde d'exploration spatiale pour missions lointaines.", costMinerai: 1000, costSilicium: 250, costHydrogene: 0, countColumn: 'explorer', baseSpeed: 80000, fuelConsumption: 1, cargoCapacity: 100, driveType: 'combustion', weapons: 0, shield: 0, hull: 4, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 1, role: null, flavorText: "L'explorateur est un vaisseau rapide equipe de scanners avances pour cartographier les systemes stellaires inconnus.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [] } },
  { id: 'smallCargo', name: 'Petit transporteur', description: 'Transport léger de ressources.', costMinerai: 2000, costSilicium: 2000, costHydrogene: 0, countColumn: 'smallCargo', baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000, driveType: 'combustion', weapons: 1, shield: 8, hull: 12, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_transport', sortOrder: 2, role: null, flavorText: "Rapide et maniable, le petit transporteur est le cheval de trait de toute flotte commerciale.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [{ researchId: 'combustion', level: 2 }] } },
  { id: 'largeCargo', name: 'Grand transporteur', description: 'Transport lourd de ressources.', costMinerai: 6000, costSilicium: 6000, costHydrogene: 0, countColumn: 'largeCargo', baseSpeed: 7500, fuelConsumption: 50, cargoCapacity: 25000, driveType: 'combustion', weapons: 1, shield: 20, hull: 36, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_transport', sortOrder: 3, role: null, flavorText: "Avec sa soute massive, le grand transporteur peut deplacer d'enormes quantites de ressources en un seul voyage.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }] } },
  { id: 'espionageProbe', name: "Sonde d'espionnage", description: 'Sonde rapide pour espionner.', costMinerai: 0, costSilicium: 1000, costHydrogene: 0, countColumn: 'espionageProbe', baseSpeed: 100000000, fuelConsumption: 1, cargoCapacity: 0, driveType: 'combustion', weapons: 0, shield: 0, hull: 3, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 4, role: 'probe', flavorText: "Quasiment indetectable, la sonde d'espionnage collecte des renseignements precieux sur les planetes adverses.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 3 }], research: [{ researchId: 'combustion', level: 3 }, { researchId: 'espionageTech', level: 2 }] } },
  { id: 'colonyShip', name: 'Vaisseau de colonisation', description: 'Colonise de nouvelles planètes.', costMinerai: 10000, costSilicium: 20000, costHydrogene: 10000, countColumn: 'colonyShip', baseSpeed: 2500, fuelConsumption: 1000, cargoCapacity: 7500, driveType: 'impulse', weapons: 4, shield: 80, hull: 90, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 5, role: 'colonizer', flavorText: "Ce vaisseau transporte tout le necessaire pour etablir une nouvelle colonie sur une planete inhabitee.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'impulse', level: 3 }] } },
  { id: 'recycler', name: 'Recycleur', description: 'Collecte les champs de débris.', costMinerai: 10000, costSilicium: 6000, costHydrogene: 2000, countColumn: 'recycler', baseSpeed: 2000, fuelConsumption: 300, cargoCapacity: 20000, driveType: 'combustion', weapons: 1, shield: 8, hull: 48, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 6, role: 'recycler', flavorText: "Equipe de puissants aimants et de bras mecaniques, le recycleur collecte les debris des batailles spatiales.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }, { researchId: 'shielding', level: 2 }] } },
  { id: 'solarSatellite', name: 'Satellite solaire', description: "Produit de l'énergie en orbite. Ne peut pas être envoyé en mission.", costMinerai: 0, costSilicium: 2000, costHydrogene: 500, countColumn: 'solarSatellite', baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion', weapons: 1, shield: 1, hull: 6, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 7, role: 'stationary', flavorText: "En orbite stationnaire, les satellites solaires captent l'énergie stellaire et la transmettent aux installations planétaires. Plus la planète est proche de son étoile, plus ils sont efficaces.", isStationary: true, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [] } },
  // Military ships → commandCenter
  { id: 'interceptor', name: 'Intercepteur', description: 'Vaisseau de combat de base.', costMinerai: 3000, costSilicium: 1000, costHydrogene: 0, countColumn: 'interceptor', baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion', weapons: 4, shield: 8, hull: 12, baseArmor: 1, shotCount: 3, combatCategoryId: 'light', categoryId: 'ship_combat', sortOrder: 8, role: null, flavorText: "Le chasseur leger, pilier des premieres flottes, compense sa fragilite par son faible cout de production.", prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'frigate', name: 'Frégate', description: 'Vaisseau de combat amélioré.', costMinerai: 6000, costSilicium: 4000, costHydrogene: 0, countColumn: 'frigate', baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100, driveType: 'impulse', weapons: 12, shield: 16, hull: 30, baseArmor: 2, shotCount: 2, combatCategoryId: 'medium', categoryId: 'ship_combat', sortOrder: 9, role: null, flavorText: "Blindage renforce et armement superieur font du chasseur lourd un adversaire redoutable en combat rapproche.", prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 3 }], research: [{ researchId: 'armor', level: 2 }, { researchId: 'impulse', level: 2 }] } },
  { id: 'cruiser', name: 'Croiseur', description: 'Vaisseau de guerre polyvalent.', costMinerai: 20000, costSilicium: 7000, costHydrogene: 2000, countColumn: 'cruiser', baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse', weapons: 45, shield: 28, hull: 55, baseArmor: 4, shotCount: 1, combatCategoryId: 'heavy', categoryId: 'ship_combat', sortOrder: 10, role: null, flavorText: "Polyvalent et puissamment arme, le croiseur domine les escarmouches grace a son tir rapide devastateur.", prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 5 }], research: [{ researchId: 'impulse', level: 4 }, { researchId: 'weapons', level: 3 }] } },
  { id: 'battlecruiser', name: 'Cuirassé', description: 'Puissant navire de guerre.', costMinerai: 45000, costSilicium: 15000, costHydrogene: 0, countColumn: 'battlecruiser', baseSpeed: 10000, fuelConsumption: 500, cargoCapacity: 1500, driveType: 'hyperspaceDrive', weapons: 70, shield: 40, hull: 100, baseArmor: 6, shotCount: 1, combatCategoryId: 'heavy', categoryId: 'ship_combat', sortOrder: 11, role: null, flavorText: "Le vaisseau de bataille, colosse d'acier et de feu, est la piece maitresse de toute flotte d'invasion.", prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 7 }], research: [{ researchId: 'hyperspaceDrive', level: 4 }] } },
];

// ── Defense data (merged: defenses + combat-stats) ──

const DEFENSES = [
  { id: 'rocketLauncher', name: 'Lanceur de missiles', description: 'Défense de base, peu coûteuse.', costMinerai: 2000, costSilicium: 0, costHydrogene: 0, countColumn: 'rocketLauncher', weapons: 5, shield: 6, hull: 10, baseArmor: 1, shotCount: 2, combatCategoryId: 'light', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 0, flavorText: "Simple mais efficace, le lanceur de missiles constitue la premiere ligne de defense de toute planete.", prerequisites: { buildings: [{ buildingId: 'arsenal', level: 1 }], research: [] as { researchId: string; level: number }[] } },
  { id: 'lightLaser', name: 'Artillerie laser légère', description: 'Défense laser de base.', costMinerai: 1500, costSilicium: 500, costHydrogene: 0, countColumn: 'lightLaser', weapons: 7, shield: 8, hull: 12, baseArmor: 1, shotCount: 3, combatCategoryId: 'light', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 1, flavorText: "Le laser leger offre un excellent rapport cout-efficacite pour les defenses planetaires de base.", prerequisites: { buildings: [{ buildingId: 'arsenal', level: 2 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'heavyLaser', name: 'Artillerie laser lourde', description: 'Défense laser puissante.', costMinerai: 6000, costSilicium: 2000, costHydrogene: 0, countColumn: 'heavyLaser', weapons: 15, shield: 18, hull: 35, baseArmor: 3, shotCount: 2, combatCategoryId: 'medium', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 2, flavorText: "Concentrant une energie devastatrice, le laser lourd peut percer le blindage des vaisseaux moyens.", prerequisites: { buildings: [{ buildingId: 'arsenal', level: 4 }], research: [{ researchId: 'energyTech', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'electromagneticCannon', name: 'Canon électromagnétique', description: 'Défense balistique puissante.', costMinerai: 20000, costSilicium: 15000, costHydrogene: 2000, countColumn: 'electromagneticCannon', weapons: 50, shield: 30, hull: 60, baseArmor: 5, shotCount: 1, combatCategoryId: 'heavy', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 3, flavorText: "Propulsant des projectiles a une fraction de la vitesse de la lumiere, le canon de Gauss inflige des degats considerables.", prerequisites: { buildings: [{ buildingId: 'arsenal', level: 6 }], research: [{ researchId: 'energyTech', level: 6 }, { researchId: 'weapons', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'plasmaTurret', name: 'Artillerie à ions', description: 'Défense plasma dévastatrice.', costMinerai: 50000, costSilicium: 50000, costHydrogene: 30000, countColumn: 'plasmaTurret', weapons: 80, shield: 50, hull: 120, baseArmor: 7, shotCount: 1, combatCategoryId: 'heavy', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 4, flavorText: "La tourelle a plasma genere un flux de particules ionisees capable de vaporiser les blindages les plus epais.", prerequisites: { buildings: [{ buildingId: 'arsenal', level: 8 }], research: [{ researchId: 'energyTech', level: 8 }, { researchId: 'weapons', level: 7 }] } },
];

// ── Production config data ──

const PRODUCTION_CONFIG = [
  { id: 'mineraiMine', baseProduction: 30, exponentBase: 1.1, energyConsumption: 10, storageBase: null, tempCoeffA: null, tempCoeffB: null },
  { id: 'siliciumMine', baseProduction: 20, exponentBase: 1.1, energyConsumption: 10, storageBase: null, tempCoeffA: null, tempCoeffB: null },
  { id: 'hydrogeneSynth', baseProduction: 10, exponentBase: 1.1, energyConsumption: 20, storageBase: null, tempCoeffA: 1.36, tempCoeffB: 0.004 },
  { id: 'solarPlant', baseProduction: 20, exponentBase: 1.1, energyConsumption: null, storageBase: null, tempCoeffA: null, tempCoeffB: null },
  { id: 'storage', baseProduction: 5000, exponentBase: 1.1, energyConsumption: null, storageBase: 5000, tempCoeffA: null, tempCoeffB: null },
];

// ── Planet types data ──

const PLANET_TYPES = [
  { id: 'volcanic', name: 'Volcanique', description: 'Planète volcanique aux sols riches en silicium.', positions: [1, 2, 3], mineraiBonus: 1.0, siliciumBonus: 1.2, hydrogeneBonus: 0.7, diameterMin: 5800, diameterMax: 9800, sortOrder: 0, role: null },
  { id: 'arid', name: 'Aride', description: 'Planète aride riche en minerai.', positions: [4, 5, 6], mineraiBonus: 1.2, siliciumBonus: 1.1, hydrogeneBonus: 0.8, diameterMin: 9000, diameterMax: 13000, sortOrder: 1, role: null },
  { id: 'temperate', name: 'Tempérée', description: 'Planète équilibrée sans bonus ni malus.', positions: [7, 9], mineraiBonus: 1.0, siliciumBonus: 1.0, hydrogeneBonus: 1.0, diameterMin: 10000, diameterMax: 15600, sortOrder: 2, role: null },
  { id: 'glacial', name: 'Glaciale', description: "Planète glaciale propice à la synthèse d'hydrogène.", positions: [10, 11, 12], mineraiBonus: 0.8, siliciumBonus: 1.0, hydrogeneBonus: 1.3, diameterMin: 7500, diameterMax: 12200, sortOrder: 3, role: null },
  { id: 'gaseous', name: 'Gazeuse', description: "Géante gazeuse avec d'abondantes ressources en hydrogène.", positions: [13, 14, 15], mineraiBonus: 0.9, siliciumBonus: 0.9, hydrogeneBonus: 1.1, diameterMin: 8000, diameterMax: 14000, sortOrder: 4, role: null },
  { id: 'homeworld', name: 'Planète mère', description: 'Planète de départ neutre.', positions: [], mineraiBonus: 1.0, siliciumBonus: 1.0, hydrogeneBonus: 1.0, diameterMin: 12000, diameterMax: 12000, sortOrder: 5, role: 'homeworld' },
];

// ── Pirate templates data ──

const PIRATE_TEMPLATES = [
  // ── Easy tier ──
  {
    id: 'scout_patrol_easy',
    name: 'Patrouille pirate',
    tier: 'easy',
    ships: { interceptor: 5 },
    rewards: { minerai: 3000, silicium: 1500, hydrogene: 500, bonusShips: [] },
  },
  {
    id: 'raider_squad_easy',
    name: 'Escouade de pillards',
    tier: 'easy',
    ships: { interceptor: 4, frigate: 1 },
    rewards: { minerai: 5000, silicium: 2500, hydrogene: 1000, bonusShips: [] },
  },
  {
    id: 'smuggler_convoy_easy',
    name: 'Convoi de contrebandiers',
    tier: 'easy',
    ships: { interceptor: 3, smallCargo: 5 },
    rewards: { minerai: 6000, silicium: 4000, hydrogene: 1500, bonusShips: [] },
  },
  // ── Medium tier ──
  {
    id: 'reinforced_scouts_medium',
    name: 'Éclaireurs renforcés',
    tier: 'medium',
    ships: { interceptor: 4, frigate: 1 },
    rewards: {
      minerai: 10000, silicium: 5000, hydrogene: 2000,
      bonusShips: [{ shipId: 'interceptor', count: 2, chance: 0.3 }],
    },
  },
  {
    id: 'war_party_medium',
    name: 'Bande de guerre pirate',
    tier: 'medium',
    ships: { interceptor: 3, frigate: 1 },
    rewards: {
      minerai: 15000, silicium: 8000, hydrogene: 3000,
      bonusShips: [{ shipId: 'interceptor', count: 2, chance: 0.3 }],
    },
  },
  {
    id: 'shield_wall_medium',
    name: 'Mur de boucliers pirate',
    tier: 'medium',
    ships: { frigate: 8, cruiser: 1 },
    rewards: {
      minerai: 18000, silicium: 10000, hydrogene: 4000,
      bonusShips: [{ shipId: 'interceptor', count: 3, chance: 0.3 }],
    },
  },
  {
    id: 'swarm_medium',
    name: 'Essaim pirate',
    tier: 'medium',
    ships: { interceptor: 4, frigate: 1 },
    rewards: {
      minerai: 20000, silicium: 12000, hydrogene: 5000,
      bonusShips: [{ shipId: 'interceptor', count: 3, chance: 0.3 }],
    },
  },
  // ── Hard tier ──
  {
    id: 'battlegroup_hard',
    name: 'Groupe de combat pirate',
    tier: 'hard',
    ships: { frigate: 5, cruiser: 3, battlecruiser: 1 },
    rewards: {
      minerai: 50000, silicium: 30000, hydrogene: 15000,
      bonusShips: [{ shipId: 'cruiser', count: 1, chance: 0.2 }],
    },
  },
  {
    id: 'heavy_assault_hard',
    name: 'Assaut lourd pirate',
    tier: 'hard',
    ships: { cruiser: 2, battlecruiser: 1 },
    rewards: {
      minerai: 70000, silicium: 40000, hydrogene: 20000,
      bonusShips: [{ shipId: 'cruiser', count: 2, chance: 0.2 }],
    },
  },
  {
    id: 'pirate_armada_hard',
    name: 'Armada pirate',
    tier: 'hard',
    ships: { frigate: 4, cruiser: 3, battlecruiser: 2 },
    rewards: {
      minerai: 100000, silicium: 60000, hydrogene: 30000,
      bonusShips: [{ shipId: 'battlecruiser', count: 1, chance: 0.2 }],
    },
  },
];

// ── Tutorial quests data ──

const TUTORIAL_QUESTS = [
  { id: 'quest_1', order: 1, title: 'Premiers pas', narrativeText: "Commandant, bienvenue sur votre nouvelle colonie. Notre priorité est d'établir une extraction de minerai. Construisez votre première mine pour alimenter nos projets.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'mineraiMine', conditionTargetValue: 1, rewardMinerai: 100, rewardSilicium: 0, rewardHydrogene: 0 },
  { id: 'quest_2', order: 2, title: 'Fondations technologiques', narrativeText: "Excellent travail. Le silicium est essentiel pour toute technologie avancée. Lancez l'extraction de silicium sans tarder.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'siliciumMine', conditionTargetValue: 1, rewardMinerai: 0, rewardSilicium: 100, rewardHydrogene: 0 },
  { id: 'quest_3', order: 3, title: 'Alimenter la colonie', narrativeText: "Nos installations ont besoin d'énergie pour fonctionner. Une centrale solaire assurera l'alimentation de vos mines.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'solarPlant', conditionTargetValue: 1, rewardMinerai: 100, rewardSilicium: 75, rewardHydrogene: 0 },
  { id: 'quest_4', order: 4, title: 'Expansion minière', narrativeText: "Bien. Il est temps d'accélérer notre production. Montez votre mine de minerai au niveau 3 pour assurer un flux constant.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'mineraiMine', conditionTargetValue: 3, rewardMinerai: 200, rewardSilicium: 100, rewardHydrogene: 0 },
  { id: 'quest_5', order: 5, title: 'Équilibre énergétique', narrativeText: "La croissance exige de l'énergie. Améliorez votre centrale solaire au niveau 3 pour soutenir l'expansion.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'solarPlant', conditionTargetValue: 3, rewardMinerai: 250, rewardSilicium: 150, rewardHydrogene: 50 },
  { id: 'quest_6', order: 6, title: "L'automatisation", narrativeText: 'Les robots de construction accéléreront tous vos projets futurs. Construisez une usine de robots.', conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'robotics', conditionTargetValue: 1, rewardMinerai: 350, rewardSilicium: 200, rewardHydrogene: 150 },
  { id: 'quest_7', order: 7, title: 'La science avant tout', narrativeText: "La recherche est la clé du progrès. Construisez un laboratoire de recherche pour débloquer les technologies avancées.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'researchLab', conditionTargetValue: 1, rewardMinerai: 200, rewardSilicium: 400, rewardHydrogene: 200 },
  { id: 'quest_8', order: 8, title: 'Maîtrise énergétique', narrativeText: "Avant de concevoir des moteurs, nous devons maîtriser les fondamentaux de l'énergie. Recherchez la Technologie Énergie.", conditionType: 'research_level', conditionLabel: 'Niveau recherche', conditionTargetId: 'energyTech', conditionTargetValue: 1, rewardMinerai: 150, rewardSilicium: 350, rewardHydrogene: 200 },
  { id: 'quest_9', order: 9, title: 'Premiers moteurs', narrativeText: "Nos scientifiques peuvent désormais concevoir des moteurs à combustion. Cette propulsion sera essentielle pour nos futurs vaisseaux.", conditionType: 'research_level', conditionLabel: 'Niveau recherche', conditionTargetId: 'combustion', conditionTargetValue: 1, rewardMinerai: 400, rewardSilicium: 200, rewardHydrogene: 300 },
  { id: 'quest_10', order: 10, title: 'Le chantier spatial', narrativeText: "Commandant, il est temps de conquérir les étoiles. Un chantier spatial nous permettra de construire nos premiers vaisseaux.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'shipyard', conditionTargetValue: 1, rewardMinerai: 500, rewardSilicium: 300, rewardHydrogene: 150 },
  { id: 'quest_11', order: 11, title: 'Vaisseau amiral', narrativeText: "Commandant, votre chantier spatial a détecté un signal faible en provenance du secteur voisin. C'est un ancien vaisseau éclaireur, à la dérive depuis des décennies. Nos ingénieurs l'ont remorqué et remis en état. Ce sera votre vaisseau personnel -- votre amiral. Donnez-lui un nom.", conditionType: 'flagship_named', conditionLabel: 'Nommer le vaisseau', conditionTargetId: 'any', conditionTargetValue: 1, rewardMinerai: 600, rewardSilicium: 350, rewardHydrogene: 150 },
  { id: 'quest_12', order: 12, title: 'Cargaison abandonnée', narrativeText: "Nos scanners ont détecté un vaisseau de transport abandonné dans la ceinture d'astéroïdes en [{galaxy}:{system}:8]. Envoyez votre vaisseau amiral récupérer la cargaison !", conditionType: 'fleet_return', conditionLabel: 'Retour de flotte', conditionTargetId: 'any', conditionTargetValue: 1, rewardMinerai: 800, rewardSilicium: 450, rewardHydrogene: 200 },
  { id: 'quest_13', order: 13, title: 'Agrandir le chantier', narrativeText: "Pour construire des vaisseaux plus avancés, nous devons agrandir notre chantier spatial au niveau 2.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'shipyard', conditionTargetValue: 2, rewardMinerai: 1000, rewardSilicium: 500, rewardHydrogene: 200 },
  { id: 'quest_14', order: 14, title: 'Premier prospecteur', narrativeText: "Le Prospecteur est un vaisseau minier spécialisé. Construisez-en un pour exploiter les gisements d'astéroïdes.", conditionType: 'ship_count', conditionLabel: 'Nombre vaisseaux', conditionTargetId: 'prospector', conditionTargetValue: 1, rewardMinerai: 1200, rewardSilicium: 600, rewardHydrogene: 200 },
  { id: 'quest_15', order: 15, title: 'Première récolte', narrativeText: "Un gisement prometteur a été repéré en [{galaxy}:{system}:8]. Envoyez vos prospecteurs pour votre première extraction !", conditionType: 'mission_complete', conditionLabel: 'Mission complétée', conditionTargetId: 'mine', conditionTargetValue: 1, rewardMinerai: 1500, rewardSilicium: 700, rewardHydrogene: 250 },
  { id: 'quest_16', order: 16, title: 'Centre de missions', narrativeText: "Votre colonie est florissante. Un centre de missions vous permettra de détecter de nouvelles opportunités : gisements et menaces pirates.", conditionType: 'building_level', conditionLabel: 'Niveau bâtiment', conditionTargetId: 'missionCenter', conditionTargetValue: 1, rewardMinerai: 1800, rewardSilicium: 800, rewardHydrogene: 250 },
];

// ── Bonus definitions data ──

const BONUS_DEFINITIONS = [
  { id: 'robotics__building_time', sourceType: 'building', sourceId: 'robotics', stat: 'building_time', percentPerLevel: -15, category: null, statLabel: 'Temps de construction' },
  { id: 'researchLab__research_time', sourceType: 'building', sourceId: 'researchLab', stat: 'research_time', percentPerLevel: -15, category: null, statLabel: 'Temps de recherche' },
  { id: 'shipyard__ship_build_time__build_industrial', sourceType: 'building', sourceId: 'shipyard', stat: 'ship_build_time', percentPerLevel: -15, category: 'build_industrial', statLabel: 'Temps de construction des vaisseaux' },
  { id: 'arsenal__defense_build_time', sourceType: 'building', sourceId: 'arsenal', stat: 'defense_build_time', percentPerLevel: -15, category: null, statLabel: 'Temps de construction des défenses' },
  { id: 'commandCenter__ship_build_time__build_military', sourceType: 'building', sourceId: 'commandCenter', stat: 'ship_build_time', percentPerLevel: -15, category: 'build_military', statLabel: 'Temps de construction des vaisseaux' },
  { id: 'weapons__weapons', sourceType: 'research', sourceId: 'weapons', stat: 'weapons', percentPerLevel: 10, category: null, statLabel: 'Dégâts des armes' },
  { id: 'shielding__shielding', sourceType: 'research', sourceId: 'shielding', stat: 'shielding', percentPerLevel: 10, category: null, statLabel: 'Puissance des boucliers' },
  { id: 'armor__armor', sourceType: 'research', sourceId: 'armor', stat: 'armor', percentPerLevel: 10, category: null, statLabel: 'Résistance de la coque' },
  { id: 'combustion__ship_speed__combustion', sourceType: 'research', sourceId: 'combustion', stat: 'ship_speed', percentPerLevel: 10, category: 'combustion', statLabel: 'Vitesse des vaisseaux' },
  { id: 'impulse__ship_speed__impulse', sourceType: 'research', sourceId: 'impulse', stat: 'ship_speed', percentPerLevel: 20, category: 'impulse', statLabel: 'Vitesse des vaisseaux' },
  { id: 'hyperspaceDrive__ship_speed__hyperspaceDrive', sourceType: 'research', sourceId: 'hyperspaceDrive', stat: 'ship_speed', percentPerLevel: 30, category: 'hyperspaceDrive', statLabel: 'Vitesse des vaisseaux' },
  { id: 'rockFracturing__mining_extraction', sourceType: 'research', sourceId: 'rockFracturing', stat: 'mining_extraction', percentPerLevel: 15, category: null, statLabel: "Capacité d'extraction" },
  { id: 'computerTech__fleet_count', sourceType: 'research', sourceId: 'computerTech', stat: 'fleet_count', percentPerLevel: 100, category: null, statLabel: 'Flottes simultanées' },
  { id: 'espionageTech__spy_range', sourceType: 'research', sourceId: 'espionageTech', stat: 'spy_range', percentPerLevel: 100, category: null, statLabel: "Portée d'espionnage" },
  { id: 'energyTech__energy_production', sourceType: 'research', sourceId: 'energyTech', stat: 'energy_production', percentPerLevel: 2, category: null, statLabel: "Production d'énergie" },
];

// ── Mission definitions data ──

const MISSION_DEFINITIONS = [
  { id: 'transport', label: 'Transport', hint: 'Envoyez des ressources vers une planète alliée', buttonLabel: 'Envoyer', color: '#3b82f6', sortOrder: 1, dangerous: false, requiredShipRoles: null, exclusive: false, recommendedShipRoles: ['smallCargo', 'largeCargo'], requiresPveMission: false },
  { id: 'station', label: 'Stationner', hint: 'Stationnez votre flotte sur une planète alliée', buttonLabel: 'Envoyer', color: '#10b981', sortOrder: 2, dangerous: false, requiredShipRoles: null, exclusive: false, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'spy', label: 'Espionner', hint: "Envoyez des sondes d'espionnage", buttonLabel: 'Espionner', color: '#8b5cf6', sortOrder: 3, dangerous: false, requiredShipRoles: ['espionageProbe'], exclusive: true, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'attack', label: 'Attaque', hint: 'Attaquez une planète ennemie', buttonLabel: 'Attaquer', color: '#ef4444', sortOrder: 4, dangerous: true, requiredShipRoles: ['interceptor', 'frigate', 'cruiser', 'battlecruiser'], exclusive: false, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'colonize', label: 'Coloniser', hint: 'Colonisez une position vide', buttonLabel: 'Coloniser', color: '#f97316', sortOrder: 5, dangerous: true, requiredShipRoles: ['colonyShip'], exclusive: true, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'recycle', label: 'Recycler', hint: 'Récupérez les débris en orbite', buttonLabel: 'Recycler', color: '#06b6d4', sortOrder: 6, dangerous: false, requiredShipRoles: ['recycler'], exclusive: true, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'mine', label: 'Miner', hint: "Envoyez des prospecteurs sur une ceinture d'astéroïdes", buttonLabel: 'Envoyer', color: '#f59e0b', sortOrder: 7, dangerous: false, requiredShipRoles: ['prospector'], exclusive: false, recommendedShipRoles: null, requiresPveMission: true },
  { id: 'pirate', label: 'Pirate', hint: 'Attaquez un repaire pirate', buttonLabel: 'Attaquer', color: '#e11d48', sortOrder: 8, dangerous: true, requiredShipRoles: ['interceptor', 'frigate', 'cruiser', 'battlecruiser'], exclusive: false, recommendedShipRoles: null, requiresPveMission: true },
  {
    id: 'trade',
    label: 'Commerce',
    hint: 'Envoyez une flotte chercher des marchandises achetées sur le marché',
    buttonLabel: 'Commercer',
    color: '#a78bfa',
    sortOrder: 9,
    dangerous: false,
    requiredShipRoles: null,
    exclusive: false,
    recommendedShipRoles: ['smallCargo', 'largeCargo'],
    requiresPveMission: false,
  },
];

// ── UI labels data ──

const UI_LABELS = [
  // Propulsion
  { key: 'drive.combustion', label: 'Combustion' },
  { key: 'drive.impulse', label: 'Impulsion' },
  { key: 'drive.hyperspaceDrive', label: 'Hyperespace' },
  // Fleet phases
  { key: 'phase.outbound', label: 'En route' },
  { key: 'phase.prospecting', label: 'Prospection' },
  { key: 'phase.mining', label: 'Extraction' },
  { key: 'phase.return', label: 'Retour' },
  { key: 'phase.base', label: 'Base' },
  // PvE tiers
  { key: 'tier.easy', label: 'Facile' },
  { key: 'tier.medium', label: 'Moyen' },
  { key: 'tier.hard', label: 'Difficile' },
  // Event types
  { key: 'event.building-done', label: 'Construction' },
  { key: 'event.research-done', label: 'Recherche' },
  { key: 'event.shipyard-done', label: 'Chantier' },
  { key: 'event.fleet-arrived', label: 'Flotte arrivée' },
  { key: 'event.fleet-returned', label: 'Flotte de retour' },
  { key: 'event.pve-mission-done', label: 'Mission PvE' },
  { key: 'event.tutorial-quest-done', label: 'Tutoriel' },
  // Spy visibility
  { key: 'spy_visibility.resources', label: 'Ressources' },
  { key: 'spy_visibility.fleet', label: 'Flotte' },
  { key: 'spy_visibility.defenses', label: 'Défenses' },
  { key: 'spy_visibility.buildings', label: 'Bâtiments' },
  { key: 'spy_visibility.research', label: 'Recherches' },
  // Combat outcomes
  { key: 'outcome.attacker', label: 'Victoire' },
  { key: 'outcome.defender', label: 'Défaite' },
  { key: 'outcome.draw', label: 'Match nul' },
];

// ── Universe config data ──

const UNIVERSE_CONFIG = [
  // ── Existing keys (untouched) ──
  { key: 'name', value: 'Universe 1' },
  { key: 'speed', value: 1 },
  { key: 'galaxies', value: 9 },
  { key: 'systems', value: 499 },
  { key: 'positions', value: 16 },
  { key: 'maxPlanetsPerPlayer', value: 9 },
  { key: 'debrisRatio', value: 0.3 },
  { key: 'lootRatio', value: 0.5 },
  { key: 'startingMinerai', value: 500 },
  { key: 'startingSilicium', value: 300 },
  { key: 'startingHydrogene', value: 100 },
  { key: 'slag_rate', value: 0.5 },

  // ── Economy & general rules ──
  { key: 'cancel_refund_ratio', value: 0.7 },
  { key: 'belt_positions', value: [8, 16] },
  { key: 'homePlanetDiameter', value: 12000 },
  { key: 'home_planet_position_min', value: 4 },
  { key: 'home_planet_position_max', value: 12 },

  // ── Combat ──
  { key: 'combat_max_rounds', value: 4 },
  { key: 'combat_debris_ratio', value: 0.3 },
  { key: 'combat_defense_repair_rate', value: 0.7 },
  { key: 'combat_pillage_ratio', value: 0.33 },
  { key: 'combat_min_damage_per_hit', value: 1 },
  { key: 'combat_research_bonus_per_level', value: 0.1 },

  // ── PvE ──
  { key: 'pve_max_concurrent_missions', value: 3 },
  { key: 'pve_hydrogene_cap', value: 1500 },
  { key: 'pve_dismiss_cooldown_hours', value: 24 },
  { key: 'pve_mission_expiry_days', value: 7 },
  { key: 'pve_search_radius', value: 5 },
  { key: 'pve_tier_medium_unlock', value: 4 },
  { key: 'pve_tier_hard_unlock', value: 6 },
  { key: 'pve_deposit_variance_min', value: 0.6 },
  { key: 'pve_deposit_variance_max', value: 1.6 },

  // ── FP (Facteur de Puissance) ──
  { key: 'fp_shotcount_exponent', value: 1.5 },
  { key: 'fp_divisor', value: 100 },
  { key: 'pirate_fp_easy_min', value: 2 },
  { key: 'pirate_fp_easy_max', value: 5 },
  { key: 'pirate_fp_medium_min', value: 5 },
  { key: 'pirate_fp_medium_max', value: 12 },
  { key: 'pirate_fp_hard_min', value: 15 },
  { key: 'pirate_fp_hard_max', value: 30 },
  { key: 'pirate_fp_player_cap_ratio', value: 0.8 },

  // ── Fleet ──
  { key: 'fleet_distance_galaxy_factor', value: 20000 },
  { key: 'fleet_distance_system_base', value: 2700 },
  { key: 'fleet_distance_system_factor', value: 95 },
  { key: 'fleet_distance_position_base', value: 1000 },
  { key: 'fleet_distance_position_factor', value: 5 },
  { key: 'fleet_same_position_distance', value: 5 },
  { key: 'fleet_speed_factor', value: 35000 },

  // ── Formulas (consumed by SP3, created here) ──
  { key: 'pve_discovery_cooldown_base', value: 7 },
  { key: 'pve_deposit_size_base', value: 15000 },
  { key: 'spy_visibility_thresholds', value: [1, 3, 5, 7, 9] },
  { key: 'ranking_points_divisor', value: 1000 },
  { key: 'shipyard_time_divisor', value: 2500 },
  { key: 'research_time_divisor', value: 1000 },
  { key: 'storage_base', value: 5000 },
  { key: 'storage_coeff_a', value: 2.5 },
  { key: 'storage_coeff_b', value: 20 },
  { key: 'storage_coeff_c', value: 33 },
  { key: 'satellite_home_planet_energy', value: 50 },
  { key: 'satellite_base_divisor', value: 4 },
  { key: 'satellite_base_offset', value: 20 },
  { key: 'phase_multiplier', value: {"1":0.35,"2":0.45,"3":0.55,"4":0.65,"5":0.78,"6":0.90,"7":0.95} },

  // ── Market ──
  { key: 'market_commission_percent', value: 5, label: 'Commission du marché galactique (%)' },
  { key: 'market_offer_duration_hours', value: 48, label: 'Durée de vie des offres du marché (heures)' },
  { key: 'market_reservation_minutes', value: 60, label: 'Temps de réservation avant expiration (minutes)' },

  // ── Exilium ──
  { key: 'exilium_daily_quest_reward', value: 1 },
  { key: 'exilium_drop_amount', value: 1 },
  { key: 'exilium_drop_rate_expedition', value: 0.05 },
  { key: 'exilium_drop_rate_pvp', value: 0.03 },
  { key: 'exilium_drop_rate_pve', value: 0.04 },
  { key: 'exilium_drop_rate_market', value: 0.02 },
  { key: 'exilium_drop_rate_recycling', value: 0.02 },

  // ── Flagship ──
  { key: 'flagship_repair_duration_seconds', value: 7200 },
  { key: 'flagship_instant_repair_exilium_cost', value: 2 },

  // ── Daily Quests ──
  { key: 'daily_quest_count', value: 3 },
  { key: 'daily_quest_miner_threshold', value: 5000 },

  // ── Talent Tree ──
  { key: 'talent_cost_tier_1', value: 1 },
  { key: 'talent_cost_tier_2', value: 2 },
  { key: 'talent_cost_tier_3', value: 3 },
  { key: 'talent_cost_tier_4', value: 4 },
  { key: 'talent_cost_tier_5', value: 5 },
  { key: 'talent_tier_2_threshold', value: 5 },
  { key: 'talent_tier_3_threshold', value: 10 },
  { key: 'talent_tier_4_threshold', value: 15 },
  { key: 'talent_tier_5_threshold', value: 20 },
  { key: 'talent_respec_ratio', value: 0 },       // TODO: remettre à 0.5 quand les talents seront finalisés
  { key: 'talent_full_reset_cost', value: 0 },    // TODO: remettre à 50 quand les talents seront finalisés
];

// ── Talent Branches ──

const TALENT_BRANCHES = [
  { id: 'combattant', name: 'Combattant', description: 'Puissance de feu & domination militaire', color: '#ff6b6b', sortOrder: 0 },
  { id: 'explorateur', name: 'Explorateur', description: 'Vitesse, mobilité & découverte', color: '#4ecdc4', sortOrder: 1 },
  { id: 'negociant', name: 'Négociant', description: 'Cargo, commerce & économie', color: '#ffd93d', sortOrder: 2 },
];

// ── Talent Definitions ──

const TALENT_DEFINITIONS = [
  // === COMBATTANT ===
  // Tier 1
  { id: 'combat_weapons', branchId: 'combattant', tier: 1, position: 'left', name: 'Armes renforcées', description: '+2 armes par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'weapons', perRank: 2 }, sortOrder: 0 },
  { id: 'combat_armor', branchId: 'combattant', tier: 1, position: 'center', name: 'Blindage réactif', description: '+2 blindage par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'baseArmor', perRank: 2 }, sortOrder: 1 },
  { id: 'combat_shield', branchId: 'combattant', tier: 1, position: 'right', name: 'Boucliers amplifiés', description: '+3 bouclier par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'shield', perRank: 3 }, sortOrder: 2 },
  // Tier 2
  { id: 'combat_shots', branchId: 'combattant', tier: 2, position: 'left', name: 'Tirs multiples', description: '+1 tir par rang', maxRanks: 2, prerequisiteId: 'combat_weapons', effectType: 'modify_stat', effectParams: { stat: 'shotCount', perRank: 1 }, sortOrder: 3 },
  { id: 'combat_war_march', branchId: 'combattant', tier: 2, position: 'center', name: 'Marche de guerre', description: '+1 vaisseau militaire en construction simultanée', maxRanks: 1, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'military_parallel_build', perRank: 1 }, sortOrder: 4 },
  { id: 'combat_hull', branchId: 'combattant', tier: 2, position: 'right', name: 'Coque renforcée', description: '+5 coque par rang', maxRanks: 3, prerequisiteId: 'combat_shield', effectType: 'modify_stat', effectParams: { stat: 'hull', perRank: 5 }, sortOrder: 5 },
  // Tier 3
  { id: 'combat_garrison', branchId: 'combattant', tier: 3, position: 'left', name: 'Garnison', description: '+10% défense planétaire par rang', maxRanks: 2, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'defense_strength', perRank: 0.10 }, sortOrder: 6 },
  { id: 'combat_assault', branchId: 'combattant', tier: 3, position: 'center', name: 'Assaut coordonné', description: '+25% dégâts des flottes depuis cette planète pendant 1h', maxRanks: 1, prerequisiteId: null, effectType: 'timed_buff', effectParams: { key: 'fleet_damage_boost', multiplier: 1.25, durationSeconds: 3600, cooldownSeconds: 86400 }, sortOrder: 7 },
  { id: 'combat_fury', branchId: 'combattant', tier: 3, position: 'right', name: 'Furie', description: 'x1.25 dégâts du flagship par rang', maxRanks: 2, prerequisiteId: 'combat_shots', effectType: 'modify_stat', effectParams: { stat: 'damageMultiplier', perRank: 0.25 }, sortOrder: 8 },
  // Tier 4
  { id: 'combat_master', branchId: 'combattant', tier: 4, position: 'left', name: "Maître d'armes", description: '-15% temps de construction vaisseaux militaires', maxRanks: 1, prerequisiteId: 'combat_garrison', effectType: 'global_bonus', effectParams: { key: 'ship_build_time', perRank: 0.15 }, sortOrder: 9 },
  { id: 'combat_arsenal', branchId: 'combattant', tier: 4, position: 'right', name: 'Arsenal avancé', description: '+20% puissance des défenses planétaires', maxRanks: 1, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'defense_strength', perRank: 0.20 }, sortOrder: 10 },
  // Tier 5 — Capstone
  { id: 'combat_supremacy', branchId: 'combattant', tier: 5, position: 'center', name: 'Suprématie', description: '+10% stats combat du flagship par type de vaisseau différent dans la flotte', maxRanks: 1, prerequisiteId: 'combat_master', effectType: 'modify_stat', effectParams: { stat: 'combatBonusPerShipType', perRank: 0.10 }, sortOrder: 11 },

  // === EXPLORATEUR ===
  // Tier 1
  { id: 'explore_speed', branchId: 'explorateur', tier: 1, position: 'left', name: 'Réacteurs optimisés', description: '+10% vitesse flagship par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'speedPercent', perRank: 0.10 }, sortOrder: 0 },
  { id: 'explore_fuel', branchId: 'explorateur', tier: 1, position: 'center', name: 'Économiseur', description: '-1 consommation carburant par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'fuelConsumption', perRank: -1 }, sortOrder: 1 },
  { id: 'explore_scanners', branchId: 'explorateur', tier: 1, position: 'right', name: 'Scanners longue portée', description: '+1 sonde d\'espionnage par rang', maxRanks: 2, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'spy_probe_bonus', perRank: 1 }, sortOrder: 2 },
  // Tier 2
  { id: 'explore_impulse', branchId: 'explorateur', tier: 2, position: 'left', name: 'Propulsion impulsion', description: 'Change la propulsion du flagship en impulsion', maxRanks: 1, prerequisiteId: 'explore_speed', effectType: 'unlock', effectParams: { key: 'drive_impulse' }, sortOrder: 3 },
  { id: 'explore_navigation', branchId: 'explorateur', tier: 2, position: 'center', name: 'Navigation stellaire', description: '-5% temps de trajet toutes flottes par rang', maxRanks: 3, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'fleet_speed', perRank: 0.05 }, sortOrder: 4 },
  { id: 'explore_control', branchId: 'explorateur', tier: 2, position: 'right', name: 'Centre de contrôle', description: '+1 slot flotte depuis cette planète', maxRanks: 1, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'fleet_slot_bonus', perRank: 1 }, sortOrder: 5 },
  // Tier 3
  { id: 'explore_cartographer', branchId: 'explorateur', tier: 3, position: 'left', name: 'Cartographe', description: '+10% réussite expéditions par rang', maxRanks: 2, prerequisiteId: 'explore_impulse', effectType: 'global_bonus', effectParams: { key: 'expedition_success_bonus', perRank: 0.10 }, sortOrder: 6 },
  { id: 'explore_hyperscan', branchId: 'explorateur', tier: 3, position: 'center', name: 'Hyperscan', description: 'Révèle les flottes en approche pendant 4h', maxRanks: 1, prerequisiteId: null, effectType: 'timed_buff', effectParams: { key: 'reveal_incoming_fleets', multiplier: 1, durationSeconds: 14400, cooldownSeconds: 43200 }, sortOrder: 7 },
  { id: 'explore_scout', branchId: 'explorateur', tier: 3, position: 'right', name: 'Éclaireur', description: '+1 slot de flotte global', maxRanks: 1, prerequisiteId: 'explore_control', effectType: 'global_bonus', effectParams: { key: 'fleet_slot_global', perRank: 1 }, sortOrder: 8 },
  // Tier 4
  { id: 'explore_hyperdrive', branchId: 'explorateur', tier: 4, position: 'left', name: 'Hyperdrive', description: 'Change la propulsion en hyperespace', maxRanks: 1, prerequisiteId: 'explore_cartographer', effectType: 'unlock', effectParams: { key: 'drive_hyperspace' }, sortOrder: 9 },
  { id: 'explore_emergency', branchId: 'explorateur', tier: 4, position: 'right', name: "Saut d'urgence", description: 'Rappel instantané d\'une flotte en cours', maxRanks: 1, prerequisiteId: null, effectType: 'timed_buff', effectParams: { key: 'instant_fleet_recall', multiplier: 1, durationSeconds: 1, cooldownSeconds: 86400 }, sortOrder: 10 },
  // Tier 5 — Capstone
  { id: 'explore_legendary', branchId: 'explorateur', tier: 5, position: 'center', name: 'Navigateur légendaire', description: 'Toutes les flottes partant de la planète du flagship +15% vitesse', maxRanks: 1, prerequisiteId: 'explore_hyperdrive', effectType: 'planet_bonus', effectParams: { key: 'fleet_speed', perRank: 0.15 }, sortOrder: 11 },

  // === NEGOCIANT ===
  // Tier 1
  { id: 'trade_cargo', branchId: 'negociant', tier: 1, position: 'left', name: 'Soute étendue', description: '+100 cargo flagship par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'cargoCapacity', perRank: 100 }, sortOrder: 0 },
  { id: 'trade_negotiator', branchId: 'negociant', tier: 1, position: 'center', name: 'Négociateur', description: '-5% frais marché par rang', maxRanks: 2, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'market_fee_reduction', perRank: 0.05 }, sortOrder: 1 },
  { id: 'trade_logistics', branchId: 'negociant', tier: 1, position: 'right', name: 'Logisticien', description: '+5% capacité stockage par rang', maxRanks: 3, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'storage_capacity_bonus', perRank: 0.05 }, sortOrder: 2 },
  // Tier 2
  { id: 'trade_armored', branchId: 'negociant', tier: 2, position: 'left', name: 'Convoi blindé', description: '+5 coque flagship par rang', maxRanks: 2, prerequisiteId: 'trade_cargo', effectType: 'modify_stat', effectParams: { stat: 'hull', perRank: 5 }, sortOrder: 3 },
  { id: 'trade_network', branchId: 'negociant', tier: 2, position: 'center', name: 'Réseau commercial', description: '+1 offre simultanée marché', maxRanks: 1, prerequisiteId: 'trade_negotiator', effectType: 'global_bonus', effectParams: { key: 'market_offer_slots', perRank: 1 }, sortOrder: 4 },
  { id: 'trade_prospector', branchId: 'negociant', tier: 2, position: 'right', name: 'Prospecteur', description: '+3% production mines par rang', maxRanks: 3, prerequisiteId: 'trade_logistics', effectType: 'planet_bonus', effectParams: { key: 'mine_production_bonus', perRank: 0.03 }, sortOrder: 5 },
  // Tier 3
  { id: 'trade_smuggler', branchId: 'negociant', tier: 3, position: 'left', name: 'Contrebandier', description: '30% du cargo de toutes les flottes protégé du pillage', maxRanks: 1, prerequisiteId: 'trade_armored', effectType: 'global_bonus', effectParams: { key: 'pillage_protection', perRank: 0.30 }, sortOrder: 6 },
  { id: 'trade_overclock', branchId: 'negociant', tier: 3, position: 'center', name: 'Overclock minier', description: '+50% production mines pendant 2h', maxRanks: 1, prerequisiteId: 'trade_prospector', effectType: 'timed_buff', effectParams: { key: 'mine_overclock', multiplier: 1.5, durationSeconds: 7200, cooldownSeconds: 86400 }, sortOrder: 7 },
  { id: 'trade_hangars', branchId: 'negociant', tier: 3, position: 'right', name: 'Maître des hangars', description: '+10% cargo toutes flottes par rang', maxRanks: 2, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'fleet_cargo', perRank: 0.10 }, sortOrder: 8 },
  // Tier 4
  { id: 'trade_boom', branchId: 'negociant', tier: 4, position: 'left', name: 'Boom économique', description: '+25% production ressources planète pendant 4h', maxRanks: 1, prerequisiteId: 'trade_overclock', effectType: 'timed_buff', effectParams: { key: 'resource_production_boost', multiplier: 1.25, durationSeconds: 14400, cooldownSeconds: 172800 }, sortOrder: 9 },
  { id: 'trade_mogul', branchId: 'negociant', tier: 4, position: 'right', name: 'Magnat', description: 'Transactions marché sans frais', maxRanks: 1, prerequisiteId: 'trade_network', effectType: 'global_bonus', effectParams: { key: 'market_fee_reduction', perRank: 1.0 }, sortOrder: 10 },
  // Tier 5 — Capstone
  { id: 'trade_empire', branchId: 'negociant', tier: 5, position: 'center', name: 'Empire commercial', description: '+5% production ressources sur toutes les planètes', maxRanks: 1, prerequisiteId: 'trade_boom', effectType: 'global_bonus', effectParams: { key: 'global_production_bonus', perRank: 0.05 }, sortOrder: 11 },
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
    const { prerequisites: _prereqs, ...row } = b;
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

  // 2b. Bonus definitions (upsert)
  for (const bd of BONUS_DEFINITIONS) {
    const { id: _id, ...bdData } = bd;
    await db.insert(bonusDefinitions).values(bd)
      .onConflictDoUpdate({ target: bonusDefinitions.id, set: bdData });
  }
  console.log(`  ✓ ${BONUS_DEFINITIONS.length} bonus definitions`);

  // 3. Research definitions
  for (const r of RESEARCH) {
    const { prerequisites: _prereqs, ...row } = r;
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

  // 5. Ship definitions — cleanup old renamed IDs
  const OLD_SHIP_IDS = ['lightFighter', 'heavyFighter', 'battleship'];
  const OLD_DEFENSE_IDS = ['gaussCannon', 'smallShield', 'largeShield'];
  await db.delete(shipPrerequisites).where(sql`ship_id IN (${sql.join(OLD_SHIP_IDS.map(id => sql`${id}`), sql`, `)})`);
  await db.delete(shipDefinitions).where(sql`id IN (${sql.join(OLD_SHIP_IDS.map(id => sql`${id}`), sql`, `)})`);
  await db.delete(defensePrerequisites).where(sql`defense_id IN (${sql.join(OLD_DEFENSE_IDS.map(id => sql`${id}`), sql`, `)})`);
  await db.delete(defenseDefinitions).where(sql`id IN (${sql.join(OLD_DEFENSE_IDS.map(id => sql`${id}`), sql`, `)})`);

  for (const s of SHIPS) {
    const { prerequisites: _prereqs, ...row } = s;
    const values = { isStationary: false, ...row };
    await db.insert(shipDefinitions).values(values)
      .onConflictDoUpdate({ target: shipDefinitions.id, set: values });
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
    const { prerequisites: _prereqs, ...row } = d;
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

  // 9. Production config
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

  // 13. Pirate templates
  for (const pt of PIRATE_TEMPLATES) {
    const { id: _id, ...ptData } = pt;
    await db.insert(pirateTemplates).values(pt)
      .onConflictDoUpdate({ target: pirateTemplates.id, set: ptData });
  }
  console.log(`  ✓ ${PIRATE_TEMPLATES.length} pirate templates`);

  // 14b. Mission definitions
  for (const m of MISSION_DEFINITIONS) {
    const { id: _id, ...mData } = m;
    await db.insert(missionDefinitions).values(m)
      .onConflictDoUpdate({ target: missionDefinitions.id, set: mData });
  }
  console.log(`  ✓ ${MISSION_DEFINITIONS.length} mission definitions`);

  // 14c. UI labels
  for (const l of UI_LABELS) {
    const { key: _key, ...lData } = l;
    await db.insert(uiLabels).values(l)
      .onConflictDoUpdate({ target: uiLabels.key, set: lData });
  }
  console.log(`  ✓ ${UI_LABELS.length} UI labels`);

  // 14. Tutorial quest definitions
  for (const tq of TUTORIAL_QUESTS) {
    const { id: _id, ...tqData } = tq;
    await db.insert(tutorialQuestDefinitions).values(tq)
      .onConflictDoUpdate({ target: tutorialQuestDefinitions.id, set: tqData });
  }
  console.log(`  ✓ ${TUTORIAL_QUESTS.length} tutorial quest definitions`);

  // 15. Migrate existing planets: set homeworld type on first planet of each user
  await db.execute(sql`
    UPDATE planets SET planet_class_id = 'homeworld'
    WHERE planet_class_id IS NULL
    AND id IN (
      SELECT DISTINCT ON (user_id) id
      FROM planets
      ORDER BY user_id, created_at ASC
    )
  `);
  console.log(`  ✓ Migrated home planets to homeworld type`);

  // 16. Talent branches
  await db.delete(talentDefinitions);
  await db.delete(talentBranchDefinitions);
  await db.insert(talentBranchDefinitions).values(TALENT_BRANCHES);
  console.log(`  ✓ ${TALENT_BRANCHES.length} talent branches`);

  // 17. Talent definitions
  await db.insert(talentDefinitions).values(TALENT_DEFINITIONS);
  console.log(`  ✓ ${TALENT_DEFINITIONS.length} talent definitions`);

  console.log('Seed complete!');
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
