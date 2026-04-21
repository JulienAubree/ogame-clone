import { pgTable, uuid, varchar, text, timestamp, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const allianceRoleEnum = pgEnum('alliance_role', ['founder', 'officer', 'member']);
export const requestStatusEnum = pgEnum('request_status', ['pending', 'accepted', 'declined']);

export const alliances = pgTable('alliances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 30 }).notNull().unique(),
  tag: varchar('tag', { length: 8 }).notNull().unique(),
  description: text('description'),
  founderId: uuid('founder_id').notNull().references(() => users.id),
  blasonShape: varchar('blason_shape', { length: 32 }).notNull(),
  blasonIcon: varchar('blason_icon', { length: 32 }).notNull(),
  blasonColor1: varchar('blason_color1', { length: 7 }).notNull(),
  blasonColor2: varchar('blason_color2', { length: 7 }).notNull(),
  motto: varchar('motto', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const allianceMembers = pgTable('alliance_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  allianceId: uuid('alliance_id').notNull().references(() => alliances.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  role: allianceRoleEnum('role').notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('alliance_members_alliance_idx').on(table.allianceId),
]);

export const allianceInvitations = pgTable('alliance_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  allianceId: uuid('alliance_id').notNull().references(() => alliances.id, { onDelete: 'cascade' }),
  invitedUserId: uuid('invited_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  invitedByUserId: uuid('invited_by_user_id').notNull().references(() => users.id),
  status: requestStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('unique_alliance_invitation').on(table.allianceId, table.invitedUserId),
]);

export const allianceApplications = pgTable('alliance_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  allianceId: uuid('alliance_id').notNull().references(() => alliances.id, { onDelete: 'cascade' }),
  applicantUserId: uuid('applicant_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: requestStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('unique_alliance_application').on(table.allianceId, table.applicantUserId),
]);
