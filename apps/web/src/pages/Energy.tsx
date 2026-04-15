import { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { buildProductionConfig } from '@/lib/production-config';
import { solarSatelliteEnergy, calculateShieldCapacity } from '@exilium/game-engine';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon, EnergieIcon } from '@/components/common/ResourceIcons';
import { DefenseIcon } from '@/lib/icons';
import { getPlanetImageUrl } from '@/lib/assets';
import { EnergyBar } from '@/components/energy/EnergyBar';
import { FluxView } from '@/components/energy/FluxView';
import { TableView } from '@/components/energy/TableView';

type View = 'flux' | 'table';

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af', uncommon: '#22c55e', rare: '#3b82f6', epic: '#a855f7', legendary: '#eab308',
};
const RARITY_LABELS: Record<string, string> = {
  common: 'Commun', uncommon: 'Peu commun', rare: 'Rare', epic: 'Epique', legendary: 'Legendaire',
};
const STAT_SHORT: Record<string, { label: string }> = {
  production_minerai: { label: 'Minerai' }, production_silicium: { label: 'Silicium' },
  production_hydrogene: { label: 'Hydrogene' }, energy_production: { label: 'Energie' },
  storage_minerai: { label: 'Stock. Fe' }, storage_silicium: { label: 'Stock. Si' },
  storage_hydrogene: { label: 'Stock. H' },
};
const STAT_LABELS: Record<string, string> = {
  production_minerai: 'Prod. minerai', production_silicium: 'Prod. silicium',
  production_hydrogene: 'Prod. hydrogene', energy_production: 'Prod. energie',
  storage_minerai: 'Stock. minerai', storage_silicium: 'Stock. silicium',
  storage_hydrogene: 'Stock. hydrogene',
};
const PLANET_BONUS_TO_STAT: Record<string, string> = {
  mineraiBonus: 'production_minerai', siliciumBonus: 'production_silicium', hydrogeneBonus: 'production_hydrogene',
};

function formatBonus(value: number): string {
  const percent = Math.round(value * 100);
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

function BiomePopover({ biome }: { biome: { id: string; name: string; rarity: string; description?: string; effects?: Array<{ stat: string; modifier: number }> } }) {
  const [isOpen, setIsOpen] = useState(false);
  const color = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
  return (
    <span className="relative" style={isOpen ? { zIndex: 9999 } : undefined}
      onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium border cursor-default transition-colors"
        style={{ color, borderColor: `${color}${isOpen ? '55' : '33'}`, backgroundColor: `${color}${isOpen ? '25' : '15'}` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        {biome.name}
      </span>
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-56 rounded-lg border border-border bg-popover p-3 shadow-xl pointer-events-none" style={{ zIndex: 9999 }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold" style={{ color }}>{biome.name}</span>
          </div>
          <span className="inline-block rounded-full px-1.5 py-px text-[10px] font-medium mb-2"
            style={{ color, backgroundColor: `${color}20` }}>{RARITY_LABELS[biome.rarity] ?? biome.rarity}</span>
          {biome.description && <p className="text-xs text-muted-foreground mb-2 italic">{biome.description}</p>}
          {biome.effects && biome.effects.length > 0 && (
            <div className="space-y-1">
              {biome.effects.map((e, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{STAT_LABELS[e.stat] ?? e.stat}</span>
                  <span className={e.modifier > 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>{formatBonus(e.modifier)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export default function Energy() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();
  const [activeView, setActiveView] = useState<View>('flux');

  const { data, isLoading } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const setPercentMutation = trpc.resource.setProductionPercent.useMutation({
    onSuccess: () => utils.resource.production.invalidate({ planetId: planetId! }),
  });

  const setShieldMutation = trpc.resource.setShieldPercent.useMutation({
    onSuccess: () => utils.resource.production.invalidate({ planetId: planetId! }),
  });

  const [localPercents, setLocalPercents] = useState<Record<string, number>>({});

  const handlePercentChange = useCallback((key: string, value: number) => {
    setLocalPercents((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handlePercentChangeEnd = useCallback(
    (key: string, value: number) => {
      setLocalPercents((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      if (key === 'shield') {
        setShieldMutation.mutate({ planetId: planetId!, percent: value });
      } else {
        setPercentMutation.mutate({ planetId: planetId!, [key]: value });
      }
    },
    [planetId, setPercentMutation, setShieldMutation],
  );

  const [bonusExpanded, setBonusExpanded] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  const isHomePlanet = data.planetClassId === 'homeworld';
  const prodConfig = gameConfig ? buildProductionConfig(gameConfig) : undefined;
  const satEnergyPerUnit = solarSatelliteEnergy(data.maxTemp, isHomePlanet, prodConfig?.satellite);
  const satCount = data.levels.solarSatelliteCount;
  const satEnergyTotal = satEnergyPerUnit * satCount;
  const plantEnergy = data.rates.energyProduced - satEnergyTotal;

  const shieldBuildingLevel = buildings?.find((b) => b.id === 'planetaryShield')?.currentLevel ?? 0;
  const shieldLevelBonus = data.rates.shieldLevelBonus ?? 0;
  const shieldLevel = shieldBuildingLevel + shieldLevelBonus;
  const shieldPercent = localPercents['shield'] ?? data.rates.shieldPercent ?? 100;

  // Energy bar segments
  const energySegments = [
    { label: 'Mine Min.', value: data.rates.mineraiMineEnergyConsumption, color: '#fb923c' },
    { label: 'Mine Sil.', value: data.rates.siliciumMineEnergyConsumption, color: '#34d399' },
    { label: 'Synth. H\u2082', value: data.rates.hydrogeneSynthEnergyConsumption, color: '#60a5fa' },
    ...(shieldLevel > 0 ? [{ label: 'Bouclier', value: data.rates.shieldEnergyConsumption, color: '#22d3ee' }] : []),
  ];

  // Sources
  const energySources = [
    { name: 'Centrale Solaire', icon: <EnergieIcon size={20} />, energy: plantEnergy, detail: `Niveau ${data.levels.solarPlant}` },
    ...(satCount > 0
      ? [{ name: 'Satellites Solaires', icon: <EnergieIcon size={20} />, energy: satEnergyTotal, detail: `${satCount} \u00d7 ${satEnergyPerUnit}` }]
      : []),
  ];

  // Consumers
  const consumers = [
    {
      key: 'mineraiMinePercent',
      name: 'Mine Minerai',
      icon: <MineraiIcon size={18} />,
      level: data.levels.mineraiMine,
      colorHex: '#fb923c',
      colorClass: 'text-minerai',
      percent: localPercents['mineraiMinePercent'] ?? data.rates.mineraiMinePercent,
      energyConsumption: data.rates.mineraiMineEnergyConsumption,
      production: `+${data.rates.mineraiPerHour.toLocaleString('fr-FR')}/h`,
      productionLabel: 'Produit',
      productionUnit: '/heure',
    },
    {
      key: 'siliciumMinePercent',
      name: 'Mine Silicium',
      icon: <SiliciumIcon size={18} />,
      level: data.levels.siliciumMine,
      colorHex: '#34d399',
      colorClass: 'text-silicium',
      percent: localPercents['siliciumMinePercent'] ?? data.rates.siliciumMinePercent,
      energyConsumption: data.rates.siliciumMineEnergyConsumption,
      production: `+${data.rates.siliciumPerHour.toLocaleString('fr-FR')}/h`,
      productionLabel: 'Produit',
      productionUnit: '/heure',
    },
    {
      key: 'hydrogeneSynthPercent',
      name: 'Synth. H\u2082',
      icon: <HydrogeneIcon size={18} />,
      level: data.levels.hydrogeneSynth,
      colorHex: '#60a5fa',
      colorClass: 'text-hydrogene',
      percent: localPercents['hydrogeneSynthPercent'] ?? data.rates.hydrogeneSynthPercent,
      energyConsumption: data.rates.hydrogeneSynthEnergyConsumption,
      production: `+${data.rates.hydrogenePerHour.toLocaleString('fr-FR')}/h`,
      productionLabel: 'Produit',
      productionUnit: '/heure',
    },
    ...(shieldLevel > 0
      ? [{
          key: 'shield',
          name: 'Bouclier',
          icon: <DefenseIcon width={18} height={18} />,
          level: shieldLevel,
          levelBonus: shieldLevelBonus > 0 ? shieldLevelBonus : undefined,
          colorHex: '#22d3ee',
          colorClass: 'text-shield',
          percent: shieldPercent,
          energyConsumption: data.rates.shieldEnergyConsumption,
          production: `${Math.floor(calculateShieldCapacity(shieldLevel) * shieldPercent / 100)}/tour`,
          productionLabel: 'Capacité',
          productionUnit: '/tour',
        }]
      : []),
  ];

  const isMutating = setPercentMutation.isPending || setShieldMutation.isPending;

  // Planet bonus computation
  const biomes = (data.biomes ?? []) as Array<{ id: string; name: string; rarity: string; description?: string; effects?: Array<{ stat: string; modifier: number }> }>;
  const planetTypeEffects: Record<string, number> = {};
  if (data.planetTypeBonus) {
    for (const [key, stat] of Object.entries(PLANET_BONUS_TO_STAT)) {
      const val = data.planetTypeBonus[key as keyof typeof data.planetTypeBonus];
      if (val && val !== 1) planetTypeEffects[stat] = val - 1;
    }
  }
  const biomeEffects: Record<string, number> = {};
  for (const biome of biomes) {
    for (const e of biome.effects ?? []) {
      biomeEffects[e.stat] = (biomeEffects[e.stat] ?? 0) + e.modifier;
    }
  }
  const allStats = new Set([...Object.keys(planetTypeEffects), ...Object.keys(biomeEffects)]);
  const totals: Record<string, number> = {};
  for (const stat of allStats) totals[stat] = (planetTypeEffects[stat] ?? 0) + (biomeEffects[stat] ?? 0);
  const hasBonuses = allStats.size > 0;

  return (
    <div className="space-y-4">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl -mx-4 -mt-4 lg:mx-0 lg:mt-0">
        <div className="absolute inset-0">
          {data.planetClassId && data.planetImageIndex != null ? (
            <img
              src={getPlanetImageUrl(data.planetClassId, data.planetImageIndex)}
              alt=""
              className="h-full w-full object-cover opacity-40 blur-sm scale-110"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-12 lg:pb-8">
          <div className="flex items-start gap-5">
            {data.planetClassId && data.planetImageIndex != null ? (
              <img
                src={getPlanetImageUrl(data.planetClassId, data.planetImageIndex, 'thumb')}
                alt={data.planetName}
                className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-primary/10 shrink-0"
              />
            ) : (
              <div className="flex h-20 w-20 lg:h-24 lg:w-24 items-center justify-center rounded-full border-2 border-primary/30 bg-card text-2xl font-bold text-primary shadow-lg shadow-primary/10 shrink-0">
                {data.planetName.charAt(0)}
              </div>
            )}

            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground truncate">{data.planetName}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {data.planetTypeName ?? 'Inconnue'} · {data.maxTemp}°C
              </p>

              {/* Cumulated bonus pills */}
              {hasBonuses && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {Object.entries(totals).map(([stat, val]) => {
                    const info = STAT_SHORT[stat];
                    return (
                      <span key={stat} className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                        val > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : val < 0 ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-muted/10 text-muted-foreground border-border/30'
                      }`}>
                        {formatBonus(val)} {info?.label ?? stat}
                      </span>
                    );
                  })}
                  <button type="button" onClick={() => setBonusExpanded(!bonusExpanded)}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5 ml-1">
                    Detail
                    <ChevronDown className={`h-3 w-3 transition-transform ${bonusExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Biomes */}
          {biomes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {biomes.map((biome) => <BiomePopover key={biome.id} biome={biome} />)}
            </div>
          )}

          {/* Expandable bonus detail */}
          {bonusExpanded && hasBonuses && (
            <div className="mt-4 pt-3 border-t border-white/10 space-y-3 text-xs">
              {Object.keys(planetTypeEffects).length > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground font-medium mb-1.5">Type : {data.planetTypeName}</div>
                  <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 ml-2">
                    {Object.entries(planetTypeEffects).map(([stat, val]) => (
                      <div key={stat} className="contents">
                        <span className="text-muted-foreground">{STAT_LABELS[stat] ?? stat}</span>
                        <span className={`text-right font-medium ${val > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBonus(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {biomes.length > 0 && Object.keys(biomeEffects).length > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground font-medium mb-1.5">Biomes</div>
                  <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 ml-2">
                    {Object.entries(biomeEffects).map(([stat, val]) => (
                      <div key={stat} className="contents">
                        <span className="text-muted-foreground">{STAT_LABELS[stat] ?? stat}</span>
                        <span className={`text-right font-medium ${val > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBonus(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Energy budget bar */}
      <div className="px-4 lg:px-0">
        <EnergyBar
          totalProduced={data.rates.energyProduced}
          totalConsumed={data.rates.energyConsumed}
          segments={energySegments}
          productionFactor={data.rates.productionFactor}
        />
      </div>

      {/* View tabs */}
      <div className="px-4 lg:px-0">
        <div className="flex gap-0.5 bg-card/50 rounded-lg p-0.5 border border-border/30 w-fit">
          <button
            onClick={() => setActiveView('flux')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeView === 'flux'
                ? 'bg-energy/10 text-energy'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Flux
          </button>
          <button
            onClick={() => setActiveView('table')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeView === 'table'
                ? 'bg-energy/10 text-energy'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tableau
          </button>
        </div>
      </div>

      {/* Active view */}
      <div className="px-4 lg:px-0 pb-4">
        {activeView === 'flux' ? (
          <FluxView
            sources={energySources}
            consumers={consumers}
            onPercentChange={handlePercentChange}
            onPercentChangeEnd={handlePercentChangeEnd}
            disabled={isMutating}
          />
        ) : (
          <TableView
            sources={energySources}
            consumers={consumers}
            energySurplus={data.rates.energyProduced - data.rates.energyConsumed}
            productionFactor={data.rates.productionFactor}
            energyProduced={data.rates.energyProduced}
            energyConsumed={data.rates.energyConsumed}
            onPercentChange={handlePercentChange}
            onPercentChangeEnd={handlePercentChangeEnd}
            disabled={isMutating}
          />
        )}
      </div>
    </div>
  );
}
