import { eq, and, or } from 'drizzle-orm';
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
  rapidFire,
  productionConfig,
  universeConfig,
  planetTypes,
  planets,
  pirateTemplates,
  tutorialQuestDefinitions,
} from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { TRPCError } from '@trpc/server';

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
}

export interface GameConfig {
  categories: CategoryConfig[];
  buildings: Record<string, BuildingConfig>;
  research: Record<string, ResearchConfig>;
  ships: Record<string, ShipConfig>;
  defenses: Record<string, DefenseConfig>;
  rapidFire: Record<string, Record<string, number>>;
  production: Record<string, ProductionConfigEntry>;
  universe: Record<string, unknown>;
  planetTypes: PlanetTypeConfig[];
  pirateTemplates: PirateTemplateConfig[];
  tutorialQuests: TutorialQuestConfig[];
  bonuses: BonusConfig[];
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
  prerequisites: {
    buildings: { buildingId: string; level: number }[];
    research: { researchId: string; level: number }[];
  };
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
  armor: number;
  flavorText: string | null;
  categoryId: string | null;
  sortOrder: number;
  isStationary: boolean;
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
  armor: number;
  maxPerPlanet: number | null;
  flavorText: string | null;
  categoryId: string | null;
  sortOrder: number;
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
  fieldsBonus: number;
  sortOrder: number;
}

export interface ProductionConfigEntry {
  id: string;
  baseProduction: number;
  exponentBase: number;
  energyConsumption: number | null;
  storageBase: number | null;
}

export interface PirateTemplateConfig {
  id: string;
  name: string;
  tier: string;
  ships: Record<string, number>;
  techs: { weapons: number; shielding: number; armor: number };
  rewards: { minerai: number; silicium: number; hydrogene: number; bonusShips: { shipId: string; count: number; chance: number }[] };
  centerLevelMin: number;
  centerLevelMax: number;
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
}

let cache: GameConfig | null = null;

export function createGameConfigService(db: Database) {
  function invalidateCache() {
    cache = null;
  }

  async function getFullConfig(): Promise<GameConfig> {
    if (cache) return cache;

    // Load all data in parallel
    const [
      categoryRows,
      buildingRows,
      buildingPrereqRows,
      researchRows,
      researchPrereqRows,
      shipRows,
      shipPrereqRows,
      defenseRows,
      defensePrereqRows,
      rapidFireRows,
      productionRows,
      universeRows,
      planetTypeRows,
      pirateTemplateRows,
      tutorialQuestRows,
      bonusRows,
    ] = await Promise.all([
      db.select().from(entityCategories),
      db.select().from(buildingDefinitions),
      db.select().from(buildingPrerequisites),
      db.select().from(researchDefinitions),
      db.select().from(researchPrerequisites),
      db.select().from(shipDefinitions),
      db.select().from(shipPrerequisites),
      db.select().from(defenseDefinitions),
      db.select().from(defensePrerequisites),
      db.select().from(rapidFire),
      db.select().from(productionConfig),
      db.select().from(universeConfig),
      db.select().from(planetTypes),
      db.select().from(pirateTemplates),
      db.select().from(tutorialQuestDefinitions),
      db.select().from(bonusDefinitions),
    ]);

    // Categories
    const categories: CategoryConfig[] = categoryRows.map(c => ({
      id: c.id,
      entityType: c.entityType,
      name: c.name,
      sortOrder: c.sortOrder,
    }));

    // Buildings
    const buildings: Record<string, BuildingConfig> = {};
    for (const b of buildingRows) {
      buildings[b.id] = {
        id: b.id,
        name: b.name,
        description: b.description,
        baseCost: { minerai: b.baseCostMinerai, silicium: b.baseCostSilicium, hydrogene: b.baseCostHydrogene },
        costFactor: b.costFactor,
        baseTime: b.baseTime,
        flavorText: b.flavorText ?? null,
        categoryId: b.categoryId,
        sortOrder: b.sortOrder,
        prerequisites: buildingPrereqRows
          .filter(p => p.buildingId === b.id)
          .map(p => ({ buildingId: p.requiredBuildingId, level: p.requiredLevel })),
      };
    }

    // Research
    const research: Record<string, ResearchConfig> = {};
    for (const r of researchRows) {
      const prereqs = researchPrereqRows.filter(p => p.researchId === r.id);
      research[r.id] = {
        id: r.id,
        name: r.name,
        description: r.description,
        baseCost: { minerai: r.baseCostMinerai, silicium: r.baseCostSilicium, hydrogene: r.baseCostHydrogene },
        costFactor: r.costFactor,
        flavorText: r.flavorText ?? null,
        effectDescription: r.effectDescription ?? null,
        levelColumn: r.levelColumn,
        categoryId: r.categoryId,
        sortOrder: r.sortOrder,
        maxLevel: r.maxLevel ?? null,
        prerequisites: {
          buildings: prereqs.filter(p => p.requiredBuildingId).map(p => ({ buildingId: p.requiredBuildingId!, level: p.requiredLevel })),
          research: prereqs.filter(p => p.requiredResearchId).map(p => ({ researchId: p.requiredResearchId!, level: p.requiredLevel })),
        },
      };
    }

    // Ships
    const ships: Record<string, ShipConfig> = {};
    for (const s of shipRows) {
      const prereqs = shipPrereqRows.filter(p => p.shipId === s.id);
      ships[s.id] = {
        id: s.id,
        name: s.name,
        description: s.description,
        cost: { minerai: s.costMinerai, silicium: s.costSilicium, hydrogene: s.costHydrogene },
        countColumn: s.countColumn,
        baseSpeed: s.baseSpeed,
        fuelConsumption: s.fuelConsumption,
        cargoCapacity: s.cargoCapacity,
        driveType: s.driveType,
        miningExtraction: s.miningExtraction,
        weapons: s.weapons,
        shield: s.shield,
        armor: s.armor,
        flavorText: s.flavorText ?? null,
        categoryId: s.categoryId,
        sortOrder: s.sortOrder,
        isStationary: s.isStationary,
        prerequisites: {
          buildings: prereqs.filter(p => p.requiredBuildingId).map(p => ({ buildingId: p.requiredBuildingId!, level: p.requiredLevel })),
          research: prereqs.filter(p => p.requiredResearchId).map(p => ({ researchId: p.requiredResearchId!, level: p.requiredLevel })),
        },
      };
    }

    // Defenses
    const defenses: Record<string, DefenseConfig> = {};
    for (const d of defenseRows) {
      const prereqs = defensePrereqRows.filter(p => p.defenseId === d.id);
      defenses[d.id] = {
        id: d.id,
        name: d.name,
        description: d.description,
        cost: { minerai: d.costMinerai, silicium: d.costSilicium, hydrogene: d.costHydrogene },
        countColumn: d.countColumn,
        weapons: d.weapons,
        shield: d.shield,
        armor: d.armor,
        maxPerPlanet: d.maxPerPlanet,
        flavorText: d.flavorText ?? null,
        categoryId: d.categoryId,
        sortOrder: d.sortOrder,
        prerequisites: {
          buildings: prereqs.filter(p => p.requiredBuildingId).map(p => ({ buildingId: p.requiredBuildingId!, level: p.requiredLevel })),
          research: prereqs.filter(p => p.requiredResearchId).map(p => ({ researchId: p.requiredResearchId!, level: p.requiredLevel })),
        },
      };
    }

    // Rapid fire
    const rf: Record<string, Record<string, number>> = {};
    for (const r of rapidFireRows) {
      if (!rf[r.attackerId]) rf[r.attackerId] = {};
      rf[r.attackerId][r.targetId] = r.value;
    }

    // Production
    const production: Record<string, ProductionConfigEntry> = {};
    for (const p of productionRows) {
      production[p.id] = {
        id: p.id,
        baseProduction: p.baseProduction,
        exponentBase: p.exponentBase,
        energyConsumption: p.energyConsumption,
        storageBase: p.storageBase,
      };
    }

    // Universe
    const universe: Record<string, unknown> = {};
    for (const u of universeRows) {
      universe[u.key] = u.value;
    }

    // Planet types
    const ptConfigs: PlanetTypeConfig[] = planetTypeRows.map(pt => ({
      id: pt.id,
      name: pt.name,
      description: pt.description,
      positions: pt.positions as number[],
      mineraiBonus: pt.mineraiBonus,
      siliciumBonus: pt.siliciumBonus,
      hydrogeneBonus: pt.hydrogeneBonus,
      diameterMin: pt.diameterMin,
      diameterMax: pt.diameterMax,
      fieldsBonus: pt.fieldsBonus,
      sortOrder: pt.sortOrder,
    }));

    // Pirate templates
    const ptTemplates: PirateTemplateConfig[] = pirateTemplateRows.map(pt => ({
      id: pt.id,
      name: pt.name,
      tier: pt.tier,
      ships: pt.ships as Record<string, number>,
      techs: pt.techs as { weapons: number; shielding: number; armor: number },
      rewards: pt.rewards as { minerai: number; silicium: number; hydrogene: number; bonusShips: { shipId: string; count: number; chance: number }[] },
      centerLevelMin: pt.centerLevelMin,
      centerLevelMax: pt.centerLevelMax,
    }));

    // Tutorial quests
    const tqConfigs: TutorialQuestConfig[] = tutorialQuestRows.map(tq => ({
      id: tq.id,
      order: tq.order,
      title: tq.title,
      narrativeText: tq.narrativeText,
      conditionType: tq.conditionType,
      conditionTargetId: tq.conditionTargetId,
      conditionTargetValue: tq.conditionTargetValue,
      rewardMinerai: tq.rewardMinerai,
      rewardSilicium: tq.rewardSilicium,
      rewardHydrogene: tq.rewardHydrogene,
    }));

    // Bonuses
    const bonuses: BonusConfig[] = bonusRows.map(b => ({
      id: b.id,
      sourceType: b.sourceType as 'building' | 'research',
      sourceId: b.sourceId,
      stat: b.stat,
      percentPerLevel: b.percentPerLevel,
      category: b.category,
    }));

    cache = { categories, buildings, research, ships, defenses, rapidFire: rf, production, universe, planetTypes: ptConfigs, pirateTemplates: ptTemplates, tutorialQuests: tqConfigs, bonuses };
    return cache;
  }

  return {
    getFullConfig,
    invalidateCache,

    async createCategory(data: { id: string; entityType: string; name: string; sortOrder: number }) {
      await db.insert(entityCategories).values(data);
      invalidateCache();
    },

    async updateCategory(id: string, data: Partial<{ name: string; sortOrder: number }>) {
      await db.update(entityCategories).set(data).where(eq(entityCategories.id, id));
      invalidateCache();
    },

    async deleteCategory(id: string) {
      await db.delete(entityCategories).where(eq(entityCategories.id, id));
      invalidateCache();
    },

    async createBuilding(data: {
      id: string;
      name: string;
      description?: string;
      baseCostMinerai?: number;
      baseCostSilicium?: number;
      baseCostHydrogene?: number;
      costFactor?: number;
      baseTime?: number;
      flavorText?: string | null;
      categoryId?: string | null;
      sortOrder?: number;
    }) {
      await db.insert(buildingDefinitions).values({
        id: data.id,
        name: data.name,
        description: data.description ?? '',
        baseCostMinerai: data.baseCostMinerai ?? 0,
        baseCostSilicium: data.baseCostSilicium ?? 0,
        baseCostHydrogene: data.baseCostHydrogene ?? 0,
        costFactor: data.costFactor ?? 1.5,
        baseTime: data.baseTime ?? 60,
        flavorText: data.flavorText ?? null,
        categoryId: data.categoryId ?? null,
        sortOrder: data.sortOrder ?? 0,
      });
      invalidateCache();
    },

    async deleteBuilding(id: string) {
      // Check if referenced as prerequisite by other buildings
      const buildingPrereqRefs = await db.select().from(buildingPrerequisites)
        .where(eq(buildingPrerequisites.requiredBuildingId, id));
      if (buildingPrereqRefs.length > 0) {
        const refIds = [...new Set(buildingPrereqRefs.map(r => r.buildingId))];
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce bâtiment est requis comme prérequis par: ${refIds.join(', ')}`,
        });
      }
      // Check if referenced as prerequisite by research
      const researchPrereqRefs = await db.select().from(researchPrerequisites)
        .where(eq(researchPrerequisites.requiredBuildingId, id));
      if (researchPrereqRefs.length > 0) {
        const refIds = [...new Set(researchPrereqRefs.map(r => r.researchId))];
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce bâtiment est requis comme prérequis par les recherches: ${refIds.join(', ')}`,
        });
      }
      // Check if referenced as prerequisite by ships
      const shipPrereqRefs = await db.select().from(shipPrerequisites)
        .where(eq(shipPrerequisites.requiredBuildingId, id));
      if (shipPrereqRefs.length > 0) {
        const refIds = [...new Set(shipPrereqRefs.map(r => r.shipId))];
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce bâtiment est requis comme prérequis par les vaisseaux: ${refIds.join(', ')}`,
        });
      }
      // Check if referenced as prerequisite by defenses
      const defensePrereqRefs = await db.select().from(defensePrerequisites)
        .where(eq(defensePrerequisites.requiredBuildingId, id));
      if (defensePrereqRefs.length > 0) {
        const refIds = [...new Set(defensePrereqRefs.map(r => r.defenseId))];
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce bâtiment est requis comme prérequis par les défenses: ${refIds.join(', ')}`,
        });
      }
      await db.delete(buildingDefinitions).where(eq(buildingDefinitions.id, id));
      invalidateCache();
    },

    async updateBuilding(id: string, data: Partial<{
      name: string;
      description: string;
      baseCostMinerai: number;
      baseCostSilicium: number;
      baseCostHydrogene: number;
      costFactor: number;
      baseTime: number;
      flavorText: string | null;
      categoryId: string | null;
      sortOrder: number;
    }>) {
      await db.update(buildingDefinitions).set(data).where(eq(buildingDefinitions.id, id));
      invalidateCache();
    },

    async updateBuildingPrerequisites(buildingId: string, prereqs: { requiredBuildingId: string; requiredLevel: number }[]) {
      await db.delete(buildingPrerequisites).where(eq(buildingPrerequisites.buildingId, buildingId));
      if (prereqs.length > 0) {
        await db.insert(buildingPrerequisites).values(prereqs.map(p => ({ buildingId, ...p })));
      }
      invalidateCache();
    },

    async createResearch(data: {
      id: string;
      name: string;
      description?: string;
      baseCostMinerai?: number;
      baseCostSilicium?: number;
      baseCostHydrogene?: number;
      costFactor?: number;
      flavorText?: string | null;
      effectDescription?: string | null;
      levelColumn: string;
      categoryId?: string | null;
      sortOrder?: number;
    }) {
      await db.insert(researchDefinitions).values({
        id: data.id,
        name: data.name,
        description: data.description ?? '',
        baseCostMinerai: data.baseCostMinerai ?? 0,
        baseCostSilicium: data.baseCostSilicium ?? 0,
        baseCostHydrogene: data.baseCostHydrogene ?? 0,
        costFactor: data.costFactor ?? 2,
        flavorText: data.flavorText ?? null,
        effectDescription: data.effectDescription ?? null,
        levelColumn: data.levelColumn,
        categoryId: data.categoryId ?? null,
        sortOrder: data.sortOrder ?? 0,
      });
      invalidateCache();
    },

    async deleteResearch(id: string) {
      // Check if referenced as prerequisite by other research
      const researchPrereqRefs = await db.select().from(researchPrerequisites)
        .where(eq(researchPrerequisites.requiredResearchId, id));
      if (researchPrereqRefs.length > 0) {
        const refIds = [...new Set(researchPrereqRefs.map(r => r.researchId))];
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cette recherche est requise comme prérequis par: ${refIds.join(', ')}`,
        });
      }
      // Check if referenced as prerequisite by ships
      const shipPrereqRefs = await db.select().from(shipPrerequisites)
        .where(eq(shipPrerequisites.requiredResearchId, id));
      if (shipPrereqRefs.length > 0) {
        const refIds = [...new Set(shipPrereqRefs.map(r => r.shipId))];
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cette recherche est requise comme prérequis par les vaisseaux: ${refIds.join(', ')}`,
        });
      }
      // Check if referenced as prerequisite by defenses
      const defensePrereqRefs = await db.select().from(defensePrerequisites)
        .where(eq(defensePrerequisites.requiredResearchId, id));
      if (defensePrereqRefs.length > 0) {
        const refIds = [...new Set(defensePrereqRefs.map(r => r.defenseId))];
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cette recherche est requise comme prérequis par les défenses: ${refIds.join(', ')}`,
        });
      }
      await db.delete(researchDefinitions).where(eq(researchDefinitions.id, id));
      invalidateCache();
    },

    async updateResearch(id: string, data: Partial<{
      name: string;
      description: string;
      baseCostMinerai: number;
      baseCostSilicium: number;
      baseCostHydrogene: number;
      costFactor: number;
      flavorText: string | null;
      effectDescription: string | null;
      categoryId: string | null;
      sortOrder: number;
    }>) {
      await db.update(researchDefinitions).set(data).where(eq(researchDefinitions.id, id));
      invalidateCache();
    },

    async updateResearchPrerequisites(researchId: string, prereqs: { requiredBuildingId?: string; requiredResearchId?: string; requiredLevel: number }[]) {
      await db.delete(researchPrerequisites).where(eq(researchPrerequisites.researchId, researchId));
      if (prereqs.length > 0) {
        await db.insert(researchPrerequisites).values(prereqs.map(p => ({
          researchId,
          requiredBuildingId: p.requiredBuildingId ?? null,
          requiredResearchId: p.requiredResearchId ?? null,
          requiredLevel: p.requiredLevel,
        })));
      }
      invalidateCache();
    },

    async createShip(data: {
      id: string;
      name: string;
      description?: string;
      costMinerai?: number;
      costSilicium?: number;
      costHydrogene?: number;
      countColumn: string;
      baseSpeed?: number;
      fuelConsumption?: number;
      cargoCapacity?: number;
      driveType?: string;
      miningExtraction?: number;
      weapons?: number;
      shield?: number;
      armor?: number;
      flavorText?: string | null;
      categoryId?: string | null;
      sortOrder?: number;
    }) {
      await db.insert(shipDefinitions).values({
        id: data.id,
        name: data.name,
        description: data.description ?? '',
        costMinerai: data.costMinerai ?? 0,
        costSilicium: data.costSilicium ?? 0,
        costHydrogene: data.costHydrogene ?? 0,
        countColumn: data.countColumn,
        baseSpeed: data.baseSpeed ?? 0,
        fuelConsumption: data.fuelConsumption ?? 0,
        cargoCapacity: data.cargoCapacity ?? 0,
        driveType: data.driveType ?? 'combustion',
        miningExtraction: data.miningExtraction ?? 0,
        weapons: data.weapons ?? 0,
        shield: data.shield ?? 0,
        armor: data.armor ?? 0,
        flavorText: data.flavorText ?? null,
        categoryId: data.categoryId ?? null,
        sortOrder: data.sortOrder ?? 0,
      });
      invalidateCache();
    },

    async deleteShip(id: string) {
      // Check if referenced in rapid fire
      const rapidFireRefs = await db.select().from(rapidFire)
        .where(or(eq(rapidFire.attackerId, id), eq(rapidFire.targetId, id)));
      if (rapidFireRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce vaisseau est référencé dans la matrice de tir rapide. Supprimez d'abord ces entrées.`,
        });
      }
      await db.delete(shipDefinitions).where(eq(shipDefinitions.id, id));
      invalidateCache();
    },

    async updateShip(id: string, data: Partial<{
      name: string;
      description: string;
      costMinerai: number;
      costSilicium: number;
      costHydrogene: number;
      baseSpeed: number;
      fuelConsumption: number;
      cargoCapacity: number;
      driveType: string;
      miningExtraction: number;
      weapons: number;
      shield: number;
      armor: number;
      flavorText: string | null;
      categoryId: string | null;
      sortOrder: number;
    }>) {
      await db.update(shipDefinitions).set(data).where(eq(shipDefinitions.id, id));
      invalidateCache();
    },

    async updateShipPrerequisites(shipId: string, prereqs: { requiredBuildingId?: string; requiredResearchId?: string; requiredLevel: number }[]) {
      await db.delete(shipPrerequisites).where(eq(shipPrerequisites.shipId, shipId));
      if (prereqs.length > 0) {
        await db.insert(shipPrerequisites).values(prereqs.map(p => ({
          shipId,
          requiredBuildingId: p.requiredBuildingId ?? null,
          requiredResearchId: p.requiredResearchId ?? null,
          requiredLevel: p.requiredLevel,
        })));
      }
      invalidateCache();
    },

    async createDefense(data: {
      id: string;
      name: string;
      description?: string;
      costMinerai?: number;
      costSilicium?: number;
      costHydrogene?: number;
      countColumn: string;
      weapons?: number;
      shield?: number;
      armor?: number;
      maxPerPlanet?: number | null;
      flavorText?: string | null;
      categoryId?: string | null;
      sortOrder?: number;
    }) {
      await db.insert(defenseDefinitions).values({
        id: data.id,
        name: data.name,
        description: data.description ?? '',
        costMinerai: data.costMinerai ?? 0,
        costSilicium: data.costSilicium ?? 0,
        costHydrogene: data.costHydrogene ?? 0,
        countColumn: data.countColumn,
        weapons: data.weapons ?? 0,
        shield: data.shield ?? 0,
        armor: data.armor ?? 0,
        maxPerPlanet: data.maxPerPlanet ?? null,
        flavorText: data.flavorText ?? null,
        categoryId: data.categoryId ?? null,
        sortOrder: data.sortOrder ?? 0,
      });
      invalidateCache();
    },

    async deleteDefense(id: string) {
      // Check if referenced in rapid fire
      const rapidFireRefs = await db.select().from(rapidFire)
        .where(or(eq(rapidFire.attackerId, id), eq(rapidFire.targetId, id)));
      if (rapidFireRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cette défense est référencée dans la matrice de tir rapide. Supprimez d'abord ces entrées.`,
        });
      }
      await db.delete(defenseDefinitions).where(eq(defenseDefinitions.id, id));
      invalidateCache();
    },

    async updateDefense(id: string, data: Partial<{
      name: string;
      description: string;
      costMinerai: number;
      costSilicium: number;
      costHydrogene: number;
      weapons: number;
      shield: number;
      armor: number;
      maxPerPlanet: number | null;
      flavorText: string | null;
      categoryId: string | null;
      sortOrder: number;
    }>) {
      await db.update(defenseDefinitions).set(data).where(eq(defenseDefinitions.id, id));
      invalidateCache();
    },

    async updateDefensePrerequisites(defenseId: string, prereqs: { requiredBuildingId?: string; requiredResearchId?: string; requiredLevel: number }[]) {
      await db.delete(defensePrerequisites).where(eq(defensePrerequisites.defenseId, defenseId));
      if (prereqs.length > 0) {
        await db.insert(defensePrerequisites).values(prereqs.map(p => ({
          defenseId,
          requiredBuildingId: p.requiredBuildingId ?? null,
          requiredResearchId: p.requiredResearchId ?? null,
          requiredLevel: p.requiredLevel,
        })));
      }
      invalidateCache();
    },

    async updateRapidFire(attackerId: string, targetId: string, value: number) {
      await db.insert(rapidFire).values({ attackerId, targetId, value })
        .onConflictDoUpdate({
          target: [rapidFire.attackerId, rapidFire.targetId],
          set: { value },
        });
      invalidateCache();
    },

    async deleteRapidFire(attackerId: string, targetId: string) {
      await db.delete(rapidFire)
        .where(eq(rapidFire.attackerId, attackerId));
      // More precise: delete where both match
      invalidateCache();
    },

    async updateProductionConfig(id: string, data: Partial<{
      baseProduction: number;
      exponentBase: number;
      energyConsumption: number | null;
      storageBase: number | null;
    }>) {
      await db.update(productionConfig).set(data).where(eq(productionConfig.id, id));
      invalidateCache();
    },

    async updateUniverseConfig(key: string, value: unknown) {
      await db.insert(universeConfig).values({ key, value })
        .onConflictDoUpdate({ target: universeConfig.key, set: { value } });
      invalidateCache();
    },

    async createPlanetType(data: {
      id: string;
      name: string;
      description?: string;
      positions: number[];
      mineraiBonus?: number;
      siliciumBonus?: number;
      hydrogeneBonus?: number;
      diameterMin: number;
      diameterMax: number;
      fieldsBonus?: number;
      sortOrder?: number;
    }) {
      await db.insert(planetTypes).values({
        id: data.id,
        name: data.name,
        description: data.description ?? '',
        positions: data.positions,
        mineraiBonus: data.mineraiBonus ?? 1.0,
        siliciumBonus: data.siliciumBonus ?? 1.0,
        hydrogeneBonus: data.hydrogeneBonus ?? 1.0,
        diameterMin: data.diameterMin,
        diameterMax: data.diameterMax,
        fieldsBonus: data.fieldsBonus ?? 1.0,
        sortOrder: data.sortOrder ?? 0,
      });
      invalidateCache();
    },

    async updatePlanetType(id: string, data: Partial<{
      name: string;
      description: string;
      positions: number[];
      mineraiBonus: number;
      siliciumBonus: number;
      hydrogeneBonus: number;
      diameterMin: number;
      diameterMax: number;
      fieldsBonus: number;
      sortOrder: number;
    }>) {
      await db.update(planetTypes).set(data).where(eq(planetTypes.id, id));
      invalidateCache();
    },

    async deletePlanetType(id: string) {
      const refs = await db.select({ id: planets.id }).from(planets)
        .where(eq(planets.planetClassId, id)).limit(1);
      if (refs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce type de planète est utilisé par des planètes existantes. Impossible de le supprimer.`,
        });
      }
      await db.delete(planetTypes).where(eq(planetTypes.id, id));
      invalidateCache();
    },

    // ── Pirate templates ──

    async createPirateTemplate(data: {
      id: string;
      name: string;
      tier: string;
      ships: Record<string, number>;
      techs: { weapons: number; shielding: number; armor: number };
      rewards: { minerai: number; silicium: number; hydrogene: number; bonusShips: { shipId: string; count: number; chance: number }[] };
      centerLevelMin: number;
      centerLevelMax: number;
    }) {
      await db.insert(pirateTemplates).values(data);
      invalidateCache();
    },

    async updatePirateTemplate(id: string, data: Partial<{
      name: string;
      tier: string;
      ships: Record<string, number>;
      techs: { weapons: number; shielding: number; armor: number };
      rewards: { minerai: number; silicium: number; hydrogene: number; bonusShips: { shipId: string; count: number; chance: number }[] };
      centerLevelMin: number;
      centerLevelMax: number;
    }>) {
      await db.update(pirateTemplates).set(data).where(eq(pirateTemplates.id, id));
      invalidateCache();
    },

    async deletePirateTemplate(id: string) {
      await db.delete(pirateTemplates).where(eq(pirateTemplates.id, id));
      invalidateCache();
    },

    // ── Tutorial quests ──

    async createTutorialQuest(data: {
      id: string;
      order: number;
      title: string;
      narrativeText: string;
      conditionType: string;
      conditionTargetId: string;
      conditionTargetValue: number;
      rewardMinerai?: number;
      rewardSilicium?: number;
      rewardHydrogene?: number;
    }) {
      await db.insert(tutorialQuestDefinitions).values({
        id: data.id,
        order: data.order,
        title: data.title,
        narrativeText: data.narrativeText,
        conditionType: data.conditionType,
        conditionTargetId: data.conditionTargetId,
        conditionTargetValue: data.conditionTargetValue,
        rewardMinerai: data.rewardMinerai ?? 0,
        rewardSilicium: data.rewardSilicium ?? 0,
        rewardHydrogene: data.rewardHydrogene ?? 0,
      });
      invalidateCache();
    },

    async updateTutorialQuest(id: string, data: Partial<{
      order: number;
      title: string;
      narrativeText: string;
      conditionType: string;
      conditionTargetId: string;
      conditionTargetValue: number;
      rewardMinerai: number;
      rewardSilicium: number;
      rewardHydrogene: number;
    }>) {
      await db.update(tutorialQuestDefinitions).set(data).where(eq(tutorialQuestDefinitions.id, id));
      invalidateCache();
    },

    async deleteTutorialQuest(id: string) {
      await db.delete(tutorialQuestDefinitions).where(eq(tutorialQuestDefinitions.id, id));
      invalidateCache();
    },

    // ── Bonus definitions ──

    async createBonus(data: {
      id: string;
      sourceType: string;
      sourceId: string;
      stat: string;
      percentPerLevel: number;
      category?: string | null;
    }) {
      await db.insert(bonusDefinitions).values({
        id: data.id,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        stat: data.stat,
        percentPerLevel: data.percentPerLevel,
        category: data.category ?? null,
      });
      invalidateCache();
    },

    async updateBonus(id: string, data: Partial<{
      stat: string;
      percentPerLevel: number;
      category: string | null;
    }>) {
      await db.update(bonusDefinitions).set(data).where(eq(bonusDefinitions.id, id));
      invalidateCache();
    },

    async deleteBonus(id: string) {
      await db.delete(bonusDefinitions).where(eq(bonusDefinitions.id, id));
      invalidateCache();
    },
  };
}

export type GameConfigService = ReturnType<typeof createGameConfigService>;
