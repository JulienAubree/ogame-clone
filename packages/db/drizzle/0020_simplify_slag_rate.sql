-- Replace position-based slag rates with a single unified rate
DELETE FROM "universe_config" WHERE "key" IN ('slag_rate.pos8', 'slag_rate.pos16');
INSERT INTO "universe_config" ("key", "value") VALUES ('slag_rate', '0.5')
  ON CONFLICT ("key") DO UPDATE SET "value" = '0.5';
