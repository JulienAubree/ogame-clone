// Game config interfaces shared across the API. Separated from
// game-config.service.ts so that pure helpers (build-config.ts, crud-helper.ts)
// can import them without pulling in the cache + service instantiation.
export interface CategoryConfig {
  id: string;
  entityType: string;
  name: string;
  sortOrder: number;
}

export interface BonusConfig {
  id: string;
  sourceType: 'building' | 'research';
  sourceId: string;
  stat: string;
  percentPerLevel: number;
  category: string | null;
  statLabel: string | null;
}

export interface MissionConfig {
  id: string;
  label: string;
  hint: string;
  buttonLabel: string;
  color: string;
  sortOrder: number;
  dangerous: boolean;
  requiredShipRoles: string[] | null;
  exclusive: boolean;
  recommendedShipRoles: string[] | null;
  requiresPveMission: boolean;
}

export interface TalentBranchConfig {
  id: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
}

export interface TalentConfig {
  id: string;
  branchId: string;
  tier: number;
  position: string;
  name: string;
  description: string;
  maxRanks: number;
  prerequisiteId: string | null;
  effectType: string;
  effectParams: Record<string, unknown>;
  sortOrder: number;
}

export interface HullAbility {
  id: string;
  name: string;
  description: string;
  type: 'fleet_unlock' | 'active';
  /** Missions que le flagship peut rejoindre (type fleet_unlock) */
  unlockedMissions?: string[];
  /** L'extraction miniere du flagship = sa soute (type fleet_unlock) */
  miningExtractionEqualsCargo?: boolean;
  /** Cooldown en secondes (type active) */
  cooldownSeconds?: number;
  /** Parametres specifiques a la capacite */
  params?: Record<string, unknown>;
}

/**
 * V7-WeaponProfiles : profil d'arme "de base" du hull. Combiné avec
 * `weapons` / `shotCount` du flagship pour produire le tir de coque.
 * Les modules d'arme équipés (kind='weapon') ajoutent des profils
 * supplémentaires en plus de celui-ci.
 */
export interface HullDefaultWeaponProfile {
  targetCategory?: string;
  rafale?: { category?: string; count: number };
  hasChainKill?: boolean;
}

export interface HullConfig {
  id: string;
  name: string;
  description: string;
  playstyle: 'warrior' | 'miner' | 'explorer';
  passiveBonuses: Record<string, number>;
  abilities: HullAbility[];
  changeCost: {
    baseMultiplier: number;
    resourceRatio: { minerai: number; silicium: number; hydrogene: number };
  };
  unavailabilitySeconds: number;
  cooldownSeconds: number;
  bonusLabels: string[];
  /** V7-WeaponProfiles : profil d'arme de base du hull. Optional pour back-compat. */
  defaultWeaponProfile?: HullDefaultWeaponProfile;
}

export interface BiomeConfig {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  compatiblePlanetTypes: string[];
  effects: Array<{ stat: string; category?: string; modifier: number }>;
}

export interface GameConfig {
  categories: CategoryConfig[];
  buildings: Record<string, BuildingConfig>;
  research: Record<string, ResearchConfig>;
  ships: Record<string, ShipConfig>;
  defenses: Record<string, DefenseConfig>;
  production: Record<string, ProductionConfigEntry>;
  universe: Record<string, unknown>;
  planetTypes: PlanetTypeConfig[];
  pirateTemplates: PirateTemplateConfig[];
  tutorialQuests: TutorialQuestConfig[];
  bonuses: BonusConfig[];
  missions: Record<string, MissionConfig>;
  labels: Record<string, string>;
  talentBranches: TalentBranchConfig[];
  talents: Record<string, TalentConfig>;
  hulls: Record<string, HullConfig>;
  biomes: BiomeConfig[];
  /**
   * Pre-parsed universe values that were previously `JSON.parse(String(...))` on
   * every fleet-send / detection call. Cached here means they're built once
   * per cache fill instead of on every request.
   */
  attackDetection: {
    scoreThresholds: number[];
    timingPercents: number[];
  };
}

export interface BuildingConfig {
  id: string;
  name: string;
  description: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  baseTime: number;
  flavorText: string | null;
  categoryId: string | null;
  sortOrder: number;
  role: string | null;
  allowedPlanetTypes: string[] | null;
  variantPlanetTypes: string[];
  prerequisites: { buildingId: string; level: number }[];
}

export interface ResearchConfig {
  id: string;
  name: string;
  description: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  flavorText: string | null;
  effectDescription: string | null;
  levelColumn: string;
  categoryId: string | null;
  sortOrder: number;
  maxLevel: number | null;
  requiredAnnexType: string | null;
  prerequisites: {
    buildings: { buildingId: string; level: number }[];
    research: { researchId: string; level: number }[];
  };
}

export interface WeaponProfileConfig {
  damage: number;
  shots: number;
  targetCategory: string;
  rafale?: { category: string; count: number };
  hasChainKill?: boolean;
}

export interface ShipConfig {
  id: string;
  name: string;
  description: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  countColumn: string;
  baseSpeed: number;
  fuelConsumption: number;
  cargoCapacity: number;
  driveType: string;
  miningExtraction: number;
  weapons: number;
  shield: number;
  hull: number;
  baseArmor: number;
  shotCount: number;
  weaponProfiles: WeaponProfileConfig[];
  combatCategoryId: string | null;
  flavorText: string | null;
  categoryId: string | null;
  sortOrder: number;
  isStationary: boolean;
  role: string | null;
  prerequisites: {
    buildings: { buildingId: string; level: number }[];
    research: { researchId: string; level: number }[];
  };
}

export interface DefenseConfig {
  id: string;
  name: string;
  description: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  countColumn: string;
  weapons: number;
  shield: number;
  hull: number;
  baseArmor: number;
  shotCount: number;
  weaponProfiles: WeaponProfileConfig[];
  combatCategoryId: string | null;
  maxPerPlanet: number | null;
  flavorText: string | null;
  categoryId: string | null;
  sortOrder: number;
  variantPlanetTypes: string[];
  prerequisites: {
    buildings: { buildingId: string; level: number }[];
    research: { researchId: string; level: number }[];
  };
}

export interface PlanetTypeConfig {
  id: string;
  name: string;
  description: string;
  positions: number[];
  mineraiBonus: number;
  siliciumBonus: number;
  hydrogeneBonus: number;
  diameterMin: number;
  diameterMax: number;
  sortOrder: number;
  role: string | null;
}

export interface ProductionConfigEntry {
  id: string;
  baseProduction: number;
  exponentBase: number;
  energyConsumption: number | null;
  storageBase: number | null;
  tempCoeffA: number | null;
  tempCoeffB: number | null;
}

export interface PirateTemplateConfig {
  id: string;
  name: string;
  tier: string;
  ships: Record<string, number>;
  rewards: { minerai: number; silicium: number; hydrogene: number; bonusShips: { shipId: string; count: number; chance: number }[] };
}

export interface TutorialQuestConfig {
  id: string;
  order: number;
  title: string;
  narrativeText: string;
  conditionType: string;
  conditionTargetId: string;
  conditionTargetValue: number;
  rewardMinerai: number;
  rewardSilicium: number;
  rewardHydrogene: number;
  conditionLabel: string | null;
}

