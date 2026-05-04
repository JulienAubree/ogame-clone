import { z } from 'zod';
import type { StatKey, TriggerKey, AbilityKey } from '@exilium/game-engine';

const STAT_KEYS = ['damage', 'hull', 'shield', 'armor', 'cargo', 'speed', 'regen', 'epic_charges_max'] as const satisfies readonly StatKey[];
const TRIGGER_KEYS = ['first_round', 'low_hull', 'enemy_fp_above'] as const satisfies readonly TriggerKey[];
const ABILITY_KEYS = ['repair', 'shield_burst', 'overcharge', 'scan', 'skip', 'damage_burst'] as const satisfies readonly AbilityKey[];

const HULL_IDS = ['combat', 'scientific', 'industrial'] as const;
const RARITIES = ['common', 'rare', 'epic'] as const;
/** V7-WeaponProfiles : kind du module. 'passive' = comportement V1
 *  (stat / conditional / active), 'weapon' = apporte un weaponProfile au combat. */
const KINDS = ['passive', 'weapon'] as const;

const TARGET_CATEGORY_KEYS = ['light', 'medium', 'heavy', 'shield', 'defense', 'capital', 'support'] as const;

/** V7-WeaponProfiles : weaponProfile shape — mirrors UnitWeaponProfile from
 *  the engine but kept inline so the API doesn't depend on engine private
 *  shapes for input validation.
 *
 *  V8.1 : `damage` est désormais OPTIONNEL — un module peut spécifier soit
 *  `damage` (valeur absolue, ancien comportement V7) soit `damageMultiplier`
 *  (% du damage de coque, comportement V8.1+). Migration 0078 a remplacé tous
 *  les modules existants par damageMultiplier ; sans cet assouplissement le
 *  safeParse échouait et les modules étaient invisibles côté front.
 *
 *  Le `.refine()` garantit qu'au moins un des deux est présent. */
const weaponProfileSchema = z.object({
  damage: z.number().min(0).optional(),
  damageMultiplier: z.number().min(0).optional(),
  shots: z.number().int().min(0),
  targetCategory: z.enum(TARGET_CATEGORY_KEYS).optional(),
  rafale: z.object({
    category: z.enum(TARGET_CATEGORY_KEYS).optional(),
    count: z.number().int().min(0),
  }).optional(),
  hasChainKill: z.boolean().optional(),
}).refine(
  (p) => p.damage !== undefined || p.damageMultiplier !== undefined,
  { message: 'profile must specify damage or damageMultiplier' },
);

export const moduleEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stat'),
    stat: z.enum(STAT_KEYS),
    value: z.number(),
  }),
  z.object({
    type: z.literal('conditional'),
    trigger: z.enum(TRIGGER_KEYS),
    threshold: z.number().optional(),
    effect: z.object({
      stat: z.enum(STAT_KEYS),
      value: z.number(),
    }),
  }),
  z.object({
    type: z.literal('active'),
    ability: z.enum(ABILITY_KEYS),
    magnitude: z.number(),
  }),
  // V7-WeaponProfiles : effect.type === 'weapon' → le module apporte un
  // weaponProfile au flagship pendant le combat (slots Arsenal).
  z.object({
    type: z.literal('weapon'),
    profile: weaponProfileSchema,
  }),
]);

export const moduleDefinitionSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
  hullId: z.enum(HULL_IDS),
  rarity: z.enum(RARITIES),
  /** V7-WeaponProfiles : default 'passive' pour back-compat avec les modules
   *  existants. Les seeds 0074_weapon_modules.sql posent kind='weapon'. */
  kind: z.enum(KINDS).optional().default('passive'),
  name: z.string().min(1).max(80),
  description: z.string().min(1),
  image: z.string().max(500).default(''),
  enabled: z.boolean().default(true),
  effect: moduleEffectSchema,
});

export type ModuleDefinitionInput = z.input<typeof moduleDefinitionSchema>;
export type ModuleDefinition = z.infer<typeof moduleDefinitionSchema>;

export const HULL_LIST = HULL_IDS;
export const RARITY_LIST = RARITIES;

// Loadout shape persisted on flagships.module_loadout.
//
// `rare` and `common` are FIXED-LENGTH arrays where empty slots are stored as
// explicit `null` placeholders. This avoids a sparse-array trap : assigning
// `arr[2] = "id"` on an empty array produces `[<empty>, <empty>, "id"]` which
// `JSON.stringify` serialises to `[null, null, "id"]` — the original Zod
// schema (`z.array(z.string())`) then rejected the parsed value, silently
// wiping the loadout on read. We now enforce explicit nulls on write AND
// pad on parse for legacy rows that were stored without padding.
export const hullSlotSchema = z.object({
  epic:   z.string().nullable(),
  rare:   z.array(z.string().nullable()).length(3),
  common: z.array(z.string().nullable()).length(5),
  /** V7-WeaponProfiles : 1 slot weapon par rareté. Optional/nullable pour
   *  back-compat avec les anciens loadouts (sans clé "weapon*" du tout). */
  weaponEpic:   z.string().nullable().optional(),
  weaponRare:   z.string().nullable().optional(),
  weaponCommon: z.string().nullable().optional(),
});

export const moduleLoadoutSchema = z.object({
  combat:     hullSlotSchema.optional(),
  scientific: hullSlotSchema.optional(),
  industrial: hullSlotSchema.optional(),
});

export type ModuleLoadoutDb = z.infer<typeof moduleLoadoutSchema>;
