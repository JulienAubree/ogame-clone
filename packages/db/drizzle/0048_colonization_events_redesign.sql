-- Colonization events redesign.
--
-- Replaces the event-queue model (consolidate/supply/reinforce) with an
-- outpost + periodic raid model. Safe to run on a DB that already has the
-- new shape (IF NOT EXISTS / IF EXISTS everywhere), so re-applying is a no-op.
--
-- 1. Add the new columns. Existing active processes get grandfathered into a
--    fresh raid grace period so the worker doesn't immediately fail them.
ALTER TABLE "colonization_processes"
  ADD COLUMN IF NOT EXISTS "outpost_established" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_raid_at" timestamptz NOT NULL DEFAULT now();

UPDATE "colonization_processes"
SET "outpost_established" = true,
    "last_raid_at" = now()
WHERE "status" = 'active';

-- 2. Drop the columns the old event model relied on.
ALTER TABLE "colonization_processes"
  DROP COLUMN IF EXISTS "consolidate_completed",
  DROP COLUMN IF EXISTS "supply_completed",
  DROP COLUMN IF EXISTS "reinforce_completed",
  DROP COLUMN IF EXISTS "reinforce_passive_bonus",
  DROP COLUMN IF EXISTS "last_event_at",
  DROP COLUMN IF EXISTS "last_consolidate_at";

-- 3. Drop the legacy events table and its enums.
DROP TABLE IF EXISTS "colonization_events";
DROP TYPE IF EXISTS "colonization_event_type";
DROP TYPE IF EXISTS "colonization_event_status";
