-- Enforce NOT NULL after backfill via scripts/migrate-alliance-blason.ts.
ALTER TABLE "alliances" ALTER COLUMN "blason_shape" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_icon" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_color1" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_color2" SET NOT NULL;
