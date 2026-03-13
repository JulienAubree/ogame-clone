import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timer } from '@/components/common/Timer';

const MISSION_LABELS: Record<string, string> = {
  transport: 'Transport',
  station: 'Stationner',
  spy: 'Espionnage',
  attack: 'Attaque',
  colonize: 'Colonisation',
};

export default function Movements() {
  const utils = trpc.useUtils();

  const { data: movements, isLoading } = trpc.fleet.movements.useQuery();

  const recallMutation = trpc.fleet.recall.useMutation({
    onSuccess: () => {
      utils.fleet.movements.invalidate();
    },
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Mouvements</h1>

      {!movements || movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun mouvement de flotte en cours.</p>
      ) : (
        <div className="space-y-4">
          {movements.map((event) => {
            const ships = event.ships as Record<string, number>;
            const isOutbound = event.phase === 'outbound';

            return (
              <Card key={event.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {MISSION_LABELS[event.mission] ?? event.mission}
                      {' — '}
                      <span className="text-muted-foreground">
                        {isOutbound ? 'Aller' : 'Retour'}
                      </span>
                    </CardTitle>
                    <Timer
                      endTime={new Date(event.arrivalTime)}
                      onComplete={() => utils.fleet.movements.invalidate()}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Destination : [{event.targetGalaxy}:{event.targetSystem}:{event.targetPosition}]
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Vaisseaux :{' '}
                    {Object.entries(ships)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ')}
                  </div>
                  {(Number(event.metalCargo) > 0 || Number(event.crystalCargo) > 0 || Number(event.deuteriumCargo) > 0) && (
                    <div className="text-xs text-muted-foreground">
                      Cargo : M:{Number(event.metalCargo).toLocaleString('fr-FR')} C:{Number(event.crystalCargo).toLocaleString('fr-FR')} D:{Number(event.deuteriumCargo).toLocaleString('fr-FR')}
                    </div>
                  )}

                  {isOutbound && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => recallMutation.mutate({ fleetEventId: event.id })}
                      disabled={recallMutation.isPending}
                    >
                      Rappeler
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
