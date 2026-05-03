// ── Hull / Flagship ──

export const HULL_TYPES = [
  { id: 'combat', label: 'Combat', color: 'text-red-400' },
  { id: 'industrial', label: 'Industrielle', color: 'text-amber-400' },
  { id: 'scientific', label: 'Scientifique', color: 'text-cyan-400' },
];

export const BONUS_LABELS: Record<string, string> = {
  combat_build_time_reduction: 'Temps construction militaire',
  industrial_build_time_reduction: 'Temps construction industrielle',
  research_time_reduction: 'Temps de recherche',
  bonus_armor: 'Blindage',
  bonus_shot_count: 'Attaques',
  bonus_weapons: 'Armes',
};
