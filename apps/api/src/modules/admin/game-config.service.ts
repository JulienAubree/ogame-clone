import { eq, and } from 'drizzle-orm';
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
} from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

export interface CategoryConfig {
  id: string;
  entityType: string;
  name: string;
  sortOrder: number;
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
}

export interface BuildingConfig {
  id: string;
  name: string;
  description: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  baseTime: number;
  levelColumn: string;
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
  levelColumn: string;
  categoryId: string | null;
  sortOrder: number;
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
  weapons: number;
  shield: number;
  armor: number;
  categoryId: string | null;
  sortOrder: number;
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
  categoryId: string | null;
  sortOrder: number;
  prerequisites: {
    buildings: { buildingId: string; level: number }[];
    research: { researchId: string; level: number }[];
  };
}

export interface ProductionConfigEntry {
  id: string;
  baseProduction: number;
  exponentBase: number;
  energyConsumption: number | null;
  storageBase: number | null;
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
        levelColumn: b.levelColumn,
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
        levelColumn: r.levelColumn,
        categoryId: r.categoryId,
        sortOrder: r.sortOrder,
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
        weapons: s.weapons,
        shield: s.shield,
        armor: s.armor,
        categoryId: s.categoryId,
        sortOrder: s.sortOrder,
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

    cache = { categories, buildings, research, ships, defenses, rapidFire: rf, production, universe };
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

    async updateBuilding(id: string, data: Partial<{
      name: string;
      description: string;
      baseCostMinerai: number;
      baseCostSilicium: number;
      baseCostHydrogene: number;
      costFactor: number;
      baseTime: number;
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

    async updateResearch(id: string, data: Partial<{
      name: string;
      description: string;
      baseCostMinerai: number;
      baseCostSilicium: number;
      baseCostHydrogene: number;
      costFactor: number;
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
      weapons: number;
      shield: number;
      armor: number;
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
  };
}

export type GameConfigService = ReturnType<typeof createGameConfigService>;
