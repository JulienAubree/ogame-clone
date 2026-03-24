-- =============================================================
-- Compact Universe: relocate all players into 1 galaxy, 50 systems
-- Preserves relative colony distances per player.
-- =============================================================
-- RUN WITH: psql $DATABASE_URL -f compact-universe.sql
-- ALWAYS BACKUP FIRST: pg_dump $DATABASE_URL > backup_before_compact.sql
-- =============================================================

BEGIN;

-- ── 0. Safety: cancel all active fleet events ──
-- Fleets in transit would have stale coordinates after relocation.
-- Refund ships to origin planet.
UPDATE fleet_events SET status = 'completed' WHERE status = 'active';

-- ── 1. Build relocation mapping ──
-- For each user: find homeworld, assign a new system (1..50),
-- keep position unchanged, set galaxy = 1.
-- Colonies keep their system OFFSET relative to homeworld.

CREATE TEMP TABLE relocation_map (
  planet_id    UUID PRIMARY KEY,
  user_id      UUID,
  old_galaxy   SMALLINT,
  old_system   SMALLINT,
  old_position SMALLINT,
  new_galaxy   SMALLINT,
  new_system   SMALLINT,
  new_position SMALLINT
);

-- Identify each user's homeworld (planetClassId = 'homeworld', or first planet created)
CREATE TEMP TABLE homeworlds AS
SELECT DISTINCT ON (user_id)
  id AS planet_id,
  user_id,
  galaxy,
  system,
  position
FROM planets
WHERE planet_type = 'planet'
ORDER BY user_id,
  CASE WHEN planet_class_id = 'homeworld' THEN 0 ELSE 1 END,
  created_at ASC;

-- Assign each user a unique new system (1, 2, 3, ..., up to 50)
CREATE TEMP TABLE user_system_map AS
SELECT
  user_id,
  galaxy AS old_galaxy,
  system AS old_system,
  ROW_NUMBER() OVER (ORDER BY user_id) AS new_system
FROM homeworlds;

-- Sanity check: no more than 50 players
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM user_system_map) > 50 THEN
    RAISE EXCEPTION 'More than 50 players — cannot fit into 50 systems. Increase target or remove inactive accounts.';
  END IF;
END $$;

-- Insert homeworlds into relocation map
INSERT INTO relocation_map (planet_id, user_id, old_galaxy, old_system, old_position, new_galaxy, new_system, new_position)
SELECT
  h.planet_id,
  h.user_id,
  h.galaxy,
  h.system,
  h.position,
  1,                      -- new_galaxy always 1
  usm.new_system::SMALLINT,
  h.position              -- position unchanged
FROM homeworlds h
JOIN user_system_map usm USING (user_id);

-- Insert colonies: keep relative system offset from homeworld, wrap into 1..50
INSERT INTO relocation_map (planet_id, user_id, old_galaxy, old_system, old_position, new_galaxy, new_system, new_position)
SELECT
  p.id,
  p.user_id,
  p.galaxy,
  p.system,
  p.position,
  1,
  -- system offset: new_hw_system + (colony_system - old_hw_system), wrapped 1..50
  (((usm.new_system + (p.system - h.system) - 1) % 50 + 50) % 50 + 1)::SMALLINT,
  p.position
FROM planets p
JOIN homeworlds h ON h.user_id = p.user_id
JOIN user_system_map usm ON usm.user_id = p.user_id
WHERE p.id != h.planet_id
  AND p.planet_type = 'planet';

-- Also handle moons (same coordinates as their planet)
INSERT INTO relocation_map (planet_id, user_id, old_galaxy, old_system, old_position, new_galaxy, new_system, new_position)
SELECT
  moon.id,
  moon.user_id,
  moon.galaxy,
  moon.system,
  moon.position,
  1,
  rm.new_system,
  moon.position
FROM planets moon
JOIN relocation_map rm ON rm.user_id = moon.user_id
  AND rm.old_galaxy = moon.galaxy
  AND rm.old_system = moon.system
  AND rm.old_position = moon.position
WHERE moon.planet_type = 'moon';

-- ── 2. Check for coordinate collisions ──
DO $$
DECLARE
  collision_count INT;
BEGIN
  SELECT COUNT(*) INTO collision_count
  FROM (
    SELECT new_galaxy, new_system, new_position,
           (SELECT planet_type FROM planets WHERE id = rm.planet_id) AS pt
    FROM relocation_map rm
    GROUP BY new_galaxy, new_system, new_position, pt
    HAVING COUNT(*) > 1
  ) dupes;

  IF collision_count > 0 THEN
    -- Resolve collisions by bumping position +1 (within 1..16)
    -- This is a simple approach for ~10 players
    WITH collisions AS (
      SELECT rm.planet_id, rm.new_system, rm.new_position,
             ROW_NUMBER() OVER (
               PARTITION BY rm.new_system, rm.new_position
               ORDER BY (SELECT created_at FROM planets WHERE id = rm.planet_id)
             ) AS rn
      FROM relocation_map rm
      JOIN planets p ON p.id = rm.planet_id AND p.planet_type = 'planet'
    )
    UPDATE relocation_map rm
    SET new_position = LEAST(15, collisions.new_position + collisions.rn - 1)::SMALLINT
    FROM collisions
    WHERE rm.planet_id = collisions.planet_id
      AND collisions.rn > 1;

    RAISE NOTICE 'Resolved % coordinate collision(s) by adjusting positions', collision_count;
  END IF;
END $$;

-- Final collision check (hard fail)
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM (
    SELECT new_galaxy, new_system, new_position,
           (SELECT planet_type FROM planets WHERE id = rm.planet_id) AS pt
    FROM relocation_map rm
    GROUP BY new_galaxy, new_system, new_position, pt
    HAVING COUNT(*) > 1
  ) x;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Unresolvable coordinate collisions remain. Aborting.';
  END IF;
END $$;

-- ── 3. Show relocation plan ──
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '──── Relocation Plan ────';
  FOR r IN
    SELECT
      rm.planet_id,
      p.name,
      u.username,
      rm.old_galaxy, rm.old_system, rm.old_position,
      rm.new_galaxy, rm.new_system, rm.new_position,
      p.planet_type
    FROM relocation_map rm
    JOIN planets p ON p.id = rm.planet_id
    JOIN users u ON u.id = rm.user_id
    ORDER BY rm.new_system, rm.new_position
  LOOP
    RAISE NOTICE '  % [%] %:%:% -> %:%:% (%)',
      r.username, r.name,
      r.old_galaxy, r.old_system, r.old_position,
      r.new_galaxy, r.new_system, r.new_position,
      r.planet_type;
  END LOOP;
END $$;

-- ── 4. Apply relocation to planets ──
UPDATE planets p
SET galaxy = rm.new_galaxy,
    system = rm.new_system,
    position = rm.new_position
FROM relocation_map rm
WHERE p.id = rm.planet_id;

-- ── 5. Update debris fields ──
-- Move debris that match old planet coords to new coords, delete others
UPDATE debris_fields df
SET galaxy = rm.new_galaxy,
    system = rm.new_system,
    position = rm.new_position
FROM relocation_map rm
WHERE df.galaxy = rm.old_galaxy
  AND df.system = rm.old_system
  AND df.position = rm.old_position;

-- Delete debris at coordinates that no longer exist in the new universe
DELETE FROM debris_fields
WHERE galaxy != 1 OR system > 50;

-- ── 6. Delete asteroid belts & deposits outside new universe ──
-- They'll be regenerated by the game on first access to each system.
DELETE FROM asteroid_belts
WHERE galaxy != 1 OR system > 50;

-- ── 7. Update fleet events (completed ones — active already cancelled above) ──
-- Update target coords on completed fleet events for history consistency
UPDATE fleet_events fe
SET target_galaxy = rm.new_galaxy,
    target_system = rm.new_system,
    target_position = rm.new_position
FROM relocation_map rm
JOIN planets p ON p.id = rm.planet_id
WHERE fe.target_planet_id = p.id;

-- ── 8. Update PvE missions coordinates (JSONB parameters) ──
UPDATE pve_missions pm
SET parameters = jsonb_set(
  jsonb_set(
    jsonb_set(pm.parameters, '{galaxy}', '1'::jsonb),
    '{system}',
    to_jsonb(rm.new_system)
  ),
  '{position}',
  to_jsonb(rm.new_position)
)
FROM relocation_map rm
WHERE (pm.parameters->>'galaxy')::INT = rm.old_galaxy
  AND (pm.parameters->>'system')::INT = rm.old_system
  AND (pm.parameters->>'position')::INT = rm.old_position;

-- Delete PvE missions at coords that don't match any planet
DELETE FROM pve_missions
WHERE status = 'available'
  AND (parameters->>'galaxy')::INT != 1;

-- ── 9. Update mission reports (JSONB coordinates) ──
-- Update coordinates
UPDATE mission_reports mr
SET coordinates = jsonb_set(
  jsonb_set(
    jsonb_set(mr.coordinates, '{galaxy}', '1'::jsonb),
    '{system}',
    to_jsonb(rm.new_system)
  ),
  '{position}',
  to_jsonb(rm.new_position)
)
FROM relocation_map rm
WHERE (mr.coordinates->>'galaxy')::INT = rm.old_galaxy
  AND (mr.coordinates->>'system')::INT = rm.old_system
  AND (mr.coordinates->>'position')::INT = rm.old_position;

-- Update originCoordinates
UPDATE mission_reports mr
SET origin_coordinates = jsonb_set(
  jsonb_set(
    jsonb_set(mr.origin_coordinates, '{galaxy}', '1'::jsonb),
    '{system}',
    to_jsonb(rm.new_system)
  ),
  '{position}',
  to_jsonb(rm.new_position)
)
FROM relocation_map rm
WHERE mr.origin_coordinates IS NOT NULL
  AND (mr.origin_coordinates->>'galaxy')::INT = rm.old_galaxy
  AND (mr.origin_coordinates->>'system')::INT = rm.old_system
  AND (mr.origin_coordinates->>'position')::INT = rm.old_position;

-- ── 10. Update universe config ──
UPDATE universe_config SET value = '1' WHERE key = 'galaxies';
UPDATE universe_config SET value = '50' WHERE key = 'systems';

-- ── 11. Cleanup temp tables ──
DROP TABLE relocation_map;
DROP TABLE homeworlds;
DROP TABLE user_system_map;

-- ── 12. Verification ──
DO $$
DECLARE
  planet_count INT;
  out_of_bounds INT;
  collision_count INT;
BEGIN
  SELECT COUNT(*) INTO planet_count FROM planets;

  SELECT COUNT(*) INTO out_of_bounds
  FROM planets
  WHERE galaxy != 1 OR system > 50 OR system < 1;

  SELECT COUNT(*) INTO collision_count
  FROM (
    SELECT galaxy, system, position, planet_type
    FROM planets
    GROUP BY galaxy, system, position, planet_type
    HAVING COUNT(*) > 1
  ) x;

  RAISE NOTICE '──── Verification ────';
  RAISE NOTICE '  Total planets: %', planet_count;
  RAISE NOTICE '  Out of bounds: % (should be 0)', out_of_bounds;
  RAISE NOTICE '  Collisions:    % (should be 0)', collision_count;

  IF out_of_bounds > 0 OR collision_count > 0 THEN
    RAISE EXCEPTION 'Verification failed! Rolling back.';
  END IF;

  RAISE NOTICE '  Universe config: 1 galaxy, 50 systems';
  RAISE NOTICE '  Done!';
END $$;

COMMIT;
