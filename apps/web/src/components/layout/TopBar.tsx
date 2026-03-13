import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';

interface ResourceDisplayProps {
  label: string;
  value: number;
  color: string;
}

function ResourceDisplay({ label, value, color }: ResourceDisplayProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>
        {value.toLocaleString('fr-FR')}
      </span>
    </div>
  );
}

export function TopBar({ planetId }: { planetId?: string }) {
  const { data } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId, refetchInterval: 60_000 },
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

  const energyBalance = data ? data.rates.energyProduced - data.rates.energyConsumed : 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-6">
        <ResourceDisplay label="Métal" value={resources.metal} color="text-metal" />
        <ResourceDisplay label="Cristal" value={resources.crystal} color="text-crystal" />
        <ResourceDisplay label="Deutérium" value={resources.deuterium} color="text-deuterium" />
        <ResourceDisplay
          label="Énergie"
          value={energyBalance}
          color={energyBalance >= 0 ? 'text-energy' : 'text-destructive'}
        />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Planète: Homeworld</span>
      </div>
    </header>
  );
}
