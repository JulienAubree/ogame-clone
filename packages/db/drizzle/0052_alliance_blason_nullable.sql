-- Alliance blason + motto — add as nullable. 0053 backfills deterministically from tag and enforces NOT NULL.
ALTER TABLE "alliances" ADD COLUMN "blason_shape" varchar(32);
ALTER TABLE "alliances" ADD COLUMN "blason_icon" varchar(32);
ALTER TABLE "alliances" ADD COLUMN "blason_color1" varchar(7);
ALTER TABLE "alliances" ADD COLUMN "blason_color2" varchar(7);
ALTER TABLE "alliances" ADD COLUMN "motto" varchar(100);
