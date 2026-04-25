import { useState, useMemo } from 'react';
import { Trash2, Boxes } from 'lucide-react';
import { trpc } from '@/trpc';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName } from '@/lib/entity-names';
import { useToastStore } from '@/stores/toast.store';
import { cn } from '@/lib/utils';
import { BuildingsIcon, DefenseIcon, FleetIcon, FlagshipIcon, ShipyardIcon } from '@/lib/icons';
import { ClockIcon as UtilClockIcon } from '@/components/icons/utility-icons';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { GameImage } from '@/components/common/GameImage';

export interface AbandonModalPlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  status?: string;
}

const BLOCKER_LABELS: Record<string, string> = {
  homeworld: 'La planète-mère ne peut pas être abandonnée.',
  colonizing: "Une colonisation est en cours — elle doit s'achever ou être annulée.",
  inbound_hostile: 'Une flotte hostile est en route vers cette planète.',
  outbound_active: 'Cette planète a une flotte en mission.',
  market_offers: 'Des offres marché actives partent de cette planète.',
  destination_invalid: 'Destination invalide.',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function AbandonColonyModal({
  planet,
  allPlanets,
  open,
  onOpenChange,
}: {
  planet: AbandonModalPlanet;
  allPlanets: AbandonModalPlanet[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const { data: gameConfig } = useGameConfig();
  const addToast = useToastStore((s) => s.addToast);

  const destinations = useMemo(
    () => allPlanets.filter((p) => p.id !== planet.id && p.status === 'active'),
    [allPlanets, planet.id],
  );

  const preview = trpc.planet.abandonPreview.useQuery(
    { planetId: planet.id, destinationPlanetId: destinationId ?? '' },
    { enabled: !!destinationId && step === 2 && open },
  );

  const utils = trpc.useUtils();
  const abandonMutation = trpc.planet.abandon.useMutation({
    onSuccess: () => {
      utils.planet.empire.invalidate();
      utils.planet.list.invalidate();
      utils.colonization.governance.invalidate();
      utils.report.list.invalidate();
      utils.report.unreadCount.invalidate();
      addToast(`Colonie ${planet.name} abandonnée.`, 'success');
      handleClose();
    },
    onError: (err) => {
      addToast(err.message ?? 'Erreur lors de l\u2019abandon.', 'error');
    },
  });

  const handleClose = () => {
    setStep(1);
    setDestinationId(null);
    setConfirmed(false);
    onOpenChange(false);
  };

  const title =
    step === 1
      ? `Abandonner ${planet.name} — destination`
      : `Abandonner ${planet.name} — résumé`;

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sélectionnez la planète de destination pour la flotte de retour.
          </p>
          {destinations.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Aucune autre colonie active.
            </div>
          ) : (
            <div className="space-y-2" role="radiogroup" aria-label="Destination">
              {destinations.map((p) => {
                const selected = destinationId === p.id;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
                      selected
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border hover:bg-accent/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="abandon-destination"
                      value={p.id}
                      checked={selected}
                      onChange={() => setDestinationId(p.id)}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {p.name}
                        {p.planetClassId === 'homeworld' && (
                          <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Capitale
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        [{p.galaxy}:{p.system}:{p.position}]
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose}>
              Annuler
            </Button>
            <Button disabled={!destinationId} onClick={() => setStep(2)}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {preview.isLoading && (
            <div className="text-sm text-muted-foreground">Calcul en cours…</div>
          )}

          {preview.isError && !preview.isLoading && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {preview.error?.message ?? 'Erreur lors du calcul du résumé.'}
            </div>
          )}

          {preview.data && (
            <>
              {preview.data.blockers.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <div className="mb-2 font-semibold">Abandon impossible :</div>
                  <ul className="list-disc space-y-1 pl-5">
                    {preview.data.blockers.map((b) => (
                      <li key={b}>{BLOCKER_LABELS[b] ?? b}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <AbandonSummary
                  preview={preview.data}
                  gameConfig={gameConfig}
                  confirmed={confirmed}
                  onConfirmChange={setConfirmed}
                />
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Retour
            </Button>
            <Button
              variant="destructive"
              disabled={
                !preview.data ||
                preview.data.blockers.length > 0 ||
                !confirmed ||
                abandonMutation.isPending
              }
              onClick={() =>
                destinationId &&
                abandonMutation.mutate({
                  planetId: planet.id,
                  destinationPlanetId: destinationId,
                })
              }
            >
              {abandonMutation.isPending ? 'Abandon…' : 'Abandonner définitivement'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

type PreviewData = {
  blockers: string[];
  ships: Record<string, number>;
  cargoCapacity: number;
  loaded: { minerai: number; silicium: number; hydrogene: number };
  overflow: { minerai: number; silicium: number; hydrogene: number };
  stock: { minerai: number; silicium: number; hydrogene: number };
  travelSeconds: number;
  arrivalTime: string | Date;
  flagshipIncluded: boolean;
  buildingsLost: number;
  defensesLost: number;
  queuesLost: number;
};

function AbandonSummary({
  preview,
  gameConfig,
  confirmed,
  onConfirmChange,
}: {
  preview: PreviewData;
  gameConfig: ReturnType<typeof useGameConfig>['data'];
  confirmed: boolean;
  onConfirmChange: (v: boolean) => void;
}) {
  const shipEntries = Object.entries(preview.ships).filter(([, n]) => n > 0);
  const overflowMinerai = Math.floor(preview.overflow.minerai);
  const overflowSilicium = Math.floor(preview.overflow.silicium);
  const overflowHydrogene = Math.floor(preview.overflow.hydrogene);
  const hasDebris = overflowMinerai > 0 || overflowSilicium > 0;
  const hasLoss =
    preview.buildingsLost > 0 ||
    preview.defensesLost > 0 ||
    preview.queuesLost > 0 ||
    overflowHydrogene > 0;

  return (
    <div className="space-y-3">
      <FleetCard preview={preview} gameConfig={gameConfig} shipEntries={shipEntries} />
      {hasDebris && (
        <DebrisCard minerai={overflowMinerai} silicium={overflowSilicium} />
      )}
      {hasLoss && (
        <LossCard
          buildings={preview.buildingsLost}
          defenses={preview.defensesLost}
          queues={preview.queuesLost}
          hydrogene={overflowHydrogene}
        />
      )}

      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirmChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-destructive"
        />
        <span>J'ai compris ce que je vais perdre.</span>
      </label>
    </div>
  );
}

function Card({
  accent,
  icon,
  title,
  subtitle,
  children,
}: {
  accent: 'success' | 'warning' | 'destructive';
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accentMap = {
    success: { border: 'border-emerald-500/30', stripe: 'bg-emerald-500', text: 'text-emerald-400' },
    warning: { border: 'border-amber-500/30', stripe: 'bg-amber-500', text: 'text-amber-400' },
    destructive: { border: 'border-destructive/40', stripe: 'bg-destructive', text: 'text-destructive' },
  };
  const a = accentMap[accent];
  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-card/40', a.border)}>
      <div className={cn('absolute inset-y-0 left-0 w-1', a.stripe)} />
      <div className="pl-4 pr-3 py-3">
        <div className="mb-2 flex items-center gap-2">
          <span className={a.text}>{icon}</span>
          <h3 className={cn('text-sm font-semibold', a.text)}>{title}</h3>
        </div>
        {subtitle && <div className="mb-2 text-xs text-muted-foreground">{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

function FleetCard({
  preview,
  gameConfig,
  shipEntries,
}: {
  preview: PreviewData;
  gameConfig: ReturnType<typeof useGameConfig>['data'];
  shipEntries: [string, number][];
}) {
  const loaded = preview.loaded;
  const capacity = preview.cargoCapacity;
  const loadedTotal = loaded.minerai + loaded.silicium + loaded.hydrogene;
  const pct = (n: number) => (capacity > 0 ? (n / capacity) * 100 : 0);
  const cargoFull = loadedTotal >= capacity && capacity > 0;

  return (
    <Card
      accent="success"
      icon={<FleetIcon width={16} height={16} />}
      title="Flotte de retour"
      subtitle={
        <div className="flex items-center gap-1.5">
          <UtilClockIcon className="h-3 w-3" />
          <span>
            {new Date(preview.arrivalTime).toLocaleString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' · '}
            {formatDuration(preview.travelSeconds)}
          </span>
        </div>
      }
    >
      {shipEntries.length > 0 && (
        <ul className="mb-3 space-y-1">
          {shipEntries.map(([shipId, count]) => (
            <li key={shipId} className="flex items-center gap-2 text-sm text-foreground">
              {shipId === 'flagship' ? (
                <FlagshipIcon width={16} height={16} className="text-energy shrink-0" />
              ) : (
                <GameImage
                  category="ships"
                  id={shipId}
                  size="icon"
                  alt=""
                  className="h-5 w-5 shrink-0 rounded"
                />
              )}
              <span className="tabular-nums text-muted-foreground w-8 text-right">{count}×</span>
              <span className="truncate">
                {shipId === 'flagship' ? 'Vaisseau amiral' : getShipName(shipId, gameConfig)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {capacity > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Soutes</span>
            <span
              className={cn(
                'tabular-nums font-medium',
                cargoFull ? 'text-amber-400' : 'text-muted-foreground',
              )}
            >
              {Math.floor(loadedTotal).toLocaleString('fr-FR')} /{' '}
              {capacity.toLocaleString('fr-FR')}
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {loaded.minerai > 0 && (
              <div className="bg-minerai" style={{ width: `${pct(loaded.minerai)}%` }} />
            )}
            {loaded.silicium > 0 && (
              <div className="bg-silicium" style={{ width: `${pct(loaded.silicium)}%` }} />
            )}
            {loaded.hydrogene > 0 && (
              <div className="bg-hydrogene" style={{ width: `${pct(loaded.hydrogene)}%` }} />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
            <span className="inline-flex items-center gap-1 text-minerai">
              <MineraiIcon size={10} /> {loaded.minerai.toLocaleString('fr-FR')}
            </span>
            <span className="inline-flex items-center gap-1 text-silicium">
              <SiliciumIcon size={10} /> {loaded.silicium.toLocaleString('fr-FR')}
            </span>
            <span className="inline-flex items-center gap-1 text-hydrogene">
              <HydrogeneIcon size={10} /> {loaded.hydrogene.toLocaleString('fr-FR')}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function DebrisCard({ minerai, silicium }: { minerai: number; silicium: number }) {
  return (
    <Card
      accent="warning"
      icon={<Boxes className="h-4 w-4" />}
      title="Champ de débris"
      subtitle="Récupérable par tout recycleur — y compris les vôtres."
    >
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {minerai > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <MineraiIcon size={14} className="text-minerai" />
            <span className="font-semibold tabular-nums text-minerai">
              {minerai.toLocaleString('fr-FR')}
            </span>
          </span>
        )}
        {silicium > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <SiliciumIcon size={14} className="text-silicium" />
            <span className="font-semibold tabular-nums text-silicium">
              {silicium.toLocaleString('fr-FR')}
            </span>
          </span>
        )}
      </div>
    </Card>
  );
}

function LossCard({
  buildings,
  defenses,
  queues,
  hydrogene,
}: {
  buildings: number;
  defenses: number;
  queues: number;
  hydrogene: number;
}) {
  return (
    <Card accent="destructive" icon={<Trash2 className="h-4 w-4" />} title="Perdu définitivement">
      <ul className="space-y-1 text-sm text-muted-foreground">
        {buildings > 0 && (
          <li className="flex items-center gap-2">
            <BuildingsIcon width={14} height={14} className="text-destructive/80 shrink-0" />
            <span className="tabular-nums text-foreground">{buildings}</span>
            <span>niveau{buildings > 1 ? 'x' : ''} de bâtiments</span>
          </li>
        )}
        {defenses > 0 && (
          <li className="flex items-center gap-2">
            <DefenseIcon width={14} height={14} className="text-destructive/80 shrink-0" />
            <span className="tabular-nums text-foreground">{defenses}</span>
            <span>défense{defenses > 1 ? 's' : ''}</span>
          </li>
        )}
        {queues > 0 && (
          <li className="flex items-center gap-2">
            <ShipyardIcon width={14} height={14} className="text-destructive/80 shrink-0" />
            <span className="tabular-nums text-foreground">{queues}</span>
            <span>élément{queues > 1 ? 's' : ''} en file</span>
          </li>
        )}
        {hydrogene > 0 && (
          <li className="flex items-center gap-2">
            <HydrogeneIcon size={14} className="text-hydrogene/80 shrink-0" />
            <span className="tabular-nums text-hydrogene">
              {hydrogene.toLocaleString('fr-FR')}
            </span>
            <span>hydrogène (non récupérable)</span>
          </li>
        )}
      </ul>
    </Card>
  );
}

