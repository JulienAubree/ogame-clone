-- V7.1 fix #2 : la migration 0076 supposait que `id = hull_id || '-w-starter-' || rarity`
-- mais les modules industrial sont préfixés `indus-` et scientific `sci-` (préfixes
-- abrégés). Donc pour ces 2 hulls le LOOKUP échouait et la migration skippait.
-- Cette migration applique le mapping hull → préfixe correct.

DO $$
DECLARE
  flagship_row RECORD;
  hull_id_val TEXT;
  prefix TEXT;
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

    -- Mapping hull_id → id prefix utilisé par les modules seedés (cf 0075)
    prefix := CASE hull_id_val
      WHEN 'industrial' THEN 'indus'
      WHEN 'scientific' THEN 'sci'
      ELSE hull_id_val
    END;

    starter_common := prefix || '-w-starter-common';
    starter_rare   := prefix || '-w-starter-rare';
    starter_epic   := prefix || '-w-starter-epic';

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

-- Pareil pour le grant inventory (au cas où la 0075 aurait skippé certaines lignes
-- à cause d'un autre bug — idempotent via ON CONFLICT)
INSERT INTO flagship_module_inventory (flagship_id, module_id, count)
SELECT f.id, m.id, 1
FROM flagships f
JOIN module_definitions m
  ON m.hull_id = f.hull_id
 AND m.kind = 'weapon'
 AND m.id LIKE '%-w-starter-%'
ON CONFLICT (flagship_id, module_id) DO NOTHING;

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('starter_weapons_naming_fix', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
