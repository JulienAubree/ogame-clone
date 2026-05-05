import { pgTable, uuid, varchar, smallint, jsonb, integer, timestamp, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { planets } from './planets.js';

/**
 * Anomalie gravitationnelle — rogue-lite asynchrone.
 * Une seule anomalie active par joueur (partial unique index plus bas).
 *
 * `fleet` shape: Record<shipId, { count: number; hullPercent: number }>.
 * `loot_ships` shape: Record<shipId, number> (récupération d'ennemis vaincus).
 */
export const anomalies = pgTable('anomalies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  originPlanetId: uuid('origin_planet_id').notNull().references(() => planets.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  currentDepth: smallint('current_depth').notNull().default(0),
  fleet: jsonb('fleet').notNull(),
  lootMinerai: numeric('loot_minerai', { precision: 20, scale: 2 }).notNull().default('0'),
  lootSilicium: numeric('loot_silicium', { precision: 20, scale: 2 }).notNull().default('0'),
  lootHydrogene: numeric('loot_hydrogene', { precision: 20, scale: 2 }).notNull().default('0'),
  lootShips: jsonb('loot_ships').notNull().default(sql`'{}'::jsonb`),
  exiliumPaid: integer('exilium_paid').notNull(),
  nextNodeAt: timestamp('next_node_at', { withTimezone: true }),
  reportIds: jsonb('report_ids').notNull().default(sql`'[]'::jsonb`),
  /** Pre-generated enemy fleet for the next node (so the player can see what's coming). */
  nextEnemyFleet: jsonb('next_enemy_fleet'),
  nextEnemyFp: integer('next_enemy_fp'),
  /** 'combat' | 'event' — type of the pending node. */
  nextNodeType: varchar('next_node_type', { length: 8 }).notNull().default('combat'),
  /** When nextNodeType='event', id of the picked event in anomaly_content.events. */
  nextEventId: varchar('next_event_id', { length: 40 }),
  /** Event ids already shown in this run (no-repeat). */
  seenEventIds: jsonb('seen_event_ids').notNull().default(sql`'[]'::jsonb`),
  /** Decrements at each combat won; when 0, next node becomes an event. */
  combatsUntilNextEvent: smallint('combats_until_next_event').notNull().default(3),
  /** Resolved events: [{ depth, eventId, choiceIndex, outcomeApplied, resolvedAt }]. */
  eventLog: jsonb('event_log').notNull().default(sql`'[]'::jsonb`),
  /** Snapshot of equipped modules at run start. Shape:
   *  Record<hullId, { epic: string | null; rare: (string|null)[]; common: (string|null)[] }>.
   *  Fixed-length arrays with `null` placeholders for empty slots — see
   *  hullSlotSchema in apps/api/src/modules/modules/modules.types.ts. */
  equippedModules:    jsonb('equipped_modules').notNull().default(sql`'{}'::jsonb`),
  /** Pending epic effect to apply on next combat (set by epic module activation). */
  pendingEpicEffect:  jsonb('pending_epic_effect'),
  /** Anomaly V4 (2026-05-03) : nombre de charges réparation restantes dans la run. */
  repairChargesCurrent: smallint('repair_charges_current').notNull().default(0),
  /** Max charges réparation (initialisé à `anomaly_repair_charges_per_run` à l'engage). */
  repairChargesMax:     smallint('repair_charges_max').notNull().default(3),
  /** Anomaly tiers (2026-05-04) : palier sélectionné à l'engage. */
  tier: smallint('tier').notNull().default(1),
  /** V9 Boss (2026-05-04) : liste des buffs actifs accordés par les boss
   *  vaincus dans cette run. Shape :
   *  Array<{ type: BossBuff; magnitude: number; sourceBossId: string }>.
   *  Appliqués au flagship pour le reste de la run. */
  activeBuffs:        jsonb('active_buffs').notNull().default(sql`'[]'::jsonb`),
  /** V9 Boss : id du boss à affronter au prochain noeud (set quand
   *  next_node_type='boss'). Permet de persister la sélection sans
   *  retoucher la pool à chaque tick. */
  pendingBossId:      varchar('pending_boss_id', { length: 40 }),
  /** V9 Boss : ids des boss déjà battus dans cette run (anti-répétition). */
  defeatedBossIds:    jsonb('defeated_boss_ids').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
