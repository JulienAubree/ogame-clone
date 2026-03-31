import { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { useGameConfig } from '@/hooks/useGameConfig';
import { buildProductionConfig } from '@/lib/production-config';
import { solarSatelliteEnergy, calculateShieldCapacity } from '@exilium/game-engine';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { PlanetCard } from '@/components/energy/PlanetCard';
import { FluxView } from '@/components/energy/FluxView';
import { TableView } from '@/components/energy/TableView';
import { EnergyBalance } from '@/components/energy/EnergyBalance';
import { ResourceImpact } from '@/components/energy/ResourceImpact';

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

  const resources = useResourceCounter(
    data
      ? {
          minerai: data.minerai,
          silicium: data.silicium,
          hydrogene: data.hydrogene,
          resourcesUpdatedAt: data.resourcesUpdatedAt,
          mineraiPerHour: data.rates.mineraiPerHour,
          siliciumPerHour: data.rates.siliciumPerHour,
          hydrogenePerHour: data.rates.hydrogenePerHour,
          storageMineraiCapacity: data.rates.storageMineraiCapacity,
          storageSiliciumCapacity: data.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: data.rates.storageHydrogeneCapacity,
        }
      : undefined,
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

  // Optimistic local state for knob dragging
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

  // Compute derived data
  const isHomePlanet = data.planetClassId === 'homeworld';
  const prodConfig = gameConfig ? buildProductionConfig(gameConfig) : undefined;
  const satEnergyPerUnit = solarSatelliteEnergy(data.maxTemp, isHomePlanet, prodConfig?.satellite);
  const satCount = data.levels.solarSatelliteCount;
  const satEnergyTotal = satEnergyPerUnit * satCount;
  const plantEnergy = data.rates.energyProduced - satEnergyTotal;

  const shieldLevel = buildings?.find((b) => b.id === 'planetaryShield')?.currentLevel ?? 0;
  const shieldPercent = localPercents['shield'] ?? data.rates.shieldPercent ?? 100;

  // Build source list
  const energySources = [
    { name: 'Centrale Solaire', icon: '☀️', energy: plantEnergy, detail: `Niveau ${data.levels.solarPlant}` },
    ...(satCount > 0
      ? [{ name: 'Satellites Solaires', icon: '🛰️', energy: satEnergyTotal, detail: `${satCount} × ${satEnergyPerUnit}` }]
      : []),
  ];

  // Build consumer list (superset — works for both views)
  const consumers = [
    {
      key: 'mineraiMinePercent',
      name: 'Mine Minerai',
      icon: '⛏️',
      level: data.levels.mineraiMine,
      colorHex: '#fb923c',
      colorClass: 'text-minerai',
      percent: localPercents['mineraiMinePercent'] ?? data.rates.mineraiMinePercent,
      energyConsumption: data.rates.mineraiMineEnergyConsumption,
      production: data.rates.mineraiPerHour.toLocaleString('fr-FR'),
      productionLabel: 'Produit',
      productionUnit: '/heure',
      stock: {
        current: resources.minerai,
        capacity: data.rates.storageMineraiCapacity,
      },
    },
    {
      key: 'siliciumMinePercent',
      name: 'Mine Silicium',
      icon: '💎',
      level: data.levels.siliciumMine,
      colorHex: '#34d399',
      colorClass: 'text-silicium',
      percent: localPercents['siliciumMinePercent'] ?? data.rates.siliciumMinePercent,
      energyConsumption: data.rates.siliciumMineEnergyConsumption,
      production: data.rates.siliciumPerHour.toLocaleString('fr-FR'),
      productionLabel: 'Produit',
      productionUnit: '/heure',
      stock: {
        current: resources.silicium,
        capacity: data.rates.storageSiliciumCapacity,
      },
    },
    {
      key: 'hydrogeneSynthPercent',
      name: 'Synth. H₂',
      icon: '🧪',
      level: data.levels.hydrogeneSynth,
      colorHex: '#60a5fa',
      colorClass: 'text-hydrogene',
      percent: localPercents['hydrogeneSynthPercent'] ?? data.rates.hydrogeneSynthPercent,
      energyConsumption: data.rates.hydrogeneSynthEnergyConsumption,
      production: data.rates.hydrogenePerHour.toLocaleString('fr-FR'),
      productionLabel: 'Produit',
      productionUnit: '/heure',
      stock: {
        current: resources.hydrogene,
        capacity: data.rates.storageHydrogeneCapacity,
      },
    },
    ...(shieldLevel > 0
      ? [{
          key: 'shield',
          name: 'Bouclier',
          icon: '🛡️',
          level: shieldLevel,
          colorHex: '#22d3ee',
          colorClass: 'text-shield',
          percent: shieldPercent,
          energyConsumption: data.rates.shieldEnergyConsumption,
          production: String(Math.floor(calculateShieldCapacity(shieldLevel) * shieldPercent / 100)),
          productionLabel: 'Capacité',
          productionUnit: '/tour',
        }]
      : []),
  ];

  const resourceRows = [
    { name: 'Minerai', colorClass: 'text-minerai', current: resources.minerai, perHour: data.rates.mineraiPerHour, capacity: data.rates.storageMineraiCapacity },
    { name: 'Silicium', colorClass: 'text-silicium', current: resources.silicium, perHour: data.rates.siliciumPerHour, capacity: data.rates.storageSiliciumCapacity },
    { name: 'Hydrogène', colorClass: 'text-hydrogene', current: resources.hydrogene, perHour: data.rates.hydrogenePerHour, capacity: data.rates.storageHydrogeneCapacity },
  ];

  const isMutating = setPercentMutation.isPending || setShieldMutation.isPending;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Énergie" />

      {/* Planet Card */}
      <PlanetCard
        name={data.planetName}
        planetTypeName={data.planetTypeName}
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
          ⚡ Flux
        </button>
        <button
          onClick={() => setActiveView('table')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeView === 'table'
              ? 'bg-energy/10 text-energy'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          📊 Tableau
        </button>
      </div>

      {/* Active view */}
      {activeView === 'flux' ? (
        <FluxView
          sources={energySources}
          totalEnergy={data.rates.energyProduced}
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

      {/* Energy balance (common to both views) */}
      <EnergyBalance
        energyProduced={data.rates.energyProduced}
        energyConsumed={data.rates.energyConsumed}
        productionFactor={data.rates.productionFactor}
      />

      {/* Resource impact (common to both views) */}
      <ResourceImpact resources={resourceRows} />
    </div>
  );
}
