import { pgTable, uuid, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const missionCenterState = pgTable('mission_center_state', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  nextDiscoveryAt: timestamp('next_discovery_at', { withTimezone: true }).notNull(),
  nextPirateDiscoveryAt: timestamp('next_pirate_discovery_at', { withTimezone: true }),
  lastDismissAt: timestamp('last_dismiss_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
