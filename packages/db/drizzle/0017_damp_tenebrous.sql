CREATE INDEX "alliance_members_alliance_idx" ON "alliance_members" USING btree ("alliance_id");--> statement-breakpoint
CREATE INDEX "build_queue_planet_type_status_idx" ON "build_queue" USING btree ("planet_id","type","status");--> statement-breakpoint
CREATE INDEX "planets_user_idx" ON "planets" USING btree ("user_id");