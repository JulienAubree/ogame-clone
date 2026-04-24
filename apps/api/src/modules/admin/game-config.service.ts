import { eq } from 'drizzle-orm';
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
  planets,
  pirateTemplates,
  tutorialQuestDefinitions,
  missionDefinitions,
  uiLabels,
  talentBranchDefinitions,
  talentDefinitions,
} from '@exilium/db';
import type { Database } from '@exilium/db';
import type Redis from 'ioredis';
import { TRPCError } from '@trpc/server';
import { buildConfigFromDb } from './game-config/build-config.js';
import type { GameConfig } from './game-config.types.js';

// Re-export all config types so existing `import { GameConfig } from '.../game-config.service.js'`
// keeps working across the codebase.
export * from './game-config.types.js';

const INVALIDATE_CHANNEL = 'game-config:invalidate';

/**
 * In-memory snapshot of the full GameConfig. Cleared on any admin mutation
 * via `invalidateCache()`, rebuilt lazily on the next `getFullConfig()` call.
 * Kept at module scope so the cache is shared across all imports in the same
 * process. When PM2 runs multiple instances, each worker holds its own copy
 * and the Redis pub/sub channel above broadcasts invalidations across them.
 */
let cache: GameConfig | null = null;

// Tracks whether this process has already subscribed to the invalidation
// channel — the service factory may be called multiple times in tests or
// split routers, and we only want one subscription per process.
let subscribed = false;

export function createGameConfigService(db: Database, redis?: Redis) {
  if (redis && !subscribed) {
    subscribed = true;
    // Duplicate the connection — ioredis Subscriber mode disables normal
    // commands on that client, so we can't reuse the main connection.
    const sub = redis.duplicate();
    sub.subscribe(INVALIDATE_CHANNEL).catch((err) => {
      console.error('[game-config] subscribe failed:', err);
    });
    sub.on('message', (channel) => {
      if (channel === INVALIDATE_CHANNEL) cache = null;
    });
  }

  function invalidateCache() {
    cache = null;
    // Broadcast so sibling PM2 workers drop their cache too. Fire-and-forget —
    // a slow Redis shouldn't block an admin mutation response, and the local
    // cache is already cleared above.
    redis?.publish(INVALIDATE_CHANNEL, '1').catch(() => { /* best-effort */ });
  }

  async function getFullConfig(): Promise<GameConfig> {
    if (cache) return cache;
    cache = await buildConfigFromDb(db);
    return cache;
  }

  return {
    getFullConfig,
    invalidateCache,

    // ── Categories ──

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

    // ── Buildings ──

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
      role?: string | null;
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
        role: data.role ?? null,
        variantPlanetTypes: [],
      });
      invalidateCache();
    },

    async deleteBuilding(id: string) {
      // Refuse deletion when this building is still referenced as a
      // prerequisite — deleting would leave orphaned requirements and silently
      // break progression for dependent entities.
      const buildingRefs = await db.select({ ownerId: buildingPrerequisites.buildingId }).from(buildingPrerequisites)
        .where(eq(buildingPrerequisites.requiredBuildingId, id));
      if (buildingRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce bâtiment est requis comme prérequis par: ${[...new Set(buildingRefs.map((r) => r.ownerId))].join(', ')}`,
        });
      }
      const researchRefs = await db.select({ ownerId: researchPrerequisites.researchId }).from(researchPrerequisites)
        .where(eq(researchPrerequisites.requiredBuildingId, id));
      if (researchRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce bâtiment est requis comme prérequis par les recherches: ${[...new Set(researchRefs.map((r) => r.ownerId))].join(', ')}`,
        });
      }
      const shipRefs = await db.select({ ownerId: shipPrerequisites.shipId }).from(shipPrerequisites)
        .where(eq(shipPrerequisites.requiredBuildingId, id));
      if (shipRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce bâtiment est requis comme prérequis par les vaisseaux: ${[...new Set(shipRefs.map((r) => r.ownerId))].join(', ')}`,
        });
      }
      const defenseRefs = await db.select({ ownerId: defensePrerequisites.defenseId }).from(defensePrerequisites)
        .where(eq(defensePrerequisites.requiredBuildingId, id));
      if (defenseRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ce bâtiment est requis comme prérequis par les défenses: ${[...new Set(defenseRefs.map((r) => r.ownerId))].join(', ')}`,
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
      role: string | null;
    }>) {
      // Defensive: variantPlanetTypes is managed by dedicated upload/delete
      // endpoints — never let the generic edit form overwrite it.
      const { variantPlanetTypes: _strip, ...safeData } = data as typeof data & { variantPlanetTypes?: unknown };
      void _strip;
      await db.update(buildingDefinitions).set(safeData).where(eq(buildingDefinitions.id, id));
      invalidateCache();
    },

    async updateBuildingPrerequisites(buildingId: string, prereqs: { requiredBuildingId: string; requiredLevel: number }[]) {
      await db.delete(buildingPrerequisites).where(eq(buildingPrerequisites.buildingId, buildingId));
      if (prereqs.length > 0) {
        await db.insert(buildingPrerequisites).values(prereqs.map((p) => ({ buildingId, ...p })));
      }
      invalidateCache();
    },

    // ── Research ──

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
      const researchRefs = await db.select({ ownerId: researchPrerequisites.researchId }).from(researchPrerequisites)
        .where(eq(researchPrerequisites.requiredResearchId, id));
      if (researchRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cette recherche est requise comme prérequis par: ${[...new Set(researchRefs.map((r) => r.ownerId))].join(', ')}`,
        });
      }
      const shipRefs = await db.select({ ownerId: shipPrerequisites.shipId }).from(shipPrerequisites)
        .where(eq(shipPrerequisites.requiredResearchId, id));
      if (shipRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cette recherche est requise comme prérequis par les vaisseaux: ${[...new Set(shipRefs.map((r) => r.ownerId))].join(', ')}`,
        });
      }
      const defenseRefs = await db.select({ ownerId: defensePrerequisites.defenseId }).from(defensePrerequisites)
        .where(eq(defensePrerequisites.requiredResearchId, id));
      if (defenseRefs.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cette recherche est requise comme prérequis par les défenses: ${[...new Set(defenseRefs.map((r) => r.ownerId))].join(', ')}`,
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
        await db.insert(researchPrerequisites).values(prereqs.map((p) => ({
          researchId,
          requiredBuildingId: p.requiredBuildingId ?? null,
          requiredResearchId: p.requiredResearchId ?? null,
          requiredLevel: p.requiredLevel,
        })));
      }
      invalidateCache();
    },

    // ── Ships ──

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
      hull?: number;
      baseArmor?: number;
      shotCount?: number;
      combatCategoryId?: string | null;
      flavorText?: string | null;
      categoryId?: string | null;
      sortOrder?: number;
      role?: string | null;
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
        hull: data.hull ?? 0,
        baseArmor: data.baseArmor ?? 0,
        shotCount: data.shotCount ?? 1,
        combatCategoryId: data.combatCategoryId ?? null,
        flavorText: data.flavorText ?? null,
        categoryId: data.categoryId ?? null,
        sortOrder: data.sortOrder ?? 0,
        role: data.role ?? null,
      });
      invalidateCache();
    },

    async deleteShip(id: string) {
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
      hull: number;
      baseArmor: number;
      shotCount: number;
      combatCategoryId: string | null;
      flavorText: string | null;
      categoryId: string | null;
      sortOrder: number;
      role: string | null;
    }>) {
      await db.update(shipDefinitions).set(data).where(eq(shipDefinitions.id, id));
      invalidateCache();
    },

    async updateShipPrerequisites(shipId: string, prereqs: { requiredBuildingId?: string; requiredResearchId?: string; requiredLevel: number }[]) {
      await db.delete(shipPrerequisites).where(eq(shipPrerequisites.shipId, shipId));
      if (prereqs.length > 0) {
        await db.insert(shipPrerequisites).values(prereqs.map((p) => ({
          shipId,
          requiredBuildingId: p.requiredBuildingId ?? null,
          requiredResearchId: p.requiredResearchId ?? null,
          requiredLevel: p.requiredLevel,
        })));
      }
      invalidateCache();
    },

    // ── Defenses ──

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
      hull?: number;
      baseArmor?: number;
      shotCount?: number;
      combatCategoryId?: string | null;
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
        hull: data.hull ?? 0,
        baseArmor: data.baseArmor ?? 0,
        shotCount: data.shotCount ?? 1,
        combatCategoryId: data.combatCategoryId ?? null,
        maxPerPlanet: data.maxPerPlanet ?? null,
        flavorText: data.flavorText ?? null,
        categoryId: data.categoryId ?? null,
        sortOrder: data.sortOrder ?? 0,
        variantPlanetTypes: [],
      });
      invalidateCache();
    },

    async deleteDefense(id: string) {
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
      hull: number;
      baseArmor: number;
      shotCount: number;
      combatCategoryId: string | null;
      maxPerPlanet: number | null;
      flavorText: string | null;
      categoryId: string | null;
      sortOrder: number;
    }>) {
      const { variantPlanetTypes: _strip, ...safeData } = data as typeof data & { variantPlanetTypes?: unknown };
      void _strip;
      await db.update(defenseDefinitions).set(safeData).where(eq(defenseDefinitions.id, id));
      invalidateCache();
    },

    async updateDefensePrerequisites(defenseId: string, prereqs: { requiredBuildingId?: string; requiredResearchId?: string; requiredLevel: number }[]) {
      await db.delete(defensePrerequisites).where(eq(defensePrerequisites.defenseId, defenseId));
      if (prereqs.length > 0) {
        await db.insert(defensePrerequisites).values(prereqs.map((p) => ({
          defenseId,
          requiredBuildingId: p.requiredBuildingId ?? null,
          requiredResearchId: p.requiredResearchId ?? null,
          requiredLevel: p.requiredLevel,
        })));
      }
      invalidateCache();
    },

    // ── Production / universe ──

    async updateProductionConfig(id: string, data: Partial<{
      baseProduction: number;
      exponentBase: number;
      energyConsumption: number | null;
      storageBase: number | null;
      tempCoeffA: number | null;
      tempCoeffB: number | null;
    }>) {
      await db.update(productionConfig).set(data).where(eq(productionConfig.id, id));
      invalidateCache();
    },

    async updateUniverseConfig(key: string, value: unknown) {
      await db.insert(universeConfig).values({ key, value })
        .onConflictDoUpdate({ target: universeConfig.key, set: { value } });
      invalidateCache();
    },

    // ── Planet types ──

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
      sortOrder?: number;
      role?: string | null;
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
        sortOrder: data.sortOrder ?? 0,
        role: data.role ?? null,
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
      sortOrder: number;
      role: string | null;
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
      rewards: { minerai: number; silicium: number; hydrogene: number; bonusShips: { shipId: string; count: number; chance: number }[] };
    }) {
      await db.insert(pirateTemplates).values(data);
      invalidateCache();
    },

    async updatePirateTemplate(id: string, data: Partial<{
      name: string;
      tier: string;
      ships: Record<string, number>;
      rewards: { minerai: number; silicium: number; hydrogene: number; bonusShips: { shipId: string; count: number; chance: number }[] };
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
      conditionLabel?: string | null;
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
        conditionLabel: data.conditionLabel ?? null,
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
      conditionLabel: string | null;
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
      statLabel?: string | null;
    }) {
      await db.insert(bonusDefinitions).values({
        id: data.id,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        stat: data.stat,
        percentPerLevel: data.percentPerLevel,
        category: data.category ?? null,
        statLabel: data.statLabel ?? null,
      });
      invalidateCache();
    },

    async updateBonus(id: string, data: Partial<{
      stat: string;
      percentPerLevel: number;
      category: string | null;
      statLabel: string | null;
    }>) {
      await db.update(bonusDefinitions).set(data).where(eq(bonusDefinitions.id, id));
      invalidateCache();
    },

    async deleteBonus(id: string) {
      await db.delete(bonusDefinitions).where(eq(bonusDefinitions.id, id));
      invalidateCache();
    },

    // ── Missions ──

    async createMission(data: {
      id: string; label: string; hint?: string; buttonLabel?: string;
      color?: string; sortOrder?: number; dangerous?: boolean;
      requiredShipRoles?: string[] | null; exclusive?: boolean;
      recommendedShipRoles?: string[] | null; requiresPveMission?: boolean;
    }) {
      await db.insert(missionDefinitions).values(data);
      invalidateCache();
    },

    async updateMission(id: string, data: Partial<Omit<typeof missionDefinitions.$inferInsert, 'id'>>) {
      await db.update(missionDefinitions).set(data).where(eq(missionDefinitions.id, id));
      invalidateCache();
    },

    async deleteMission(id: string) {
      await db.delete(missionDefinitions).where(eq(missionDefinitions.id, id));
      invalidateCache();
    },

    // ── Talent branches ──

    async createTalentBranch(data: { id: string; name: string; description?: string; color: string; sortOrder?: number }) {
      await db.insert(talentBranchDefinitions).values({
        id: data.id,
        name: data.name,
        description: data.description ?? '',
        color: data.color,
        sortOrder: data.sortOrder ?? 0,
      });
      invalidateCache();
    },

    async updateTalentBranch(id: string, data: Partial<{ name: string; description: string; color: string; sortOrder: number }>) {
      await db.update(talentBranchDefinitions).set(data).where(eq(talentBranchDefinitions.id, id));
      invalidateCache();
    },

    async deleteTalentBranch(id: string) {
      await db.delete(talentBranchDefinitions).where(eq(talentBranchDefinitions.id, id));
      invalidateCache();
    },

    // ── Talents ──

    async createTalent(data: {
      id: string;
      branchId: string;
      tier: number;
      position: string;
      name: string;
      description?: string;
      maxRanks?: number;
      prerequisiteId?: string | null;
      effectType: string;
      effectParams: unknown;
      sortOrder?: number;
    }) {
      await db.insert(talentDefinitions).values({
        id: data.id,
        branchId: data.branchId,
        tier: data.tier,
        position: data.position,
        name: data.name,
        description: data.description ?? '',
        maxRanks: data.maxRanks ?? 1,
        prerequisiteId: data.prerequisiteId ?? null,
        effectType: data.effectType,
        effectParams: data.effectParams,
        sortOrder: data.sortOrder ?? 0,
      });
      invalidateCache();
    },

    async updateTalent(id: string, data: Partial<{
      branchId: string;
      tier: number;
      position: string;
      name: string;
      description: string;
      maxRanks: number;
      prerequisiteId: string | null;
      effectType: string;
      effectParams: unknown;
      sortOrder: number;
    }>) {
      await db.update(talentDefinitions).set(data).where(eq(talentDefinitions.id, id));
      invalidateCache();
    },

    async deleteTalent(id: string) {
      await db.delete(talentDefinitions).where(eq(talentDefinitions.id, id));
      invalidateCache();
    },

    // ── Labels ──

    async createLabel(data: { key: string; label: string }) {
      await db.insert(uiLabels).values(data);
      invalidateCache();
    },

    async updateLabel(key: string, data: { label: string }) {
      await db.update(uiLabels).set(data).where(eq(uiLabels.key, key));
      invalidateCache();
    },

    async deleteLabel(key: string) {
      await db.delete(uiLabels).where(eq(uiLabels.key, key));
      invalidateCache();
    },
  };
}

export type GameConfigService = ReturnType<typeof createGameConfigService>;
