/**
 * Presentational list of biome chips.
 *
 * Used by both ModePlanet (occupied) and ModePlanet (empty-discovered) to
 * render a biome's name + first effect as a colored pill. Rarity colors and
 * stat label map mirror the legacy Galaxy.tsx conventions so the new
 * DetailPanel stays visually consistent with the existing screen.
 */

import type { ReactElement } from 'react';
import type { BiomeView } from '../slotView';

interface Props {
  biomes: BiomeView[];
}

// Mirrored from apps/web/src/pages/Galaxy.tsx (mobile list still uses them).
// Kept duplicated intentionally: mobile list and desktop DetailPanel have
// separate styling needs. If a future task extracts a shared module,
// consolidate there.
const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

// Mirrored from apps/web/src/pages/Galaxy.tsx (mobile list still uses them).
// Kept duplicated intentionally: mobile list and desktop DetailPanel have
// separate styling needs. If a future task extracts a shared module,
// consolidate there.
const STAT_LABELS: Record<string, string> = {
  production_minerai: 'Production minerai',
  production_silicium: 'Production silicium',
  production_hydrogene: 'Production hydrogène',
  energy_production: 'Production énergie',
  storage_minerai: 'Stockage minerai',
  storage_silicium: 'Stockage silicium',
  storage_hydrogene: 'Stockage hydrogène',
};

function formatEffects(effectsRaw: unknown): Array<{ text: string; positive: boolean }> {
  const effects = Array.isArray(effectsRaw)
    ? (effectsRaw as Array<{ stat?: string; modifier?: number }>)
    : [];
  return effects
    .filter((e) => typeof e.modifier === 'number' && e.stat)
    .map((e) => {
      const sign = e.modifier! > 0 ? '+' : '';
      const pct = Math.round(e.modifier! * 100);
      const label = STAT_LABELS[e.stat!] ?? e.stat!;
      return { text: `${sign}${pct}% ${label}`, positive: e.modifier! > 0 };
    });
}

export function BiomeChips({ biomes }: Props): ReactElement | null {
  if (biomes.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {biomes.map((biome) => {
        const color = RARITY_COLORS[biome.rarity] ?? RARITY_COLORS.common;
        const effects = formatEffects(biome.effects);
        return (
          <div
            key={biome.id}
            className="rounded-md px-2.5 py-1.5 text-[11px]"
            style={{
              backgroundColor: `${color}10`,
              borderLeft: `3px solid ${color}`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium" style={{ color }}>{biome.name}</span>
            </div>
            {effects.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 ml-3">
                {effects.map((e, i) => (
                  <span key={i} className={e.positive ? 'text-emerald-400' : 'text-red-400'}>
                    {e.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
