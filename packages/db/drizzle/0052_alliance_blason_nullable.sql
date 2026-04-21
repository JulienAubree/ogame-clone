-- Alliance blason + motto — add as nullable for now. Backfill via scripts/migrate-alliance-blason.ts, then NOT NULL in 0053.
ALTER TABLE "alliances" ADD COLUMN "blason_shape" varchar(32);
ALTER TABLE "alliances" ADD COLUMN "blason_icon" varchar(32);
ALTER TABLE "alliances" ADD COLUMN "blason_color1" varchar(7);
ALTER TABLE "alliances" ADD COLUMN "blason_color2" varchar(7);
ALTER TABLE "alliances" ADD COLUMN "motto" varchar(100);
