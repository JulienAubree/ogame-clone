-- Email verification flow.
--
-- email_verified_at is nullable; null means "not verified". Existing accounts
-- created before this migration are grandfathered in (backfilled to now) so we
-- don't break them with a retroactive banner.
ALTER TABLE "users"
  ADD COLUMN "email_verified_at" timestamp with time zone;

UPDATE "users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL;

-- Verification tokens. Same shape as password_reset_tokens: hashed, single-use,
-- short-lived.
CREATE TABLE "email_verification_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(255) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "email_verification_tokens_token_hash_idx" ON "email_verification_tokens" ("token_hash");
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" ("user_id");
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" ("expires_at");
