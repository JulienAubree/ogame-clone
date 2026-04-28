import { useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronLeft } from 'lucide-react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useOutsideClick } from '@/hooks/useOutsideClick';
import { useToastStore } from '@/stores/toast.store';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { formatNumber } from '@/lib/format';
import { packCargos } from '@/lib/cargo-pack';
import { cn } from '@/lib/utils';

interface Props {
  targetPlanetId: string;
  size?: 'sm' | 'md';
}

type Resources = { minerai: number; silicium: number; hydrogene: number };

export function ImportResourcesButton({ targetPlanetId, size = 'md' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, open, () => setOpen(false));

  const { data: gameConfig } = useGameConfig();
  const { data: summaries } = trpc.planet.summaries.useQuery(undefined, { enabled: open });
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);

  const target = summaries?.find((s) => s.id === targetPlanetId);
  const sources = useMemo(() => {
    if (!summaries) return [];
    return summaries
      .filter((s) => s.id !== targetPlanetId)
      .sort((a, b) => (b.minerai + b.silicium + b.hydrogene) - (a.minerai + a.silicium + a.hydrogene));
  }, [summaries, targetPlanetId]);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [cargo, setCargo] = useState<Resources>({ minerai: 0, silicium: 0, hydrogene: 0 });

  const source = sources.find((s) => s.id === selectedSourceId) ?? null;

  const shipStats = useMemo(() => {
    if (!gameConfig) return {};
    const out: Record<string, { cargoCapacity: number }> = {};
    for (const [id, def] of Object.entries(gameConfig.ships)) {
      out[id] = { cargoCapacity: (def as { cargoCapacity: number }).cargoCapacity };
    }
    return out;
  }, [gameConfig]);

  const totalCargo = cargo.minerai + cargo.silicium + cargo.hydrogene;
  const pack = useMemo(() => {
    if (!source) return { picked: {} as Record<string, number>, coveredCargo: 0 };
    return packCargos(totalCargo, source.ships, shipStats);
  }, [source, totalCargo, shipStats]);

  const cargoOverflow = totalCargo > (source?.cargoCapacity ?? 0);

  const sendMutation = trpc.fleet.send.useMutation({
    onSuccess: () => {
      utils.fleet.movements.invalidate();
      utils.fleet.slots.invalidate();
      utils.shipyard.empireOverview.invalidate();
      utils.planet.empire.invalidate();
      utils.planet.summaries.invalidate();
      if (source) {
        utils.shipyard.ships.invalidate({ planetId: source.id });
        utils.resource.production.invalidate({ planetId: source.id });
      }
      addToast(
        source ? `Transport envoyé depuis ${source.name}` : 'Transport envoyé',
        'success',
        '/fleet?tab=movements',
      );
      reset();
    },
    onError: (err) => {
      addToast(err.message ?? 'Erreur lors de l\'envoi du transport', 'error');
    },
  });

  function reset() {
    setOpen(false);
    setSelectedSourceId(null);
    setCargo({ minerai: 0, silicium: 0, hydrogene: 0 });
  }

  function pickSource(id: string) {
    const next = sources.find((s) => s.id === id);
    if (!next) return;
    setSelectedSourceId(id);
    // Pré-remplit chaque ressource au max possible (cap par cargo total)
    const remaining = next.cargoCapacity;
    const total = next.minerai + next.silicium + next.hydrogene;
    if (total === 0 || remaining === 0) {
      setCargo({ minerai: 0, silicium: 0, hydrogene: 0 });
      return;
    }
    if (total <= remaining) {
      setCargo({ minerai: next.minerai, silicium: next.silicium, hydrogene: next.hydrogene });
      return;
    }
    // Cargo limité : on répartit proportionnellement
    const ratio = remaining / total;
    setCargo({
      minerai: Math.floor(next.minerai * ratio),
      silicium: Math.floor(next.silicium * ratio),
      hydrogene: Math.floor(next.hydrogene * ratio),
    });
  }

  function setResource(key: keyof Resources, value: number) {
    if (!source) return;
    const stock = source[key];
    const otherTotal = totalCargo - cargo[key];
    const remainingCargo = Math.max(0, source.cargoCapacity - otherTotal);
    const clamped = Math.max(0, Math.min(value, stock, remainingCargo));
    setCargo({ ...cargo, [key]: clamped });
  }

  function handleSubmit() {
    if (!source || !target || totalCargo === 0) return;
    // Cap final côté client (sécurité, le helper rend les montants si jamais ils dépassaient)
    const finalCargo = cargoOverflow
      ? capProportional(cargo, source.cargoCapacity)
      : cargo;
    sendMutation.mutate({
      originPlanetId: source.id,
      targetGalaxy: target.galaxy,
      targetSystem: target.system,
      targetPosition: target.position,
      mission: 'transport',
      ships: pack.picked,
      mineraiCargo: finalCargo.minerai,
      siliciumCargo: finalCargo.silicium,
      hydrogeneCargo: finalCargo.hydrogene,
    });
  }

  const triggerSize = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const showButton = (summaries?.length ?? 0) >= 2 || !summaries; // affichage spéculatif tant que pas chargé

  if (!showButton) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Importer des ressources depuis une autre planète"
        aria-label="Importer des ressources"
        className={cn(
          'inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors',
          triggerSize,
          open && 'bg-accent/60 text-foreground',
        )}
      >
        <ArrowDownToLine className={iconSize} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-x-2 top-16 z-50 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1.5 sm:w-80 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-card/95 backdrop-blur-lg shadow-lg animate-slide-up">
          {!selectedSourceId ? (
            <SourcePicker
              sources={sources}
              loading={!summaries}
              onPick={pickSource}
              onClose={() => setOpen(false)}
            />
          ) : source ? (
            <SourceDetail
              source={source}
              targetName={target?.name ?? 'cette planète'}
              cargo={cargo}
              setResource={setResource}
              pack={pack}
              cargoOverflow={cargoOverflow}
              onBack={() => setSelectedSourceId(null)}
              onSubmit={handleSubmit}
              isPending={sendMutation.isPending}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SourcePickerProps {
  sources: Array<{
    id: string; name: string; galaxy: number; system: number; position: number;
    minerai: number; silicium: number; hydrogene: number; cargoCapacity: number;
  }>;
  loading: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}

function SourcePicker({ sources, loading, onPick, onClose }: SourcePickerProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <span className="text-xs font-semibold text-foreground">Importer depuis...</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Fermer
        </button>
      </div>
      {loading ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">Chargement...</div>
      ) : sources.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          Aucune autre planète disponible.
        </div>
      ) : (
        <ul className="divide-y divide-border/30">
          {sources.map((s) => {
            const total = s.minerai + s.silicium + s.hydrogene;
            const noCargo = s.cargoCapacity === 0;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s.id)}
                  className={cn(
                    'w-full px-3 py-2 text-left transition-colors hover:bg-accent',
                    noCargo && 'opacity-60',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      [{s.galaxy}:{s.system}:{s.position}]
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                    <span className="text-minerai">{formatNumber(s.minerai)}</span>
                    <span className="text-silicium">{formatNumber(s.silicium)}</span>
                    <span className="text-hydrogene">{formatNumber(s.hydrogene)}</span>
                    <span className="ml-auto text-[10px]">
                      {noCargo ? 'aucun cargo' : `cargo ${formatNumber(s.cargoCapacity)}`}
                    </span>
                  </div>
                  {total === 0 && !noCargo && (
                    <div className="text-[10px] text-amber-400/80">Stock vide</div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

interface SourceDetailProps {
  source: {
    id: string; name: string; minerai: number; silicium: number; hydrogene: number;
    cargoCapacity: number;
  };
  targetName: string;
  cargo: Resources;
  setResource: (k: keyof Resources, v: number) => void;
  pack: { picked: Record<string, number>; coveredCargo: number };
  cargoOverflow: boolean;
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

function SourceDetail({ source, targetName, cargo, setResource, pack, cargoOverflow, onBack, onSubmit, isPending }: SourceDetailProps) {
  const totalCargo = cargo.minerai + cargo.silicium + cargo.hydrogene;
  const canSubmit = !isPending && totalCargo > 0 && pack.coveredCargo > 0;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground" aria-label="Retour">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs">
          <span className="font-semibold text-foreground">{source.name}</span>
          <span className="text-muted-foreground"> → {targetName}</span>
        </div>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <ResourceLine
          label="Minerai" icon={<MineraiIcon size={12} className="text-minerai" />}
          stock={source.minerai} value={cargo.minerai}
          onChange={(v) => setResource('minerai', v)}
        />
        <ResourceLine
          label="Silicium" icon={<SiliciumIcon size={12} className="text-silicium" />}
          stock={source.silicium} value={cargo.silicium}
          onChange={(v) => setResource('silicium', v)}
        />
        <ResourceLine
          label="Hydrogène" icon={<HydrogeneIcon size={12} className="text-hydrogene" />}
          stock={source.hydrogene} value={cargo.hydrogene}
          onChange={(v) => setResource('hydrogene', v)}
        />

        <div className="border-t border-border/30 pt-2 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Cargo :</span>
            <span className={cn('tabular-nums', cargoOverflow ? 'text-amber-400' : 'text-foreground')}>
              {formatNumber(totalCargo)} / {formatNumber(source.cargoCapacity)}
            </span>
          </div>
          {Object.keys(pack.picked).length > 0 && (
            <div className="mt-1 text-[10px] text-muted-foreground/80">
              → {Object.entries(pack.picked).map(([id, n]) => `${n} ${id}`).join(' + ')}
            </div>
          )}
          {cargoOverflow && (
            <div className="mt-1 text-[10px] text-amber-400">
              Cargo limité : les montants seront capés à l'envoi.
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/40 px-3 py-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(
            'w-full rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            canSubmit
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {isPending ? 'Envoi...' : 'Envoyer le transport'}
        </button>
      </div>
    </>
  );
}

interface ResourceLineProps {
  label: string;
  icon: React.ReactNode;
  stock: number;
  value: number;
  onChange: (v: number) => void;
}

function ResourceLine({ label, icon, stock, value, onChange }: ResourceLineProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">stock {formatNumber(stock)}</span>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={stock}
          value={value || ''}
          placeholder="0"
          onChange={(e) => onChange(Math.floor(Number(e.target.value) || 0))}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => onChange(0)}
          className="rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => onChange(stock)}
          className="rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
        >
          Max
        </button>
      </div>
    </div>
  );
}

function capProportional(cargo: Resources, max: number): Resources {
  const total = cargo.minerai + cargo.silicium + cargo.hydrogene;
  if (total <= max || total === 0) return cargo;
  const ratio = max / total;
  return {
    minerai: Math.floor(cargo.minerai * ratio),
    silicium: Math.floor(cargo.silicium * ratio),
    hydrogene: Math.floor(cargo.hydrogene * ratio),
  };
}
