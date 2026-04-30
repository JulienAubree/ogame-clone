-- Anomalie Gravitationnelle V1 (rogue-lite asynchrone)

CREATE TABLE IF NOT EXISTS "anomalies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "origin_planet_id" uuid NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "current_depth" smallint NOT NULL DEFAULT 0,
  "fleet" jsonb NOT NULL,
  "loot_minerai" numeric(20,2) NOT NULL DEFAULT '0',
  "loot_silicium" numeric(20,2) NOT NULL DEFAULT '0',
  "loot_hydrogene" numeric(20,2) NOT NULL DEFAULT '0',
  "loot_ships" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "exilium_paid" integer NOT NULL,
  "next_node_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);

-- Partial unique index : un seul run actif par user (le flagship étant unique).
CREATE UNIQUE INDEX IF NOT EXISTS "anomalies_one_active_per_user"
  ON "anomalies" (user_id) WHERE status = 'active';

-- Index pour l'historique
CREATE INDEX IF NOT EXISTS "anomalies_user_completed_idx"
  ON "anomalies" (user_id, completed_at DESC) WHERE status IN ('completed', 'wiped');
