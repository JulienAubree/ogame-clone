import { pgTable, uuid, varchar, smallint, integer, numeric, timestamp, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const planetTypeEnum = pgEnum('planet_type', ['planet', 'moon']);

export const planets = pgTable('planets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull().default('Homeworld'),
  galaxy: smallint('galaxy').notNull(),
  system: smallint('system').notNull(),
  position: smallint('position').notNull(),
  planetType: planetTypeEnum('planet_type').notNull().default('planet'),
  diameter: integer('diameter').notNull(),
  maxFields: integer('max_fields').notNull(),
  minTemp: smallint('min_temp').notNull(),
  maxTemp: smallint('max_temp').notNull(),

  // Resources
  metal: numeric('metal', { precision: 20, scale: 2 }).notNull().default('500'),
  crystal: numeric('crystal', { precision: 20, scale: 2 }).notNull().default('500'),
  deuterium: numeric('deuterium', { precision: 20, scale: 2 }).notNull().default('0'),
  resourcesUpdatedAt: timestamp('resources_updated_at', { withTimezone: true }).notNull().defaultNow(),

  // Building levels (inline)
  metalMineLevel: smallint('metal_mine_level').notNull().default(0),
  crystalMineLevel: smallint('crystal_mine_level').notNull().default(0),
  deutSynthLevel: smallint('deut_synth_level').notNull().default(0),
  solarPlantLevel: smallint('solar_plant_level').notNull().default(0),
  roboticsLevel: smallint('robotics_level').notNull().default(0),
  shipyardLevel: smallint('shipyard_level').notNull().default(0),
  researchLabLevel: smallint('research_lab_level').notNull().default(0),
  storageMetalLevel: smallint('storage_metal_level').notNull().default(0),
  storageCrystalLevel: smallint('storage_crystal_level').notNull().default(0),
  storageDeutLevel: smallint('storage_deut_level').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('unique_coordinates').on(table.galaxy, table.system, table.position, table.planetType),
]);
