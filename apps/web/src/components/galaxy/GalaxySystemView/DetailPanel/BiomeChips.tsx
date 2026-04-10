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

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

const STAT_LABELS: Record<string, string> = {
  production_minerai: 'Production minerai',
  production_silicium: 'Production silicium',
  production_hydrogene: 'Production hydrogène',
  energy_production: 'Production énergie',
  storage_minerai: 'Stockage minerai',
  storage_silicium: 'Stockage silicium',
  storage_hydrogene: 'Stockage hydrogène',
};

function summarizeFirstEffect(effectsRaw: unknown): string | null {
  const effects = Array.isArray(effectsRaw)
    ? (effectsRaw as Array<{ stat?: string; modifier?: number }>)
    : [];
  const first = effects[0];
  if (!first || typeof first.modifier !== 'number' || !first.stat) {
    return null;
  }
  const sign = first.modifier > 0 ? '+' : '';
  const pct = Math.round(first.modifier * 100);
  const label = STAT_LABELS[first.stat] ?? first.stat;
  return `${sign}${pct}% ${label}`;
}

export function BiomeChips({ biomes }: Props): ReactElement | null {
  if (biomes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {biomes.map((biome) => {
        const color = RARITY_COLORS[biome.rarity] ?? RARITY_COLORS.common;
        const summary = summarizeFirstEffect(biome.effects);
        return (
          <div
            key={biome.id}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
            style={{
              backgroundColor: `${color}15`,
              border: `1px solid ${color}40`,
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span style={{ color }}>{biome.name}</span>
            {summary && (
              <span className="text-muted-foreground">· {summary}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
