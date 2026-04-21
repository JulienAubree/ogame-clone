-- Backfill any still-null blason fields deterministically from the tag, then enforce NOT NULL.
-- This runs inline so the migrator does not need a separate JS backfill step between 0052 and 0053.
-- Values chosen here are stable per tag but do not need to match the JS generateDefaultBlason exactly:
-- new alliances always pick their blason via the JS helper at creation time; this backfill only
-- covers legacy rows created before the blason feature shipped.

UPDATE "alliances"
SET
  "blason_shape" = COALESCE(
    "blason_shape",
    (ARRAY[
      'shield-classic','shield-pointed','shield-heater',
      'circle','hexagon','diamond','rounded-square','chevron',
      'star-4','star-6',
      'split-horizontal','split-diagonal'
    ])[((hashtext("tag") % 12) + 12) % 12 + 1]
  ),
  "blason_icon" = COALESCE(
    "blason_icon",
    (ARRAY[
      'crossed-swords','skull','planet','star','moon',
      'rocket','satellite','galaxy','crosshair','crown',
      'lightning','eye','atom','gear','crystal','trident','book'
    ])[((hashtext("tag" || 'i') % 17) + 17) % 17 + 1]
  ),
  "blason_color1" = COALESCE(
    "blason_color1",
    (ARRAY[
      '#8b0000','#1a3a6c','#3d1a5b','#1f4d2e',
      '#4a2c17','#5c4a1a','#2d4a7a','#5c1a3b',
      '#d4af37','#00e0ff','#e8e4d4','#8aa0a8',
      '#c0392b','#27ae60','#8e44ad','#f39c12'
    ])[((hashtext("tag" || 'c1') % 16) + 16) % 16 + 1]
  ),
  "blason_color2" = COALESCE(
    "blason_color2",
    (ARRAY[
      '#8b0000','#1a3a6c','#3d1a5b','#1f4d2e',
      '#4a2c17','#5c4a1a','#2d4a7a','#5c1a3b',
      '#d4af37','#00e0ff','#e8e4d4','#8aa0a8',
      '#c0392b','#27ae60','#8e44ad','#f39c12'
    ])[((hashtext("tag" || 'c2') % 16) + 16) % 16 + 1]
  )
WHERE "blason_shape" IS NULL
   OR "blason_icon" IS NULL
   OR "blason_color1" IS NULL
   OR "blason_color2" IS NULL;

ALTER TABLE "alliances" ALTER COLUMN "blason_shape" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_icon" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_color1" SET NOT NULL;
ALTER TABLE "alliances" ALTER COLUMN "blason_color2" SET NOT NULL;
