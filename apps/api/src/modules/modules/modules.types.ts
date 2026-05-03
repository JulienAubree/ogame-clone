import { z } from 'zod';
import type { StatKey, TriggerKey, AbilityKey } from '@exilium/game-engine';

const STAT_KEYS = ['damage', 'hull', 'shield', 'armor', 'cargo', 'speed', 'regen', 'epic_charges_max'] as const satisfies readonly StatKey[];
const TRIGGER_KEYS = ['first_round', 'low_hull', 'enemy_fp_above', 'last_round'] as const satisfies readonly TriggerKey[];
const ABILITY_KEYS = ['repair', 'shield_burst', 'overcharge', 'scan', 'skip', 'damage_burst'] as const satisfies readonly AbilityKey[];

const HULL_IDS = ['combat', 'scientific', 'industrial'] as const;
const RARITIES = ['common', 'rare', 'epic'] as const;

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
]);

export const moduleDefinitionSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
  hullId: z.enum(HULL_IDS),
  rarity: z.enum(RARITIES),
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
export const hullSlotSchema = z.object({
  epic:   z.string().nullable(),
  rare:   z.array(z.string()).max(3),
  common: z.array(z.string()).max(5),
});

export const moduleLoadoutSchema = z.object({
  combat:     hullSlotSchema.optional(),
  scientific: hullSlotSchema.optional(),
  industrial: hullSlotSchema.optional(),
});

export type ModuleLoadoutDb = z.infer<typeof moduleLoadoutSchema>;
