import type { CombatConfig, ShipCategory } from './combat.js';

export const COMBAT_CATEGORIES: ShipCategory[] = [
  { id: 'light', name: 'Léger', targetable: true, targetOrder: 1 },
  { id: 'medium', name: 'Moyen', targetable: true, targetOrder: 2 },
  { id: 'heavy', name: 'Lourd', targetable: true, targetOrder: 3 },
  { id: 'shield', name: 'Bouclier', targetable: true, targetOrder: 4 },
  { id: 'defense', name: 'Défense', targetable: true, targetOrder: 5 },
  // Capital ship = vaisseau amiral. Non-targetable mais ciblé AVANT le support :
  // les ennemis cherchent à abattre le capitaine avant de viser cargos/sondes
  // une fois l'escorte de combat tombée. Cohérent avec une formation où les
  // supports sont à l'arrière de la ligne.
  { id: 'capital', name: 'Vaisseau amiral', targetable: false, targetOrder: 6 },
  // V9.2 Boss-as-unit : le boss est non-targetable tant que des escortes vivent.
  // targetOrder=8 pour qu'il soit ciblé APRES support (=7) en dernier ressort,
  // mais en pratique le combat se résout avant car les escortes meurent d'abord.
  // Le boss fait office de "dernier rempart" — quand le boss est solo (pas
  // d'escorte), selectTarget le pickup via le fallback non-targetable comme
  // pour capital aujourd'hui.
  { id: 'support', name: 'Support', targetable: false, targetOrder: 7 },
  { id: 'boss', name: 'Boss', targetable: false, targetOrder: 8 },
];

export function buildCombatConfig(
  universe: Record<string, unknown>,
  overrides?: Partial<CombatConfig>,
): CombatConfig {
  return {
    maxRounds: Number(universe['combat_max_rounds']) || 4,
    debrisRatio: Number(universe['combat_debris_ratio']) || 0.3,
    defenseRepairRate: Number(universe['combat_defense_repair_rate']) || 0.7,
    pillageRatio: Number(universe['combat_pillage_ratio']) || 0.33,
    minDamagePerHit: Number(universe['combat_min_damage_per_hit']) || 1,
    researchBonusPerLevel: Number(universe['combat_research_bonus_per_level']) || 0.1,
    categories: COMBAT_CATEGORIES,
    ...overrides,
  };
}
