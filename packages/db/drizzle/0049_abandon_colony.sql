-- Abandon colony feature.
--
-- 1. New fleet mission value used only by PlanetAbandonService.
-- 2. origin_planet_id must survive planet deletion, otherwise the return
--    fleet we create when abandoning a colony gets cascade-deleted along
--    with the planet and the ships/resources aboard vanish.

ALTER TYPE "fleet_mission" ADD VALUE IF NOT EXISTS 'abandon_return';

ALTER TABLE "fleet_events"
  DROP CONSTRAINT IF EXISTS "fleet_events_origin_planet_id_planets_id_fk";

ALTER TABLE "fleet_events"
  ALTER COLUMN "origin_planet_id" DROP NOT NULL;

ALTER TABLE "fleet_events"
  ADD CONSTRAINT "fleet_events_origin_planet_id_planets_id_fk"
  FOREIGN KEY ("origin_planet_id") REFERENCES "planets"("id")
  ON DELETE SET NULL;
