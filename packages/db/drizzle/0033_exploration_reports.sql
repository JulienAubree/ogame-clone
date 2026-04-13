-- Exploration report status lifecycle enum
CREATE TYPE "exploration_report_status" AS ENUM ('inventory', 'listed', 'sold', 'consumed');

-- Vendable exploration report objects
CREATE TABLE "exploration_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "creator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "galaxy" smallint NOT NULL,
  "system" smallint NOT NULL,
  "position" smallint NOT NULL,
  "planet_class_id" varchar(64) NOT NULL,
  "biomes" jsonb NOT NULL,
  "biome_count" smallint NOT NULL,
  "max_rarity" varchar(32) NOT NULL,
  "is_complete" boolean NOT NULL DEFAULT false,
  "creation_cost" numeric(20, 2) NOT NULL,
  "status" "exploration_report_status" NOT NULL DEFAULT 'inventory',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "exploration_reports_owner_status_idx" ON "exploration_reports" ("owner_id", "status");
CREATE INDEX "exploration_reports_galaxy_system_status_idx" ON "exploration_reports" ("galaxy", "system", "status");

-- Add nullable FK column on market_offers to link report offers
ALTER TABLE "market_offers" ADD COLUMN "exploration_report_id" uuid REFERENCES "exploration_reports"("id") ON DELETE SET NULL;

-- Drop NOT NULL on resourceType and quantity (report offers don't carry resources)
ALTER TABLE "market_offers" ALTER COLUMN "resource_type" DROP NOT NULL;
ALTER TABLE "market_offers" ALTER COLUMN "quantity" DROP NOT NULL;
