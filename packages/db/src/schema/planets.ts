import { pgTable, uuid, varchar, smallint, integer, numeric, timestamp, uniqueIndex, index, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planetTypes } from './game-config.js';

export const planetTypeEnum = pgEnum('planet_type', ['planet', 'moon']);

export const planets = pgTable('planets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull().default('Homeworld'),
  renamed: boolean('renamed').notNull().default(false),
  galaxy: smallint('galaxy').notNull(),
  system: smallint('system').notNull(),
  position: smallint('position').notNull(),
  planetType: planetTypeEnum('planet_type').notNull().default('planet'),
  planetClassId: varchar('planet_class_id', { length: 64 }).references(() => planetTypes.id, { onDelete: 'set null' }),
  planetImageIndex: smallint('planet_image_index'),
  diameter: integer('diameter').notNull(),
  maxFields: integer('max_fields').notNull(),
  minTemp: smallint('min_temp').notNull(),
  maxTemp: smallint('max_temp').notNull(),

  // Resources
  minerai: numeric('minerai', { precision: 20, scale: 2 }).notNull().default('500'),
  silicium: numeric('silicium', { precision: 20, scale: 2 }).notNull().default('500'),
  hydrogene: numeric('hydrogene', { precision: 20, scale: 2 }).notNull().default('0'),
  resourcesUpdatedAt: timestamp('resources_updated_at', { withTimezone: true }).notNull().defaultNow(),

  // Production percentages (0-100, step 10)
  mineraiMinePercent: smallint('minerai_mine_percent').notNull().default(100),
  siliciumMinePercent: smallint('silicium_mine_percent').notNull().default(100),
  hydrogeneSynthPercent: smallint('hydrogene_synth_percent').notNull().default(100),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('unique_coordinates').on(table.galaxy, table.system, table.position, table.planetType),
  index('planets_user_idx').on(table.userId),
]);
