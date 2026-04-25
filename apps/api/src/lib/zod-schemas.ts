import { z } from 'zod';

/**
 * Schémas Zod réutilisables pour réduire la duplication dans les routers tRPC.
 * Les patterns les plus fréquents sont déclarés ici une seule fois.
 *
 * Chaque schéma reste un `z.ZodSchema` — on peut chaîner `.optional()`,
 * `.nullable()`, `.default()`, etc. en cas de besoin.
 */

// ── Strings ──────────────────────────────────────────────────────────

/** ID non-vide (clé primaire, identifiant entité) */
export const idSchema = z.string().min(1);

/** Chaîne non vide (label, titre, description requise) */
export const nonEmptyString = z.string().min(1);

/** Chaîne nullable et optionnelle (champ texte qui peut être effacé) */
export const optionalNullableString = z.string().nullable().optional();

// ── Numbers ──────────────────────────────────────────────────────────

/** Entier strictement positif (quantité, niveau requis, etc.) */
export const positiveInt = z.number().int().positive();

/** Entier ≥ 0 (coûts, durées, etc.) */
export const nonNegativeInt = z.number().int().min(0);

/** Entier optionnel (champ admin facultatif) */
export const optionalInt = z.number().int().optional();

/** Entier ≥ 0 et optionnel (coût optionnel, niveau optionnel) */
export const optionalNonNegativeInt = z.number().int().min(0).optional();

/** Entier nullable et optionnel (max par planète, etc.) */
export const optionalNullableInt = z.number().int().nullable().optional();

// ── Domain-specific (jeu) ────────────────────────────────────────────

/** Coût en ressources (minerai/silicium/hydrogène) — tous optionnels */
export const optionalResourceCostSchema = z.object({
  costMinerai: optionalInt,
  costSilicium: optionalInt,
  costHydrogene: optionalInt,
});

/** Stats de combat de base (weapons/shield/hull/armor/shotCount) — tous optionnels */
export const optionalCombatStatsSchema = z.object({
  weapons: optionalInt,
  shield: optionalInt,
  hull: optionalInt,
  baseArmor: optionalInt,
  shotCount: optionalInt,
});

/** Profil d'arme (batterie multiple) */
export const weaponProfileSchema = z.object({
  damage: z.number(),
  shots: nonNegativeInt,
  targetCategory: nonEmptyString,
  rafale: z.object({ category: nonEmptyString, count: nonNegativeInt }).optional(),
  hasChainKill: z.boolean().optional(),
});

/** Pré-requis (bâtiment ou recherche avec niveau) */
export const buildingPrereqSchema = z.object({
  buildingId: idSchema,
  level: positiveInt,
});

export const researchPrereqSchema = z.object({
  researchId: idSchema,
  level: positiveInt,
});

/** Pré-requis "mixte" pour ships/defenses (building OU research) */
export const mixedPrereqSchema = z.object({
  requiredBuildingId: z.string().optional(),
  requiredResearchId: z.string().optional(),
  requiredLevel: positiveInt,
});
