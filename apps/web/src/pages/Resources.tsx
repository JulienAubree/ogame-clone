import { useCallback } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Badge } from '@/components/ui/badge';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';

export default function Resources() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();

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

  const setPercentMutation = trpc.resource.setProductionPercent.useMutation({
    onSuccess: () => {
      utils.resource.production.invalidate({ planetId: planetId! });
    },
  });

  const handlePercentChange = useCallback(
    (field: 'mineraiMinePercent' | 'siliciumMinePercent' | 'hydrogeneSynthPercent', value: number) => {
      setPercentMutation.mutate({ planetId: planetId!, [field]: value });
    },
    [planetId, setPercentMutation],
  );

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title="Ressources" />
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  const resourceRows = [
    {
      name: 'Minerai',
      color: 'text-minerai',
      glowClass: 'glow-minerai',
      current: resources.minerai,
      perHour: data.rates.mineraiPerHour,
      capacity: data.rates.storageMineraiCapacity,
    },
    {
      name: 'Silicium',
      color: 'text-silicium',
      glowClass: 'glow-silicium',
      current: resources.silicium,
      perHour: data.rates.siliciumPerHour,
      capacity: data.rates.storageSiliciumCapacity,
    },
    {
      name: 'Hydrogène',
      color: 'text-hydrogene',
      glowClass: 'glow-hydrogene',
      current: resources.hydrogene,
      perHour: data.rates.hydrogenePerHour,
      capacity: data.rates.storageHydrogeneCapacity,
    },
  ];

  const energyGenerators = [
    {
      name: 'Mine de minerai',
      level: data.levels.mineraiMineLevel,
      perHour: data.rates.mineraiPerHour,
      energy: data.rates.mineraiMineEnergyConsumption,
      percent: data.rates.mineraiMinePercent,
      field: 'mineraiMinePercent' as const,
      color: 'text-minerai',
    },
    {
      name: 'Mine de silicium',
      level: data.levels.siliciumMineLevel,
      perHour: data.rates.siliciumPerHour,
      energy: data.rates.siliciumMineEnergyConsumption,
      percent: data.rates.siliciumMinePercent,
      field: 'siliciumMinePercent' as const,
      color: 'text-silicium',
    },
    {
      name: 'Synth. H\u2082',
      level: data.levels.hydrogeneSynthLevel,
      perHour: data.rates.hydrogenePerHour,
      energy: data.rates.hydrogeneSynthEnergyConsumption,
      percent: data.rates.hydrogeneSynthPercent,
      field: 'hydrogeneSynthPercent' as const,
      color: 'text-hydrogene',
    },
  ];

  const energyBalance = data.rates.energyProduced - data.rates.energyConsumed;
  const energySufficient = energyBalance >= 0;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Ressources" />

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        {/* Left column: production */}
        <section className="glass-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Production</h2>
          <div className="space-y-4">
            {resourceRows.map((r) => {
              const fillPercent = r.capacity > 0 ? Math.min(100, (r.current / r.capacity) * 100) : 0;
              return (
                <div key={r.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${r.color} ${r.glowClass}`}>{r.name}</span>
                    <div className="flex gap-6 text-sm">
                      <span>{r.current.toLocaleString('fr-FR')}</span>
                      <span className="text-muted-foreground">
                        +{r.perHour.toLocaleString('fr-FR')}/h
                      </span>
                      <span className="text-muted-foreground">
                        Cap: {r.capacity.toLocaleString('fr-FR')}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-[width] duration-1000 ease-linear ${
                        fillPercent > 90 ? 'bg-destructive' : fillPercent > 70 ? 'bg-energy' : 'bg-primary'
                      }`}
                      style={{ width: `${fillPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right column: energy */}
        <div className="space-y-4">
          {/* Energy management */}
          <section className="glass-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Gestion d'énergie</h2>
            <div className="space-y-5">
              {energyGenerators.map((gen) => (
                <div key={gen.field} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${gen.color}`}>{gen.name}</span>
                      <Badge variant="secondary" className="text-xs">Niv. {gen.level}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">+{gen.perHour.toLocaleString('fr-FR')}/h</span>
                      <span className="text-energy">-{gen.energy}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={10}
                      value={gen.percent}
                      onChange={(e) => handlePercentChange(gen.field, Number(e.target.value))}
                      disabled={setPercentMutation.isPending}
                      className="flex-1 h-1.5 appearance-none bg-muted rounded-full cursor-pointer accent-primary
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                    />
                    <span className="text-sm font-mono w-10 text-right">{gen.percent}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Energy balance */}
          <section className="glass-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Balance énergétique</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-energy font-medium glow-energy">Centrale solaire</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Niv. {data.levels.solarPlantLevel}</Badge>
                  <span className="text-energy font-mono">+{data.rates.energyProduced}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm font-medium">
                <span className="text-muted-foreground">Balance énergétique</span>
                <span className={energySufficient ? 'text-energy' : 'text-destructive'}>
                  {energyBalance >= 0 ? '+' : ''}{energyBalance}
                </span>
              </div>

              {data.rates.energyConsumed > 0 && (
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-[width] duration-500 ${
                      energySufficient ? 'bg-energy' : 'bg-destructive'
                    }`}
                    style={{
                      width: `${Math.min(100, (data.rates.energyProduced / Math.max(1, data.rates.energyConsumed)) * 100)}%`,
                    }}
                  />
                </div>
              )}

              {data.rates.productionFactor < 1 && (
                <p className="text-xs text-destructive">
                  Facteur de production : {(data.rates.productionFactor * 100).toFixed(1)}% — Construisez
                  une centrale solaire ou réduisez la puissance de vos mines !
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
