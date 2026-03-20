CREATE TABLE "mission_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fleet_event_id" uuid,
	"pve_mission_id" uuid,
	"message_id" uuid,
	"mission_type" "fleet_mission" NOT NULL,
	"title" varchar(255) NOT NULL,
	"coordinates" jsonb NOT NULL,
	"origin_coordinates" jsonb,
	"fleet" jsonb NOT NULL,
	"departure_time" timestamp with time zone NOT NULL,
	"completion_time" timestamp with time zone NOT NULL,
	"result" jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mission_reports" ADD CONSTRAINT "mission_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_reports" ADD CONSTRAINT "mission_reports_fleet_event_id_fleet_events_id_fk" FOREIGN KEY ("fleet_event_id") REFERENCES "public"."fleet_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_reports" ADD CONSTRAINT "mission_reports_pve_mission_id_pve_missions_id_fk" FOREIGN KEY ("pve_mission_id") REFERENCES "public"."pve_missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_reports" ADD CONSTRAINT "mission_reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mission_reports_user_created_idx" ON "mission_reports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mission_reports_message_idx" ON "mission_reports" USING btree ("message_id");