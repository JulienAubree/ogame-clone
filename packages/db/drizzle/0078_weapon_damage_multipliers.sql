-- V8.1 — Weapon Damage Multipliers (2026-05-04)
-- Refactor : les weapon modules ne stockent plus un `damage` absolu mais un
-- `damageMultiplier` relatif au damage du tireur (le flagship dans 100% des
-- cas en V7/V8). Le combat consomme désormais `flagship.baseDamage ×
-- damageMultiplier × researchMult` au lieu d'un damage hardcoded en seed.
--
-- Pourquoi : avec un flagship niveau 5 + recherches + passives, le damage de
-- coque est de l'ordre de 300-400. Les modules common (~9 dmg/shot post-research)
-- représentaient ~3% du DPS, autant ne pas les avoir. Le passage en multiplier
-- les rend significatifs et scale-proof : peu importe le niveau du joueur, un
-- module common reste ~30% du tir principal, un epic ~120%.
--
-- Calibration :
--   common → 0.30 (utilitaire — supplément discret)
--   rare   → 0.70 (solide complément)
--   epic   → 1.20 (frappe plus fort que la coque)
--
-- shots, targetCategory, rafale, hasChainKill restent inchangés — c'est leur
-- rôle qui crée la diversité entre modules (pas la valeur damage absolue).
--
-- Idempotent : `#-` retire `{profile,damage}` SI présent, `jsonb_set` ajoute
-- `{profile,damageMultiplier}` avec create_missing=true. Re-runs no-op.

-- Common — ×0.30 du tir principal
UPDATE module_definitions
SET effect = jsonb_set(
  effect #- '{profile,damage}',
  '{profile,damageMultiplier}',
  '0.30'::jsonb,
  true
)
WHERE kind = 'weapon' AND rarity = 'common';

-- Rare — ×0.70 du tir principal
UPDATE module_definitions
SET effect = jsonb_set(
  effect #- '{profile,damage}',
  '{profile,damageMultiplier}',
  '0.70'::jsonb,
  true
)
WHERE kind = 'weapon' AND rarity = 'rare';

-- Epic — ×1.20 du tir principal (un poil plus que la coque)
UPDATE module_definitions
SET effect = jsonb_set(
  effect #- '{profile,damage}',
  '{profile,damageMultiplier}',
  '1.20'::jsonb,
  true
)
WHERE kind = 'weapon' AND rarity = 'epic';

-- Marker idempotence
INSERT INTO _migrations_state (key, value)
VALUES ('weapon_damage_multipliers', 'done')
ON CONFLICT (key) DO UPDATE SET value = 'done', set_at = now();
