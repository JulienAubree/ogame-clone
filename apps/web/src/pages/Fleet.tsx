import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useSearchParams } from 'react-router';
import { trpc } from '@/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Mission = 'transport' | 'station' | 'spy' | 'attack' | 'colonize' | 'recycle';

const MISSION_LABELS: Record<Mission, string> = {
  transport: 'Transporter',
  station: 'Stationner',
  spy: 'Espionner',
  attack: 'Attaquer',
  colonize: 'Coloniser',
  recycle: 'Recycler',
};

const COMBAT_SHIPS = ['lightFighter', 'heavyFighter', 'cruiser', 'battleship'];

function getMissionValidationError(mission: Mission, selectedShips: Record<string, number>): string | null {
  const hasShip = (id: string) => (selectedShips[id] ?? 0) > 0;

  switch (mission) {
    case 'spy':
      if (!hasShip('espionageProbe')) return 'La mission Espionner nécessite au moins 1 sonde d\'espionnage.';
      return null;
    case 'attack':
      if (!COMBAT_SHIPS.some(hasShip)) return 'La mission Attaquer nécessite au moins 1 vaisseau de combat (chasseur léger, chasseur lourd, croiseur ou vaisseau de bataille).';
      return null;
    case 'recycle': {
      const hasNonRecycler = Object.entries(selectedShips).some(([id, count]) => count > 0 && id !== 'recycler');
      if (!hasShip('recycler')) return 'La mission Recycler nécessite au moins 1 recycleur.';
      if (hasNonRecycler) return 'La mission Recycler n\'autorise que les recycleurs.';
      return null;
    }
    case 'colonize':
      if (!hasShip('colonyShip')) return 'La mission Coloniser nécessite au moins 1 vaisseau de colonisation.';
      return null;
    default:
      return null;
  }
}

export default function Fleet() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();

  const [step, setStep] = useState(1);
  const [selectedShips, setSelectedShips] = useState<Record<string, number>>({});
  const [target, setTarget] = useState({ galaxy: 1, system: 1, position: 1 });
  const [mission, setMission] = useState<Mission>('transport');
  const [cargo, setCargo] = useState({ metal: 0, crystal: 0, deuterium: 0 });
  const [searchParams, setSearchParams] = useSearchParams();
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);

  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const prefillRef = useRef<{ mission: Mission; galaxy: number; system: number; position: number } | null>(null);

  // Read query params once on mount
  useEffect(() => {
    const paramMission = searchParams.get('mission') as Mission | null;
    if (!paramMission) return;

    const data = {
      mission: paramMission,
      galaxy: Number(searchParams.get('galaxy')) || 1,
      system: Number(searchParams.get('system')) || 1,
      position: Number(searchParams.get('position')) || 1,
    };

    prefillRef.current = data;
    setTarget({ galaxy: data.galaxy, system: data.system, position: data.position });
    setMission(data.mission);

    // Clear params from URL
    setSearchParams({}, { replace: true });
  }, []);

  // Auto-select ships and jump to step 2 when ships data loads
  useEffect(() => {
    if (!prefillRef.current || !ships) return;

    if (prefillRef.current.mission === 'recycle') {
      const recyclerData = ships.find((s) => s.id === 'recycler');
      if (!recyclerData || recyclerData.count === 0) {
        setPrefillWarning('Aucun recycleur disponible sur cette planète.');
        prefillRef.current = null;
        return;
      }
      setSelectedShips({ recycler: recyclerData.count });
    }

    setStep(2);
    prefillRef.current = null;
  }, [ships]);

  const sendMutation = trpc.fleet.send.useMutation({
    onSuccess: () => {
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      setStep(1);
      setSelectedShips({});
      setCargo({ metal: 0, crystal: 0, deuterium: 0 });
    },
  });

  const hasShips = Object.values(selectedShips).some((v) => v > 0);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Flotte</h1>

      {/* Step indicators */}
      <div className="flex gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={s === step ? 'text-primary font-bold' : 'text-muted-foreground'}
          >
            Étape {s}
          </span>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sélection des vaisseaux</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ships?.filter((s) => s.count > 0).map((ship) => (
              <div key={ship.id} className="flex items-center gap-3">
                <span className="w-40 text-sm">{ship.name}</span>
                <span className="text-xs text-muted-foreground">({ship.count} dispo)</span>
                <Input
                  type="number"
                  min={0}
                  max={ship.count}
                  value={selectedShips[ship.id] || 0}
                  onChange={(e) =>
                    setSelectedShips({
                      ...selectedShips,
                      [ship.id]: Math.max(0, Math.min(ship.count, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-24"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedShips({ ...selectedShips, [ship.id]: ship.count })}
                >
                  Max
                </Button>
              </div>
            ))}

            {prefillWarning && (
              <p className="text-sm text-orange-400">{prefillWarning}</p>
            )}

            {(!ships || ships.filter((s) => s.count > 0).length === 0) && (
              <p className="text-sm text-muted-foreground">Aucun vaisseau disponible</p>
            )}

            <Button onClick={() => setStep(2)} disabled={!hasShips}>
              Suivant
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destination et mission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Galaxie</label>
                <Input
                  type="number"
                  min={1}
                  max={9}
                  value={target.galaxy}
                  onChange={(e) => setTarget({ ...target, galaxy: Number(e.target.value) || 1 })}
                  className="w-20"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Système</label>
                <Input
                  type="number"
                  min={1}
                  max={499}
                  value={target.system}
                  onChange={(e) => setTarget({ ...target, system: Number(e.target.value) || 1 })}
                  className="w-24"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Position</label>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={target.position}
                  onChange={(e) => setTarget({ ...target, position: Number(e.target.value) || 1 })}
                  className="w-20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Mission</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MISSION_LABELS) as Mission[]).map((m) => (
                  <Button
                    key={m}
                    variant={mission === m ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMission(m)}
                  >
                    {MISSION_LABELS[m]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Retour
              </Button>
              <Button onClick={() => setStep(3)}>
                Suivant
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chargement et confirmation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-1">
              <div>Destination : [{target.galaxy}:{target.system}:{target.position}]</div>
              <div>Mission : {MISSION_LABELS[mission]}</div>
              <div>
                Vaisseaux :{' '}
                {Object.entries(selectedShips)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')}
              </div>
            </div>

            {(mission === 'transport' || mission === 'station') && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Cargo</label>
                <div className="flex gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Métal</label>
                    <Input
                      type="number"
                      min={0}
                      value={cargo.metal}
                      onChange={(e) => setCargo({ ...cargo, metal: Number(e.target.value) || 0 })}
                      className="w-28"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Cristal</label>
                    <Input
                      type="number"
                      min={0}
                      value={cargo.crystal}
                      onChange={(e) => setCargo({ ...cargo, crystal: Number(e.target.value) || 0 })}
                      className="w-28"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Deutérium</label>
                    <Input
                      type="number"
                      min={0}
                      value={cargo.deuterium}
                      onChange={(e) => setCargo({ ...cargo, deuterium: Number(e.target.value) || 0 })}
                      className="w-28"
                    />
                  </div>
                </div>
              </div>
            )}

            {getMissionValidationError(mission, selectedShips) && (
              <p className="text-sm text-destructive">{getMissionValidationError(mission, selectedShips)}</p>
            )}

            {sendMutation.error && (
              <p className="text-sm text-destructive">{sendMutation.error.message}</p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Retour
              </Button>
              <Button
                onClick={() =>
                  sendMutation.mutate({
                    originPlanetId: planetId!,
                    targetGalaxy: target.galaxy,
                    targetSystem: target.system,
                    targetPosition: target.position,
                    mission,
                    ships: selectedShips,
                    metalCargo: cargo.metal,
                    crystalCargo: cargo.crystal,
                    deuteriumCargo: cargo.deuterium,
                  })
                }
                disabled={sendMutation.isPending || !!getMissionValidationError(mission, selectedShips)}
              >
                Envoyer la flotte
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
