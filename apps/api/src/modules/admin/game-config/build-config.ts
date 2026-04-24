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
  pirateTemplates,
  tutorialQuestDefinitions,
  missionDefinitions,
  uiLabels,
  talentBranchDefinitions,
  talentDefinitions,
  biomeDefinitions,
} from '@exilium/db';
import type { Database } from '@exilium/db';
import type {
  BiomeConfig,
  BonusConfig,
  BuildingConfig,
  CategoryConfig,
  DefenseConfig,
  GameConfig,
  HullConfig,
  MissionConfig,
  PirateTemplateConfig,
  PlanetTypeConfig,
  ProductionConfigEntry,
  ResearchConfig,
  ShipConfig,
  TalentBranchConfig,
  TalentConfig,
  TutorialQuestConfig,
} from '../game-config.types.js';

/**
 * Build the full GameConfig snapshot from the database. Pure function — no
 * caching. The caller (game-config.service) is responsible for memoizing the
 * result and invalidating on admin mutations.
 *
 * All 20 tables are queried in parallel so the overall cost is dominated by
 * the slowest single query (~5-10 ms on the current dataset).
 */
export async function buildConfigFromDb(db: Database): Promise<GameConfig> {
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
    productionRows,
    universeRows,
    planetTypeRows,
    pirateTemplateRows,
    tutorialQuestRows,
    bonusRows,
    missionsRows,
    labelsRows,
    talentBranchRows,
    talentRows,
    biomeRows,
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
    db.select().from(productionConfig),
    db.select().from(universeConfig),
    db.select().from(planetTypes),
    db.select().from(pirateTemplates),
    db.select().from(tutorialQuestDefinitions),
    db.select().from(bonusDefinitions),
    db.select().from(missionDefinitions).orderBy(missionDefinitions.sortOrder),
    db.select().from(uiLabels),
    db.select().from(talentBranchDefinitions).orderBy(talentBranchDefinitions.sortOrder),
    db.select().from(talentDefinitions),
    db.select().from(biomeDefinitions).orderBy(biomeDefinitions.id),
  ]);

  const categories: CategoryConfig[] = categoryRows.map((c) => ({
    id: c.id,
    entityType: c.entityType,
    name: c.name,
    sortOrder: c.sortOrder,
  }));

  // Pre-index prerequisites into Maps (O(n) instead of O(n²) filter loops)
  const buildingPrereqMap = groupBy(buildingPrereqRows, (p) => p.buildingId);
  const researchPrereqMap = groupBy(researchPrereqRows, (p) => p.researchId);
  const shipPrereqMap = groupBy(shipPrereqRows, (p) => p.shipId);
  const defensePrereqMap = groupBy(defensePrereqRows, (p) => p.defenseId);

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
      role: b.role ?? null,
      allowedPlanetTypes: (b.allowedPlanetTypes as string[] | null) ?? null,
      variantPlanetTypes: (b.variantPlanetTypes as string[] | null) ?? [],
      prerequisites: (buildingPrereqMap.get(b.id) ?? []).map((p) => ({
        buildingId: p.requiredBuildingId,
        level: p.requiredLevel,
      })),
    };
  }

  const research: Record<string, ResearchConfig> = {};
  for (const r of researchRows) {
    const prereqs = researchPrereqMap.get(r.id) ?? [];
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
      requiredAnnexType: (r.requiredAnnexType as string | null) ?? null,
      prerequisites: splitPrereqs(prereqs),
    };
  }

  const ships: Record<string, ShipConfig> = {};
  for (const s of shipRows) {
    const prereqs = shipPrereqMap.get(s.id) ?? [];
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
      hull: s.hull,
      baseArmor: s.baseArmor,
      shotCount: s.shotCount,
      combatCategoryId: s.combatCategoryId ?? null,
      flavorText: s.flavorText ?? null,
      categoryId: s.categoryId,
      sortOrder: s.sortOrder,
      isStationary: s.isStationary,
      role: s.role ?? null,
      prerequisites: splitPrereqs(prereqs),
    };
  }

  const defenses: Record<string, DefenseConfig> = {};
  for (const d of defenseRows) {
    const prereqs = defensePrereqMap.get(d.id) ?? [];
    defenses[d.id] = {
      id: d.id,
      name: d.name,
      description: d.description,
      cost: { minerai: d.costMinerai, silicium: d.costSilicium, hydrogene: d.costHydrogene },
      countColumn: d.countColumn,
      weapons: d.weapons,
      shield: d.shield,
      hull: d.hull,
      baseArmor: d.baseArmor,
      shotCount: d.shotCount,
      combatCategoryId: d.combatCategoryId ?? null,
      maxPerPlanet: d.maxPerPlanet,
      flavorText: d.flavorText ?? null,
      categoryId: d.categoryId,
      sortOrder: d.sortOrder,
      variantPlanetTypes: (d.variantPlanetTypes as string[] | null) ?? [],
      prerequisites: splitPrereqs(prereqs),
    };
  }

  const production: Record<string, ProductionConfigEntry> = {};
  for (const p of productionRows) {
    production[p.id] = {
      id: p.id,
      baseProduction: p.baseProduction,
      exponentBase: p.exponentBase,
      energyConsumption: p.energyConsumption,
      storageBase: p.storageBase,
      tempCoeffA: p.tempCoeffA ?? null,
      tempCoeffB: p.tempCoeffB ?? null,
    };
  }

  const universe: Record<string, unknown> = {};
  for (const u of universeRows) universe[u.key] = u.value;

  const ptConfigs: PlanetTypeConfig[] = planetTypeRows.map((pt) => ({
    id: pt.id,
    name: pt.name,
    description: pt.description,
    positions: pt.positions as number[],
    mineraiBonus: pt.mineraiBonus,
    siliciumBonus: pt.siliciumBonus,
    hydrogeneBonus: pt.hydrogeneBonus,
    diameterMin: pt.diameterMin,
    diameterMax: pt.diameterMax,
    sortOrder: pt.sortOrder,
    role: pt.role ?? null,
  }));

  const ptTemplates: PirateTemplateConfig[] = pirateTemplateRows.map((pt) => ({
    id: pt.id,
    name: pt.name,
    tier: pt.tier,
    ships: pt.ships as Record<string, number>,
    rewards: pt.rewards as PirateTemplateConfig['rewards'],
  }));

  const tqConfigs: TutorialQuestConfig[] = tutorialQuestRows.map((tq) => ({
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
    conditionLabel: tq.conditionLabel ?? null,
  }));

  const bonuses: BonusConfig[] = bonusRows.map((b) => ({
    id: b.id,
    sourceType: b.sourceType as 'building' | 'research',
    sourceId: b.sourceId,
    stat: b.stat,
    percentPerLevel: b.percentPerLevel,
    category: b.category,
    statLabel: b.statLabel ?? null,
  }));

  const missions: Record<string, MissionConfig> = {};
  for (const m of missionsRows) {
    missions[m.id] = {
      id: m.id,
      label: m.label,
      hint: m.hint,
      buttonLabel: m.buttonLabel,
      color: m.color,
      sortOrder: m.sortOrder,
      dangerous: m.dangerous,
      requiredShipRoles: m.requiredShipRoles as string[] | null,
      exclusive: m.exclusive,
      recommendedShipRoles: m.recommendedShipRoles as string[] | null,
      requiresPveMission: m.requiresPveMission,
    };
  }

  const labels: Record<string, string> = {};
  for (const l of labelsRows) labels[l.key] = l.label;

  const talentBranches: TalentBranchConfig[] = talentBranchRows.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    color: b.color,
    sortOrder: b.sortOrder,
  }));

  const talents: Record<string, TalentConfig> = {};
  for (const t of talentRows) {
    talents[t.id] = {
      id: t.id,
      branchId: t.branchId,
      tier: t.tier,
      position: t.position,
      name: t.name,
      description: t.description,
      maxRanks: t.maxRanks,
      prerequisiteId: t.prerequisiteId,
      effectType: t.effectType,
      effectParams: (t.effectParams ?? {}) as Record<string, unknown>,
      sortOrder: t.sortOrder,
    };
  }

  // Hulls live as a JSON blob in universe_config keyed 'hulls'
  const hulls: Record<string, HullConfig> = {};
  const hullsRaw = universe['hulls'] as HullConfig[] | undefined;
  if (hullsRaw && Array.isArray(hullsRaw)) {
    for (const h of hullsRaw) hulls[h.id] = h;
  }

  const biomes: BiomeConfig[] = biomeRows.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    rarity: b.rarity as BiomeConfig['rarity'],
    compatiblePlanetTypes: b.compatiblePlanetTypes as string[],
    effects: b.effects as BiomeConfig['effects'],
  }));

  return {
    categories,
    buildings,
    research,
    ships,
    defenses,
    production,
    universe,
    planetTypes: ptConfigs,
    pirateTemplates: ptTemplates,
    tutorialQuests: tqConfigs,
    bonuses,
    missions,
    labels,
    talentBranches,
    talents,
    hulls,
    biomes,
  };
}

/** Group a flat list of rows by a key extracted from each row. */
function groupBy<T, K>(rows: readonly T[], keyFn: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const arr = out.get(key);
    if (arr) arr.push(row);
    else out.set(key, [row]);
  }
  return out;
}

/**
 * Split a mixed prereq list (some reference buildings, others research) into
 * the two-bucket shape used by ShipConfig/DefenseConfig/ResearchConfig.
 */
function splitPrereqs<T extends { requiredBuildingId?: string | null; requiredResearchId?: string | null; requiredLevel: number }>(
  prereqs: readonly T[],
): {
  buildings: { buildingId: string; level: number }[];
  research: { researchId: string; level: number }[];
} {
  const buildings: { buildingId: string; level: number }[] = [];
  const research: { researchId: string; level: number }[] = [];
  for (const p of prereqs) {
    if (p.requiredBuildingId) {
      buildings.push({ buildingId: p.requiredBuildingId, level: p.requiredLevel });
    } else if (p.requiredResearchId) {
      research.push({ researchId: p.requiredResearchId, level: p.requiredLevel });
    }
  }
  return { buildings, research };
}
