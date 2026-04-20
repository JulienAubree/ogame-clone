-- Switch colonization rate bonuses from multiplicative to additive
-- percentage points per hour, and backfill frozen difficulty_factor on
-- any in-progress colonization so the rebalanced values apply retroactively.
--
-- Semantics: bonus values are now added directly to the effective %/h.
--   - garrison_bonus = 0.05  →  +5%/h while garrison FP >= threshold
--   - convoy_bonus   = 0.05  →  +5%/h for 2h after any delivery
--   - bonus_cap      = 0.10  →  cumulative cap is +10%/h

UPDATE "universe_config" SET "value" = '0.05'::jsonb WHERE "key" = 'colonization_rate_garrison_bonus';
UPDATE "universe_config" SET "value" = '0.05'::jsonb WHERE "key" = 'colonization_rate_convoy_bonus';
UPDATE "universe_config" SET "value" = '0.10'::jsonb WHERE "key" = 'colonization_rate_bonus_cap';

-- Backfill difficulty_factor for active processes using the new formula
-- (typeFactor × distanceFactor) so existing colonies benefit from the
-- rebalance instead of staying on the old (punitive) values.
UPDATE "colonization_processes" cp
SET "difficulty_factor" = (
  CASE COALESCE(p."planet_class_id", 'temperate')
    WHEN 'temperate' THEN 1.0
    WHEN 'arid'      THEN 0.95
    WHEN 'glacial'   THEN 0.95
    WHEN 'volcanic'  THEN 0.90
    WHEN 'gaseous'   THEN 0.90
    ELSE 0.9
  END
) * GREATEST(
  0.90,
  1 - 0.01 * ABS(p."system" - COALESCE(hw."system", p."system"))
)
FROM "planets" p
LEFT JOIN "planets" hw
  ON hw."user_id" = cp."user_id" AND hw."planet_class_id" = 'homeworld'
WHERE cp."planet_id" = p."id" AND cp."status" = 'active';
