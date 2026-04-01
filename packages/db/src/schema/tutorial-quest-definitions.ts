import { pgTable, varchar, integer, text } from 'drizzle-orm/pg-core';

export const tutorialQuestDefinitions = pgTable('tutorial_quest_definitions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  order: integer('quest_order').notNull(),
  title: varchar('title', { length: 128 }).notNull(),
  narrativeText: text('narrative_text').notNull(),
  conditionType: varchar('condition_type', { length: 32 }).notNull(),  // building_level | ship_count | mission_complete
  conditionTargetId: varchar('condition_target_id', { length: 64 }).notNull(),
  conditionTargetValue: integer('condition_target_value').notNull(),
  rewardMinerai: integer('reward_minerai').notNull().default(0),
  rewardSilicium: integer('reward_silicium').notNull().default(0),
  rewardHydrogene: integer('reward_hydrogene').notNull().default(0),
  conditionLabel: varchar('condition_label', { length: 128 }),
  chapterId: varchar('chapter_id', { length: 64 }).notNull().default('chapter_1'),
  journalEntry: text('journal_entry').notNull().default(''),
  objectiveLabel: varchar('objective_label', { length: 128 }).notNull().default(''),
});
