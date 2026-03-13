import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function Resources() {
  const { planetId } = useOutletContext<{ planetId?: string }>();

  const { data, isLoading } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
    data
      ? {
          metal: data.metal,
          crystal: data.crystal,
          deuterium: data.deuterium,
          resourcesUpdatedAt: data.resourcesUpdatedAt,
          metalPerHour: data.rates.metalPerHour,
          crystalPerHour: data.rates.crystalPerHour,
          deutPerHour: data.rates.deutPerHour,
          storageMetalCapacity: data.rates.storageMetalCapacity,
          storageCrystalCapacity: data.rates.storageCrystalCapacity,
          storageDeutCapacity: data.rates.storageDeutCapacity,
        }
      : undefined,
  );

  if (isLoading || !data) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  const resourceRows = [
    {
      name: 'Métal',
      color: 'text-metal',
      current: resources.metal,
      perHour: data.rates.metalPerHour,
      capacity: data.rates.storageMetalCapacity,
    },
    {
      name: 'Cristal',
      color: 'text-crystal',
      current: resources.crystal,
      perHour: data.rates.crystalPerHour,
      capacity: data.rates.storageCrystalCapacity,
    },
    {
      name: 'Deutérium',
      color: 'text-deuterium',
      current: resources.deuterium,
      perHour: data.rates.deutPerHour,
      capacity: data.rates.storageDeutCapacity,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Ressources</h1>

      <Card>
        <CardHeader>
          <CardTitle>Production</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {resourceRows.map((r) => (
              <div key={r.name} className="flex items-center justify-between">
                <span className={`font-medium ${r.color}`}>{r.name}</span>
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
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Énergie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-energy font-medium">Balance</span>
            <span
              className={`text-sm font-semibold ${
                data.rates.energyProduced >= data.rates.energyConsumed
                  ? 'text-energy'
                  : 'text-destructive'
              }`}
            >
              {data.rates.energyProduced - data.rates.energyConsumed} ({data.rates.energyProduced} /{' '}
              {data.rates.energyConsumed})
            </span>
          </div>
          {data.rates.productionFactor < 1 && (
            <p className="mt-2 text-xs text-destructive">
              Facteur de production : {(data.rates.productionFactor * 100).toFixed(1)}% — Construisez
              une centrale solaire !
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
