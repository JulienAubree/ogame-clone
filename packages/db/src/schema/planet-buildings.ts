import { pgTable, uuid, varchar, smallint, primaryKey } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';

export const planetBuildings = pgTable('planet_buildings', {
  planetId: uuid('planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  buildingId: varchar('building_id', { length: 64 }).notNull(),
  level: smallint('level').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.planetId, t.buildingId] }),
]);
