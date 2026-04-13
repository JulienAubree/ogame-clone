import { pgTable, uuid, timestamp, numeric, varchar, smallint, boolean, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const explorationReportStatusEnum = pgEnum('exploration_report_status', [
  'inventory',
  'listed',
  'sold',
  'consumed',
]);

export const explorationReports = pgTable('exploration_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  galaxy: smallint('galaxy').notNull(),
  system: smallint('system').notNull(),
  position: smallint('position').notNull(),
  planetClassId: varchar('planet_class_id', { length: 64 }).notNull(),
  biomes: jsonb('biomes').notNull(),
  biomeCount: smallint('biome_count').notNull(),
  maxRarity: varchar('max_rarity', { length: 32 }).notNull(),
  isComplete: boolean('is_complete').notNull().default(false),
  creationCost: numeric('creation_cost', { precision: 20, scale: 2 }).notNull(),
  status: explorationReportStatusEnum('status').notNull().default('inventory'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index('exploration_reports_owner_status_idx').on(table.ownerId, table.status),
  index('exploration_reports_galaxy_system_status_idx').on(table.galaxy, table.system, table.status),
]);
