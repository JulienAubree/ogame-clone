import { pgTable, uuid, integer } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';

export const planetShips = pgTable('planet_ships', {
  planetId: uuid('planet_id')
    .primaryKey()
    .references(() => planets.id, { onDelete: 'cascade' }),
  smallCargo: integer('small_cargo').notNull().default(0),
  largeCargo: integer('large_cargo').notNull().default(0),
  interceptor: integer('interceptor').notNull().default(0),
  frigate: integer('frigate').notNull().default(0),
  cruiser: integer('cruiser').notNull().default(0),
  battlecruiser: integer('battlecruiser').notNull().default(0),
  espionageProbe: integer('espionage_probe').notNull().default(0),
  colonyShip: integer('colony_ship').notNull().default(0),
  recycler: integer('recycler').notNull().default(0),
  prospector: integer('prospector').notNull().default(0),
  recuperateur: integer('recuperateur').notNull().default(0),
  solarSatellite: integer('solar_satellite').notNull().default(0),
});
