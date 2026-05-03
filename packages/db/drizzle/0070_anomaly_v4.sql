-- Anomaly V4 — flagship-only schema additions

-- Nouvelles colonnes pour les charges réparation
-- IF NOT EXISTS pour idempotence (le 1er run a appliqué les ADD COLUMN avant
-- le crash sur INSERT universe_config — sans marker posé, le re-run crashait).
ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS repair_charges_current SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_charges_max     SMALLINT NOT NULL DEFAULT 3;

-- Universe config tunables
-- Note : universe_config.value est jsonb, donc on cast les valeurs scalaires.
INSERT INTO universe_config (key, value) VALUES
  ('anomaly_repair_charges_per_run', '3'::jsonb),
  ('anomaly_repair_charge_hull_pct', '0.30'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('anomaly_v4_schema', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
