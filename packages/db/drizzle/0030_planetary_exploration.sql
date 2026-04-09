-- Add planetary_exploration research column
ALTER TABLE "user_research" ADD COLUMN "planetary_exploration" smallint NOT NULL DEFAULT 0;

-- Add explorer ship column
ALTER TABLE "planet_ships" ADD COLUMN "explorer" integer NOT NULL DEFAULT 0;

-- Add 'explore' to fleet_mission enum
ALTER TYPE "fleet_mission" ADD VALUE IF NOT EXISTS 'explore';

-- Discovered biomes table (per-player, per-position)
CREATE TABLE "discovered_biomes" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "galaxy" smallint NOT NULL,
  "system" smallint NOT NULL,
  "position" smallint NOT NULL,
  "biome_id" varchar(64) NOT NULL REFERENCES "biome_definitions"("id") ON DELETE CASCADE,
  PRIMARY KEY ("user_id", "galaxy", "system", "position", "biome_id")
);

CREATE INDEX "discovered_biomes_user_coords_idx" ON "discovered_biomes" ("user_id", "galaxy", "system");
