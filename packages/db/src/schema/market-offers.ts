import { pgTable, uuid, timestamp, numeric, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { planets } from './planets.js';
import { explorationReports } from './exploration-reports.js';

export const marketOfferStatusEnum = pgEnum('market_offer_status', [
  'active',
  'reserved',
  'sold',
  'expired',
  'cancelled',
]);

export const marketResourceTypeEnum = pgEnum('market_resource_type', [
  'minerai',
  'silicium',
  'hydrogene',
]);

export const marketOffers = pgTable('market_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: uuid('seller_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  resourceType: marketResourceTypeEnum('resource_type'),
  quantity: numeric('quantity', { precision: 20, scale: 2 }),
  explorationReportId: uuid('exploration_report_id').references(() => explorationReports.id, { onDelete: 'set null' }),
  priceMinerai: numeric('price_minerai', { precision: 20, scale: 2 }).notNull().default('0'),
  priceSilicium: numeric('price_silicium', { precision: 20, scale: 2 }).notNull().default('0'),
  priceHydrogene: numeric('price_hydrogene', { precision: 20, scale: 2 }).notNull().default('0'),
  status: marketOfferStatusEnum('status').notNull().default('active'),
  reservedBy: uuid('reserved_by').references(() => users.id, { onDelete: 'set null' }),
  reservedAt: timestamp('reserved_at', { withTimezone: true }),
  fleetEventId: uuid('fleet_event_id'),  // Plain uuid, FK only in migration SQL to avoid circular reference
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  index('market_offers_status_idx').on(table.status),
  index('market_offers_seller_idx').on(table.sellerId, table.status),
  index('market_offers_resource_idx').on(table.resourceType, table.status),
]);
