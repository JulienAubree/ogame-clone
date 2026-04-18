import { pgTable, uuid, varchar, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { changelogs } from './changelogs.js';

export const announcementVariantEnum = pgEnum('announcement_variant', ['info', 'warning', 'success']);

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  message: varchar('message', { length: 280 }).notNull(),
  variant: announcementVariantEnum('variant').notNull().default('info'),
  changelogId: uuid('changelog_id').references(() => changelogs.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
