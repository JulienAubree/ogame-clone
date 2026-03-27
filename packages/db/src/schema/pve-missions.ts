import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const pveMissions = pgTable('pve_missions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  missionType: varchar('mission_type', { length: 32 }).notNull(),  // 'mine' | 'pirate'
  parameters: jsonb('parameters').notNull().default('{}'),  // coords, depositId, templateId, tier
  rewards: jsonb('rewards').notNull().default('{}'),  // expected resources, bonus ships
  difficultyTier: varchar('difficulty_tier', { length: 16 }),  // 'easy' | 'medium' | 'hard' (combat only)
  status: varchar('status', { length: 16 }).notNull().default('available'),  // available | in_progress | completed | expired
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('pve_missions_user_status_idx').on(table.userId, table.status),
]);

export const pirateTemplates = pgTable('pirate_templates', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  tier: varchar('tier', { length: 16 }).notNull(),  // 'easy' | 'medium' | 'hard'
  ships: jsonb('ships').notNull(),  // Record<string, number> — ratios, not absolute counts
  rewards: jsonb('rewards').notNull(),  // { minerai, silicium, hydrogene, bonusShips }
});
