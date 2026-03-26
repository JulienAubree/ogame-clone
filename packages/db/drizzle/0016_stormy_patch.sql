-- Drop rapid_fire table
ALTER TABLE "rapid_fire" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "rapid_fire" CASCADE;--> statement-breakpoint

-- Rename armor → hull in ship_definitions and defense_definitions
ALTER TABLE "ship_definitions" RENAME COLUMN "armor" TO "hull";--> statement-breakpoint
ALTER TABLE "defense_definitions" RENAME COLUMN "armor" TO "hull";--> statement-breakpoint

-- Add new combat columns to ship_definitions
ALTER TABLE "ship_definitions" ADD COLUMN "base_armor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ship_definitions" ADD COLUMN "shot_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ship_definitions" ADD COLUMN "combat_category_id" varchar(64);--> statement-breakpoint

-- Add new combat columns to defense_definitions
ALTER TABLE "defense_definitions" ADD COLUMN "base_armor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "defense_definitions" ADD COLUMN "shot_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "defense_definitions" ADD COLUMN "combat_category_id" varchar(64);--> statement-breakpoint

-- Rename ship columns in planet_ships
ALTER TABLE "planet_ships" RENAME COLUMN "light_fighter" TO "interceptor";--> statement-breakpoint
ALTER TABLE "planet_ships" RENAME COLUMN "heavy_fighter" TO "frigate";--> statement-breakpoint
ALTER TABLE "planet_ships" RENAME COLUMN "battleship" TO "battlecruiser";--> statement-breakpoint

-- Rename defense column in planet_defenses
ALTER TABLE "planet_defenses" RENAME COLUMN "gauss_cannon" TO "electromagnetic_cannon";--> statement-breakpoint

-- Add target_priority to fleet_events
ALTER TABLE "fleet_events" ADD COLUMN "target_priority" varchar(64);
