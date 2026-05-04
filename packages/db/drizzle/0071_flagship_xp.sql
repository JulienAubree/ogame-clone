-- Flagship XP system (2026-05-04)
-- IF NOT EXISTS pour idempotence en cas de re-run partiel
ALTER TABLE flagships
  ADD COLUMN IF NOT EXISTS xp    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 1;

-- Universe config tunables (jsonb cast obligatoire — colonne value est jsonb)
INSERT INTO universe_config (key, value) VALUES
  ('flagship_xp_per_kill_fp_factor',    '0.10'::jsonb),
  ('flagship_xp_per_depth_bonus',       '100'::jsonb),
  ('flagship_xp_level_multiplier_pct',  '0.05'::jsonb),
  ('flagship_max_level',                '60'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Tune parallèle V4 : adoucir le early-game pour les flagships rang 1
-- (upsert : la clé n'a jamais été seedée par les migrations antérieures)
INSERT INTO universe_config (key, value)
VALUES ('anomaly_enemy_base_ratio', '0.5'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '0.5'::jsonb;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('flagship_xp_init', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
