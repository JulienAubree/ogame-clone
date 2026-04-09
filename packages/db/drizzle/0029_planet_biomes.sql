-- Biome rarity enum
CREATE TYPE "biome_rarity" AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary');

-- Biome definitions (game config)
CREATE TABLE "biome_definitions" (
  "id" varchar(64) PRIMARY KEY,
  "name" varchar(128) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "rarity" "biome_rarity" NOT NULL,
  "compatible_planet_types" jsonb NOT NULL,
  "effects" jsonb NOT NULL
);

-- Planet biomes (join table)
CREATE TABLE "planet_biomes" (
  "planet_id" uuid NOT NULL REFERENCES "planets"("id") ON DELETE CASCADE,
  "biome_id" varchar(64) NOT NULL REFERENCES "biome_definitions"("id") ON DELETE CASCADE,
  PRIMARY KEY ("planet_id", "biome_id")
);

CREATE INDEX "planet_biomes_planet_idx" ON "planet_biomes" ("planet_id");
