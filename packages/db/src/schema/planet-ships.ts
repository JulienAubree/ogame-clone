import { pgTable, uuid, integer } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';

export const planetShips = pgTable('planet_ships', {
  planetId: uuid('planet_id')
    .primaryKey()
    .references(() => planets.id, { onDelete: 'cascade' }),
  smallCargo: integer('small_cargo').notNull().default(0),
  largeCargo: integer('large_cargo').notNull().default(0),
  lightFighter: integer('light_fighter').notNull().default(0),
  heavyFighter: integer('heavy_fighter').notNull().default(0),
  cruiser: integer('cruiser').notNull().default(0),
  battleship: integer('battleship').notNull().default(0),
  espionageProbe: integer('espionage_probe').notNull().default(0),
  colonyShip: integer('colony_ship').notNull().default(0),
  recycler: integer('recycler').notNull().default(0),
  prospector: integer('prospector').notNull().default(0),
  explorer: integer('explorer').notNull().default(0),
});
