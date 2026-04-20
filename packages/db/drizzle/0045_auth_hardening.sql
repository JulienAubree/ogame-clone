-- Auth hardening: account lockout + login audit log.

-- Lockout and last-login tracking on users
ALTER TABLE "users"
  ADD COLUMN "failed_login_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "locked_until" timestamp with time zone,
  ADD COLUMN "last_login_at" timestamp with time zone;

-- Audit table: one row per login attempt (success or failure).
-- user_id is nullable so we can record attempts for unknown emails.
CREATE TABLE "login_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "email" varchar(255) NOT NULL,
  "success" boolean NOT NULL,
  "reason" varchar(64),
  "ip_address" varchar(64),
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "login_events_user_id_idx" ON "login_events" ("user_id");
CREATE INDEX "login_events_email_idx" ON "login_events" ("email");
CREATE INDEX "login_events_created_at_idx" ON "login_events" ("created_at");
