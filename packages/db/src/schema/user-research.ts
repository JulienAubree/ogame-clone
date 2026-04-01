import { pgTable, uuid, smallint } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const userResearch = pgTable('user_research', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  espionageTech: smallint('espionage_tech').notNull().default(0),
  computerTech: smallint('computer_tech').notNull().default(0),
  energyTech: smallint('energy_tech').notNull().default(0),
  combustion: smallint('combustion').notNull().default(0),
  impulse: smallint('impulse').notNull().default(0),
  hyperspaceDrive: smallint('hyperspace_drive').notNull().default(0),
  weapons: smallint('weapons').notNull().default(0),
  shielding: smallint('shielding').notNull().default(0),
  armor: smallint('armor').notNull().default(0),
  rockFracturing: smallint('rock_fracturing').notNull().default(0),
  deepSpaceRefining: smallint('deep_space_refining').notNull().default(0),
  sensorNetwork: smallint('sensor_network').notNull().default(0),
  stealthTech: smallint('stealth_tech').notNull().default(0),
  semiconductors: smallint('semiconductors').notNull().default(0),
  armoredStorage: smallint('armored_storage').notNull().default(0),
});
