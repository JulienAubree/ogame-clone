-- Anomaly tiers system (2026-05-04)

-- Tier sur l'anomaly row (default 1 pour back-compat des anomalies actives)
ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS tier SMALLINT NOT NULL DEFAULT 1;

-- Tier progression sur le flagship
ALTER TABLE flagships
  ADD COLUMN IF NOT EXISTS max_tier_unlocked  SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_tier_completed SMALLINT NOT NULL DEFAULT 0;

-- Universe config tunables (jsonb cast obligatoire)
INSERT INTO universe_config (key, value) VALUES
  ('anomaly_tier_multiplier_factor',  '1.0'::jsonb),
  ('anomaly_loot_tier_cap',           '10'::jsonb),
  ('anomaly_tier_engage_cost_factor', '1.0'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('anomaly_tiers_init', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
