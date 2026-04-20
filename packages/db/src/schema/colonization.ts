import { pgTable, uuid, real, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';
import { users } from './users.js';

export const colonizationStatusEnum = pgEnum('colonization_status', ['active', 'completed', 'failed']);

export const colonizationProcesses = pgTable('colonization_processes', {
  id: uuid('id').primaryKey().defaultRandom(),
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  colonyShipOriginPlanetId: uuid('colony_ship_origin_planet_id').notNull(),
  progress: real('progress').notNull().default(0),
  difficultyFactor: real('difficulty_factor').notNull().default(1),
  outpostEstablished: boolean('outpost_established').notNull().default(false),
  status: colonizationStatusEnum('status').notNull().default('active'),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }).notNull().defaultNow(),
  lastRaidAt: timestamp('last_raid_at', { withTimezone: true }).notNull().defaultNow(),
  lastConvoySupplyAt: timestamp('last_convoy_supply_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
