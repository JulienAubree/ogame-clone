import { pgTable, uuid, real, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';
import { users } from './users.js';

export const colonizationStatusEnum = pgEnum('colonization_status', ['active', 'completed', 'failed']);

export const colonizationEventTypeEnum = pgEnum('colonization_event_type', ['raid', 'shortage']);

export const colonizationEventStatusEnum = pgEnum('colonization_event_status', ['pending', 'resolved', 'expired']);

export const colonizationProcesses = pgTable('colonization_processes', {
  id: uuid('id').primaryKey().defaultRandom(),
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  colonyShipOriginPlanetId: uuid('colony_ship_origin_planet_id').notNull(),
  progress: real('progress').notNull().default(0),
  difficultyFactor: real('difficulty_factor').notNull().default(1),
  reinforcePassiveBonus: real('reinforce_passive_bonus').notNull().default(0),
  status: colonizationStatusEnum('status').notNull().default('active'),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }).notNull().defaultNow(),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull().defaultNow(),
  lastConsolidateAt: timestamp('last_consolidate_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const colonizationEvents = pgTable('colonization_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  processId: uuid('process_id').notNull().references(() => colonizationProcesses.id, { onDelete: 'cascade' }),
  eventType: colonizationEventTypeEnum('event_type').notNull(),
  status: colonizationEventStatusEnum('status').notNull().default('pending'),
  penalty: real('penalty').notNull(),
  resolveBonus: real('resolve_bonus').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
