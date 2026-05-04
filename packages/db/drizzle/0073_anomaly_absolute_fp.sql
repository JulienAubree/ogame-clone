-- Anomaly V6-AbsoluteFP (2026-05-04)
-- Décorrélation enemy FP / player FP : palier 1 accessible aux débutants,
-- paliers élevés réservés aux hardcore. Voir packages/game-engine/src/formulas/anomaly.ts.

-- Nouvelles clés : FP absolu par palier
INSERT INTO universe_config (key, value) VALUES
  ('anomaly_tier_base_fp',     '80'::jsonb),   -- FP enemy au palier 1, depth 1
  ('anomaly_tier_fp_growth',   '1.7'::jsonb)   -- croissance FP entre paliers
ON CONFLICT (key) DO NOTHING;

-- Re-tuning des clés intra-palier pour la V6 :
--  - difficulty_growth 1.3 → 1.06  (croissance smooth depth 1→20)
--  - enemy_max_ratio   1.3 → 3.0   (cap intra-palier ×3 au depth max)
-- On force l'UPDATE car les anciennes valeurs (calibrées V4 quand le ratio
-- était relatif au playerFP) n'ont plus de sens en absolu.
UPDATE universe_config SET value = '1.06'::jsonb WHERE key = 'anomaly_difficulty_growth';
UPDATE universe_config SET value = '3.0'::jsonb  WHERE key = 'anomaly_enemy_max_ratio';

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('anomaly_absolute_fp_init', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
