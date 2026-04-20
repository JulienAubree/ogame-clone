-- Colonization rate bonuses + rebalance.
--
-- 1. Track the last time a friendly supply convoy arrived at a colonizing
--    planet, for the "recent convoy" bonus window.
ALTER TABLE "colonization_processes"
  ADD COLUMN IF NOT EXISTS "last_convoy_supply_at" timestamptz;

-- 2. Rebalance passive rate + difficulty factors, and add the new bonus
--    knobs. Upsert each row so the migration is idempotent.
INSERT INTO "universe_config" ("key", "value") VALUES
  ('colonization_passive_rate', '0.11'::jsonb),
  ('colonization_difficulty_temperate', '1.0'::jsonb),
  ('colonization_difficulty_arid', '0.95'::jsonb),
  ('colonization_difficulty_glacial', '0.95'::jsonb),
  ('colonization_difficulty_volcanic', '0.90'::jsonb),
  ('colonization_difficulty_gaseous', '0.90'::jsonb),
  ('colonization_distance_penalty_per_hop', '0.01'::jsonb),
  ('colonization_distance_floor', '0.90'::jsonb),
  ('colonization_rate_garrison_fp_threshold', '50'::jsonb),
  ('colonization_rate_garrison_bonus', '0.15'::jsonb),
  ('colonization_rate_convoy_bonus', '0.15'::jsonb),
  ('colonization_rate_convoy_window_hours', '2'::jsonb),
  ('colonization_rate_bonus_cap', '0.30'::jsonb)
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";
