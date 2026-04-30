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
import { biomeDefinitions } from './schema/biomes.js';
import { tutorialQuestDefinitions } from './schema/tutorial-quest-definitions.js';
import { tutorialChapters } from './schema/tutorial-chapters.js';
import { missionDefinitions } from './schema/mission-definitions.js';
import { uiLabels } from './schema/ui-labels.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://exilium:exilium@localhost:5432/exilium';
const client = postgres(DATABASE_URL);
const db = drizzle(client);

// ── Entity Categories ──

const CATEGORIES = [
  // Buildings
  { id: 'building_extraction', entityType: 'building', name: 'Extraction', sortOrder: 0 },
  { id: 'building_energie', entityType: 'building', name: 'Énergie', sortOrder: 1 },
  { id: 'building_industrie', entityType: 'building', name: 'Industrie', sortOrder: 2 },
  { id: 'building_stockage', entityType: 'building', name: 'Stockage', sortOrder: 3 },
  { id: 'building_recherche', entityType: 'building', name: 'Recherche', sortOrder: 4 },
  { id: 'building_militaire', entityType: 'building', name: 'Militaire', sortOrder: 5 },
  { id: 'building_exploration', entityType: 'building', name: 'Exploration', sortOrder: 6 },
  { id: 'building_commerce', entityType: 'building', name: 'Commerce', sortOrder: 7 },
  { id: 'building_defense', entityType: 'building', name: 'Défense', sortOrder: 8 },
  { id: 'building_gouvernance', entityType: 'building', name: 'Gouvernance', sortOrder: 9 },
  // Research
  { id: 'research_propulsion', entityType: 'research', name: 'Propulsion', sortOrder: 0 },
  { id: 'research_combat', entityType: 'research', name: 'Combat', sortOrder: 1 },
  { id: 'research_sciences', entityType: 'research', name: 'Sciences', sortOrder: 2 },
  { id: 'research_defense', entityType: 'research', name: 'Défense', sortOrder: 3 },
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
  { id: 'mineraiMine', name: 'Mine de minerai', description: 'Produit du minerai, ressource de base.', baseCostMinerai: 60, baseCostSilicium: 15, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 45, categoryId: 'building_extraction', sortOrder: 0, role: 'producer_minerai', flavorText: "Creusant profondement dans la croute planetaire, les foreuses extractrices de minerai constituent la colonne vertebrale de toute economie spatiale.", prerequisites: [] as { buildingId: string; level: number }[], variantPlanetTypes: ['arid', 'gaseous', 'glacial', 'temperate', 'volcanic'] },
  { id: 'siliciumMine', name: 'Mine de silicium', description: 'Produit du silicium.', baseCostMinerai: 48, baseCostSilicium: 24, baseCostHydrogene: 0, costFactor: 1.6, baseTime: 45, categoryId: 'building_extraction', sortOrder: 1, role: 'producer_silicium', flavorText: "Les gisements de silicium, formes sous des pressions immenses, alimentent l'ensemble des technologies avancees de la galaxie.", prerequisites: [], variantPlanetTypes: ['arid', 'gaseous', 'glacial', 'temperate', 'volcanic'] },
  { id: 'hydrogeneSynth', name: "Synthétiseur d'hydrogène", description: "Produit de l'hydrogène.", baseCostMinerai: 225, baseCostSilicium: 75, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 45, categoryId: 'building_extraction', sortOrder: 2, role: 'producer_hydrogene', flavorText: "L'hydrogene, element fondamental de l'univers, est extrait des oceans planetaires par un processus de filtration moleculaire.", prerequisites: [], variantPlanetTypes: ['arid', 'gaseous', 'glacial', 'temperate', 'volcanic'] },
  { id: 'solarPlant', name: 'Centrale solaire', description: "Produit de l'énergie.", baseCostMinerai: 75, baseCostSilicium: 30, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 45, categoryId: 'building_energie', sortOrder: 0, role: 'producer_energy', flavorText: "D'immenses panneaux photovoltaiques captent l'energie de l'etoile la plus proche pour alimenter l'ensemble des infrastructures planetaires.", prerequisites: [], variantPlanetTypes: ['arid', 'gaseous', 'glacial', 'temperate', 'volcanic'] },
  { id: 'robotics', name: 'Usine de robots', description: 'Réduit le temps de construction des bâtiments.', baseCostMinerai: 400, baseCostSilicium: 120, baseCostHydrogene: 200, costFactor: 2, baseTime: 60, categoryId: 'building_industrie', sortOrder: 0, role: null, flavorText: "Les chaines de montage automatisees accelerent la construction de tous les batiments et infrastructures.", prerequisites: [] },
  { id: 'shipyard', name: 'Chantier spatial', description: 'Débloque et construit les vaisseaux industriels.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_industrie', sortOrder: 1, role: null, flavorText: "Le chantier spatial assemble les vaisseaux industriels necessaires a l'expansion de votre empire.", prerequisites: [{ buildingId: 'robotics', level: 1 }] },
  { id: 'arsenal', name: 'Arsenal planétaire', description: 'Débloque et construit les défenses planétaires.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_militaire', sortOrder: 0, role: null, flavorText: "L'arsenal planetaire fabrique les systemes de defense qui protegent vos installations contre les attaques ennemies.", prerequisites: [{ buildingId: 'robotics', level: 2 }] },
  { id: 'commandCenter', name: 'Centre de commandement', description: 'Débloque et construit les vaisseaux militaires.', baseCostMinerai: 400, baseCostSilicium: 200, baseCostHydrogene: 100, costFactor: 2, baseTime: 60, categoryId: 'building_militaire', sortOrder: 1, role: null, flavorText: "Le centre de commandement coordonne la construction des vaisseaux militaires les plus puissants de votre flotte.", prerequisites: [{ buildingId: 'robotics', level: 4 }, { buildingId: 'shipyard', level: 2 }] },
  { id: 'researchLab', name: 'Laboratoire de recherche', description: 'Permet les recherches.', baseCostMinerai: 200, baseCostSilicium: 400, baseCostHydrogene: 200, costFactor: 2, baseTime: 60, categoryId: 'building_recherche', sortOrder: 0, role: null, flavorText: "Au coeur de ce laboratoire, les meilleurs scientifiques de l'empire repoussent les frontieres de la connaissance.", prerequisites: [], allowedPlanetTypes: ['homeworld'] },
  { id: 'storageMinerai', name: 'Entrepôt de minerai', description: 'Augmente le stockage de minerai.', baseCostMinerai: 1000, baseCostSilicium: 0, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 0, role: 'storage_minerai', flavorText: "De vastes entrepots blindes permettent de stocker des quantites croissantes de minerai en toute securite.", prerequisites: [] },
  { id: 'storageSilicium', name: 'Entrepôt de silicium', description: 'Augmente le stockage de silicium.', baseCostMinerai: 1000, baseCostSilicium: 500, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 1, role: 'storage_silicium', flavorText: "Ces chambres a environnement controle preservent le silicium dans des conditions optimales.", prerequisites: [] },
  { id: 'storageHydrogene', name: "Réservoir d'hydrogène", description: "Augmente le stockage d'hydrogène.", baseCostMinerai: 1000, baseCostSilicium: 1000, baseCostHydrogene: 0, costFactor: 2, baseTime: 60, categoryId: 'building_stockage', sortOrder: 2, role: 'storage_hydrogene', flavorText: "Des reservoirs cryogeniques haute pression maintiennent l'hydrogene a l'etat liquide pour un stockage maximal.", prerequisites: [] },
  { id: 'missionCenter', name: 'Centre de missions', description: "Découvre des gisements miniers toutes les 6h (−1h/niveau, min 1h). Détecte aussi les menaces pirates. Bâtiment principal sur la planète mère.", baseCostMinerai: 5000, baseCostSilicium: 3000, baseCostHydrogene: 1000, costFactor: 1.8, baseTime: 300, categoryId: 'building_exploration', sortOrder: 0, role: 'mission_center', flavorText: "Centre névralgique des opérations exterieures de l'empire, le centre de missions scanne en permanence les ceintures d'astéroïdes à la recherche de gisements exploitables. Chaque amélioration accélère la fréquence des découvertes et la taille des gisements détectés. Construit uniquement sur la planète mère, il pilote l'ensemble des relais déployés sur les colonies.", prerequisites: [{ buildingId: 'shipyard', level: 2 }], allowedPlanetTypes: ['homeworld'] },
  { id: 'missionRelay', name: 'Relais de missions', description: "Avant-poste de coordination construit sur les colonies. Augmente les récompenses des missions PvE selon le biome de la colonie : volcanique → minerai, aride → silicium, gazeuse → hydrogène, tempérée → toutes ressources, glaciale → butin pirate. Bonus de diversité : +5% sur tous les bonus relais par biome distinct couvert (jusqu'à +25% si les 5 biomes ont au moins un relais).", baseCostMinerai: 2500, baseCostSilicium: 1500, baseCostHydrogene: 500, costFactor: 1.6, baseTime: 240, categoryId: 'building_exploration', sortOrder: 1, role: null, flavorText: "Chaque relais analyse les ressources spécifiques de son biome pour optimiser le butin rapporté par vos flottes. Cumulez les niveaux pour pousser un axe au maximum, ou diversifiez les biomes pour bénéficier d'un bonus de coordination empire-wide.", prerequisites: [{ buildingId: 'missionCenter', level: 2 }], allowedPlanetTypes: ['volcanic', 'arid', 'temperate', 'glacial', 'gaseous'], variantPlanetTypes: ['arid', 'gaseous', 'glacial', 'temperate', 'volcanic'] },
  {
    id: 'galacticMarket',
    name: 'Marché Galactique',
    description: 'Permet les échanges de ressources avec les autres joueurs de l\'univers.',
    baseCostMinerai: 5000,
    baseCostSilicium: 5000,
    baseCostHydrogene: 1000,
    costFactor: 1.5,
    baseTime: 120,
    categoryId: 'building_commerce',
    sortOrder: 0,
    role: 'market',
    flavorText: 'Le marché galactique met en relation acheteurs et vendeurs à travers l\'univers.',
    prerequisites: [{ buildingId: 'shipyard', level: 2 }],
  },
  { id: 'planetaryShield', name: 'Bouclier planétaire', description: "Génère un champ de force protégeant la planète. Sa puissance est réglable pour économiser l'énergie. La recherche Blindage augmente sa capacité en combat.", baseCostMinerai: 2000, baseCostSilicium: 2000, baseCostHydrogene: 0, costFactor: 1.5, baseTime: 7200, categoryId: 'building_defense', sortOrder: 0, role: 'planetaryShield', flavorText: "Un dôme d'énergie pure enveloppe la planète. En combat, le bouclier est indestructible et se régénère à chaque round. Il ne protège pas votre flotte, mais tant qu'il n'est pas percé, vos défenses planétaires sont intouchables. Sa puissance est réglable dans les paramètres d'énergie.", prerequisites: [] as { buildingId: string; level: number }[], variantPlanetTypes: ['arid', 'gaseous', 'glacial', 'volcanic'] },
  { id: 'labVolcanic', name: 'Forge Volcanique', description: "Annexe de recherche specialisee dans les technologies offensives, exploitant la chaleur extreme du volcanisme.", baseCostMinerai: 8000, baseCostSilicium: 16000, baseCostHydrogene: 8000, costFactor: 2, baseTime: 3600, categoryId: 'building_recherche', sortOrder: 1, role: null, flavorText: "Au coeur des coulees de lave, les forges volcaniques exploitent des temperatures impossibles a reproduire artificiellement pour developper des armes devastatrices.", prerequisites: [{ buildingId: 'researchLab', level: 6 }], allowedPlanetTypes: ['volcanic'] },
  { id: 'labArid', name: 'Laboratoire Aride', description: "Annexe de recherche specialisee dans les materiaux de blindage, tirant parti des mineraux rares du desert.", baseCostMinerai: 8000, baseCostSilicium: 16000, baseCostHydrogene: 8000, costFactor: 2, baseTime: 3600, categoryId: 'building_recherche', sortOrder: 2, role: null, flavorText: "Les conditions extremes du desert permettent de tester des alliages sous des contraintes thermiques et abrasives uniques.", prerequisites: [{ buildingId: 'researchLab', level: 6 }], allowedPlanetTypes: ['arid'] },
  { id: 'labTemperate', name: 'Bio-Laboratoire', description: "Annexe de recherche specialisee dans l'optimisation de la production, s'appuyant sur la biodiversite locale.", baseCostMinerai: 8000, baseCostSilicium: 16000, baseCostHydrogene: 8000, costFactor: 2, baseTime: 3600, categoryId: 'building_recherche', sortOrder: 3, role: null, flavorText: "La richesse biologique des mondes temperes inspire des procedes d'optimisation energetique et productive sans equivalent.", prerequisites: [{ buildingId: 'researchLab', level: 6 }], allowedPlanetTypes: ['temperate'] },
  { id: 'labGlacial', name: 'Cryo-Laboratoire', description: "Annexe de recherche specialisee dans les technologies defensives, exploitant les proprietes cryogeniques.", baseCostMinerai: 8000, baseCostSilicium: 16000, baseCostHydrogene: 8000, costFactor: 2, baseTime: 3600, categoryId: 'building_recherche', sortOrder: 4, role: null, flavorText: "Les temperatures proches du zero absolu permettent de developper des supraconducteurs et des boucliers d'une efficacite inegalee.", prerequisites: [{ buildingId: 'researchLab', level: 6 }], allowedPlanetTypes: ['glacial'] },
  { id: 'labGaseous', name: 'Nebula-Lab', description: "Annexe de recherche specialisee dans la propulsion, exploitant les courants atmospheriques et les gaz rares.", baseCostMinerai: 8000, baseCostSilicium: 16000, baseCostHydrogene: 8000, costFactor: 2, baseTime: 3600, categoryId: 'building_recherche', sortOrder: 5, role: null, flavorText: "Flottant dans l'atmosphere dense des geantes gazeuses, le Nebula-Lab teste des systemes de propulsion dans des conditions extremes.", prerequisites: [{ buildingId: 'researchLab', level: 6 }], allowedPlanetTypes: ['gaseous'] },
  { id: 'imperialPowerCenter', name: 'Centre de Pouvoir Impérial', description: "Siège du pouvoir politique de votre empire. Chaque niveau augmente votre capacité de gouvernance, permettant de gérer efficacement davantage de colonies.", baseCostMinerai: 5000, baseCostSilicium: 8000, baseCostHydrogene: 3000, costFactor: 1.8, baseTime: 7200, categoryId: 'building_gouvernance', sortOrder: 0, role: 'governance', flavorText: "Le cœur politique d'un empire en expansion.", allowedPlanetTypes: ['homeworld'], prerequisites: [{ buildingId: 'robotics', level: 4 }] },
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
  { id: 'shielding', name: 'Technologie Bouclier', description: 'Augmente les boucliers de 10% par niveau.', baseCostMinerai: 200, baseCostSilicium: 600, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'shielding', categoryId: 'research_combat', sortOrder: 7, flavorText: "Les generateurs de bouclier creent des champs de force protegeant vos unites des impacts ennemis.", effectDescription: "Chaque niveau augmente les boucliers de toutes les unites de 10%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 4 }], research: [{ researchId: 'energyTech', level: 3 }] } },
  { id: 'armor', name: 'Technologie Protection', description: 'Augmente la coque et le blindage de 10% par niveau.', baseCostMinerai: 1000, baseCostSilicium: 0, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'armor', categoryId: 'research_combat', sortOrder: 8, flavorText: "Des alliages toujours plus resistants renforcent la coque et le blindage de toutes vos unites de 10% par niveau.", effectDescription: "Chaque niveau augmente la coque et le blindage de toutes les unites de 10%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 2 }], research: [] } },
  { id: 'rockFracturing', name: 'Technologie de fracturation des roches', description: "Ameliore les techniques d'extraction miniere, augmentant la capacite d'extraction des prospecteurs de 15% par niveau.", baseCostMinerai: 2000, baseCostSilicium: 4000, baseCostHydrogene: 1000, costFactor: 2, levelColumn: 'rockFracturing', categoryId: 'research_sciences', sortOrder: 9, flavorText: "Des ondes de choc calibrees fracturent la roche asteroidale, augmentant considerablement la quantite de minerai extraite par vos prospecteurs.", effectDescription: "Chaque niveau augmente la capacite d'extraction de tous les prospecteurs de 15%.", prerequisites: { buildings: [{ buildingId: 'missionCenter', level: 1 }], research: [{ researchId: 'combustion', level: 3 }] } },
  // NOTE: deepSpaceRefining has no bonus_definitions entry. Its reduction is multiplicative
  // (0.85^level), incompatible with resolveBonus's linear formula. Computed directly in pve.ts.
  { id: 'deepSpaceRefining', name: 'Raffinage en espace lointain', description: "Developpe des techniques de raffinage embarquees qui reduisent les scories lors de l'extraction miniere.", baseCostMinerai: 2000, baseCostSilicium: 4000, baseCostHydrogene: 1000, costFactor: 2, levelColumn: 'deepSpaceRefining', categoryId: 'research_sciences', sortOrder: 10, flavorText: "Des nanofiltres embarques separent les scories du minerai pur directement dans la soute du prospecteur, maximisant chaque voyage.", effectDescription: "Chaque niveau reduit les scories de 15% (multiplicatif). Niveau 15 : ~2.5% de scories restantes.", prerequisites: { buildings: [{ buildingId: 'missionCenter', level: 2 }], research: [{ researchId: 'rockFracturing', level: 2 }] } },
  { id: 'sensorNetwork', name: 'Réseau de capteurs', description: "Deploie un reseau de capteurs en espace profond pour detecter les flottes hostiles en approche. Plus le niveau est eleve, plus la detection est precoce et detaillee.", baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 10000, costFactor: 2, levelColumn: 'sensorNetwork', categoryId: 'research_combat', sortOrder: 11, flavorText: "Un maillage de balises furtives parseme l'espace autour de vos colonies, detectant toute perturbation gravitationnelle causee par une flotte en approche.", effectDescription: "Chaque niveau ameliore le delai et le detail de detection des attaques entrantes.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 6 }], research: [{ researchId: 'espionageTech', level: 3 }] } },
  { id: 'stealthTech', name: 'Technologie furtive', description: "Developpe des systemes de brouillage et d'occultation pour reduire la detectabilite de vos flottes d'attaque. Contrecarre le reseau de capteurs ennemi.", baseCostMinerai: 15000, baseCostSilicium: 15000, baseCostHydrogene: 10000, costFactor: 2, levelColumn: 'stealthTech', categoryId: 'research_combat', sortOrder: 12, flavorText: "Des generateurs de champ holographique et des absorbeurs d'ondes rendent vos flottes quasi-invisibles aux capteurs ennemis.", effectDescription: "Chaque niveau reduit l'efficacite du reseau de capteurs ennemi, retardant la detection et masquant les informations.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 6 }], research: [{ researchId: 'espionageTech', level: 3 }] } },
  { id: 'semiconductors', name: 'Technologie de semi-conducteurs', description: "Ameliore l'efficacite des circuits de tous les systemes, reduisant leur consommation energetique de 2% par niveau.", baseCostMinerai: 800, baseCostSilicium: 400, baseCostHydrogene: 200, costFactor: 2, levelColumn: 'semiconductors', categoryId: 'research_sciences', sortOrder: 11, flavorText: "Des materiaux semi-conducteurs avances reduisent les pertes thermiques et ameliorent le rendement de tous les systemes energetiques de la colonie.", effectDescription: "Chaque niveau reduit la consommation d'energie de tous les batiments de 2%.", prerequisites: { buildings: [{ buildingId: 'researchLab', level: 3 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'armoredStorage', name: 'Blindage des hangars', description: 'Renforce les hangars pour protéger une partie des ressources contre le pillage.', baseCostMinerai: 1000, baseCostSilicium: 1000, baseCostHydrogene: 0, costFactor: 2, levelColumn: 'armoredStorage', categoryId: 'research_defense', sortOrder: 50, flavorText: 'Un blindage moléculaire rend une partie du stockage totalement inaccessible aux pilleurs.', effectDescription: 'Chaque niveau augmente de 5% la capacité blindée des hangars, protégeant les ressources du pillage.', prerequisites: { buildings: [{ buildingId: 'storageMinerai', level: 2 }], research: [] } },
  { id: 'planetaryExploration', name: 'Exploration planétaire', description: "Permet d'explorer les planètes pour découvrir leurs biomes.", baseCostMinerai: 1000, baseCostSilicium: 2000, baseCostHydrogene: 500, costFactor: 2, levelColumn: 'planetaryExploration', categoryId: 'research_sciences', sortOrder: 15, flavorText: "L'étude approfondie des écosystèmes planétaires révèle des biomes aux propriétés uniques, offrant des avantages stratégiques à ceux qui savent les exploiter.", effectDescription: "Niveau 1 : débloque le vaisseau Explorateur. Chaque niveau augmente les chances de découvrir des biomes lors des missions d'exploration.", maxLevel: null, prerequisites: { buildings: [{ buildingId: 'researchLab', level: 3 }], research: [{ researchId: 'espionageTech', level: 2 }] } },
  { id: 'volcanicWeaponry', name: 'Metallurgie de plasma', description: "Les forges volcaniques permettent de developper des armes d'une puissance superieure.", baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 6000, costFactor: 2, levelColumn: 'volcanicWeaponry', categoryId: 'research_combat', sortOrder: 20, flavorText: "Le plasma en fusion, canalise par des champs magnetiques, produit des projectiles capables de traverser n'importe quel blindage.", effectDescription: "Chaque niveau augmente les degats de toutes les unites de 10%.", maxLevel: null, requiredAnnexType: 'volcanic', prerequisites: { buildings: [], research: [{ researchId: 'weapons', level: 3 }] } },
  { id: 'aridArmor', name: 'Blindage composite', description: "Les mineraux rares du desert permettent de creer des alliages de coque et de blindage ultra-resistants.", baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 6000, costFactor: 2, levelColumn: 'aridArmor', categoryId: 'research_combat', sortOrder: 21, flavorText: "Des fibres minerales entrelacees avec des nano-polymeres forment un blindage composite capable d'absorber des impacts devastateurs.", effectDescription: "Chaque niveau augmente la coque et le blindage de toutes les unites de 10%.", maxLevel: null, requiredAnnexType: 'arid', prerequisites: { buildings: [], research: [{ researchId: 'armor', level: 3 }] } },
  { id: 'temperateProduction', name: 'Symbiose adaptative', description: "L'etude des ecosystemes temperes ameliore l'efficacite de toutes les chaines de production.", baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 6000, costFactor: 2, levelColumn: 'temperateProduction', categoryId: 'research_sciences', sortOrder: 22, flavorText: "Des micro-organismes symbiotiques, adaptes a chaque processus industriel, optimisent la production de toutes les ressources.", effectDescription: "Chaque niveau augmente la production de toutes les ressources de 2%.", maxLevel: null, requiredAnnexType: 'temperate', prerequisites: { buildings: [], research: [{ researchId: 'energyTech', level: 3 }] } },
  { id: 'glacialShielding', name: 'Bouclier cryogenique', description: "Les supraconducteurs cryogeniques permettent de creer des boucliers d'une efficacite inegalee.", baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 6000, costFactor: 2, levelColumn: 'glacialShielding', categoryId: 'research_combat', sortOrder: 23, flavorText: "Des circuits supraconducteurs refroidis a des temperatures proches du zero absolu generent des champs de force d'une stabilite parfaite.", effectDescription: "Chaque niveau augmente les boucliers de toutes les unites de 10%.", maxLevel: null, requiredAnnexType: 'glacial', prerequisites: { buildings: [], research: [{ researchId: 'shielding', level: 3 }] } },
  { id: 'gaseousPropulsion', name: 'Propulsion ionique avancee', description: "Les gaz rares des geantes gazeuses alimentent des moteurs d'une vitesse inegalee.", baseCostMinerai: 10000, baseCostSilicium: 20000, baseCostHydrogene: 6000, costFactor: 2, levelColumn: 'gaseousPropulsion', categoryId: 'research_propulsion', sortOrder: 24, flavorText: "Des ions lourds extraits de l'atmosphere dense sont acceleres a des vitesses relativistes, propulsant les vaisseaux au-dela de toutes les limites connues.", effectDescription: "Chaque niveau augmente la vitesse de tous les vaisseaux de 10%.", maxLevel: null, requiredAnnexType: 'gaseous', prerequisites: { buildings: [], research: [{ researchId: 'impulse', level: 3 }] } },
];

// ── Ship data (merged: ships + combat-stats + ship-stats) ──

const SHIPS = [
  // Industrial ships → shipyard
  { id: 'prospector', name: 'Prospecteur', description: "Vaisseau minier pour l'extraction de ressources.", costMinerai: 2250, costSilicium: 750, costHydrogene: 375, countColumn: 'prospector', baseSpeed: 3000, fuelConsumption: 50, cargoCapacity: 750, driveType: 'combustion', weapons: 1, shield: 8, hull: 15, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', miningExtraction: 3000, categoryId: 'ship_utilitaire', sortOrder: 0, role: 'mining', flavorText: "Le prospecteur est un vaisseau minier leger concu pour l'extraction de ressources sur les asteroides et planetes voisines.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [] } },
  { id: 'recuperateur', name: 'Récupérateur', description: "Mini recycleur early-game pour collecter les débris spatiaux.", costMinerai: 2250, costSilicium: 750, costHydrogene: 375, countColumn: 'recuperateur', baseSpeed: 2000, fuelConsumption: 15, cargoCapacity: 2000, driveType: 'combustion', weapons: 1, shield: 10, hull: 20, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 1, role: 'recycling', flavorText: "Compact et economique, le recuperateur est le premier vaisseau capable de collecter les debris des batailles spatiales. Sa petite soute le rend ideal pour les jeunes empires.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'smallCargo', name: 'Petit transporteur', description: 'Transport léger de ressources.', costMinerai: 1500, costSilicium: 1500, costHydrogene: 0, countColumn: 'smallCargo', baseSpeed: 5000, fuelConsumption: 10, cargoCapacity: 5000, driveType: 'combustion', weapons: 1, shield: 8, hull: 12, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_transport', sortOrder: 2, role: 'transport', flavorText: "Rapide et maniable, le petit transporteur est le cheval de trait de toute flotte commerciale.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 2 }], research: [{ researchId: 'combustion', level: 2 }] } },
  { id: 'largeCargo', name: 'Grand transporteur', description: 'Transport lourd de ressources.', costMinerai: 4500, costSilicium: 4500, costHydrogene: 0, countColumn: 'largeCargo', baseSpeed: 7500, fuelConsumption: 50, cargoCapacity: 25000, driveType: 'combustion', weapons: 1, shield: 20, hull: 36, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_transport', sortOrder: 3, role: 'transport', flavorText: "Avec sa soute massive, le grand transporteur peut deplacer d'enormes quantites de ressources en un seul voyage.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }] } },
  { id: 'espionageProbe', name: "Sonde d'espionnage", description: 'Sonde rapide pour espionner.', costMinerai: 0, costSilicium: 750, costHydrogene: 0, countColumn: 'espionageProbe', baseSpeed: 100000000, fuelConsumption: 1, cargoCapacity: 0, driveType: 'combustion', weapons: 0, shield: 0, hull: 3, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 4, role: 'espionage', flavorText: "Quasiment indetectable, la sonde d'espionnage collecte des renseignements precieux sur les planetes adverses.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 3 }], research: [{ researchId: 'combustion', level: 3 }, { researchId: 'espionageTech', level: 2 }] } },
  { id: 'colonyShip', name: 'Vaisseau de colonisation', description: 'Colonise de nouvelles planètes.', costMinerai: 7500, costSilicium: 15000, costHydrogene: 7500, countColumn: 'colonyShip', baseSpeed: 2500, fuelConsumption: 1000, cargoCapacity: 7500, driveType: 'impulse', weapons: 4, shield: 80, hull: 90, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 5, role: 'colonization', flavorText: "Ce vaisseau transporte tout le necessaire pour etablir une nouvelle colonie sur une planete inhabitee.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'impulse', level: 3 }] } },
  { id: 'recycler', name: 'Recycleur', description: 'Collecte les champs de débris.', costMinerai: 7500, costSilicium: 4500, costHydrogene: 1500, countColumn: 'recycler', baseSpeed: 2000, fuelConsumption: 300, cargoCapacity: 20000, driveType: 'combustion', weapons: 1, shield: 8, hull: 48, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 6, role: 'recycling', flavorText: "Equipe de puissants aimants et de bras mecaniques, le recycleur collecte les debris des batailles spatiales.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 4 }], research: [{ researchId: 'combustion', level: 6 }, { researchId: 'shielding', level: 2 }] } },
  { id: 'solarSatellite', name: 'Satellite solaire', description: "Produit de l'énergie en orbite. Ne peut pas être envoyé en mission.", costMinerai: 0, costSilicium: 1500, costHydrogene: 375, countColumn: 'solarSatellite', baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion', weapons: 1, shield: 1, hull: 6, baseArmor: 0, shotCount: 1, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 7, role: 'energy', flavorText: "En orbite stationnaire, les satellites solaires captent l'énergie stellaire et la transmettent aux installations planétaires. Plus la planète est proche de son étoile, plus ils sont efficaces.", isStationary: true, prerequisites: { buildings: [{ buildingId: 'shipyard', level: 1 }], research: [] } },
  { id: 'explorer', name: 'Explorateur', description: "Vaisseau scientifique d'exploration planétaire.", costMinerai: 2250, costSilicium: 1500, costHydrogene: 375, countColumn: 'explorer', baseSpeed: 8000, fuelConsumption: 20, cargoCapacity: 0, driveType: 'combustion', weapons: 0, shield: 5, hull: 10, baseArmor: 0, shotCount: 0, combatCategoryId: 'support', categoryId: 'ship_utilitaire', sortOrder: 8, role: 'exploration', flavorText: "Équipé de capteurs avancés et de laboratoires embarqués, l'explorateur analyse la composition des planètes pour révéler leurs biomes cachés.", prerequisites: { buildings: [{ buildingId: 'shipyard', level: 3 }], research: [{ researchId: 'planetaryExploration', level: 1 }] } },
  // Military ships → commandCenter
  { id: 'interceptor', name: 'Intercepteur', description: 'Vaisseau de combat de base.', costMinerai: 2250, costSilicium: 750, costHydrogene: 0, countColumn: 'interceptor', baseSpeed: 12500, fuelConsumption: 20, cargoCapacity: 50, driveType: 'combustion', weapons: 4, shield: 6, hull: 12, baseArmor: 1, shotCount: 3, combatCategoryId: 'light', categoryId: 'ship_combat', sortOrder: 8, role: 'combat', flavorText: "Le chasseur leger, pilier des premieres flottes, compense sa fragilite par son faible cout de production.", weaponProfiles: [
    { damage: 4, shots: 3, targetCategory: 'light', hasChainKill: true },
  ], prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 1 }], research: [{ researchId: 'combustion', level: 1 }] } },
  { id: 'frigate', name: 'Frégate', description: 'Vaisseau de combat amélioré.', costMinerai: 4500, costSilicium: 3000, costHydrogene: 0, countColumn: 'frigate', baseSpeed: 10000, fuelConsumption: 75, cargoCapacity: 100, driveType: 'impulse', weapons: 12, shield: 16, hull: 30, baseArmor: 2, shotCount: 2, combatCategoryId: 'medium', categoryId: 'ship_combat', sortOrder: 9, role: 'combat', flavorText: "Blindage renforce et armement superieur font du chasseur lourd un adversaire redoutable en combat rapproche.", weaponProfiles: [
    { damage: 12, shots: 1, targetCategory: 'medium' },
    { damage: 6,  shots: 2, targetCategory: 'light' },
  ], prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 3 }], research: [{ researchId: 'armor', level: 2 }, { researchId: 'impulse', level: 2 }] } },
  { id: 'cruiser', name: 'Croiseur', description: 'Vaisseau de guerre polyvalent.', costMinerai: 15000, costSilicium: 5250, costHydrogene: 1500, countColumn: 'cruiser', baseSpeed: 15000, fuelConsumption: 300, cargoCapacity: 800, driveType: 'impulse', weapons: 45, shield: 32, hull: 55, baseArmor: 4, shotCount: 1, combatCategoryId: 'heavy', categoryId: 'ship_combat', sortOrder: 10, role: 'combat', flavorText: "Polyvalent et puissamment arme, le croiseur domine les escarmouches grace a son tir rapide devastateur.", weaponProfiles: [
    { damage: 35, shots: 1, targetCategory: 'heavy' },
    { damage: 6,  shots: 2, targetCategory: 'light', rafale: { category: 'light', count: 6 } },
  ], prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 5 }], research: [{ researchId: 'impulse', level: 4 }, { researchId: 'weapons', level: 3 }] } },
  { id: 'battlecruiser', name: 'Cuirassé', description: 'Puissant navire de guerre.', costMinerai: 33750, costSilicium: 11250, costHydrogene: 0, countColumn: 'battlecruiser', baseSpeed: 10000, fuelConsumption: 500, cargoCapacity: 1500, driveType: 'hyperspaceDrive', weapons: 70, shield: 40, hull: 120, baseArmor: 6, shotCount: 1, combatCategoryId: 'heavy', categoryId: 'ship_combat', sortOrder: 11, role: 'combat', flavorText: "Le vaisseau de bataille, colosse d'acier et de feu, est la piece maitresse de toute flotte d'invasion.", weaponProfiles: [
    { damage: 50, shots: 1, targetCategory: 'heavy' },
    { damage: 10, shots: 2, targetCategory: 'medium', rafale: { category: 'medium', count: 4 } },
  ], prerequisites: { buildings: [{ buildingId: 'commandCenter', level: 7 }], research: [{ researchId: 'hyperspaceDrive', level: 4 }] } },
];

// ── Defense data (merged: defenses + combat-stats) ──

const DEFENSES = [
  { id: 'rocketLauncher', name: 'Lanceur de missiles', description: 'Défense de base, peu coûteuse.', costMinerai: 3000, costSilicium: 0, costHydrogene: 0, countColumn: 'rocketLauncher', weapons: 6, shield: 8, hull: 14, baseArmor: 1, shotCount: 2, combatCategoryId: 'light', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 0, flavorText: "Simple mais efficace, le lanceur de missiles constitue la premiere ligne de defense de toute planete.", weaponProfiles: [
    { damage: 6, shots: 2, targetCategory: 'light', hasChainKill: true },
  ], prerequisites: { buildings: [{ buildingId: 'arsenal', level: 1 }], research: [] as { researchId: string; level: number }[] } },
  { id: 'lightLaser', name: 'Artillerie laser légère', description: 'Défense laser de base.', costMinerai: 2250, costSilicium: 750, costHydrogene: 0, countColumn: 'lightLaser', weapons: 7, shield: 8, hull: 12, baseArmor: 1, shotCount: 3, combatCategoryId: 'light', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 1, flavorText: "Le laser leger offre un excellent rapport cout-efficacite pour les defenses planetaires de base.", weaponProfiles: [
    { damage: 7, shots: 3, targetCategory: 'light', hasChainKill: true },
  ], prerequisites: { buildings: [{ buildingId: 'arsenal', level: 2 }], research: [{ researchId: 'energyTech', level: 1 }] } },
  { id: 'heavyLaser', name: 'Artillerie laser lourde', description: 'Défense laser puissante.', costMinerai: 5625, costSilicium: 1875, costHydrogene: 0, countColumn: 'heavyLaser', weapons: 15, shield: 18, hull: 35, baseArmor: 3, shotCount: 2, combatCategoryId: 'medium', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 2, flavorText: "Concentrant une energie devastatrice, le laser lourd peut percer le blindage des vaisseaux moyens.", weaponProfiles: [
    { damage: 15, shots: 2, targetCategory: 'medium' },
  ], prerequisites: { buildings: [{ buildingId: 'arsenal', level: 4 }], research: [{ researchId: 'energyTech', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'electromagneticCannon', name: 'Canon électromagnétique', description: 'Défense balistique puissante.', costMinerai: 16500, costSilicium: 12000, costHydrogene: 1500, countColumn: 'electromagneticCannon', weapons: 55, shield: 35, hull: 70, baseArmor: 5, shotCount: 1, combatCategoryId: 'heavy', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 3, flavorText: "Propulsant des projectiles a une fraction de la vitesse de la lumiere, le canon de Gauss inflige des degats considerables.", weaponProfiles: [
    { damage: 55, shots: 1, targetCategory: 'heavy' },
  ], prerequisites: { buildings: [{ buildingId: 'arsenal', level: 6 }], research: [{ researchId: 'energyTech', level: 6 }, { researchId: 'weapons', level: 3 }, { researchId: 'shielding', level: 1 }] } },
  { id: 'plasmaTurret', name: 'Artillerie à ions', description: 'Défense plasma dévastatrice.', costMinerai: 37500, costSilicium: 37500, costHydrogene: 22500, countColumn: 'plasmaTurret', weapons: 90, shield: 60, hull: 140, baseArmor: 7, shotCount: 1, combatCategoryId: 'heavy', maxPerPlanet: null, categoryId: 'defense_tourelles', sortOrder: 4, flavorText: "La tourelle a plasma genere un flux de particules ionisees capable de vaporiser les blindages les plus epais.", weaponProfiles: [
    { damage: 90, shots: 1, targetCategory: 'heavy' },
  ], prerequisites: { buildings: [{ buildingId: 'arsenal', level: 8 }], research: [{ researchId: 'energyTech', level: 8 }, { researchId: 'weapons', level: 7 }] } },
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

// ── Biome definitions data ──

const BIOME_DEFINITIONS = [
  // ── Universal biomes (all planet types) ──
  { id: 'fertile_plains', name: 'Plaines fertiles', description: 'De vastes étendues de terres riches en nutriments minéraux.', rarity: 'common' as const, compatiblePlanetTypes: [], effects: [{ stat: 'production_silicium', modifier: 0.08 }] },
  { id: 'surface_deposits', name: 'Gisements de surface', description: 'Des filons de minerai affleurent partout à la surface.', rarity: 'common' as const, compatiblePlanetTypes: [], effects: [{ stat: 'production_minerai', modifier: 0.08 }] },
  { id: 'deep_caverns', name: 'Cavernes profondes', description: 'Un réseau souterrain immense offrant un stockage naturel.', rarity: 'common' as const, compatiblePlanetTypes: [], effects: [{ stat: 'storage_minerai', modifier: 0.10 }] },
  { id: 'underground_reserves', name: 'Nappes souterraines', description: 'Des poches de gaz pressurisé piégées dans la croûte.', rarity: 'uncommon' as const, compatiblePlanetTypes: [], effects: [{ stat: 'storage_hydrogene', modifier: 0.10 }] },
  { id: 'stable_orbit', name: 'Orbite stable', description: "Une orbite parfaitement régulière maximisant l'exposition solaire.", rarity: 'rare' as const, compatiblePlanetTypes: [], effects: [{ stat: 'energy_production', modifier: 0.08 }] },
  { id: 'active_core', name: 'Noyau actif', description: "Un noyau planétaire en fusion alimentant toute l'activité géologique.", rarity: 'rare' as const, compatiblePlanetTypes: [], effects: [{ stat: 'production_minerai', modifier: 0.12 }, { stat: 'production_silicium', modifier: 0.12 }, { stat: 'production_hydrogene', modifier: 0.12 }] },
  { id: 'precursor_relics', name: 'Reliques précurseurs', description: "Des artefacts d'une civilisation disparue accélèrent les découvertes.", rarity: 'epic' as const, compatiblePlanetTypes: [], effects: [{ stat: 'production_minerai', modifier: 0.05 }, { stat: 'production_silicium', modifier: 0.05 }, { stat: 'production_hydrogene', modifier: 0.05 }, { stat: 'energy_production', modifier: 0.10 }] },
  { id: 'gravitational_nexus', name: 'Nexus gravitationnel', description: 'Une anomalie gravitationnelle qui facilite toutes les opérations planétaires.', rarity: 'legendary' as const, compatiblePlanetTypes: [], effects: [{ stat: 'production_minerai', modifier: 0.08 }, { stat: 'production_silicium', modifier: 0.08 }, { stat: 'production_hydrogene', modifier: 0.08 }, { stat: 'storage_minerai', modifier: 0.10 }, { stat: 'storage_silicium', modifier: 0.10 }, { stat: 'storage_hydrogene', modifier: 0.10 }] },

  // ── Volcanic biomes (positions 1-3) ──
  { id: 'lava_flows', name: 'Coulées de lave', description: 'Des rivières de lave charrient des cristaux de silicium en fusion.', rarity: 'common' as const, compatiblePlanetTypes: ['volcanic'], effects: [{ stat: 'production_silicium', modifier: 0.10 }] },
  { id: 'volcanic_vents', name: 'Cheminées volcaniques', description: "Des colonnes de chaleur intense exploitables pour la production d'énergie.", rarity: 'uncommon' as const, compatiblePlanetTypes: ['volcanic'], effects: [{ stat: 'energy_production', modifier: 0.12 }] },
  { id: 'natural_forges', name: 'Forges naturelles', description: 'Des cavités de magma à température constante, parfaites pour la métallurgie.', rarity: 'rare' as const, compatiblePlanetTypes: ['volcanic'], effects: [{ stat: 'production_minerai', modifier: 0.15 }] },
  { id: 'primordial_magma', name: 'Lac de magma primordial', description: "Un lac de magma ancien riche en éléments lourds.", rarity: 'epic' as const, compatiblePlanetTypes: ['volcanic'], effects: [{ stat: 'production_minerai', modifier: 0.20 }] },
  { id: 'plasma_core', name: 'Coeur de plasma', description: 'Le noyau de la planète émet une énergie phénoménale.', rarity: 'legendary' as const, compatiblePlanetTypes: ['volcanic'], effects: [{ stat: 'energy_production', modifier: 0.25 }] },

  // ── Arid biomes (positions 4-6) ──
  { id: 'metallic_dunes', name: 'Dunes métalliques', description: 'Des dunes de sable chargées de particules métalliques.', rarity: 'common' as const, compatiblePlanetTypes: ['arid'], effects: [{ stat: 'production_minerai', modifier: 0.10 }] },
  { id: 'deep_canyons', name: 'Canyons profonds', description: "D'immenses canyons offrant un espace de stockage naturel.", rarity: 'uncommon' as const, compatiblePlanetTypes: ['arid'], effects: [{ stat: 'storage_silicium', modifier: 0.15 }] },
  { id: 'underground_oasis', name: 'Oasis souterraine', description: 'Des sources souterraines riches en composés hydrogénés.', rarity: 'rare' as const, compatiblePlanetTypes: ['arid'], effects: [{ stat: 'production_hydrogene', modifier: 0.15 }] },
  { id: 'crystal_desert', name: 'Désert de cristaux', description: 'Une étendue de cristaux de silicium naturellement formés.', rarity: 'epic' as const, compatiblePlanetTypes: ['arid'], effects: [{ stat: 'production_silicium', modifier: 0.18 }] },
  { id: 'permanent_sandstorm', name: 'Tempête de sable permanente', description: 'Une tempête éternelle qui érode la roche et expose des gisements.', rarity: 'legendary' as const, compatiblePlanetTypes: ['arid'], effects: [{ stat: 'production_minerai', modifier: 0.15 }, { stat: 'production_silicium', modifier: 0.15 }] },

  // ── Temperate biomes (positions 7, 9) ──
  { id: 'dense_forests', name: 'Forêts denses', description: 'Une biomasse luxuriante convertissant la lumière en énergie.', rarity: 'common' as const, compatiblePlanetTypes: ['temperate'], effects: [{ stat: 'energy_production', modifier: 0.08 }] },
  { id: 'mineral_plateaus', name: 'Plateaux minéraux', description: "Des hauts plateaux où les filons sont faciles d'accès.", rarity: 'uncommon' as const, compatiblePlanetTypes: ['temperate'], effects: [{ stat: 'production_minerai', modifier: 0.12 }] },
  { id: 'symbiotic_ecosystem', name: 'Écosystème symbiotique', description: "Un écosystème en équilibre parfait qui amplifie toute activité.", rarity: 'rare' as const, compatiblePlanetTypes: ['temperate'], effects: [{ stat: 'production_minerai', modifier: 0.10 }, { stat: 'production_silicium', modifier: 0.10 }, { stat: 'production_hydrogene', modifier: 0.10 }] },
  { id: 'exposed_rare_earths', name: 'Terres rares exposées', description: 'Des gisements de terres rares affleurant en surface.', rarity: 'epic' as const, compatiblePlanetTypes: ['temperate'], effects: [{ stat: 'production_silicium', modifier: 0.20 }] },
  { id: 'harmonic_biosphere', name: 'Biosphère harmonique', description: "La vie de cette planète vibre à une fréquence qui amplifie tout.", rarity: 'legendary' as const, compatiblePlanetTypes: ['temperate'], effects: [{ stat: 'production_minerai', modifier: 0.10 }, { stat: 'production_silicium', modifier: 0.10 }, { stat: 'production_hydrogene', modifier: 0.10 }, { stat: 'energy_production', modifier: 0.10 }] },

  // ── Glacial biomes (positions 10-12) ──
  { id: 'hydrogen_glaciers', name: "Glaciers d'hydrogène", description: "D'immenses glaciers d'hydrogène solide prêts à être exploités.", rarity: 'common' as const, compatiblePlanetTypes: ['glacial'], effects: [{ stat: 'production_hydrogene', modifier: 0.10 }] },
  { id: 'rich_permafrost', name: 'Permafrost riche', description: 'Un sol gelé emprisonnant des ressources parfaitement conservées.', rarity: 'uncommon' as const, compatiblePlanetTypes: ['glacial'], effects: [{ stat: 'storage_minerai', modifier: 0.12 }, { stat: 'storage_silicium', modifier: 0.12 }, { stat: 'storage_hydrogene', modifier: 0.12 }] },
  { id: 'cryogenic_geysers', name: 'Geysers cryogéniques', description: "Des geysers projetant de l'hydrogène liquide depuis les profondeurs.", rarity: 'rare' as const, compatiblePlanetTypes: ['glacial'], effects: [{ stat: 'production_hydrogene', modifier: 0.15 }] },
  { id: 'antimatter_crystals', name: "Cristaux d'antimatière", description: 'Des formations cristallines émettant une énergie exotique.', rarity: 'epic' as const, compatiblePlanetTypes: ['glacial'], effects: [{ stat: 'production_hydrogene', modifier: 0.22 }] },
  { id: 'eternal_cryovolcano', name: 'Cryovolcan éternel', description: "Un volcan de glace en éruption permanente, source inépuisable.", rarity: 'legendary' as const, compatiblePlanetTypes: ['glacial'], effects: [{ stat: 'production_hydrogene', modifier: 0.20 }, { stat: 'energy_production', modifier: 0.15 }] },

  // ── Gaseous biomes (positions 13-15) ──
  { id: 'noble_gas_layers', name: 'Couches de gaz nobles', description: 'Des strates atmosphériques riches en gaz exploitables.', rarity: 'common' as const, compatiblePlanetTypes: ['gaseous'], effects: [{ stat: 'production_hydrogene', modifier: 0.10 }] },
  { id: 'atmospheric_vortex', name: 'Vortex atmosphérique', description: 'Un cyclone permanent comprimant les ressources gazeuses.', rarity: 'uncommon' as const, compatiblePlanetTypes: ['gaseous'], effects: [{ stat: 'production_hydrogene', modifier: 0.08 }, { stat: 'storage_hydrogene', modifier: 0.10 }] },
  { id: 'deuterium_clouds', name: 'Nuages de deutérium', description: 'Des nuages denses de deutérium prêts pour la synthèse.', rarity: 'rare' as const, compatiblePlanetTypes: ['gaseous'], effects: [{ stat: 'production_hydrogene', modifier: 0.15 }] },
  { id: 'ionic_storm', name: 'Tempête ionique', description: "Une tempête électrique permanente convertible en énergie pure.", rarity: 'epic' as const, compatiblePlanetTypes: ['gaseous'], effects: [{ stat: 'energy_production', modifier: 0.20 }] },
  { id: 'spatial_anomaly', name: 'Anomalie spatiale', description: "Une distorsion de l'espace-temps aux propriétés inexplicables.", rarity: 'legendary' as const, compatiblePlanetTypes: ['gaseous'], effects: [{ stat: 'production_hydrogene', modifier: 0.15 }, { stat: 'production_minerai', modifier: 0.10 }, { stat: 'production_silicium', modifier: 0.10 }] },
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

const TUTORIAL_CHAPTERS = [
  { id: 'chapter_1', title: "L'atterrissage", journalIntro: "Le vaisseau est en miettes. Les systemes de survie tiennent a peine. Les scanners detectent une planete habitable a proximite. C'est notre seule chance.", order: 1, rewardMinerai: 500, rewardSilicium: 300, rewardHydrogene: 100, rewardExilium: 0, rewardUnits: [] },
  { id: 'chapter_2', title: 'La colonie', journalIntro: "Les fondations sont la. On ne survivra pas longtemps en se contentant de creuser. Il est temps de penser plus grand — automatisation, recherche, construction.", order: 2, rewardMinerai: 500, rewardSilicium: 500, rewardHydrogene: 300, rewardExilium: 2, rewardUnits: [] },
  { id: 'chapter_3', title: "L'espace", journalIntro: "Le chantier spatial est operationnel. L'espace est immense, dangereux, et plein de debris. Mais c'est la que se trouvent les ressources dont on a besoin pour grandir.", order: 3, rewardMinerai: 0, rewardSilicium: 0, rewardHydrogene: 0, rewardExilium: 3, rewardUnits: [{ shipId: 'prospector', quantity: 1 }, { shipId: 'smallCargo', quantity: 1 }] },
  { id: 'chapter_4', title: 'La menace', journalIntro: "Jour 80 — Les capteurs longue portee ont capte des signaux non identifies. Des vaisseaux, nombreux, en patrouille. On n'est pas seuls ici. Et ils n'ont pas l'air amicaux.", order: 4, rewardMinerai: 0, rewardSilicium: 0, rewardHydrogene: 0, rewardExilium: 15, rewardUnits: [{ shipId: 'interceptor', quantity: 5 }] },
];

const TUTORIAL_QUESTS = [
  // Chapter 1: L'atterrissage
  { id: 'quest_1', order: 1, title: 'Signal de vie', narrativeText: "Construisez votre premiere mine pour extraire du minerai.", conditionType: 'building_level', conditionTargetId: 'mineraiMine', conditionTargetValue: 1, rewardMinerai: 100, rewardSilicium: 0, rewardHydrogene: 0, conditionLabel: 'Mine de minerai Nv.1', chapterId: 'chapter_1', journalEntry: "Jour 1 — L'impact a ete violent. La coque est fissuree de partout mais les capteurs detectent du minerai brut a quelques centaines de metres. Il faut commencer a extraire si on veut reparer quoi que ce soit.", objectiveLabel: 'Mine de minerai' },
  { id: 'quest_2', order: 2, title: 'Composants critiques', narrativeText: "Le silicium est essentiel pour les composants electroniques.", conditionType: 'building_level', conditionTargetId: 'siliciumMine', conditionTargetValue: 1, rewardMinerai: 0, rewardSilicium: 100, rewardHydrogene: 0, conditionLabel: 'Mine de silicium Nv.1', chapterId: 'chapter_1', journalEntry: "Jour 3 — Le minerai ne suffira pas. Les circuits de l'ordinateur de bord sont grilles. Il nous faut du silicium pour fabriquer les composants de base.", objectiveLabel: 'Mine de silicium' },
  { id: 'quest_3', order: 3, title: 'Courant vital', narrativeText: "Sans energie, rien ne fonctionne.", conditionType: 'building_level', conditionTargetId: 'solarPlant', conditionTargetValue: 1, rewardMinerai: 100, rewardSilicium: 75, rewardHydrogene: 0, conditionLabel: 'Centrale solaire Nv.1', chapterId: 'chapter_1', journalEntry: "Jour 5 — Les batteries sont presque a plat. Sans energie, les mines s'arreteront. J'ai repere un emplacement ideal pour une centrale solaire.", objectiveLabel: 'Centrale solaire' },
  { id: 'quest_4', order: 4, title: 'Carburant', narrativeText: "L'hydrogene est indispensable pour les vaisseaux.", conditionType: 'building_level', conditionTargetId: 'hydrogeneSynth', conditionTargetValue: 1, rewardMinerai: 150, rewardSilicium: 75, rewardHydrogene: 50, conditionLabel: "Synth. H\u2082 Nv.1", chapterId: 'chapter_1', journalEntry: "Jour 8 — Le minerai et le silicium ne suffiront pas. Pour propulser quoi que ce soit dans l'espace, il nous faudra de l'hydrogene. L'eau souterraine pourrait etre notre source.", objectiveLabel: "Synth. d'hydrogene" },
  { id: 'quest_5', order: 5, title: 'Cadence', narrativeText: "Augmentez la production.", conditionType: 'building_level', conditionTargetId: 'mineraiMine', conditionTargetValue: 3, rewardMinerai: 200, rewardSilicium: 100, rewardHydrogene: 0, conditionLabel: 'Mine de minerai Nv.3', chapterId: 'chapter_1', journalEntry: "Jour 12 — La colonie prend forme. Mais a ce rythme, on mettra des mois a reparer le vaisseau. Il faut augmenter la cadence d'extraction.", objectiveLabel: 'Mine de minerai' },

  // Chapter 2: La colonie
  { id: 'quest_6', order: 6, title: 'Mains mecaniques', narrativeText: "L'automatisation accelere les constructions.", conditionType: 'building_level', conditionTargetId: 'robotics', conditionTargetValue: 1, rewardMinerai: 275, rewardSilicium: 175, rewardHydrogene: 100, conditionLabel: 'Usine de robots Nv.1', chapterId: 'chapter_2', journalEntry: "Jour 18 — Mes bras n'en peuvent plus. L'ingenieure a dessine les plans d'un systeme robotique. Ca devrait accelerer toutes les constructions futures.", objectiveLabel: 'Usine de robots' },
  { id: 'quest_7', order: 7, title: 'Savoirs perdus', narrativeText: "La recherche ouvre de nouvelles possibilites.", conditionType: 'building_level', conditionTargetId: 'researchLab', conditionTargetValue: 1, rewardMinerai: 175, rewardSilicium: 300, rewardHydrogene: 150, conditionLabel: 'Laboratoire Nv.1', chapterId: 'chapter_2', journalEntry: "Jour 22 — On a trouve des fragments de donnees dans l'epave. Avec un laboratoire, on pourrait decoder ces technologies et les adapter.", objectiveLabel: 'Laboratoire de recherche' },
  { id: 'quest_8', order: 8, title: 'Rendement', narrativeText: "Optimisez votre consommation energetique.", conditionType: 'research_level', conditionTargetId: 'energyTech', conditionTargetValue: 1, rewardMinerai: 150, rewardSilicium: 275, rewardHydrogene: 150, conditionLabel: 'Tech. Energie Nv.1', chapterId: 'chapter_2', journalEntry: "Jour 28 — Le labo est operationnel. Premiere priorite : optimiser notre consommation energetique. Chaque watt compte.", objectiveLabel: 'Tech. Energie' },
  { id: 'quest_9', order: 9, title: 'Propulsion', narrativeText: "Les moteurs a combustion ouvrent l'acces a l'espace.", conditionType: 'research_level', conditionTargetId: 'combustion', conditionTargetValue: 1, rewardMinerai: 350, rewardSilicium: 175, rewardHydrogene: 200, conditionLabel: 'Combustion Nv.1', chapterId: 'chapter_2', journalEntry: "Jour 35 — Les donnees de l'epave contiennent des schemas de moteurs a combustion. Si on les reconstitue, on pourra peut-etre envoyer quelque chose en orbite.", objectiveLabel: 'Combustion' },
  { id: 'quest_10', order: 10, title: 'Premier chantier', narrativeText: "Le chantier spatial permet de construire des vaisseaux.", conditionType: 'building_level', conditionTargetId: 'shipyard', conditionTargetValue: 1, rewardMinerai: 400, rewardSilicium: 250, rewardHydrogene: 150, conditionLabel: 'Chantier spatial Nv.1', chapterId: 'chapter_2', journalEntry: "Jour 42 — Le moment est venu. Avec les moteurs et les materiaux, on peut construire un chantier spatial. Notre premier pas vers les etoiles.", objectiveLabel: 'Chantier spatial' },

  // Chapter 3: L'espace
  { id: 'quest_11', order: 11, title: 'Bapteme', narrativeText: "Votre vaisseau amiral attend un nom.", conditionType: 'flagship_named', conditionTargetId: 'any', conditionTargetValue: 1, rewardMinerai: 500, rewardSilicium: 275, rewardHydrogene: 150, conditionLabel: 'Vaisseau amiral', chapterId: 'chapter_3', journalEntry: "Jour 48 — L'equipe a restaure une vieille coque de reconnaissance trouvee dans l'epave. C'est rudimentaire, mais c'est NOTRE vaisseau amiral. Il merite un nom.", objectiveLabel: 'Vaisseau amiral' },
  { id: 'quest_12', order: 12, title: 'Cargaison perdue', narrativeText: "Recuperez la cargaison abandonnee.", conditionType: 'fleet_return', conditionTargetId: 'any', conditionTargetValue: 1, rewardMinerai: 625, rewardSilicium: 350, rewardHydrogene: 175, conditionLabel: 'Envoyer une flotte', chapterId: 'chapter_3', journalEntry: "Jour 52 — Les scanners ont detecte des conteneurs de fret derives en [{galaxy}:{system}:8]. Ca ressemble a de la cargaison abandonnee. Si on envoie une equipe, on pourrait recuperer le tout.", objectiveLabel: 'Flotte de transport' },
  { id: 'quest_13', order: 13, title: 'Oreilles ouvertes', narrativeText: "Le centre de missions detecte les opportunites.", conditionType: 'building_level', conditionTargetId: 'missionCenter', conditionTargetValue: 1, rewardMinerai: 1500, rewardSilicium: 800, rewardHydrogene: 300, conditionLabel: 'Centre de missions Nv.1', chapterId: 'chapter_3', journalEntry: "Jour 55 — On capte de plus en plus de signaux en provenance du systeme. Un centre de missions nous permettrait d'analyser ces donnees et de localiser les opportunites — gisements, epaves, anomalies.", objectiveLabel: 'Centre de missions' },
  { id: 'quest_14', order: 14, title: 'Chantier avance', narrativeText: "Agrandissez le chantier pour des vaisseaux specialises.", conditionType: 'building_level', conditionTargetId: 'shipyard', conditionTargetValue: 4, rewardMinerai: 3500, rewardSilicium: 1500, rewardHydrogene: 600, conditionLabel: 'Chantier spatial Nv.4', chapterId: 'chapter_3', journalEntry: "Jour 58 — Le premier vol a revele l'ampleur des debris en orbite. Pour en tirer profit, il faut agrandir le chantier et construire des vaisseaux specialises.", objectiveLabel: 'Chantier spatial' },
  { id: 'quest_15', order: 15, title: 'Premier prospecteur', narrativeText: "Le prospecteur extrait des ressources des asteroides.", conditionType: 'ship_count', conditionTargetId: 'prospector', conditionTargetValue: 1, rewardMinerai: 3500, rewardSilicium: 1500, rewardHydrogene: 600, conditionLabel: 'Prospecteur x1', chapterId: 'chapter_3', journalEntry: "Jour 63 — Les ceintures d'asteroides regorgent de ressources brutes. Un prospecteur pourrait en extraire des tonnes.", objectiveLabel: 'Prospecteur' },
  { id: 'quest_16', order: 16, title: 'Premiere recolte', narrativeText: "Envoyez votre premiere mission de minage.", conditionType: 'mission_complete', conditionTargetId: 'mine', conditionTargetValue: 1, rewardMinerai: 1100, rewardSilicium: 625, rewardHydrogene: 250, conditionLabel: 'Mission de minage', chapterId: 'chapter_3', journalEntry: "Jour 68 — Le prospecteur est pret. Les scanners ont repere un gisement prometteur. C'est l'heure d'envoyer notre premiere mission de minage.", objectiveLabel: 'Mission de minage' },

  // Chapter 4: La menace
  { id: 'quest_17', order: 17, title: "Etat d'alerte", narrativeText: "Construisez un centre de commandement.", conditionType: 'building_level', conditionTargetId: 'commandCenter', conditionTargetValue: 1, rewardMinerai: 1250, rewardSilicium: 700, rewardHydrogene: 275, conditionLabel: 'Centre de commandement Nv.1', chapterId: 'chapter_4', journalEntry: "Jour 82 — J'ai convoque un conseil d'urgence. On a besoin d'un centre de commandement pour coordonner nos defenses. C'est la priorite absolue.", objectiveLabel: 'Centre de commandement' },
  { id: 'quest_18', order: 18, title: 'Premiere ligne', narrativeText: "Les intercepteurs sont rapides et maniables.", conditionType: 'ship_count', conditionTargetId: 'interceptor', conditionTargetValue: 3, rewardMinerai: 1400, rewardSilicium: 825, rewardHydrogene: 275, conditionLabel: 'Intercepteur x3', chapterId: 'chapter_4', journalEntry: "Jour 86 — Le centre de commandement est operationnel. Les ingenieurs ont finalise les plans des intercepteurs. Rapides, maniables, pas chers — exactement ce qu'il nous faut.", objectiveLabel: 'Intercepteurs' },
  { id: 'quest_19', order: 19, title: 'Puissance de feu', narrativeText: "L'armement ameliore les degats de vos vaisseaux.", conditionType: 'research_level', conditionTargetId: 'weapons', conditionTargetValue: 1, rewardMinerai: 1050, rewardSilicium: 1050, rewardHydrogene: 350, conditionLabel: 'Armement Nv.1', chapterId: 'chapter_4', journalEntry: "Jour 90 — Les intercepteurs sont en vol d'essai. Mais leurs armes sont trop faibles. La recherche en armement pourrait changer la donne.", objectiveLabel: 'Armement' },
  { id: 'quest_20', order: 20, title: 'Blindage', narrativeText: "Les boucliers protegent vos vaisseaux.", conditionType: 'research_level', conditionTargetId: 'shielding', conditionTargetValue: 1, rewardMinerai: 1050, rewardSilicium: 1050, rewardHydrogene: 350, conditionLabel: 'Bouclier Nv.1', chapterId: 'chapter_4', journalEntry: "Jour 95 — Les tirs de nos intercepteurs sont plus precis, mais ils ne tiennent pas les impacts. Il faut renforcer les boucliers.", objectiveLabel: 'Bouclier' },
  { id: 'quest_21', order: 21, title: 'Forteresse', narrativeText: "Les defenses planetaires protegent votre colonie.", conditionType: 'defense_count', conditionTargetId: 'lightLaser', conditionTargetValue: 4, rewardMinerai: 1400, rewardSilicium: 700, rewardHydrogene: 350, conditionLabel: 'Artillerie laser x4', chapterId: 'chapter_4', journalEntry: "Jour 100 — On ne peut pas tout miser sur la flotte. Des tourelles au sol protegeraient la colonie meme en notre absence.", objectiveLabel: 'Artillerie laser legere' },
  { id: 'quest_22', order: 22, title: 'Bapteme du feu', narrativeText: "Attaquez un repaire pirate.", conditionType: 'mission_complete', conditionTargetId: 'pirate', conditionTargetValue: 1, rewardMinerai: 1750, rewardSilicium: 1050, rewardHydrogene: 500, conditionLabel: 'Mission pirate', chapterId: 'chapter_4', journalEntry: "Jour 105 — Un repaire pirate a ete localise. C'est le moment de tester notre preparation. Si on survit a ca, on survivra a tout.", objectiveLabel: 'Mission pirate' },
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
  { id: 'armor__armor', sourceType: 'research', sourceId: 'armor', stat: 'armor', percentPerLevel: 10, category: null, statLabel: 'Coque et blindage' },
  { id: 'combustion__ship_speed__combustion', sourceType: 'research', sourceId: 'combustion', stat: 'ship_speed', percentPerLevel: 10, category: 'combustion', statLabel: 'Vitesse des vaisseaux' },
  { id: 'impulse__ship_speed__impulse', sourceType: 'research', sourceId: 'impulse', stat: 'ship_speed', percentPerLevel: 20, category: 'impulse', statLabel: 'Vitesse des vaisseaux' },
  { id: 'hyperspaceDrive__ship_speed__hyperspaceDrive', sourceType: 'research', sourceId: 'hyperspaceDrive', stat: 'ship_speed', percentPerLevel: 30, category: 'hyperspaceDrive', statLabel: 'Vitesse des vaisseaux' },
  { id: 'rockFracturing__mining_extraction', sourceType: 'research', sourceId: 'rockFracturing', stat: 'mining_extraction', percentPerLevel: 15, category: null, statLabel: "Capacité d'extraction" },
  { id: 'computerTech__fleet_count', sourceType: 'research', sourceId: 'computerTech', stat: 'fleet_count', percentPerLevel: 100, category: null, statLabel: 'Flottes simultanées' },
  { id: 'espionageTech__spy_range', sourceType: 'research', sourceId: 'espionageTech', stat: 'spy_range', percentPerLevel: 100, category: null, statLabel: "Portée d'espionnage" },
  { id: 'energyTech__energy_production', sourceType: 'research', sourceId: 'energyTech', stat: 'energy_production', percentPerLevel: 2, category: null, statLabel: "Production d'énergie" },
  { id: 'semiconductors__energy_consumption', sourceType: 'research', sourceId: 'semiconductors', stat: 'energy_consumption', percentPerLevel: -2, category: null, statLabel: "Consommation d'énergie" },
  { id: 'armoredStorage__armored_storage', sourceType: 'research', sourceId: 'armoredStorage', stat: 'armored_storage', percentPerLevel: 5, category: null, statLabel: 'Protection blindée' },
  { id: 'volcanicWeaponry__weapons', sourceType: 'research', sourceId: 'volcanicWeaponry', stat: 'weapons', percentPerLevel: 10, category: null, statLabel: 'Degats des armes (Forge Volcanique)' },
  { id: 'aridArmor__armor', sourceType: 'research', sourceId: 'aridArmor', stat: 'armor', percentPerLevel: 10, category: null, statLabel: 'Coque et blindage (Laboratoire Aride)' },
  { id: 'temperateProduction__production_minerai', sourceType: 'research', sourceId: 'temperateProduction', stat: 'production_minerai', percentPerLevel: 2, category: null, statLabel: 'Production de minerai (Bio-Laboratoire)' },
  { id: 'temperateProduction__production_silicium', sourceType: 'research', sourceId: 'temperateProduction', stat: 'production_silicium', percentPerLevel: 2, category: null, statLabel: 'Production de silicium (Bio-Laboratoire)' },
  { id: 'temperateProduction__production_hydrogene', sourceType: 'research', sourceId: 'temperateProduction', stat: 'production_hydrogene', percentPerLevel: 2, category: null, statLabel: "Production d'hydrogene (Bio-Laboratoire)" },
  { id: 'glacialShielding__shielding', sourceType: 'research', sourceId: 'glacialShielding', stat: 'shielding', percentPerLevel: 10, category: null, statLabel: 'Puissance des boucliers (Cryo-Laboratoire)' },
  { id: 'gaseousPropulsion__ship_speed', sourceType: 'research', sourceId: 'gaseousPropulsion', stat: 'ship_speed', percentPerLevel: 10, category: null, statLabel: 'Vitesse des vaisseaux (Nebula-Lab)' },
];

// ── Mission definitions data ──

const MISSION_DEFINITIONS = [
  { id: 'transport', label: 'Transport', hint: 'Envoyez des ressources vers une planète alliée', buttonLabel: 'Envoyer', color: '#3b82f6', sortOrder: 1, dangerous: false, requiredShipRoles: null, exclusive: false, recommendedShipRoles: ['smallCargo', 'largeCargo'], requiresPveMission: false },
  { id: 'station', label: 'Stationner', hint: 'Stationnez votre flotte sur une planète alliée', buttonLabel: 'Envoyer', color: '#10b981', sortOrder: 2, dangerous: false, requiredShipRoles: null, exclusive: false, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'spy', label: 'Espionner', hint: "Envoyez des sondes d'espionnage", buttonLabel: 'Espionner', color: '#8b5cf6', sortOrder: 3, dangerous: false, requiredShipRoles: ['espionageProbe'], exclusive: true, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'attack', label: 'Attaque', hint: 'Attaquez une planète ennemie', buttonLabel: 'Attaquer', color: '#ef4444', sortOrder: 4, dangerous: true, requiredShipRoles: ['interceptor', 'frigate', 'cruiser', 'battlecruiser'], exclusive: false, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'colonize', label: 'Coloniser', hint: 'Colonisez une position vide', buttonLabel: 'Coloniser', color: '#f97316', sortOrder: 5, dangerous: true, requiredShipRoles: ['colonyShip'], exclusive: true, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'recycle', label: 'Recycler', hint: 'Récupérez les débris en orbite', buttonLabel: 'Recycler', color: '#06b6d4', sortOrder: 6, dangerous: false, requiredShipRoles: ['recycling'], exclusive: true, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'mine', label: 'Miner', hint: "Envoyez des prospecteurs sur une ceinture d'astéroïdes", buttonLabel: 'Envoyer', color: '#f59e0b', sortOrder: 7, dangerous: false, requiredShipRoles: ['mining'], exclusive: false, recommendedShipRoles: null, requiresPveMission: true },
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
  { id: 'explore', label: 'Explorer', hint: "Envoyez des explorateurs découvrir les biomes d'une planète", buttonLabel: 'Explorer', color: '#06b6d4', sortOrder: 10, dangerous: false, requiredShipRoles: ['exploration'], exclusive: true, recommendedShipRoles: ['exploration'], requiresPveMission: false },
  { id: 'colonize_reinforce', label: 'Renfort colonie', hint: 'Envoyez des vaisseaux pour sécuriser votre colonie', buttonLabel: 'Renforcer', color: '#3b82f6', sortOrder: 11, dangerous: false, requiredShipRoles: null, exclusive: false, recommendedShipRoles: null, requiresPveMission: false },
  { id: 'abandon_return', label: 'Abandon de colonie', hint: "Retour forcé après abandon d'une colonie", buttonLabel: 'Retour', color: '#f97316', sortOrder: 14, dangerous: false, requiredShipRoles: null, exclusive: false, recommendedShipRoles: null, requiresPveMission: true },
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
  { key: 'phase.exploring', label: 'Exploration en cours' },
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
  { key: 'event.friend-request', label: 'Demande d\'ami' },
  { key: 'event.friend-accepted', label: 'Ami accepté' },
  { key: 'event.friend-declined', label: 'Ami refusé' },
  { key: 'event.report-sold', label: 'Rapport vendu' },
  { key: 'event.report-purchased', label: 'Rapport acheté' },
  { key: 'event.market-offer-reserved', label: 'Offre réservée' },
  { key: 'event.market-offer-sold', label: 'Vente finalisée' },
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
  { key: 'combat_max_rounds', value: 6 },
  { key: 'combat_debris_ratio', value: 0.35 },
  { key: 'combat_defense_repair_rate', value: 0.5 },
  { key: 'combat_pillage_ratio', value: 0.33 },
  { key: 'protected_storage_base_ratio', value: 0.05 },
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
  { key: 'pve_loot_multiplier', value: 0.1 },
  // Exploration recon (P1)
  { key: 'pve_max_exploration_missions', value: 2 },
  { key: 'pve_exploration_min_distance', value: 3 },
  { key: 'pve_exploration_expiration_hours', value: 48 },

  // Anomalie gravitationnelle (rogue-lite V1)
  { key: 'anomaly_entry_cost_exilium', value: 5 },
  { key: 'anomaly_difficulty_growth', value: 1.3 },
  { key: 'anomaly_loot_base', value: 5000 },
  { key: 'anomaly_loot_growth', value: 1.4 },
  { key: 'anomaly_enemy_recovery_ratio', value: 0.15 },
  { key: 'anomaly_node_travel_seconds', value: 120 },

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
  { key: 'shipyard_time_divisor', value: 4500 },
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
  { key: 'report_creation_base_cost', value: '200' },
  { key: 'report_creation_biome_costs', value: '{"common":50,"uncommon":100,"rare":250,"epic":600,"legendary":1000}' },

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

  // ── Colonization & Governance ──
  { key: 'colonization_passive_rate', value: 0.11 },
  { key: 'colonization_consumption_minerai', value: 200 },
  { key: 'colonization_consumption_silicium', value: 100 },
  { key: 'colonization_outpost_threshold_minerai', value: 500 },
  { key: 'colonization_outpost_threshold_silicium', value: 250 },
  { key: 'colonization_grace_period_hours', value: 1 },
  { key: 'colonization_outpost_timeout_hours', value: 24 },
  { key: 'colonization_raid_interval_min', value: 3600 },
  { key: 'colonization_raid_interval_max', value: 5400 },
  { key: 'colonization_raid_travel_min', value: 1800 },
  { key: 'colonization_raid_travel_max', value: 3600 },
  { key: 'colonization_raid_stationed_fp_ratio', value: 0.001 },
  { key: 'colonization_raid_base_start_fp', value: 10 },
  { key: 'colonization_raid_ipc_start_exponent', value: 1.4 },
  { key: 'colonization_raid_base_cap_fp', value: 35 },
  { key: 'colonization_raid_ipc_cap_exponent', value: 1.8 },
  { key: 'colonization_raid_wave_growth', value: 2.0 },
  { key: 'colonization_raid_stationed_max_bonus', value: 0.5 },
  { key: 'colonization_raid_base_penalty', value: 0.08 },
  { key: 'colonization_raid_no_garrison_pillage', value: 0.50 },
  { key: 'colonization_raid_garrison_pillage', value: 0.33 },
  { key: 'governance_penalty_harvest', value: [0.15, 0.35, 0.60] },
  { key: 'governance_penalty_construction', value: [0.15, 0.35, 0.60] },
  { key: 'colonization_difficulty_temperate', value: 1.0 },
  { key: 'colonization_difficulty_arid', value: 0.95 },
  { key: 'colonization_difficulty_glacial', value: 0.95 },
  { key: 'colonization_difficulty_volcanic', value: 0.90 },
  { key: 'colonization_difficulty_gaseous', value: 0.90 },
  { key: 'colonization_distance_penalty_per_hop', value: 0.01 },
  { key: 'colonization_distance_floor', value: 0.90 },
  { key: 'colonization_rate_garrison_fp_threshold', value: 50 },
  { key: 'colonization_rate_garrison_bonus', value: 0.05 },
  { key: 'colonization_rate_convoy_bonus', value: 0.05 },
  { key: 'colonization_rate_convoy_window_hours', value: 2 },
  { key: 'colonization_rate_bonus_cap', value: 0.10 },

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
  { id: 'militaire', name: 'Militaire', description: 'Combat, attaque & defense', color: '#ff6b6b', sortOrder: 0 },
  { id: 'scientifique', name: 'Scientifique', description: 'Recherche, espionnage & information', color: '#4ecdc4', sortOrder: 1 },
  { id: 'industriel', name: 'Industriel', description: 'Production, minage & commerce', color: '#ffd93d', sortOrder: 2 },
];

// ── Hull Definitions ──

const HULLS = [
  {
    id: 'combat',
    name: 'Coque de combat',
    description: 'Vaisseau taillé pour la guerre. Bonus de stats de combat et réduction du temps de construction des vaisseaux militaires.',
    playstyle: 'warrior',
    passiveBonuses: {
      combat_build_time_reduction: 0.20,
      bonus_armor: 6,
      bonus_shot_count: 2,
      bonus_weapons: 8,
    },
    abilities: [],
    bonusLabels: [
      '+6 blindage',
      '+2 attaques',
      '+8 armes',
      '-20% temps construction vaisseaux militaires',
    ],
    changeCost: { baseMultiplier: 500, resourceRatio: { minerai: 3, silicium: 2, hydrogene: 1 } },
    unavailabilitySeconds: 300,
    cooldownSeconds: 300,
  },
  {
    id: 'industrial',
    name: 'Coque industrielle',
    description: 'Vaisseau optimisé pour l\'extraction et le recyclage. Réduction du temps de construction des vaisseaux industriels.',
    playstyle: 'miner',
    passiveBonuses: {
      industrial_build_time_reduction: 0.20,
    },
    abilities: [
      {
        id: 'mine_mission',
        name: 'Minage',
        description: 'Le vaisseau amiral peut participer aux missions de minage. Son extraction est egale a sa soute.',
        type: 'fleet_unlock',
        unlockedMissions: ['mine'],
        miningExtractionEqualsCargo: true,
      },
      {
        id: 'recycle_mission',
        name: 'Recyclage',
        description: 'Le vaisseau amiral peut participer aux missions de recyclage.',
        type: 'fleet_unlock',
        unlockedMissions: ['recycle'],
      },
    ],
    bonusLabels: [
      '-20% temps construction vaisseaux industriels',
      'Permet le minage et recyclage',
    ],
    changeCost: { baseMultiplier: 500, resourceRatio: { minerai: 3, silicium: 2, hydrogene: 1 } },
    unavailabilitySeconds: 300,
    cooldownSeconds: 300,
  },
  {
    id: 'scientific',
    name: 'Coque scientifique',
    description: 'Vaisseau orienté recherche et renseignement. Réduction du temps de recherche et capacité de scan.',
    playstyle: 'explorer',
    passiveBonuses: {
      research_time_reduction: 0.20,
    },
    abilities: [
      {
        id: 'scan_mission',
        name: 'Scan',
        description: 'Espionnage instantane, indetectable. Genere un rapport sans envoyer de sonde.',
        type: 'active',
        cooldownSeconds: 1800,
        params: { espionageBonus: 5 },
      },
    ],
    bonusLabels: [
      '-20% temps de recherche',
      'Mission de scan (espionnage)',
    ],
    changeCost: { baseMultiplier: 500, resourceRatio: { minerai: 3, silicium: 2, hydrogene: 1 } },
    unavailabilitySeconds: 300,
    cooldownSeconds: 300,
  },
];

// ── Talent Definitions ──

const TALENT_DEFINITIONS: Record<string, unknown>[] = [
  // === MILITAIRE === (combat, attaque, defense)
  // Tier 1
  { id: 'mil_weapons', branchId: 'militaire', tier: 1, position: 'left', name: 'Armes renforcees', description: '+2 armes par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'weapons', perRank: 2 }, sortOrder: 0 },
  { id: 'mil_armor', branchId: 'militaire', tier: 1, position: 'center', name: 'Blindage reactif', description: '+2 blindage par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'baseArmor', perRank: 2 }, sortOrder: 1 },
  { id: 'mil_shield', branchId: 'militaire', tier: 1, position: 'right', name: 'Boucliers amplifies', description: '+3 bouclier par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'shield', perRank: 3 }, sortOrder: 2 },
  // Tier 2
  { id: 'mil_build_time', branchId: 'militaire', tier: 2, position: 'center', name: 'Chaine de production', description: '-10% temps de construction vaisseaux militaires', maxRanks: 1, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'military_build_time', perRank: 0.10 }, sortOrder: 3 },
  { id: 'mil_repair', branchId: 'militaire', tier: 2, position: 'left', name: 'Reparation rapide', description: '-15% temps de reparation par rang', maxRanks: 3, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'flagship_repair_time', perRank: 0.15 }, sortOrder: 4 },
  // Tier 3
  { id: 'mil_parallel_build', branchId: 'militaire', tier: 3, position: 'center', name: 'Production militaire parallele', description: '+1 slot de construction militaire parallele (planete du flagship)', maxRanks: 1, prerequisiteId: 'mil_build_time', effectType: 'planet_bonus', effectParams: { key: 'military_parallel_build', perRank: 1 }, sortOrder: 5 },

  // === INDUSTRIEL === (production, minage, commerce)
  // Tier 1
  { id: 'ind_cargo', branchId: 'industriel', tier: 1, position: 'left', name: 'Soute etendue', description: '+1000 cargo par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'cargoCapacity', perRank: 1000 }, sortOrder: 0 },
  { id: 'ind_speed', branchId: 'industriel', tier: 1, position: 'center', name: 'Reacteurs optimises', description: '+10% vitesse par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'speedPercent', perRank: 0.10 }, sortOrder: 1 },
  { id: 'ind_hull', branchId: 'industriel', tier: 1, position: 'right', name: 'Coque renforcee', description: '+5 coque par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'hull', perRank: 5 }, sortOrder: 2 },
  // Tier 2
  { id: 'ind_build_time', branchId: 'industriel', tier: 2, position: 'center', name: 'Chaine de montage', description: '-10% temps de construction vaisseaux industriels', maxRanks: 1, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'industrial_build_time', perRank: 0.10 }, sortOrder: 3 },
  { id: 'ind_mining_speed', branchId: 'industriel', tier: 2, position: 'left', name: 'Forage accelere', description: '+15% vitesse de minage par rang', maxRanks: 3, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'mining_speed', perRank: 0.15 }, sortOrder: 4 },
  { id: 'ind_prospect_speed', branchId: 'industriel', tier: 2, position: 'right', name: 'Prospection avancee', description: '+15% vitesse de prospection par rang', maxRanks: 3, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'prospection_speed', perRank: 0.15 }, sortOrder: 5 },
  // Tier 3
  { id: 'ind_parallel_build', branchId: 'industriel', tier: 3, position: 'center', name: 'Production parallele', description: '+1 slot de construction industrielle parallele (planete du flagship)', maxRanks: 1, prerequisiteId: 'ind_build_time', effectType: 'planet_bonus', effectParams: { key: 'industrial_parallel_build', perRank: 1 }, sortOrder: 6 },

  // === SCIENTIFIQUE === (recherche, espionnage, information)
  // Tier 1
  { id: 'sci_fuel', branchId: 'scientifique', tier: 1, position: 'left', name: 'Economiseur', description: '-1 consommation carburant par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'fuelConsumption', perRank: -1 }, sortOrder: 0 },
  { id: 'sci_shots', branchId: 'scientifique', tier: 1, position: 'center', name: 'Tirs de precision', description: '+1 tir par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'shotCount', perRank: 1 }, sortOrder: 1 },
  { id: 'sci_shield', branchId: 'scientifique', tier: 1, position: 'right', name: 'Champ de force', description: '+2 bouclier par rang', maxRanks: 3, prerequisiteId: null, effectType: 'modify_stat', effectParams: { stat: 'shield', perRank: 2 }, sortOrder: 2 },
  // Tier 2
  { id: 'sci_research_time', branchId: 'scientifique', tier: 2, position: 'center', name: 'Protocoles avances', description: '-10% temps de recherche', maxRanks: 1, prerequisiteId: null, effectType: 'global_bonus', effectParams: { key: 'research_time', perRank: 0.10 }, sortOrder: 3 },
  { id: 'sci_energy', branchId: 'scientifique', tier: 2, position: 'left', name: 'Amplification energetique', description: '+2% production d\'energie par rang (planete du flagship)', maxRanks: 3, prerequisiteId: null, effectType: 'planet_bonus', effectParams: { key: 'energy_production', perRank: 0.02 }, sortOrder: 4 },
  // Tier 3
  { id: 'sci_shield_boost', branchId: 'scientifique', tier: 3, position: 'center', name: 'Bouclier renforce', description: '+1 niveau de bouclier planetaire par rang (planete du flagship)', maxRanks: 2, prerequisiteId: 'sci_energy', effectType: 'planet_bonus', effectParams: { key: 'shield_level_bonus', perRank: 1 }, sortOrder: 6 },
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

  // Biome definitions
  for (const biome of BIOME_DEFINITIONS) {
    await db.insert(biomeDefinitions).values(biome)
      .onConflictDoUpdate({ target: biomeDefinitions.id, set: { ...biome } });
  }
  console.log(`  ✓ ${BIOME_DEFINITIONS.length} biome definitions`);

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

  // 14. Tutorial chapters
  for (const chapter of TUTORIAL_CHAPTERS) {
    await db.insert(tutorialChapters).values(chapter).onConflictDoUpdate({
      target: tutorialChapters.id,
      set: {
        title: chapter.title,
        journalIntro: chapter.journalIntro,
        order: chapter.order,
        rewardMinerai: chapter.rewardMinerai,
        rewardSilicium: chapter.rewardSilicium,
        rewardHydrogene: chapter.rewardHydrogene,
        rewardExilium: chapter.rewardExilium,
        rewardUnits: chapter.rewardUnits,
      },
    });
  }
  console.log(`  ✓ ${TUTORIAL_CHAPTERS.length} tutorial chapters`);

  // 14b. Tutorial quest definitions
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

  // 15b. Convert any missionCenter previously built on a non-homeworld colony into a missionRelay (idempotent).
  // missionCenter is now restricted to homeworld; the level on the colony becomes the relay level.
  const relayMigration = await db.execute(sql`
    UPDATE planet_buildings pb
    SET building_id = 'missionRelay'
    FROM planets p
    WHERE pb.planet_id = p.id
      AND pb.building_id = 'missionCenter'
      AND p.planet_class_id IS DISTINCT FROM 'homeworld'
  `);
  console.log(`  ✓ Migrated ${(relayMigration as { count?: number }).count ?? 0} colony missionCenter rows to missionRelay`);

  // 16. Talent branches
  await db.delete(talentDefinitions);
  await db.delete(talentBranchDefinitions);
  await db.insert(talentBranchDefinitions).values(TALENT_BRANCHES);
  console.log(`  ✓ ${TALENT_BRANCHES.length} talent branches`);

  // 17. Talent definitions
  if (TALENT_DEFINITIONS.length > 0) {
    await db.insert(talentDefinitions).values(TALENT_DEFINITIONS);
  }
  console.log(`  ✓ ${TALENT_DEFINITIONS.length} talent definitions`);

  // 18. Hull definitions (stored as JSON in universe_config)
  await db.insert(universeConfig).values({ key: 'hulls', value: HULLS })
    .onConflictDoUpdate({ target: universeConfig.key, set: { value: HULLS } });
  console.log(`  ✓ ${HULLS.length} hull definitions`);

  // 19. Migrate existing flagships to industrial hull (idempotent)
  await db.execute(sql`
    UPDATE flagships SET hull_id = 'industrial' WHERE hull_id IS NULL
  `);
  await db.execute(sql`
    UPDATE users SET playstyle = 'miner'
    WHERE id IN (SELECT user_id FROM flagships WHERE hull_id = 'industrial')
    AND (playstyle IS NULL OR playstyle != 'miner')
  `);
  console.log(`  ✓ Migrated existing flagships to industrial hull`);

  console.log('Seed complete!');
  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
