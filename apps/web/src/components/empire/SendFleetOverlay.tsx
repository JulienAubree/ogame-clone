import { useEffect, useMemo, useState } from 'react';
import { Send, Clock, Fuel, Truck, Anchor } from 'lucide-react';
import { trpc } from '@/trpc';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { Button } from '@/components/ui/button';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { getAssetUrl, getPlanetImageUrl } from '@/lib/assets';
import { FlagshipIcon } from '@/lib/icons';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PlanetFleetData } from './empire-types';

export type SendFleetMission = 'transport' | 'station';

interface AvailablePlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  originPlanetId: string;
  originName: string;
  availableShips: PlanetFleetData['ships'];
  availablePlanets: AvailablePlanet[];
  initialMission?: SendFleetMission;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export function SendFleetOverlay({
  open,
  onClose,
  originPlanetId,
  originName,
  availableShips,
  availablePlanets,
  initialMission = 'transport',
}: Props) {
  const utils = trpc.useUtils();
  const [mission, setMission] = useState<SendFleetMission>(initialMission);
  const [targetPlanetId, setTargetPlanetId] = useState<string | null>(
    availablePlanets[0]?.id ?? null,
  );
  const [selectedShips, setSelectedShips] = useState<Record<string, number>>({});
  const [cargo, setCargo] = useState({ minerai: 0, silicium: 0, hydrogene: 0 });

  useEffect(() => {
    if (open) setMission(initialMission);
  }, [open, initialMission]);

  // Stationary ships (e.g. solar satellites) cannot be sent in any mission.
  const sendableShips = useMemo(
    () => availableShips.filter((s) => !s.isStationary),
    [availableShips],
  );

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: originPlanetId },
    { enabled: open },
  );

  const targetPlanet = useMemo(
    () => availablePlanets.find((p) => p.id === targetPlanetId),
    [availablePlanets, targetPlanetId],
  );

  const totalSelected = useMemo(
    () => Object.values(selectedShips).reduce((s, c) => s + c, 0),
    [selectedShips],
  );

  const totalCargoCapacity = useMemo(() => {
    let total = 0;
    for (const ship of sendableShips) {
      const count = selectedShips[ship.id] ?? 0;
      total += count * ship.cargoCapacity;
    }
    return total;
  }, [selectedShips, sendableShips]);

  const cargoUsed = cargo.minerai + cargo.silicium + cargo.hydrogene;
  const cargoOverflow = cargoUsed > totalCargoCapacity;

  const canEstimate = !!targetPlanet && totalSelected > 0;
  const { data: estimate } = trpc.fleet.estimate.useQuery(
    {
      originPlanetId,
      targetGalaxy: targetPlanet?.galaxy ?? 1,
      targetSystem: targetPlanet?.system ?? 1,
      targetPosition: targetPlanet?.position ?? 1,
      ships: selectedShips,
    },
    { enabled: open && canEstimate },
  );

  const sendMutation = trpc.fleet.send.useMutation({
    onSuccess: () => {
      utils.fleet.movements.invalidate();
      utils.fleet.slots.invalidate();
      utils.shipyard.empireOverview.invalidate();
      utils.shipyard.ships.invalidate({ planetId: originPlanetId });
      utils.resource.production.invalidate({ planetId: originPlanetId });
      utils.planet.empire.invalidate();
      onClose();
      setSelectedShips({});
      setCargo({ minerai: 0, silicium: 0, hydrogene: 0 });
    },
  });

  const fuelNeeded = estimate?.fuel ?? 0;
  const minerai = resourceData?.minerai ?? 0;
  const silicium = resourceData?.silicium ?? 0;
  const hydrogene = resourceData?.hydrogene ?? 0;
  const hydrogeneAvailableForCargo = Math.max(0, hydrogene - fuelNeeded);

  const insufficientFuel = canEstimate && fuelNeeded > hydrogene;
  const overflowMinerai = cargo.minerai > minerai;
  const overflowSilicium = cargo.silicium > silicium;
  const overflowHydrogene = cargo.hydrogene > hydrogeneAvailableForCargo;

  const canSubmit =
    canEstimate &&
    !cargoOverflow &&
    !insufficientFuel &&
    !overflowMinerai &&
    !overflowSilicium &&
    !overflowHydrogene &&
    !sendMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit || !targetPlanet) return;
    sendMutation.mutate({
      originPlanetId,
      targetGalaxy: targetPlanet.galaxy,
      targetSystem: targetPlanet.system,
      targetPosition: targetPlanet.position,
      mission,
      ships: selectedShips,
      mineraiCargo: cargo.minerai,
      siliciumCargo: cargo.silicium,
      hydrogeneCargo: cargo.hydrogene,
    });
  };

  const fillMaxResource = (key: 'minerai' | 'silicium' | 'hydrogene') => {
    const currentTotal = cargo.minerai + cargo.silicium + cargo.hydrogene;
    const remaining = Math.max(0, totalCargoCapacity - (currentTotal - cargo[key]));
    const stock = key === 'minerai' ? minerai : key === 'silicium' ? silicium : hydrogeneAvailableForCargo;
    setCargo({ ...cargo, [key]: Math.floor(Math.min(remaining, stock)) });
  };

  return (
    <EntityDetailOverlay open={open} onClose={onClose} title={`Envoyer une flotte — ${originName}`}>
      <div className="p-4 space-y-4">
        {/* Mission picker */}
        <section className="grid grid-cols-2 gap-2">
          <MissionTab
            active={mission === 'transport'}
            onClick={() => setMission('transport')}
            icon={<Truck className="h-4 w-4" />}
            label="Transport"
            hint="Aller-retour avec ressources"
          />
          <MissionTab
            active={mission === 'station'}
            onClick={() => setMission('station')}
            icon={<Anchor className="h-4 w-4" />}
            label="Stationner"
            hint="Flotte reste à destination"
          />
        </section>

        {/* Target picker */}
        <section className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Destination</label>
          {availablePlanets.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucune autre planète disponible.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {availablePlanets.map((p) => {
                const isSelected = p.id === targetPlanetId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setTargetPlanetId(p.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                      isSelected
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border/60 hover:bg-accent/30',
                    )}
                  >
                    {p.planetClassId && p.planetImageIndex != null ? (
                      <img
                        src={getPlanetImageUrl(p.planetClassId, p.planetImageIndex, 'icon')}
                        alt=""
                        className="h-7 w-7 rounded-full border border-border/60 object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full border border-border/60 bg-muted shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className={cn('text-xs font-semibold truncate', isSelected ? 'text-primary' : 'text-foreground')}>{p.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">[{p.galaxy}:{p.system}:{p.position}]</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Ship selection */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Vaisseaux</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, number> = {};
                  for (const ship of sendableShips) next[ship.id] = ship.count;
                  setSelectedShips(next);
                }}
                className="text-[10px] text-primary hover:underline"
              >
                Tout
              </button>
              <span className="text-[10px] text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => setSelectedShips({})}
                className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                Aucun
              </button>
            </div>
          </div>
          {sendableShips.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/40 py-3 text-center text-xs text-muted-foreground/70">
              Aucun vaisseau mobilisable depuis cette planète.
            </div>
          ) : (
          <div className="space-y-1">
            {sendableShips.map((ship) => {
              const value = selectedShips[ship.id] ?? 0;
              const isFlagship = ship.id === 'flagship';
              return (
                <div
                  key={ship.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors',
                    value > 0
                      ? isFlagship
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'border-primary/30 bg-primary/5'
                      : 'border-border/40',
                  )}
                >
                  {isFlagship ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-sm border border-amber-500/40 bg-amber-500/10 shrink-0">
                      <FlagshipIcon width={14} height={14} className="text-amber-400" />
                    </div>
                  ) : (
                    <img
                      src={getAssetUrl('ships', ship.id, 'thumb')}
                      alt=""
                      className="h-6 w-6 rounded-sm object-cover shrink-0"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground truncate">{ship.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Stock <span className="font-mono">{ship.count.toLocaleString('fr-FR')}</span>
                      {ship.cargoCapacity > 0 && <> · Cargo/u <span className="font-mono">{formatCompact(ship.cargoCapacity)}</span></>}
                    </div>
                  </div>
                  <QuantityStepper
                    value={value}
                    onChange={(v) => setSelectedShips({ ...selectedShips, [ship.id]: v })}
                    max={ship.count}
                    min={0}
                  />
                </div>
              );
            })}
          </div>
          )}
        </section>

        {/* Cargo */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Ressources à transporter</label>
            <span className={cn('text-[10px] font-mono', cargoOverflow ? 'text-destructive' : 'text-muted-foreground')}>
              {formatCompact(cargoUsed)} / {formatCompact(totalCargoCapacity)}
            </span>
          </div>
          <CargoInput
            icon={<MineraiIcon className="h-4 w-4" />}
            label="Minerai"
            value={cargo.minerai}
            stock={minerai}
            overflow={overflowMinerai}
            onChange={(v) => setCargo({ ...cargo, minerai: v })}
            onMax={() => fillMaxResource('minerai')}
            disabled={totalCargoCapacity === 0}
          />
          <CargoInput
            icon={<SiliciumIcon className="h-4 w-4" />}
            label="Silicium"
            value={cargo.silicium}
            stock={silicium}
            overflow={overflowSilicium}
            onChange={(v) => setCargo({ ...cargo, silicium: v })}
            onMax={() => fillMaxResource('silicium')}
            disabled={totalCargoCapacity === 0}
          />
          <CargoInput
            icon={<HydrogeneIcon className="h-4 w-4" />}
            label="Hydrogène"
            value={cargo.hydrogene}
            stock={hydrogeneAvailableForCargo}
            stockHint={fuelNeeded > 0 ? `(carburant ${formatCompact(fuelNeeded)} réservé)` : undefined}
            overflow={overflowHydrogene}
            onChange={(v) => setCargo({ ...cargo, hydrogene: v })}
            onMax={() => fillMaxResource('hydrogene')}
            disabled={totalCargoCapacity === 0}
          />
        </section>

        {/* Estimate + submit */}
        <section className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {estimate ? formatDuration(estimate.duration * 1000) : <span className="text-muted-foreground/50">—</span>}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Fuel className="h-3.5 w-3.5" />
              {estimate ? formatCompact(fuelNeeded) : <span className="text-muted-foreground/50">—</span>}
              {insufficientFuel && <span className="text-destructive ml-1">insuffisant</span>}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Send className="h-3.5 w-3.5" />
              <strong className="font-mono text-foreground">{totalSelected.toLocaleString('fr-FR')}</strong> vaisseaux
            </span>
          </div>
          {sendMutation.error && (
            <p className="text-xs text-destructive">{sendMutation.error.message}</p>
          )}
          <Button
            variant="retro"
            className="w-full"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <Send className="h-4 w-4 mr-2" />
            {sendMutation.isPending ? 'Envoi…' : 'Envoyer la flotte'}
          </Button>
        </section>
      </div>
    </EntityDetailOverlay>
  );
}

function MissionTab({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
        active
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border/60 text-muted-foreground hover:bg-accent/30 hover:text-foreground',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {label}
      </span>
      <span className={cn('text-[10px]', active ? 'text-primary/80' : 'text-muted-foreground/70')}>{hint}</span>
    </button>
  );
}

function CargoInput({
  icon,
  label,
  value,
  stock,
  stockHint,
  overflow,
  onChange,
  onMax,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  stock: number;
  stockHint?: string;
  overflow: boolean;
  onChange: (v: number) => void;
  onMax: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1.5">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">
          Stock <span className="font-mono">{Math.floor(stock).toLocaleString('fr-FR')}</span>
          {stockHint && <span className="ml-1">{stockHint}</span>}
        </div>
      </div>
      <input
        type="number"
        min={0}
        value={value || ''}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className={cn(
          'w-24 rounded-md border bg-background px-2 py-1 text-right font-mono text-sm text-foreground',
          overflow ? 'border-destructive' : 'border-border',
        )}
      />
      <button
        type="button"
        onClick={onMax}
        disabled={disabled}
        className="rounded-md border border-border bg-card/40 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
      >
        Max
      </button>
    </div>
  );
}
