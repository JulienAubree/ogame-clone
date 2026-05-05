-- V9 — Boss anomaly (2026-05-04)
-- Ajoute les colonnes nécessaires pour gérer les boss spawnant aux profondeurs
-- 1, 5, 10, 15, 20 d'une run anomaly :
--   - active_buffs       : liste des buffs actifs accordés par les boss vaincus
--                          ({type, magnitude, sourceBossId}). Persistés jusqu'au
--                          runComplete ou wipe.
--   - pending_boss_id    : id du boss à affronter au prochain noeud (nullable).
--                          Utilisé en complément de next_node_type='boss'.
--   - defeated_boss_ids  : liste des boss déjà battus dans cette run, pour
--                          empêcher la répétition intra-run.

ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS active_buffs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_boss_id VARCHAR(40),
  ADD COLUMN IF NOT EXISTS defeated_boss_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO _migrations_state (key, value)
VALUES ('anomaly_boss_init', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
