import { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { buildProductionConfig } from '@/lib/production-config';
import { solarSatelliteEnergy, calculateShieldCapacity } from '@exilium/game-engine';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon, EnergieIcon } from '@/components/common/ResourceIcons';
import { DefenseIcon } from '@/lib/icons';
import { PlanetCard } from '@/components/energy/PlanetCard';
import { EnergyBar } from '@/components/energy/EnergyBar';
import { FluxView } from '@/components/energy/FluxView';
import { TableView } from '@/components/energy/TableView';

type View = 'flux' | 'table';

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

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title="Énergie" />
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

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Énergie" />

      {/* Energy budget bar */}
      <EnergyBar
        totalProduced={data.rates.energyProduced}
        totalConsumed={data.rates.energyConsumed}
        segments={energySegments}
        productionFactor={data.rates.productionFactor}
      />

      {/* Planet Card */}
      <PlanetCard
        name={data.planetName}
        planetTypeName={data.planetTypeName}
        planetClassId={data.planetClassId}
        planetImageIndex={data.planetImageIndex}
        maxTemp={data.maxTemp}
        bonus={data.planetTypeBonus}
      />

      {/* View tabs */}
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

      {/* Active view */}
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
  );
}
