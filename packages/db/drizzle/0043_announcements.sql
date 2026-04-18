-- Announcements system: add announcements table for session banners,
-- optionally linked to a changelog entry.

CREATE TYPE "public"."announcement_variant" AS ENUM('info', 'warning', 'success');--> statement-breakpoint

CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" varchar(280) NOT NULL,
	"variant" "announcement_variant" DEFAULT 'info' NOT NULL,
	"changelog_id" uuid,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_changelog_id_changelogs_id_fk" FOREIGN KEY ("changelog_id") REFERENCES "public"."changelogs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
