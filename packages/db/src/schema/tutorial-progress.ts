import { pgTable, uuid, varchar, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const tutorialProgress = pgTable('tutorial_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  currentQuestId: varchar('current_quest_id', { length: 64 }).notNull().default('quest_1'),
  completedQuests: jsonb('completed_quests').notNull().default([]),
  isComplete: boolean('is_complete').notNull().default(false),
  pendingCompletion: boolean('pending_completion').notNull().default(false),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
