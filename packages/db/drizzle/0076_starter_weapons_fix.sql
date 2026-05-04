-- V7.1 fix : la migration 0075 utilisait jsonb_set sans `create_missing=true`,
-- donc pour les flagships dont le hull n'avait jamais de loadout (module_loadout
-- = {} sans la clé du hull), le UPDATE ne créait pas la clé et les starters
-- n'étaient pas auto-équipés. Cette migration répare proprement.

DO $$
DECLARE
  flagship_row RECORD;
  hull_id_val TEXT;
  current_slot JSONB;
  starter_common TEXT;
  starter_rare TEXT;
  starter_epic TEXT;
  new_slot JSONB;
BEGIN
  FOR flagship_row IN
    SELECT id, hull_id, module_loadout FROM flagships
  LOOP
    hull_id_val := flagship_row.hull_id;
    IF hull_id_val IS NULL THEN
      CONTINUE;
    END IF;

    starter_common := hull_id_val || '-w-starter-common';
    starter_rare   := hull_id_val || '-w-starter-rare';
    starter_epic   := hull_id_val || '-w-starter-epic';

    IF NOT EXISTS (SELECT 1 FROM module_definitions WHERE id = starter_common) THEN
      CONTINUE;
    END IF;

    current_slot := COALESCE(flagship_row.module_loadout->hull_id_val, '{}'::jsonb);

    new_slot := current_slot;
    IF (new_slot->>'weaponCommon') IS NULL THEN
      new_slot := jsonb_set(new_slot, '{weaponCommon}', to_jsonb(starter_common), true);
    END IF;
    IF (new_slot->>'weaponRare') IS NULL THEN
      new_slot := jsonb_set(new_slot, '{weaponRare}', to_jsonb(starter_rare), true);
    END IF;
    IF (new_slot->>'weaponEpic') IS NULL THEN
      new_slot := jsonb_set(new_slot, '{weaponEpic}', to_jsonb(starter_epic), true);
    END IF;

    IF new_slot IS DISTINCT FROM current_slot THEN
      -- create_missing=true (4e arg) garantit que la clé du hull est créée
      -- même si le module_loadout n'avait pas encore d'entrée pour ce hull.
      UPDATE flagships
      SET module_loadout = jsonb_set(
        COALESCE(module_loadout, '{}'::jsonb),
        ARRAY[hull_id_val],
        new_slot,
        true
      )
      WHERE id = flagship_row.id;
    END IF;
  END LOOP;
END $$;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('starter_weapons_fix', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
