import { pgTable, uuid, varchar, integer, smallint, timestamp, uniqueIndex, text, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { planets } from './planets.js';

export const flagships = pgTable('flagships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  planetId: uuid('planet_id')
    .notNull()
    .references(() => planets.id, { onDelete: 'set null' }),

  // Personnalisation
  name: varchar('name', { length: 32 }).notNull().default('Vaisseau amiral'),
  description: varchar('description', { length: 256 }).notNull().default(''),
  flagshipImageIndex: smallint('flagship_image_index'),

  // Stats de base (combat frégate, soute petit cargo, modifiables par les talents)
  baseSpeed: integer('base_speed').notNull().default(13000),
  fuelConsumption: integer('fuel_consumption').notNull().default(72),
  cargoCapacity: integer('cargo_capacity').notNull().default(8000),
  driveType: varchar('drive_type', { length: 32 }).notNull().default('impulse'),
  weapons: integer('weapons').notNull().default(12),
  shield: integer('shield').notNull().default(16),
  hull: integer('hull').notNull().default(30),
  baseArmor: integer('base_armor').notNull().default(2),
  shotCount: integer('shot_count').notNull().default(5),
  unlockedShips: text('unlocked_ships').array().notNull().default([]),
  combatCategoryId: varchar('combat_category_id', { length: 32 }).notNull().default('medium'),

  // Etat
  status: varchar('status', { length: 16 }).notNull().default('active'),
  repairEndsAt: timestamp('repair_ends_at', { withTimezone: true }),

  // Coque
  hullId: varchar('hull_id', { length: 32 }),
  hullChangedAt: timestamp('hull_changed_at', { withTimezone: true }),
  hullChangeAvailableAt: timestamp('hull_change_available_at', { withTimezone: true }),
  refitEndsAt: timestamp('refit_ends_at', { withTimezone: true }),

  // Modules
  moduleLoadout:        jsonb('module_loadout').notNull().default(sql`'{}'::jsonb`),
  epicChargesCurrent:   smallint('epic_charges_current').notNull().default(0),
  epicChargesMax:       smallint('epic_charges_max').notNull().default(1),

  /** Flagship XP system (2026-05-04) : XP cumulée. */
  xp:    integer('xp').notNull().default(0),
  /** Level dérivé de xp via xpToLevel formula, persisté pour query rapide. */
  level: smallint('level').notNull().default(1),

  /** Anomaly tiers (2026-05-04) : palier max débloqué (peut engager 1..maxTierUnlocked). */
  maxTierUnlocked:  smallint('max_tier_unlocked').notNull().default(1),
  /** Anomaly tiers : palier max complété (depth 20 atteint). Utilisé par leaderboard. */
  maxTierCompleted: smallint('max_tier_completed').notNull().default(0),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('flagships_user_id_idx').on(table.userId),
]);
