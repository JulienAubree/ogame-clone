-- Attack detection: sensor network vs stealth tech
ALTER TABLE "fleet_events" ADD COLUMN "detected_at" timestamp with time zone;
ALTER TABLE "fleet_events" ADD COLUMN "detection_score" smallint;

ALTER TABLE "user_research" ADD COLUMN "sensor_network" smallint NOT NULL DEFAULT 0;
ALTER TABLE "user_research" ADD COLUMN "stealth_tech" smallint NOT NULL DEFAULT 0;

-- Research definitions for the two new techs
INSERT INTO "research_definitions" ("id", "name", "description", "category_id", "base_cost_minerai", "base_cost_silicium", "base_cost_hydrogene", "cost_factor", "level_column", "sort_order", "flavor_text", "effect_description")
VALUES
  ('sensorNetwork', 'Réseau de capteurs', 'Deploie un reseau de capteurs en espace profond pour detecter les flottes hostiles en approche.', 'research_combat', 10000, 20000, 10000, 2, 'sensorNetwork', 11, 'Un maillage de balises furtives parseme l''espace autour de vos colonies.', 'Chaque niveau ameliore le delai et le detail de detection des attaques entrantes.'),
  ('stealthTech', 'Technologie furtive', 'Developpe des systemes de brouillage et d''occultation pour reduire la detectabilite de vos flottes d''attaque.', 'research_combat', 15000, 15000, 10000, 2, 'stealthTech', 12, 'Des generateurs de champ holographique rendent vos flottes quasi-invisibles aux capteurs ennemis.', 'Chaque niveau reduit l''efficacite du reseau de capteurs ennemi.')
ON CONFLICT ("id") DO NOTHING;

-- Prerequisites for the new techs (researchLab 6 + espionageTech 3)
INSERT INTO "research_prerequisites" ("research_id", "required_building_id", "required_level")
SELECT 'sensorNetwork', 'researchLab', 6 WHERE NOT EXISTS (SELECT 1 FROM "research_prerequisites" WHERE "research_id" = 'sensorNetwork' AND "required_building_id" = 'researchLab');
INSERT INTO "research_prerequisites" ("research_id", "required_research_id", "required_level")
SELECT 'sensorNetwork', 'espionageTech', 3 WHERE NOT EXISTS (SELECT 1 FROM "research_prerequisites" WHERE "research_id" = 'sensorNetwork' AND "required_research_id" = 'espionageTech');
INSERT INTO "research_prerequisites" ("research_id", "required_building_id", "required_level")
SELECT 'stealthTech', 'researchLab', 6 WHERE NOT EXISTS (SELECT 1 FROM "research_prerequisites" WHERE "research_id" = 'stealthTech' AND "required_building_id" = 'researchLab');
INSERT INTO "research_prerequisites" ("research_id", "required_research_id", "required_level")
SELECT 'stealthTech', 'espionageTech', 3 WHERE NOT EXISTS (SELECT 1 FROM "research_prerequisites" WHERE "research_id" = 'stealthTech' AND "required_research_id" = 'espionageTech');

-- Universe config for detection thresholds and timing
INSERT INTO "universe_config" ("key", "value", "label")
VALUES
  ('attack_detection_timing', '[20, 40, 60, 80, 100]', 'Timing de détection des attaques (% du trajet restant par palier)'),
  ('attack_detection_score_thresholds', '[0, 1, 3, 5, 7]', 'Seuils de score pour les paliers de détection')
ON CONFLICT ("key") DO NOTHING;
