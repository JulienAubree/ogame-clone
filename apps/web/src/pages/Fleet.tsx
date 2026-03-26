import { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router';
import { Input } from '@/components/ui/input';
import { CoordinateInput } from '@/components/common/CoordinateInput';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { trpc } from '@/trpc';
import { useToastStore } from '@/stores/toast.store';
import { useGameConfig } from '@/hooks/useGameConfig';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { MissionSelector } from '@/components/fleet/MissionSelector';
import { PveMissionBanner } from '@/components/fleet/PveMissionBanner';
import { FleetComposition } from '@/components/fleet/FleetComposition';
import { FleetSummaryBar } from '@/components/fleet/FleetSummaryBar';
import { TargetContactsDropdown } from '@/components/fleet/TargetContactsDropdown';
import { getCargoCapacity, type Mission } from '@/config/mission-config';
import { getShipName } from '@/lib/entity-names';
import { computeSlagRate, miningDuration, resolveBonus } from '@ogame-clone/game-engine';
import { cn } from '@/lib/utils';

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

  // Trade mode
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [tradeMode, setTradeMode] = useState(false);
  const prefillRef = useRef<{ mission: Mission; galaxy: number; system: number; position: number } | null>(null);

  // Data queries
  const { data: gameConfig } = useGameConfig();
  const { data: ships, isLoading } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const { data: fleetSlots } = trpc.fleet.slots.useQuery();

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

    const paramTradeId = searchParams.get('tradeId');
    if (paramTradeId) {
      setTradeId(paramTradeId);
      setTradeMode(true);
      const cargoMi = Number(searchParams.get('cargoMi')) || 0;
      const cargoSi = Number(searchParams.get('cargoSi')) || 0;
      const cargoH2 = Number(searchParams.get('cargoH2')) || 0;
      setCargo({ minerai: cargoMi, silicium: cargoSi, hydrogene: cargoH2 });
    }

    prefillRef.current = data;
    setTarget({ galaxy: data.galaxy, system: data.system, position: data.position });
    setMission(data.mission);
    setSearchParams({}, { replace: true });
  }, []);

  // Pre-fill ships from stationed fleet page (ship_xxx params)
  useEffect(() => {
    const shipParams: Record<string, number> = {};
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith('ship_')) {
        const shipId = key.replace('ship_', '');
        const count = Number(value);
        if (count > 0) shipParams[shipId] = count;
      }
    }
    if (Object.keys(shipParams).length > 0) {
      setSelectedShips(shipParams);
    }
  }, []); // Run once on mount

  // Default target to current planet coordinates (when no PvE params)
  useEffect(() => {
    if (pveMode || tradeMode || prefillRef.current) return;
    if (planet) {
      setTarget({ galaxy: planet.galaxy, system: planet.system, position: planet.position });
    }
  }, [planet, pveMode]);

  // Auto-select ships when data loads (PvE prefill)
  useEffect(() => {
    if (!ships || !prefillRef.current) return;
    const missionType = prefillRef.current.mission;
    const config = gameConfig?.missions[missionType];

    if (config?.requiredShipRoles) {
      const preselect: Record<string, number> = {};
      for (const shipId of config.requiredShipRoles) {
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
      utils.fleet.slots.invalidate();
      navigate('/fleet/movements');
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
      ...(tradeId ? { tradeId } : {}),
    });
  };

  const handleShipChange = (shipId: string, count: number) => {
    setSelectedShips((prev) => ({ ...prev, [shipId]: count }));
  };

  const handleMissionChange = (m: Mission) => {
    setMission(m);
  };

  // Validation
  const getValidationError = (): string | null => {
    if (!mission) return 'Sélectionnez une mission';
    if (fleetSlots && fleetSlots.current >= fleetSlots.max) return `Nombre max de flottes atteint (${fleetSlots.max}). Améliorez Technologie informatique.`;
    if (!target.galaxy || !target.system || !target.position) return 'Destination incomplète';

    const config = gameConfig?.missions[mission];

    if (config?.requiresPveMission && !pveMissionId) {
      return 'Cette mission doit être lancée depuis la page Missions';
    }

    const selected = Object.entries(selectedShips).filter(([, c]) => c > 0);
    if (selected.length === 0) return 'Sélectionnez au moins un vaisseau';

    if (config?.requiredShipRoles && !config.recommendedShipRoles) {
      const hasRequired = config.requiredShipRoles.some((id) => (selectedShips[id] ?? 0) > 0);
      if (!hasRequired) {
        const names = config.requiredShipRoles.map((id) => getShipName(id)).join(', ');
        return `Cette mission nécessite : ${names}`;
      }
    }

    if (config?.exclusive && config.requiredShipRoles) {
      const hasDisallowed = selected.some(([id]) => !config.requiredShipRoles!.includes(id));
      if (hasDisallowed) return `Cette mission n'autorise que : ${config.requiredShipRoles.map((id) => getShipName(id)).join(', ')}`;
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

  // Mining-specific stats
  const { data: researchList } = trpc.research.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId && mission === 'mine' },
  );
  const miningStats = (() => {
    if (mission !== 'mine' || !gameConfig || !researchList) return undefined;

    // Extraction capacity
    const baseExtraction = Object.entries(selectedShips).reduce((sum, [id, count]) => {
      const stats = gameConfig.ships[id];
      return sum + (stats?.miningExtraction ?? 0) * count;
    }, 0);
    const extractionMultiplier = resolveBonus(
      'mining_extraction', null,
      Object.fromEntries(researchList.map((r) => [r.id, r.currentLevel])),
      gameConfig.bonuses,
    );
    const fleetExtraction = Math.floor(baseExtraction * extractionMultiplier);

    // Slag rate
    const refiningLevel = researchList.find((r) => r.id === 'deepSpaceRefining')?.currentLevel ?? 0;
    const position = target.position as 8 | 16;
    const baseSlagRate = Number(gameConfig.universe[`slag_rate.pos${position}`] ?? 0);
    const decayBase = Number(gameConfig.universe.pve_slag_decay_base) || 0.85;
    const maxRate = Number(gameConfig.universe.pve_slag_max_rate) || 0.99;
    const slagRate = computeSlagRate(baseSlagRate, refiningLevel, { decayBase, maxRate });

    // Effective cargo (after slag)
    const effectiveCargo = Math.floor(cargoCapacity * (1 - slagRate));

    // What the fleet will actually bring back per cycle
    const maxPerCycle = Math.min(fleetExtraction, effectiveCargo);

    // Mining duration estimate
    const mineDuration = miningDuration(cargoCapacity, fleetExtraction, 1);

    return {
      fleetExtraction,
      extractionBonus: extractionMultiplier > 1 ? Math.round((extractionMultiplier - 1) * 100) : 0,
      slagRate,
      effectiveCargo: slagRate > 0 ? effectiveCargo : undefined,
      maxPerCycle,
      mineDuration,
    };
  })();

  const validationError = getValidationError();

  if (isLoading) return <CardGridSkeleton />;

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-4">
      <Breadcrumb segments={[
        { label: 'Flotte', path: '/fleet' },
        { label: 'Envoyer une flotte', path: '/fleet/send' },
      ]} />
      <div className="flex items-center justify-between">
        <PageHeader title="Flotte" />
        {fleetSlots && (
          <span className={cn(
            'text-xs font-mono px-2 py-1 rounded border',
            fleetSlots.current >= fleetSlots.max
              ? 'text-destructive border-destructive/30 bg-destructive/10'
              : 'text-muted-foreground border-border bg-card/60',
          )}>
            Flottes : {fleetSlots.current}/{fleetSlots.max}
          </span>
        )}
      </div>

      {/* PvE Mission Banner */}
      {pveMissionId && <PveMissionBanner pveMissionId={pveMissionId} />}

      {/* Mission Selector */}
      <MissionSelector
        selected={mission}
        onChange={handleMissionChange}
        locked={pveMode || tradeMode}
      />

      {/* Destination */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm text-muted-foreground">Cible</span>
        <CoordinateInput
          galaxy={target.galaxy}
          system={target.system}
          position={target.position}
          onChange={setTarget}
          disabled={pveMode || tradeMode}
        />
        {!(pveMode || tradeMode) && (
          <TargetContactsDropdown onSelect={setTarget} />
        )}
      </div>

      {/* Mission Hint (only in direct mode, not PvE — banner replaces it) */}
      {mission && !pveMode && (
        <div className="rounded-lg border border-blue-800/40 bg-blue-950/30 p-2 text-center text-xs text-blue-300">
          {gameConfig?.missions[mission]?.hint ?? ''}
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
                readOnly={tradeMode}
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
        miningStats={miningStats}
        fuel={hasShips ? (estimate?.fuel ?? null) : null}
        duration={hasShips ? (estimate?.duration ?? null) : null}
        disabled={!!validationError}
        sending={sendMutation.isPending}
        onSend={() => {
          if (mission && gameConfig?.missions[mission]?.dangerous) {
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
        title={`Confirmer la mission ${mission ? (gameConfig?.missions[mission]?.label ?? '') : ''} ?`}
        description={`Vous êtes sur le point d'envoyer votre flotte en mission ${mission ? (gameConfig?.missions[mission]?.label ?? '').toLowerCase() : ''} vers [${target.galaxy}:${target.system}:${target.position}].`}
        variant="destructive"
        confirmLabel="Envoyer"
      />
    </div>
  );
}
