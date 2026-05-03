-- Singleton table for the public homepage content. Always one row, JSONB
-- shape enforced at the API boundary (Zod). Adding/removing sections is
-- shape-only, no further migration needed.
CREATE TABLE IF NOT EXISTS "homepage_content" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "content" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
