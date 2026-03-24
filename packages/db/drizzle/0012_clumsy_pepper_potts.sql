ALTER TABLE "building_definitions" ADD COLUMN "role" varchar(64);--> statement-breakpoint
ALTER TABLE "planet_types" ADD COLUMN "role" varchar(64);--> statement-breakpoint
ALTER TABLE "ship_definitions" ADD COLUMN "role" varchar(64);--> statement-breakpoint
ALTER TABLE "building_definitions" ADD CONSTRAINT "building_definitions_role_unique" UNIQUE("role");--> statement-breakpoint
ALTER TABLE "planet_types" ADD CONSTRAINT "planet_types_role_unique" UNIQUE("role");--> statement-breakpoint
ALTER TABLE "ship_definitions" ADD CONSTRAINT "ship_definitions_role_unique" UNIQUE("role");