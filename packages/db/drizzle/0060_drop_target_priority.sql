-- Dead column since the combat targeting priority was removed in the Phase 2a
-- refactor (commit 52c5810). Ships now target via their own weapon profile
-- categories — the player-chosen priority no longer exists.
ALTER TABLE "fleet_events" DROP COLUMN IF EXISTS "target_priority";
