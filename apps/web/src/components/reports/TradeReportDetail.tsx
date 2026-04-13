// apps/web/src/components/reports/TradeReportDetail.tsx
import { useGameConfig } from '@/hooks/useGameConfig';
import { PlanetVisual } from '@/components/galaxy/PlanetVisual';
import { CoordsLink } from '@/components/common/CoordsLink';

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  epic: 'Epique',
  legendary: 'Legendaire',
};

const STAT_LABELS: Record<string, string> = {
  production_minerai: 'Production minerai',
  production_silicium: 'Production silicium',
  production_hydrogene: 'Production hydrogene',
  energy_production: 'Production energie',
  storage_minerai: 'Stockage minerai',
  storage_silicium: 'Stockage silicium',
  storage_hydrogene: 'Stockage hydrogene',
};

interface BiomeEntry {
  id: string;
  name: string;
  rarity: string;
  effects?: Array<{ stat: string; modifier: number }>;
}

interface TradeReportDetailProps {
  result: Record<string, any>;
}

export function TradeReportDetail({ result }: TradeReportDetailProps) {
  const { data: gameConfig } = useGameConfig();

  const planetClassId = result.planetClassId ?? null;
  const biomes: BiomeEntry[] = result.biomes ?? [];
  const biomeCount = result.biomeCount ?? biomes.length;
  const isComplete = result.isComplete ?? false;
  const sellerUsername = result.sellerUsername ?? 'Joueur';

  const planetTypeName = planetClassId
    ? (gameConfig?.planetTypes?.find((t: any) => t.id === planetClassId)?.name ?? 'Inconnue')
    : 'Inconnue';

  const coordsLabel =
    result.galaxy != null && result.system != null && result.position != null
      ? `[${result.galaxy}:${result.system}:${result.position}]`
      : '';

  const statusBadge = isComplete
    ? { label: 'Complet', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    : { label: 'Partiel', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };

  return (
    <div className="glass-card p-4 lg:p-5 border border-cyan-500/20">
      {/* Header row: planet visual + info */}
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <PlanetVisual
            planetClassId={planetClassId}
            planetImageIndex={null}
            size={80}
            variant="thumb"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Rapport d'exploration acquis
          </div>
          <h3 className="text-lg font-bold text-foreground leading-tight">
            Position {result.galaxy != null && result.system != null && result.position != null
              ? <CoordsLink galaxy={result.galaxy} system={result.system} position={result.position} className="text-cyan-400 hover:text-cyan-300 hover:underline font-mono text-lg transition-colors" />
              : coordsLabel}
          </h3>
          <div className="text-xs text-muted-foreground mt-0.5">
            Type : {planetTypeName}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusBadge.cls}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {statusBadge.label}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="text-cyan-400 font-semibold">{biomeCount}</span> biome
            {biomeCount > 1 ? 's' : ''} obtenu{biomeCount > 1 ? 's' : ''}
            {' '} · Vendu par{' '}
            <span className="text-foreground font-medium">{sellerUsername}</span>
          </div>
        </div>
      </div>

      {/* Biomes section */}
      {biomes.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Biomes obtenus
          </h3>
          <div className="space-y-3">
            {biomes.map((biome) => {
              const color = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
              return (
                <div
                  key={biome.id}
                  className="border-l-2 pl-3"
                  style={{ borderColor: color }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-semibold" style={{ color }}>
                      {biome.name}
                    </span>
                    <span
                      className="text-[10px] rounded-full px-1.5 py-px font-medium"
                      style={{ color, backgroundColor: `${color}20` }}
                    >
                      {RARITY_LABELS[biome.rarity] ?? biome.rarity}
                    </span>
                  </div>
                  {biome.effects && biome.effects.length > 0 && (
                    <div className="text-xs space-y-0.5 ml-4">
                      {biome.effects.map((e, i) => (
                        <div key={i} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">
                            {STAT_LABELS[e.stat] ?? e.stat}
                          </span>
                          <span
                            className={
                              e.modifier > 0
                                ? 'text-emerald-400 font-medium'
                                : 'text-red-400 font-medium'
                            }
                          >
                            {e.modifier > 0 ? '+' : ''}
                            {Math.round(e.modifier * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
