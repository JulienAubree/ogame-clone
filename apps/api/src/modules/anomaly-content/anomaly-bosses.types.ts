import { z } from 'zod';

/** Skills affecting combat. The engine consume each as a hook. */
export const BOSS_SKILLS = [
  'armor_pierce',      // ignore le blindage du flagship
  'regen',             // boss regen +X% hull / round
  'shield_aura',       // boss commence avec shield ×N
  'damage_burst',      // 1 round par combat à damage ×3
  'summon_drones',     // round 1 : +N interceptors enemy
  'disable_battery',   // round 1 : désactive 1 batterie flagship
  'armor_corrosion',   // -X% armor flagship par round (cumulatif)
  'last_stand',        // revient à 1 HP la 1re fois qu'il devrait mourir
  'evasion',           // N% chance de dodge sur chaque hit
  'rafale_swarm',      // bonus rafale ×N global pendant le combat
] as const;
export type BossSkill = (typeof BOSS_SKILLS)[number];

/** Buffs accordés en récompense de victoire — appliqués au flagship pour
 *  le reste de la run (jusqu'au runComplete ou wipe). Stockés jsonb. */
export const BOSS_BUFFS = [
  'damage_boost',      // +N% damage flagship
  'hull_repair',       // +N% hull instantané + 1 charge réparation
  'shield_amp',        // +N% shield
  'armor_amp',         // +N% armor
  'extra_charge',      // +1 charge épique max
  'module_unlock',     // débloque temporairement +1 batterie weapon
] as const;
export type BossBuff = (typeof BOSS_BUFFS)[number];

/** Depth thresholds where a boss spawns instead of a regular combat. */
export const BOSS_DEPTHS = [1, 5, 10, 15, 20] as const;
export type BossDepth = (typeof BOSS_DEPTHS)[number];

/** Tier mapping based on the depth where the boss spawns. */
export function tierForBossDepth(depth: number): 'early' | 'mid' | 'deep' {
  if (depth <= 5) return 'early';
  if (depth <= 15) return 'mid';
  return 'deep';
}

const skillEntrySchema = z.object({
  type: z.enum(BOSS_SKILLS),
  /** Magnitude du skill (% pour pierce/regen/aura/burst/etc., count pour summon). */
  magnitude: z.number().min(0).default(0.30),
});

const buffEntrySchema = z.object({
  type: z.enum(BOSS_BUFFS),
  magnitude: z.number().min(0).default(0.20),
});

/**
 * V9.2 — Profile d'arme du boss-as-unit. Subset des champs supportés par
 * `WeaponProfile` côté combat. Si `damage` est omis et `damageMultiplier`
 * fourni, le combat consomme `bossStats.weapons × damageMultiplier`. Les
 * boss anomaly peuvent cibler la category 'boss' aussi (utile pour des
 * skills de boss qui se buffent eux-mêmes — non implémenté pour l'instant
 * mais on garde l'option ouverte).
 */
const bossWeaponProfileSchema = z.object({
  damage: z.number().min(0).optional(),
  damageMultiplier: z.number().min(0).optional(),
  shots: z.number().int().min(1),
  targetCategory: z.enum(['light', 'medium', 'heavy', 'shield', 'defense', 'capital', 'support', 'boss']).optional(),
  rafale: z.object({
    category: z.enum(['light', 'medium', 'heavy', 'shield', 'defense', 'capital', 'support', 'boss']).optional(),
    count: z.number().int().min(0),
  }).optional(),
  hasChainKill: z.boolean().optional(),
});

/**
 * V9.2 Boss-as-unit — stats propres du vaisseau boss qui apparaît au combat.
 * Quand fourni, le boss est injecté comme une vraie unité (1 unité de category
 * 'boss', non-targetable tant que des escortes vivent). Quand absent, fallback
 * sur le comportement V9 où le boss n'était qu'un fpMultiplier sur la flotte
 * ennemie générique (boss-as-FP-multiplier, pas de visuel boss en combat).
 */
const bossStatsSchema = z.object({
  hull: z.number().int().min(1),
  shield: z.number().int().min(0).default(0),
  armor: z.number().int().min(0).default(0),
  weapons: z.number().int().min(0),
  shotCount: z.number().int().min(1).default(1),
  weaponProfiles: z.array(bossWeaponProfileSchema).max(4).optional(),
}).optional();

export const bossEntrySchema = z.object({
  id: z.string().min(1).max(40),
  enabled: z.boolean().default(true),
  /** Tier détermine la pool éligible : early ≤ depth 5, mid 6-15, deep 16-20. */
  tier: z.enum(['early', 'mid', 'deep']),
  image: z.string().max(500).default(''),
  /** Nom et titre fr-FR. */
  name: z.string().min(1).max(80),
  title: z.string().max(120).default(''),
  description: z.string().min(1).max(1000),
  /** FP boss = base × tier_fp_growth^(tier-1). Multiplicateur additionnel
   *  par boss (default 1.5 = boss = 1.5× un combat normal de la même depth). */
  fpMultiplier: z.number().min(1).max(5).default(1.5),
  /** 1-2 skills par boss. */
  skills: z.array(skillEntrySchema).min(1).max(2),
  /** Récompense au choix entre 2-3 buffs. Le joueur choisit dans le modal. */
  buffChoices: z.array(buffEntrySchema).min(1).max(3),
  /** V9.2 — Stats propres du vaisseau boss. Si présent, boss-as-unit est
   *  activé (cf. anomaly.combat.ts). Si absent, comportement V9 (boss-as-
   *  FP-multiplier sur horde générique). */
  bossStats: bossStatsSchema,
  /**
   * V9.2 — Part du FP target allouée aux escortes (le reste va à l'unité
   * boss). Default 0.4 = 40% du FP target part aux escortes, 60% au boss.
   * Si le boss n'a pas de `bossStats`, ce champ est ignoré (legacy V9 :
   * 100% du FP target va à la horde générique).
   */
  escortFpRatio: z.number().min(0).max(1).default(0.4),
});

export type BossEntry = z.infer<typeof bossEntrySchema>;
export type BossEntryInput = z.input<typeof bossEntrySchema>;
export type BossStats = NonNullable<z.infer<typeof bossStatsSchema>>;
export type BossWeaponProfile = z.infer<typeof bossWeaponProfileSchema>;

/** Active buff entry stored on the anomaly row (jsonb array). */
export interface ActiveBossBuff {
  type: BossBuff;
  magnitude: number;
  sourceBossId: string;
}

/**
 * Convertit les skills d'un boss seedé en BossSkillRuntime[] (format attendu
 * par simulateCombat). Tous les skills d'un boss anomaly sont 'defender'.
 *
 * V9.2 — Si le boss possède un `bossStats`, on attache `bossShipType` au
 * runtime pour que les hooks (shield_aura, regen, last_stand) ciblent
 * uniquement l'unité boss (et pas les escortes qui partagent la même side).
 */
export function bossSkillsToRuntime(boss: BossEntry): Array<{
  type: BossSkill;
  magnitude: number;
  side: 'defender';
  summonShipId?: string;
  bossShipType?: string;
}> {
  const bossShipType = boss.bossStats ? bossUnitId(boss.id) : undefined;
  return boss.skills.map(s => ({
    type: s.type,
    magnitude: s.magnitude,
    side: 'defender' as const,
    ...(s.type === 'summon_drones' ? { summonShipId: 'interceptor' } : {}),
    ...(bossShipType ? { bossShipType } : {}),
  }));
}

/**
 * V9.2 — Identifiant de l'unité boss injectée dans la flotte enemy. On
 * préfixe `boss:` pour qu'il ne collide jamais avec un shipId déclaré
 * dans game-config (interceptor / frigate / cruiser / etc.).
 */
export function bossUnitId(bossId: string): string {
  return `boss:${bossId}`;
}
