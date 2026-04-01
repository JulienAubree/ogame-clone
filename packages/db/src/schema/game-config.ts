import { pgTable, varchar, text, integer, real, jsonb, primaryKey, smallint, boolean, type AnyPgColumn } from 'drizzle-orm/pg-core';

// ── Entity Categories ──

export const entityCategories = pgTable('entity_categories', {
  id: varchar('id', { length: 64 }).primaryKey(),
  entityType: varchar('entity_type', { length: 32 }).notNull(), // 'building' | 'research' | 'ship' | 'defense'
  name: varchar('name', { length: 128 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ── Building Definitions ──

export const buildingDefinitions = pgTable('building_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  baseCostMinerai: integer('base_cost_minerai').notNull().default(0),
  baseCostSilicium: integer('base_cost_silicium').notNull().default(0),
  baseCostHydrogene: integer('base_cost_hydrogene').notNull().default(0),
  costFactor: real('cost_factor').notNull().default(1.5),
  baseTime: integer('base_time').notNull().default(60),
  categoryId: varchar('category_id', { length: 64 }).references(() => entityCategories.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  role: varchar('role', { length: 64 }).unique(),
  flavorText: text('flavor_text'),
});

export const buildingPrerequisites = pgTable('building_prerequisites', {
  buildingId: varchar('building_id', { length: 64 }).notNull().references(() => buildingDefinitions.id, { onDelete: 'cascade' }),
  requiredBuildingId: varchar('required_building_id', { length: 64 }).notNull().references(() => buildingDefinitions.id, { onDelete: 'cascade' }),
  requiredLevel: integer('required_level').notNull(),
}, (t) => [
  primaryKey({ columns: [t.buildingId, t.requiredBuildingId] }),
]);

// ── Bonus Definitions ──

export const bonusDefinitions = pgTable('bonus_definitions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  sourceType: varchar('source_type', { length: 16 }).notNull(), // 'building' | 'research'
  sourceId: varchar('source_id', { length: 64 }).notNull(),
  stat: varchar('stat', { length: 64 }).notNull(),
  percentPerLevel: real('percent_per_level').notNull(),
  category: varchar('category', { length: 64 }),
  statLabel: varchar('stat_label', { length: 128 }),
});

// ── Research Definitions ──

export const researchDefinitions = pgTable('research_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  baseCostMinerai: integer('base_cost_minerai').notNull().default(0),
  baseCostSilicium: integer('base_cost_silicium').notNull().default(0),
  baseCostHydrogene: integer('base_cost_hydrogene').notNull().default(0),
  costFactor: real('cost_factor').notNull().default(2),
  levelColumn: varchar('level_column', { length: 64 }).notNull(),
  categoryId: varchar('category_id', { length: 64 }).references(() => entityCategories.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  flavorText: text('flavor_text'),
  effectDescription: text('effect_description'),
  maxLevel: smallint('max_level'),
});

export const researchPrerequisites = pgTable('research_prerequisites', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  researchId: varchar('research_id', { length: 64 }).notNull().references(() => researchDefinitions.id, { onDelete: 'cascade' }),
  requiredBuildingId: varchar('required_building_id', { length: 64 }).references(() => buildingDefinitions.id, { onDelete: 'cascade' }),
  requiredResearchId: varchar('required_research_id', { length: 64 }).references(() => researchDefinitions.id, { onDelete: 'cascade' }),
  requiredLevel: integer('required_level').notNull(),
});

// ── Ship Definitions (merged ships + combat-stats + ship-stats) ──

export const shipDefinitions = pgTable('ship_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  costMinerai: integer('cost_minerai').notNull().default(0),
  costSilicium: integer('cost_silicium').notNull().default(0),
  costHydrogene: integer('cost_hydrogene').notNull().default(0),
  countColumn: varchar('count_column', { length: 64 }).notNull(),
  baseSpeed: integer('base_speed').notNull().default(0),
  fuelConsumption: integer('fuel_consumption').notNull().default(0),
  cargoCapacity: integer('cargo_capacity').notNull().default(0),
  driveType: varchar('drive_type', { length: 32 }).notNull().default('combustion'),
  weapons: integer('weapons').notNull().default(0),
  shield: integer('shield').notNull().default(0),
  hull: integer('hull').notNull().default(0),
  baseArmor: integer('base_armor').notNull().default(0),
  shotCount: integer('shot_count').notNull().default(1),
  combatCategoryId: varchar('combat_category_id', { length: 64 }),
  miningExtraction: integer('mining_extraction').notNull().default(0),
  isStationary: boolean('is_stationary').notNull().default(false),
  categoryId: varchar('category_id', { length: 64 }).references(() => entityCategories.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  role: varchar('role', { length: 64 }),
  flavorText: text('flavor_text'),
});

export const shipPrerequisites = pgTable('ship_prerequisites', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  shipId: varchar('ship_id', { length: 64 }).notNull().references(() => shipDefinitions.id, { onDelete: 'cascade' }),
  requiredBuildingId: varchar('required_building_id', { length: 64 }).references(() => buildingDefinitions.id, { onDelete: 'cascade' }),
  requiredResearchId: varchar('required_research_id', { length: 64 }).references(() => researchDefinitions.id, { onDelete: 'cascade' }),
  requiredLevel: integer('required_level').notNull(),
});

// ── Defense Definitions (merged defenses + combat-stats) ──

export const defenseDefinitions = pgTable('defense_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  costMinerai: integer('cost_minerai').notNull().default(0),
  costSilicium: integer('cost_silicium').notNull().default(0),
  costHydrogene: integer('cost_hydrogene').notNull().default(0),
  countColumn: varchar('count_column', { length: 64 }).notNull(),
  weapons: integer('weapons').notNull().default(0),
  shield: integer('shield').notNull().default(0),
  hull: integer('hull').notNull().default(0),
  baseArmor: integer('base_armor').notNull().default(0),
  shotCount: integer('shot_count').notNull().default(1),
  combatCategoryId: varchar('combat_category_id', { length: 64 }),
  maxPerPlanet: integer('max_per_planet'),
  categoryId: varchar('category_id', { length: 64 }).references(() => entityCategories.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  flavorText: text('flavor_text'),
});

export const defensePrerequisites = pgTable('defense_prerequisites', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  defenseId: varchar('defense_id', { length: 64 }).notNull().references(() => defenseDefinitions.id, { onDelete: 'cascade' }),
  requiredBuildingId: varchar('required_building_id', { length: 64 }).references(() => buildingDefinitions.id, { onDelete: 'cascade' }),
  requiredResearchId: varchar('required_research_id', { length: 64 }).references(() => researchDefinitions.id, { onDelete: 'cascade' }),
  requiredLevel: integer('required_level').notNull(),
});

// ── Production Config ──

export const productionConfig = pgTable('production_config', {
  id: varchar('id', { length: 64 }).primaryKey(),
  baseProduction: real('base_production').notNull(),
  exponentBase: real('exponent_base').notNull().default(1.1),
  energyConsumption: real('energy_consumption'),
  storageBase: real('storage_base'),
  tempCoeffA: real('temp_coeff_a'),
  tempCoeffB: real('temp_coeff_b'),
});

// ── Planet Types ──

export const planetTypes = pgTable('planet_types', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  positions: jsonb('positions').notNull(),
  mineraiBonus: real('minerai_bonus').notNull().default(1.0),
  siliciumBonus: real('silicium_bonus').notNull().default(1.0),
  hydrogeneBonus: real('hydrogene_bonus').notNull().default(1.0),
  diameterMin: integer('diameter_min').notNull(),
  diameterMax: integer('diameter_max').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  role: varchar('role', { length: 64 }).unique(),
});

// ── Universe Config ──

export const universeConfig = pgTable('universe_config', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').notNull(),
});

// ── Talent Branch Definitions ──

export const talentBranchDefinitions = pgTable('talent_branch_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  color: varchar('color', { length: 32 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ── Talent Definitions ──

export const talentDefinitions = pgTable('talent_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  branchId: varchar('branch_id', { length: 64 }).notNull().references(() => talentBranchDefinitions.id, { onDelete: 'cascade' }),
  tier: smallint('tier').notNull(),
  position: varchar('position', { length: 16 }).notNull(), // 'left' | 'center' | 'right'
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  maxRanks: smallint('max_ranks').notNull().default(1),
  prerequisiteId: varchar('prerequisite_id', { length: 64 }).references((): AnyPgColumn => talentDefinitions.id, { onDelete: 'set null' }),
  effectType: varchar('effect_type', { length: 32 }).notNull(), // 'modify_stat' | 'global_bonus' | 'planet_bonus' | 'timed_buff' | 'unlock'
  effectParams: jsonb('effect_params').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});
