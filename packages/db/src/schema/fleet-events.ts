import { sql } from 'drizzle-orm';
import { pgTable, uuid, smallint, timestamp, numeric, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets } from './planets.js';

export const fleetMissionEnum = pgEnum('fleet_mission', [
  'transport',
  'station',
  'spy',
  'attack',
  'colonize',
]);

export const fleetPhaseEnum = pgEnum('fleet_phase', ['outbound', 'return']);

export const fleetStatusEnum = pgEnum('fleet_status', ['active', 'completed', 'recalled']);

export const fleetEvents = pgTable('fleet_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  originPlanetId: uuid('origin_planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  targetPlanetId: uuid('target_planet_id').references(() => planets.id, { onDelete: 'set null' }),
  targetGalaxy: smallint('target_galaxy').notNull(),
  targetSystem: smallint('target_system').notNull(),
  targetPosition: smallint('target_position').notNull(),
  mission: fleetMissionEnum('mission').notNull(),
  phase: fleetPhaseEnum('phase').notNull().default('outbound'),
  status: fleetStatusEnum('status').notNull().default('active'),
  departureTime: timestamp('departure_time', { withTimezone: true }).notNull(),
  arrivalTime: timestamp('arrival_time', { withTimezone: true }).notNull(),
  metalCargo: numeric('metal_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  crystalCargo: numeric('crystal_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  deuteriumCargo: numeric('deuterium_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  ships: jsonb('ships').notNull().default('{}'),
}, (table) => [
  index('fleet_events_arrival_idx').on(table.arrivalTime).where(sql`status = 'active'`),
  index('fleet_events_user_idx').on(table.userId),
]);
