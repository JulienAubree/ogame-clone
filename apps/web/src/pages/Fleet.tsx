import { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { trpc } from '@/trpc';
import { useToastStore } from '@/stores/toast.store';
import { useGameConfig } from '@/hooks/useGameConfig';
import { MissionSelector } from '@/components/fleet/MissionSelector';
import { PveMissionBanner } from '@/components/fleet/PveMissionBanner';
import { FleetComposition } from '@/components/fleet/FleetComposition';
import { FleetSummaryBar } from '@/components/fleet/FleetSummaryBar';
import { MISSION_CONFIG, getCargoCapacity, SHIP_NAMES, type Mission } from '@/config/mission-config';
import { computeSlagRate } from '@ogame-clone/game-engine';

export default function Fleet() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const [searchParams, setSearchParams] = useSearchParams();

  // Core state
  const [mission, setMission] = useState<Mission | null>(null);
  const [target, setTarget] = useState({ galaxy: 1, system: 1, position: 1 });
  const [selectedShips, setSelectedShips] = useState<Record<string, number>>({});
  const [cargo, setCargo] = useState({ minerai: 0, silicium: 0, hydrogene: 0 });
  const [confirmSend, setConfirmSend] = useState(false);

  // PvE mode
  const [pveMissionId, setPveMissionId] = useState<string | null>(null);
  const [pveMode, setPveMode] = useState(false);
  const prefillRef = useRef<{ mission: Mission; galaxy: number; system: number; position: number } | null>(null);

  // Data queries
  const { data: gameConfig } = useGameConfig();
  const { data: ships, isLoading } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: planets } = trpc.planet.list.useQuery();
  const planet = planets?.find((p) => p.id === planetId);

  // URL param handling — runs once on mount
  useEffect(() => {
    const paramMission = searchParams.get('mission') as Mission | null;
    if (!paramMission) return;

    const data = {
      mission: paramMission,
      galaxy: Number(searchParams.get('galaxy')) || 1,
      system: Number(searchParams.get('system')) || 1,
      position: Number(searchParams.get('position')) || 1,
    };

    const paramPveMissionId = searchParams.get('pveMissionId');
    if (paramPveMissionId) {
      setPveMissionId(paramPveMissionId);
      setPveMode(true);
    }

    prefillRef.current = data;
    setTarget({ galaxy: data.galaxy, system: data.system, position: data.position });
    setMission(data.mission);
    setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Default target to current planet coordinates (when no PvE params)
  useEffect(() => {
    if (pveMode || prefillRef.current) return;
    if (planet) {
      setTarget({ galaxy: planet.galaxy, system: planet.system, position: planet.position });
    }
  }, [planet, pveMode]);

  // Auto-select ships when data loads (PvE prefill)
  useEffect(() => {
    if (!ships || !prefillRef.current) return;
    const missionType = prefillRef.current.mission;
    const config = MISSION_CONFIG[missionType];

    if (config.requiredShips) {
      const preselect: Record<string, number> = {};
      for (const shipId of config.requiredShips) {
        const ship = ships.find((s) => s.id === shipId);
        if (ship && ship.count > 0) preselect[shipId] = ship.count;
      }
      setSelectedShips(preselect);
    }

    prefillRef.current = null;
  }, [ships]);

  // Send mutation
  const sendMutation = trpc.fleet.send.useMutation({
    onSuccess: () => {
      addToast('Flotte envoyée !', 'success');
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      navigate('/movements');
    },
  });

  const handleSend = () => {
    if (!mission || !planetId) return;
    sendMutation.mutate({
      originPlanetId: planetId,
      targetGalaxy: target.galaxy,
      targetSystem: target.system,
      targetPosition: target.position,
      mission,
      ships: Object.fromEntries(Object.entries(selectedShips).filter(([, c]) => c > 0)),
      mineraiCargo: cargo.minerai,
      siliciumCargo: cargo.silicium,
      hydrogeneCargo: cargo.hydrogene,
      ...(pveMissionId ? { pveMissionId } : {}),
    });
  };

  const handleShipChange = (shipId: string, count: number) => {
    setSelectedShips((prev) => ({ ...prev, [shipId]: count }));
  };

  const handleMissionChange = (m: Mission) => {
    setMission(m);
    // Reset ships when mission changes (categories shift)
    setSelectedShips({});
  };

  // Validation
  const getValidationError = (): string | null => {
    if (!mission) return 'Sélectionnez une mission';
    if (!target.galaxy || !target.system || !target.position) return 'Destination incomplète';

    const config = MISSION_CONFIG[mission];

    if (config.requiresPveMission && !pveMissionId) {
      return 'Cette mission doit être lancée depuis la page Missions';
    }

    const selected = Object.entries(selectedShips).filter(([, c]) => c > 0);
    if (selected.length === 0) return 'Sélectionnez au moins un vaisseau';

    if (config.requiredShips && !config.recommendedShips) {
      const hasRequired = config.requiredShips.some((id) => (selectedShips[id] ?? 0) > 0);
      if (!hasRequired) {
        const names = config.requiredShips.map((id) => SHIP_NAMES[id] ?? id).join(', ');
        return `Cette mission nécessite : ${names}`;
      }
    }

    if (config.exclusive && config.requiredShips) {
      const hasDisallowed = selected.some(([id]) => !config.requiredShips!.includes(id));
      if (hasDisallowed) return `Cette mission n'autorise que : ${config.requiredShips.map((id) => SHIP_NAMES[id] ?? id).join(', ')}`;
    }

    // Check total cargo does not exceed capacity
    const totalCargo = cargo.minerai + cargo.silicium + cargo.hydrogene;
    if (totalCargo > cargoCapacity) return 'Cargo dépasse la capacité';

    return null;
  };

  // Fleet estimate (fuel + duration)
  const activeShips = Object.fromEntries(Object.entries(selectedShips).filter(([, c]) => c > 0));
  const hasShips = Object.keys(activeShips).length > 0;
  const { data: estimate } = trpc.fleet.estimate.useQuery(
    { originPlanetId: planetId!, targetGalaxy: target.galaxy, targetSystem: target.system, targetPosition: target.position, ships: activeShips },
    { enabled: !!planetId && hasShips && target.galaxy > 0 && target.system > 0 && target.position > 0 },
  );

  const totalCargo = cargo.minerai + cargo.silicium + cargo.hydrogene;
  const cargoCapacity = getCargoCapacity(selectedShips, gameConfig?.ships ?? {});

  // Compute effective cargo for mine missions (slag reduction)
  const { data: researchList } = trpc.research.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId && mission === 'mine' },
  );
  const effectiveCargo = (() => {
    if (mission !== 'mine' || !gameConfig || !researchList) return undefined;
    const refiningLevel = researchList.find((r) => r.id === 'deepSpaceRefining')?.currentLevel ?? 0;
    // Use an average slag rate across resources for the summary display
    const position = target.position as 8 | 16;
    const slagKeys = ['minerai', 'silicium', 'hydrogene'].map((res) => `slag_rate.pos${position}.${res}`);
    const rates = slagKeys.map((key) => Number(gameConfig.universe[key] ?? 0));
    const maxRate = Math.max(...rates);
    if (maxRate === 0) return undefined;
    const slagRate = computeSlagRate(maxRate, refiningLevel);
    return Math.floor(cargoCapacity * (1 - slagRate));
  })();

  const validationError = getValidationError();

  if (isLoading) return <CardGridSkeleton />;

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-4">
      <PageHeader title="Flotte" />

      {/* PvE Mission Banner */}
      {pveMissionId && <PveMissionBanner pveMissionId={pveMissionId} />}

      {/* Mission Selector */}
      <MissionSelector
        selected={mission}
        onChange={handleMissionChange}
        locked={pveMode}
      />

      {/* Destination */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm text-muted-foreground">Cible :</span>
        <Input
          type="number"
          min={1}
          max={9}
          value={target.galaxy}
          onChange={(e) => setTarget((t) => ({ ...t, galaxy: Number(e.target.value) || 1 }))}
          disabled={pveMode}
          className="h-8 w-14 text-center"
        />
        <span className="text-muted-foreground">:</span>
        <Input
          type="number"
          min={1}
          max={499}
          value={target.system}
          onChange={(e) => setTarget((t) => ({ ...t, system: Number(e.target.value) || 1 }))}
          disabled={pveMode}
          className="h-8 w-16 text-center"
        />
        <span className="text-muted-foreground">:</span>
        <Input
          type="number"
          min={1}
          max={16}
          value={target.position}
          onChange={(e) => setTarget((t) => ({ ...t, position: Number(e.target.value) || 1 }))}
          disabled={pveMode}
          className="h-8 w-14 text-center"
        />
        {pveMode && <span className="text-xs text-yellow-500">🔒</span>}
      </div>

      {/* Mission Hint (only in direct mode, not PvE — banner replaces it) */}
      {mission && !pveMode && (
        <div className="rounded-lg border border-blue-800/40 bg-blue-950/30 p-2 text-center text-xs text-blue-300">
          {MISSION_CONFIG[mission].hint}
        </div>
      )}

      {/* Fleet Composition */}
      <FleetComposition
        ships={ships ?? []}
        mission={mission}
        selectedShips={selectedShips}
        onChange={handleShipChange}
      />

      {/* Cargo */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase text-muted-foreground">Cargo</span>
          <span className="text-xs text-muted-foreground">
            {totalCargo.toLocaleString()} / {cargoCapacity.toLocaleString()}
          </span>
        </div>
        <div className="flex gap-2">
          {(['minerai', 'silicium', 'hydrogene'] as const).map((res) => (
            <div key={res} className="flex-1 text-center">
              <div className="mb-1 text-[10px] text-muted-foreground capitalize">{res === 'hydrogene' ? 'Hydrogène' : res.charAt(0).toUpperCase() + res.slice(1)}</div>
              <Input
                type="number"
                min={0}
                value={cargo[res]}
                onChange={(e) => setCargo((c) => ({ ...c, [res]: Math.max(0, Number(e.target.value) || 0) }))}
                className="h-7 text-center text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Validation Error */}
      {validationError && mission && (
        <div className="text-center text-xs text-yellow-400">{validationError}</div>
      )}

      {/* Server Error */}
      {sendMutation.error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {sendMutation.error.message}
        </div>
      )}

      {/* Summary Bar */}
      <FleetSummaryBar
        mission={mission}
        selectedShips={selectedShips}
        totalCargo={totalCargo}
        cargoCapacity={cargoCapacity}
        effectiveCargo={effectiveCargo}
        fuel={hasShips ? (estimate?.fuel ?? null) : null}
        duration={hasShips ? (estimate?.duration ?? null) : null}
        disabled={!!validationError}
        sending={sendMutation.isPending}
        onSend={() => {
          if (mission && MISSION_CONFIG[mission].dangerous) {
            setConfirmSend(true);
          } else {
            handleSend();
          }
        }}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmSend}
        onConfirm={() => { setConfirmSend(false); handleSend(); }}
        onCancel={() => setConfirmSend(false)}
        title={`Confirmer la mission ${mission ? MISSION_CONFIG[mission].label : ''} ?`}
        description={`Vous êtes sur le point d'envoyer votre flotte en mission ${mission ? MISSION_CONFIG[mission].label.toLowerCase() : ''} vers [${target.galaxy}:${target.system}:${target.position}].`}
        variant="destructive"
        confirmLabel="Envoyer"
      />
    </div>
  );
}
