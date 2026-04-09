import { pgTable, varchar, text, real, jsonb, uuid, primaryKey, pgEnum, smallint } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';
import { users } from './users.js';

export const biomeRarityEnum = pgEnum('biome_rarity', ['common', 'uncommon', 'rare', 'epic', 'legendary']);

export const biomeDefinitions = pgTable('biome_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull().default(''),
  rarity: biomeRarityEnum('rarity').notNull(),
  compatiblePlanetTypes: jsonb('compatible_planet_types').notNull(), // string[] — empty array = all types
  effects: jsonb('effects').notNull(), // Array<{ stat: string; category?: string; modifier: number }>
});

export const planetBiomes = pgTable('planet_biomes', {
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  biomeId: varchar('biome_id', { length: 64 }).notNull().references(() => biomeDefinitions.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.planetId, t.biomeId] }),
]);

export const discoveredBiomes = pgTable('discovered_biomes', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  galaxy: smallint('galaxy').notNull(),
  system: smallint('system').notNull(),
  position: smallint('position').notNull(),
  biomeId: varchar('biome_id', { length: 64 }).notNull().references(() => biomeDefinitions.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.userId, t.galaxy, t.system, t.position, t.biomeId] }),
]);
