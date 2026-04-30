-- Singleton table holding admin-managed content for the Anomaly mode.
-- Mirrors the pattern used by `homepage_content`: a single row, a JSONB
-- blob whose shape is enforced at the API boundary by Zod. Adding/removing
-- sections (e.g. event pool in V3) doesn't require a new migration.
CREATE TABLE IF NOT EXISTS anomaly_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
