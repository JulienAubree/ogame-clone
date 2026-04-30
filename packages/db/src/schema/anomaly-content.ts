import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';

/**
 * Singleton table holding admin-managed content for the Anomaly mode
 * (depth illustrations + later: random-event pool). Same pattern as
 * `homepage_content` — a single row, JSONB blob validated by Zod at the
 * API boundary.
 */
export const anomalyContent = pgTable('anomaly_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: jsonb('content').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AnomalyContentRow = typeof anomalyContent.$inferSelect;
