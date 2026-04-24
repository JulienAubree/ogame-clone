import { sql } from 'drizzle-orm';
import { pgTable, uuid, smallint, timestamp, numeric, jsonb, pgEnum, index, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { planets } from './planets.js';
import { pveMissions } from './pve-missions.js';
import { marketOffers } from './market-offers.js';

export const fleetMissionEnum = pgEnum('fleet_mission', [
  'transport', 'station', 'spy', 'attack', 'colonize', 'recycle', 'mine', 'pirate', 'trade', 'scan', 'explore', 'colonize_supply', 'colonize_reinforce', 'colonization_raid', 'abandon_return',
]);

export const fleetPhaseEnum = pgEnum('fleet_phase', ['outbound', 'prospecting', 'mining', 'exploring', 'return']);

export const fleetStatusEnum = pgEnum('fleet_status', ['active', 'completed', 'recalled']);

export const fleetEvents = pgTable('fleet_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  originPlanetId: uuid('origin_planet_id').references(() => planets.id, { onDelete: 'set null' }),
  targetPlanetId: uuid('target_planet_id').references(() => planets.id, { onDelete: 'set null' }),
  targetGalaxy: smallint('target_galaxy').notNull(),
  targetSystem: smallint('target_system').notNull(),
  targetPosition: smallint('target_position').notNull(),
  mission: fleetMissionEnum('mission').notNull(),
  phase: fleetPhaseEnum('phase').notNull().default('outbound'),
  status: fleetStatusEnum('status').notNull().default('active'),
  departureTime: timestamp('departure_time', { withTimezone: true }).notNull(),
  arrivalTime: timestamp('arrival_time', { withTimezone: true }).notNull(),
  mineraiCargo: numeric('minerai_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  siliciumCargo: numeric('silicium_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  hydrogeneCargo: numeric('hydrogene_cargo', { precision: 20, scale: 2 }).notNull().default('0'),
  ships: jsonb('ships').notNull().default('{}'),
  metadata: jsonb('metadata'),
  pveMissionId: uuid('pve_mission_id').references(() => pveMissions.id, { onDelete: 'set null' }),
  tradeId: uuid('trade_id').references(() => marketOffers.id, { onDelete: 'set null' }),
  detectedAt: timestamp('detected_at', { withTimezone: true }),
  detectionScore: smallint('detection_score'),
}, (table) => [
  index('fleet_events_arrival_idx').on(table.arrivalTime).where(sql`status = 'active'`),
  index('fleet_events_user_idx').on(table.userId),
  index('fleet_events_origin_planet_idx').on(table.originPlanetId),
]);
