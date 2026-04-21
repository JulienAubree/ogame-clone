-- Progressive pirate raid formula for colonization.
-- Raids now scale exponentially with IPC level and grow wave-by-wave
-- via a per-process `raid_count`. Garrison bonus switches from a
-- multiplicative 30%/FP factor (which exploded into ~26000 FP raids)
-- to a gentle additive bonus capped at +50%.

ALTER TABLE "colonization_processes"
  ADD COLUMN "raid_count" integer NOT NULL DEFAULT 0;

-- Replace obsolete base FP key (superseded by base_start + base_cap)
DELETE FROM "universe_config" WHERE "key" = 'colonization_raid_base_fp';

-- Rebalance garrison contribution: old 0.3 meant each stationed FP added
-- +30% to raid FP (exponential explosion). New 0.001 + cap of +50% keeps
-- well-defended colonies only mildly more attractive to pirates.
UPDATE "universe_config" SET "value" = '0.001'::jsonb
  WHERE "key" = 'colonization_raid_stationed_fp_ratio';

-- New progressive raid parameters
INSERT INTO "universe_config" ("key", "value") VALUES
  ('colonization_raid_base_start_fp',       '10'::jsonb),
  ('colonization_raid_ipc_start_exponent',  '1.4'::jsonb),
  ('colonization_raid_base_cap_fp',         '35'::jsonb),
  ('colonization_raid_ipc_cap_exponent',    '1.8'::jsonb),
  ('colonization_raid_wave_growth',         '2.0'::jsonb),
  ('colonization_raid_stationed_max_bonus', '0.5'::jsonb)
ON CONFLICT ("key") DO NOTHING;
