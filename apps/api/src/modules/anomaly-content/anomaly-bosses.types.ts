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
});

export type BossEntry = z.infer<typeof bossEntrySchema>;
export type BossEntryInput = z.input<typeof bossEntrySchema>;

/** Active buff entry stored on the anomaly row (jsonb array). */
export interface ActiveBossBuff {
  type: BossBuff;
  magnitude: number;
  sourceBossId: string;
}

/**
 * Convertit les skills d'un boss seedé en BossSkillRuntime[] (format attendu
 * par simulateCombat). Tous les skills d'un boss anomaly sont 'defender'.
 */
export function bossSkillsToRuntime(boss: BossEntry): Array<{
  type: BossSkill;
  magnitude: number;
  side: 'defender';
  summonShipId?: string;
}> {
  return boss.skills.map(s => ({
    type: s.type,
    magnitude: s.magnitude,
    side: 'defender' as const,
    ...(s.type === 'summon_drones' ? { summonShipId: 'interceptor' } : {}),
  }));
}
