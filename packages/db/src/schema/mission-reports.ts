import { pgTable, uuid, varchar, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { fleetEvents, fleetMissionEnum } from './fleet-events.js';
import { pveMissions } from './pve-missions.js';
import { messages } from './messages.js';

export const missionReports = pgTable('mission_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fleetEventId: uuid('fleet_event_id').references(() => fleetEvents.id, { onDelete: 'set null' }),
  pveMissionId: uuid('pve_mission_id').references(() => pveMissions.id, { onDelete: 'set null' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
  missionType: fleetMissionEnum('mission_type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  coordinates: jsonb('coordinates').notNull(),
  originCoordinates: jsonb('origin_coordinates'),
  fleet: jsonb('fleet').notNull(),
  departureTime: timestamp('departure_time', { withTimezone: true }).notNull(),
  completionTime: timestamp('completion_time', { withTimezone: true }).notNull(),
  result: jsonb('result').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('mission_reports_user_created_idx').on(table.userId, table.createdAt),
  index('mission_reports_message_idx').on(table.messageId),
]);
