ALTER TABLE "planet_ships" ADD COLUMN "solar_satellite" integer DEFAULT 0 NOT NULL;
ALTER TABLE "ship_definitions" ADD COLUMN "is_stationary" boolean DEFAULT false NOT NULL;
