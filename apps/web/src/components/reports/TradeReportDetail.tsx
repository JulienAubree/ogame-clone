// apps/web/src/components/reports/TradeReportDetail.tsx
import { useGameConfig } from '@/hooks/useGameConfig';
import { PlanetVisual } from '@/components/galaxy/PlanetVisual';
import { CoordsLink } from '@/components/common/CoordsLink';
import { cn } from '@/lib/utils';

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
  epic: 'Épique',
  legendary: 'Légendaire',
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

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

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

  const maxRarity = biomes.reduce((max, b) => {
    const idx = RARITY_ORDER.indexOf(b.rarity);
    return idx > max ? idx : max;
  }, -1);
  const maxRarityLabel = maxRarity >= 0 ? RARITY_LABELS[RARITY_ORDER[maxRarity]] : null;
  const maxRarityColor = maxRarity >= 0 ? RARITY_COLORS[RARITY_ORDER[maxRarity]] : null;

  const statusBadge = isComplete
    ? { label: 'Complet', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    : { label: 'Partiel', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };

  return (
    <div className="space-y-4">
      {/* ── Header card: planet visual + summary ── */}
      <div className="glass-card p-5 border border-purple-500/20">
        <div className="flex items-start gap-5">
          <div className="shrink-0">
            <PlanetVisual
              planetClassId={planetClassId}
              planetImageIndex={null}
              size={128}
              variant="thumb"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-purple-400/70 mb-1">
              Donnees acquises via le marche
            </div>
            <h3 className="text-xl font-bold text-foreground leading-tight">
              Planete {planetTypeName}
            </h3>
            {result.galaxy != null && result.system != null && result.position != null && (
              <div className="mt-1">
                <CoordsLink galaxy={result.galaxy} system={result.system} position={result.position} />
              </div>
            )}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider',
                  statusBadge.cls,
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {statusBadge.label}
              </span>
              <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                {biomeCount} biome{biomeCount > 1 ? 's' : ''}
              </span>
              {maxRarityLabel && maxRarityColor && (
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold border"
                  style={{ color: maxRarityColor, backgroundColor: `${maxRarityColor}15`, borderColor: `${maxRarityColor}30` }}
                >
                  {maxRarityLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Transaction info block ── */}
      <div className="rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-purple-400/80 mb-2">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M16 3h5v5" />
            <path d="M8 21H3v-5" />
            <path d="M21 3l-9 9" />
            <path d="M3 21l9-9" />
          </svg>
          <span>Transaction commerciale</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed italic">
          Les données cartographiques de cette planète {planetTypeName.toLowerCase()} ont été acquises
          auprès de <span className="text-foreground font-medium not-italic">{sellerUsername}</span> via
          le marché galactique. {biomeCount} biome{biomeCount > 1 ? 's' : ''} {isComplete ? 'ont été révélés, couvrant l\'intégralité de la surface.' : 'ont été révélés. D\'autres formations restent potentiellement à découvrir.'}
        </p>
      </div>

      {/* ── Biomes obtained ── */}
      {biomes.length > 0 && (
        <div className="glass-card p-4 lg:p-5 border border-cyan-500/20">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Biomes reveles
          </h3>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {biomes.map((biome) => {
              const color = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
              const effects = biome.effects ?? [];
              return (
                <div
                  key={biome.id}
                  className="rounded-lg border p-3"
                  style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm font-semibold truncate" style={{ color }}>
                      {biome.name}
                    </span>
                    <span
                      className="text-[9px] rounded-full px-1.5 py-px font-medium shrink-0 ml-auto"
                      style={{ color, backgroundColor: `${color}20` }}
                    >
                      {RARITY_LABELS[biome.rarity] ?? biome.rarity}
                    </span>
                  </div>
                  {effects.length > 0 && (
                    <div className="space-y-1">
                      {effects.map((e, i) => (
                        <div key={i} className="flex justify-between gap-2 text-xs">
                          <span className="text-muted-foreground truncate">
                            {STAT_LABELS[e.stat] ?? e.stat}
                          </span>
                          <span
                            className={cn(
                              'font-medium tabular-nums shrink-0',
                              e.modifier > 0 ? 'text-emerald-400' : 'text-red-400',
                            )}
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
