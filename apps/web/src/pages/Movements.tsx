import { useState } from 'react';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { Timer } from '@/components/common/Timer';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

const MISSION_LABELS: Record<string, string> = {
  transport: 'Transport',
  station: 'Stationner',
  spy: 'Espionnage',
  attack: 'Attaque',
  colonize: 'Colonisation',
  mine: 'Extraction',
  pirate: 'Pirate',
};

const MISSION_BORDER_COLORS: Record<string, string> = {
  transport: 'border-l-primary',
  station: 'border-l-green-500',
  spy: 'border-l-violet-500',
  attack: 'border-l-destructive',
  colonize: 'border-l-orange-500',
  mine: 'border-l-amber-500',
  pirate: 'border-l-red-500',
};

export default function Movements() {
  const utils = trpc.useUtils();
  const [recallConfirm, setRecallConfirm] = useState<string | null>(null);

  const { data: movements, isLoading } = trpc.fleet.movements.useQuery();

  const recallMutation = trpc.fleet.recall.useMutation({
    onSuccess: () => {
      utils.fleet.movements.invalidate();
      setRecallConfirm(null);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Mouvements" />
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Mouvements" />

      {!movements || movements.length === 0 ? (
        <EmptyState
          title="Aucun mouvement en cours"
          description="Envoyez une flotte depuis la page Flotte pour voir vos mouvements ici."
        />
      ) : (
        <div className="space-y-4 lg:max-w-4xl lg:mx-auto">
          {movements.map((event) => {
            const ships = event.ships as Record<string, number>;
            const borderColor = MISSION_BORDER_COLORS[event.mission] || 'border-l-muted';
            const coords = `[${event.targetGalaxy}:${event.targetSystem}:${event.targetPosition}]`;
            const canRecall = ['outbound', 'prospecting', 'mining'].includes(event.phase);

            const phaseLabels: Record<string, string> = {
              outbound: `En route vers ${coords}`,
              prospecting: `Prospection en cours sur ${coords}`,
              mining: `Extraction en cours sur ${coords}`,
              return: 'Retour',
            };
            const phaseLabel = phaseLabels[event.phase] ?? event.phase;

            return (
              <div key={event.id} className={cn('glass-card border-l-4 p-4 space-y-2', borderColor)}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{MISSION_LABELS[event.mission] ?? event.mission}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {phaseLabel}
                    </span>
                  </div>
                  <Timer
                    endTime={new Date(event.arrivalTime)}
                    onComplete={() => utils.fleet.movements.invalidate()}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Destination : {coords}
                </div>
                <div className="text-xs text-muted-foreground">
                  Vaisseaux :{' '}
                  {Object.entries(ships)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ')}
                </div>
                {(Number(event.mineraiCargo) > 0 || Number(event.siliciumCargo) > 0 || Number(event.hydrogeneCargo) > 0) && (
                  <div className="text-xs text-muted-foreground">
                    Cargo : <span className="text-minerai">M:{Number(event.mineraiCargo).toLocaleString('fr-FR')}</span>{' '}
                    <span className="text-silicium">S:{Number(event.siliciumCargo).toLocaleString('fr-FR')}</span>{' '}
                    <span className="text-hydrogene">H:{Number(event.hydrogeneCargo).toLocaleString('fr-FR')}</span>
                  </div>
                )}
                {canRecall && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setRecallConfirm(event.id)}
                    disabled={recallMutation.isPending}
                  >
                    Rappeler
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!recallConfirm}
        onConfirm={() => {
          if (recallConfirm) recallMutation.mutate({ fleetEventId: recallConfirm });
        }}
        onCancel={() => setRecallConfirm(null)}
        title="Rappeler la flotte ?"
        description="La flotte fera demi-tour et retournera à sa planète d'origine."
        variant="destructive"
        confirmLabel="Rappeler"
      />
    </div>
  );
}
