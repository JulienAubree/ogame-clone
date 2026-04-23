ALTER TABLE "building_definitions"
  ADD COLUMN "variant_planet_types" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "defense_definitions"
  ADD COLUMN "variant_planet_types" jsonb NOT NULL DEFAULT '[]'::jsonb;
