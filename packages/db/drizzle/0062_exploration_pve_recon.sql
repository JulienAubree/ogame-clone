-- Exploration PvE — P1 Reconnaissance
-- Adds the cooldown timer for exploration mission generation in mission_center_state.
-- Existing rows stay NULL → next materializeDiscoveries pass will seed them at "now".

ALTER TABLE "mission_center_state"
  ADD COLUMN IF NOT EXISTS "next_exploration_discovery_at" timestamp with time zone;

-- Track when a position was discovered to enforce the recon contract anti-exploit
-- (only positions discovered AFTER the contract was accepted count toward the quota).
-- Existing rows backfill to NOW() — they won't count for any newly generated contract,
-- which is the intended behavior.
ALTER TABLE "discovered_positions"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT NOW();
