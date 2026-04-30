import { pgTable, uuid, varchar, smallint, jsonb, integer, timestamp, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { planets } from './planets.js';

/**
 * Anomalie gravitationnelle — rogue-lite asynchrone.
 * Une seule anomalie active par joueur (partial unique index plus bas).
 *
 * `fleet` shape: Record<shipId, { count: number; hullPercent: number }>.
 * `loot_ships` shape: Record<shipId, number> (récupération d'ennemis vaincus).
 */
export const anomalies = pgTable('anomalies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  originPlanetId: uuid('origin_planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  currentDepth: smallint('current_depth').notNull().default(0),
  fleet: jsonb('fleet').notNull(),
  lootMinerai: numeric('loot_minerai', { precision: 20, scale: 2 }).notNull().default('0'),
  lootSilicium: numeric('loot_silicium', { precision: 20, scale: 2 }).notNull().default('0'),
  lootHydrogene: numeric('loot_hydrogene', { precision: 20, scale: 2 }).notNull().default('0'),
  lootShips: jsonb('loot_ships').notNull().default(sql`'{}'::jsonb`),
  exiliumPaid: integer('exilium_paid').notNull(),
  nextNodeAt: timestamp('next_node_at', { withTimezone: true }),
  reportIds: jsonb('report_ids').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
