import { pgTable, uuid, integer } from 'drizzle-orm/pg-core';
import { planets } from './planets.js';

export const planetDefenses = pgTable('planet_defenses', {
  planetId: uuid('planet_id')
    .primaryKey()
    .references(() => planets.id, { onDelete: 'cascade' }),
  rocketLauncher: integer('rocket_launcher').notNull().default(0),
  lightLaser: integer('light_laser').notNull().default(0),
  heavyLaser: integer('heavy_laser').notNull().default(0),
  gaussCannon: integer('gauss_cannon').notNull().default(0),
  plasmaTurret: integer('plasma_turret').notNull().default(0),
  smallShield: integer('small_shield').notNull().default(0),
  largeShield: integer('large_shield').notNull().default(0),
});
