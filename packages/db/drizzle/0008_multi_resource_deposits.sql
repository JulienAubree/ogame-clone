ALTER TYPE "public"."fleet_phase" ADD VALUE 'prospecting' BEFORE 'return';--> statement-breakpoint
ALTER TYPE "public"."fleet_phase" ADD VALUE 'mining' BEFORE 'return';--> statement-breakpoint
ALTER TYPE "public"."message_type" ADD VALUE 'mission';--> statement-breakpoint
CREATE TABLE "bonus_definitions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"source_type" varchar(16) NOT NULL,
	"source_id" varchar(64) NOT NULL,
	"stat" varchar(64) NOT NULL,
	"percent_per_level" real NOT NULL,
	"category" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "tutorial_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current_quest_id" varchar(64) DEFAULT 'quest_1' NOT NULL,
	"completed_quests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutorial_progress_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "tutorial_quest_definitions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"quest_order" integer NOT NULL,
	"title" varchar(128) NOT NULL,
	"narrative_text" text NOT NULL,
	"condition_type" varchar(32) NOT NULL,
	"condition_target_id" varchar(64) NOT NULL,
	"condition_target_value" integer NOT NULL,
	"reward_minerai" integer DEFAULT 0 NOT NULL,
	"reward_silicium" integer DEFAULT 0 NOT NULL,
	"reward_hydrogene" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "building_definitions" DROP CONSTRAINT "building_definitions_reduces_time_for_category_entity_categories_id_fk";
--> statement-breakpoint
DROP INDEX "deposits_belt_remaining_idx";--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "minerai_total" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "minerai_remaining" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "silicium_total" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "silicium_remaining" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "hydrogene_total" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "hydrogene_remaining" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "building_definitions" ADD COLUMN "flavor_text" text;--> statement-breakpoint
ALTER TABLE "defense_definitions" ADD COLUMN "flavor_text" text;--> statement-breakpoint
ALTER TABLE "research_definitions" ADD COLUMN "flavor_text" text;--> statement-breakpoint
ALTER TABLE "research_definitions" ADD COLUMN "effect_description" text;--> statement-breakpoint
ALTER TABLE "research_definitions" ADD COLUMN "max_level" smallint;--> statement-breakpoint
ALTER TABLE "ship_definitions" ADD COLUMN "flavor_text" text;--> statement-breakpoint
ALTER TABLE "user_research" ADD COLUMN "rock_fracturing" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_research" ADD COLUMN "deep_space_refining" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deposits_belt_idx" ON "asteroid_deposits" USING btree ("belt_id");--> statement-breakpoint
ALTER TABLE "asteroid_deposits" DROP COLUMN "resource_type";--> statement-breakpoint
ALTER TABLE "asteroid_deposits" DROP COLUMN "total_quantity";--> statement-breakpoint
ALTER TABLE "asteroid_deposits" DROP COLUMN "remaining_quantity";--> statement-breakpoint
ALTER TABLE "building_definitions" DROP COLUMN "build_time_reduction_factor";--> statement-breakpoint
ALTER TABLE "building_definitions" DROP COLUMN "reduces_time_for_category";--> statement-breakpoint
DELETE FROM universe_config WHERE key IN (
  'slag_rate.pos8.minerai', 'slag_rate.pos8.silicium', 'slag_rate.pos8.hydrogene',
  'slag_rate.pos16.minerai', 'slag_rate.pos16.silicium', 'slag_rate.pos16.hydrogene'
);--> statement-breakpoint
INSERT INTO universe_config (key, value) VALUES ('slag_rate.pos8', 0.30) ON CONFLICT (key) DO NOTHING;--> statement-breakpoint
INSERT INTO universe_config (key, value) VALUES ('slag_rate.pos16', 0.15) ON CONFLICT (key) DO NOTHING;
