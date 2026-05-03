import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';

/**
 * Singleton table holding the public homepage content. Always exactly one row
 * (UUID is fixed by the seed/bootstrap). Storing as a single JSONB blob keeps
 * the schema flexible — adding/removing sections doesn't require migrations.
 *
 * The JSON shape is enforced at the API boundary by Zod, not at the DB level.
 */
export const homepageContent = pgTable('homepage_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: jsonb('content').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type HomepageContentRow = typeof homepageContent.$inferSelect;
