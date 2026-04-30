-- Anomalie : ajout de 'anomaly' à l'enum fleet_mission (utilisé par mission_reports)
-- + nouvelle colonne report_ids sur anomalies pour lier les rapports de combat à un run.

ALTER TYPE "fleet_mission" ADD VALUE IF NOT EXISTS 'anomaly';

ALTER TABLE "anomalies"
  ADD COLUMN IF NOT EXISTS "report_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
