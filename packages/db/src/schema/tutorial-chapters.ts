import { pgTable, varchar, smallint, integer, text, jsonb } from 'drizzle-orm/pg-core';

export const tutorialChapters = pgTable('tutorial_chapters', {
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 128 }).notNull(),
  journalIntro: text('journal_intro').notNull(),
  order: smallint('chapter_order').notNull(),
  rewardMinerai: integer('reward_minerai').notNull().default(0),
  rewardSilicium: integer('reward_silicium').notNull().default(0),
  rewardHydrogene: integer('reward_hydrogene').notNull().default(0),
  rewardExilium: integer('reward_exilium').notNull().default(0),
  rewardUnits: jsonb('reward_units').notNull().default([]),
});
