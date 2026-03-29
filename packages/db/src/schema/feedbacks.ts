import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, index, integer, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const feedbackTypeEnum = pgEnum('feedback_type', ['bug', 'idea', 'feedback']);
export const feedbackStatusEnum = pgEnum('feedback_status', ['new', 'in_progress', 'resolved', 'rejected']);

export const feedbacks = pgTable('feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: feedbackTypeEnum('type').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description').notNull(),
  status: feedbackStatusEnum('status').notNull().default('new'),
  upvoteCount: integer('upvote_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  adminNote: text('admin_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('feedbacks_user_idx').on(table.userId),
  index('feedbacks_type_idx').on(table.type, table.createdAt),
  index('feedbacks_status_idx').on(table.status),
  index('feedbacks_popular_idx').on(table.upvoteCount, table.createdAt),
]);

export const feedbackVotes = pgTable('feedback_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedbackId: uuid('feedback_id').notNull().references(() => feedbacks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('feedback_votes_unique').on(table.feedbackId, table.userId),
  index('feedback_votes_feedback_idx').on(table.feedbackId),
]);

export const feedbackComments = pgTable('feedback_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedbackId: uuid('feedback_id').notNull().references(() => feedbacks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('feedback_comments_feedback_idx').on(table.feedbackId, table.createdAt),
]);
