import { pgTable, uuid, varchar, timestamp, boolean, text, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';

export const playstyleEnum = pgEnum('playstyle', ['miner', 'warrior', 'explorer']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  bio: text('bio'),
  avatarId: varchar('avatar_id', { length: 128 }),
  playstyle: playstyleEnum('playstyle'),
  seekingAlliance: boolean('seeking_alliance').notNull().default(false),
  theme: varchar('theme', { length: 16 }).notNull().default('dark'),
  profileVisibility: jsonb('profile_visibility').notNull().default({ bio: true, playstyle: true, stats: true }),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('refresh_tokens_token_hash_idx').on(table.tokenHash),
  index('refresh_tokens_expires_at_idx').on(table.expiresAt),
]);
