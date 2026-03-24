-- Attack detection: sensor network vs stealth tech
ALTER TABLE "fleet_events" ADD COLUMN "detected_at" timestamp with time zone;
ALTER TABLE "fleet_events" ADD COLUMN "detection_score" smallint;

ALTER TABLE "user_research" ADD COLUMN "sensor_network" smallint NOT NULL DEFAULT 0;
ALTER TABLE "user_research" ADD COLUMN "stealth_tech" smallint NOT NULL DEFAULT 0;

-- Research definitions for the two new techs
INSERT INTO "research_definitions" ("id", "name", "description", "category_id", "base_cost_minerai", "base_cost_silicium", "base_cost_hydrogene", "base_time_seconds", "cost_factor", "sort_order")
VALUES
  ('sensorNetwork', 'Réseau de capteurs', 'Déploie un réseau de capteurs en espace profond pour détecter les flottes hostiles en approche. Plus le niveau est élevé, plus la détection est précoce et détaillée.', 'military', 10000, 20000, 10000, 7200, 2, 130),
  ('stealthTech', 'Technologie furtive', 'Développe des systèmes de brouillage et d''occultation pour réduire la détectabilité de vos flottes d''attaque. Contrecarre le réseau de capteurs ennemi.', 'military', 15000, 15000, 10000, 7200, 2, 140)
ON CONFLICT ("id") DO NOTHING;

-- Universe config for detection thresholds and timing
INSERT INTO "universe_config" ("key", "value", "label")
VALUES
  ('attack_detection_timing', '[20, 40, 60, 80, 100]', 'Timing de détection des attaques (% du trajet restant par palier)'),
  ('attack_detection_score_thresholds', '[0, 1, 3, 5, 7]', 'Seuils de score pour les paliers de détection')
ON CONFLICT ("key") DO NOTHING;
