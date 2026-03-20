DROP INDEX "deposits_belt_remaining_idx";--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "minerai_total" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "minerai_remaining" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "silicium_total" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "silicium_remaining" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "hydrogene_total" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "asteroid_deposits" ADD COLUMN "hydrogene_remaining" numeric(20, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE INDEX "deposits_belt_idx" ON "asteroid_deposits" USING btree ("belt_id");--> statement-breakpoint
ALTER TABLE "asteroid_deposits" DROP COLUMN "resource_type";--> statement-breakpoint
ALTER TABLE "asteroid_deposits" DROP COLUMN "total_quantity";--> statement-breakpoint
ALTER TABLE "asteroid_deposits" DROP COLUMN "remaining_quantity";--> statement-breakpoint
DELETE FROM universe_config WHERE key IN (
  'slag_rate.pos8.minerai', 'slag_rate.pos8.silicium', 'slag_rate.pos8.hydrogene',
  'slag_rate.pos16.minerai', 'slag_rate.pos16.silicium', 'slag_rate.pos16.hydrogene'
);--> statement-breakpoint
INSERT INTO universe_config (key, value) VALUES ('slag_rate.pos8', 0.30) ON CONFLICT (key) DO NOTHING;--> statement-breakpoint
INSERT INTO universe_config (key, value) VALUES ('slag_rate.pos16', 0.15) ON CONFLICT (key) DO NOTHING;
