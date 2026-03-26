import { pgTable, uuid, varchar, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';
import { users } from './users.js';

export const buildQueueTypeEnum = pgEnum('build_queue_type', [
  'building',
  'research',
  'ship',
  'defense',
]);
export const buildQueueStatusEnum = pgEnum('build_queue_status', [
  'active',
  'queued',
  'completed',
]);

export const buildQueue = pgTable('build_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  planetId: uuid('planet_id')
    .notNull()
    .references(() => planets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: buildQueueTypeEnum('type').notNull(),
  itemId: varchar('item_id', { length: 64 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  completedCount: integer('completed_count').notNull().default(0),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  status: buildQueueStatusEnum('status').notNull().default('active'),
  facilityId: varchar('facility_id', { length: 64 }),
}, (table) => [
  index('build_queue_planet_type_status_idx').on(table.planetId, table.type, table.status),
]);
