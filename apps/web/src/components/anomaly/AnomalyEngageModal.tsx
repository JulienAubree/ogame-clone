import { useMemo, useState } from 'react';
import { X, Zap } from 'lucide-react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useExilium } from '@/hooks/useExilium';
import { Button } from '@/components/ui/button';
import { useToastStore } from '@/stores/toast.store';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
import { AnomalyIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AnomalyEngageModal({ open, onClose }: Props) {
  const { data: gameConfig } = useGameConfig();
  const { data: planets } = trpc.planet.list.useQuery();
  const { data: flagship } = trpc.flagship.get.useQuery();
  const { data: exilium } = useExilium();
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);

  const cost = Number(gameConfig?.universe?.anomaly_entry_cost_exilium ?? 5);
  const flagshipPlanet = useMemo(
    () => planets?.find((p) => p.id === flagship?.planetId),
    [planets, flagship?.planetId],
  );

  const { data: shipsList } = trpc.shipyard.ships.useQuery(
    { planetId: flagshipPlanet?.id ?? '' },
    { enabled: !!flagshipPlanet?.id && open },
  );
  const shipsCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of shipsList ?? []) m[s.id] = s.count;
    return m;
  }, [shipsList]);

  const [selected, setSelected] = useState<Record<string, number>>({});

  const engageMutation = trpc.anomaly.engage.useMutation({
    onSuccess: () => {
      utils.anomaly.current.invalidate();
      utils.exilium.getBalance.invalidate();
      utils.flagship.get.invalidate();
      if (flagshipPlanet) {
        utils.shipyard.ships.invalidate({ planetId: flagshipPlanet.id });
      }
      addToast('Anomalie ouverte — votre flotte plonge dans la singularité', 'success');
      setSelected({});
      onClose();
    },
    onError: (err) => addToast(err.message ?? "Impossible d'engager l'anomalie", 'error'),
  });

  if (!open) return null;

  const flagshipReady = !!flagship && flagship.status === 'active';
  const enoughExilium = (exilium?.balance ?? 0) >= cost;
  const onFlagshipPlanet = !!flagshipPlanet;
  const blockingMessage = !flagshipReady
    ? 'Vaisseau amiral indisponible (réparation, déjà en mission, etc.)'
    : !onFlagshipPlanet
      ? "Vaisseau amiral introuvable sur l'une de vos planètes"
      : !enoughExilium
        ? `Solde Exilium insuffisant (${exilium?.balance ?? 0}/${cost})`
        : null;

  const shipDefs = gameConfig?.ships ?? {};
  // Only combat ships are allowed in an anomaly (matches server-side whitelist)
  const cargoShipIds = Object.entries(shipDefs)
    .filter(([_id, def]) => (def as { role?: string })?.role === 'combat')
    .map(([id]) => id);

  const totalShipsSelected = Object.values(selected).reduce((s, c) => s + c, 0);

  function setShipCount(shipId: string, value: number) {
    const available = shipsCounts[shipId] ?? 0;
    const clamped = Math.max(0, Math.min(value, available));
    setSelected((prev) => ({ ...prev, [shipId]: clamped }));
  }

  function handleEngage() {
    if (!flagshipPlanet || !!blockingMessage) return;
    engageMutation.mutate({ ships: selected });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <AnomalyIcon className="h-5 w-5 text-violet-300" />
            <h2 className="text-lg font-bold text-foreground">Anomalie Gravitationnelle</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 text-sm">
          {/* Cost + flagship status */}
          <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Coût d'entrée</span>
              <span className="flex items-center gap-1 font-semibold">
                <ExiliumIcon size={14} className="text-purple-400" />
                <span className="text-purple-300">{cost}</span>
                <span className="text-[11px] text-muted-foreground/70">(remboursé si vous rentrez)</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Vaisseau amiral</span>
              <span className={cn('font-semibold', flagshipReady ? 'text-emerald-400' : 'text-amber-400')}>
                {flagshipReady ? '✓ Disponible' : '✗ Indisponible'}
              </span>
            </div>
            {flagshipPlanet && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Origine</span>
                <span>{flagshipPlanet.name} [{flagshipPlanet.galaxy}:{flagshipPlanet.system}:{flagshipPlanet.position}]</span>
              </div>
            )}
          </div>

          {/* Ship selection */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Composition de flotte
            </h3>
            {!shipsList ? (
              <div className="text-xs text-muted-foreground">Chargement...</div>
            ) : (
              <div className="space-y-2">
                {cargoShipIds.map((shipId) => {
                  const available = shipsCounts[shipId] ?? 0;
                  if (available === 0) return null;
                  const def = shipDefs[shipId];
                  if (!def) return null;
                  const value = selected[shipId] ?? 0;
                  return (
                    <div key={shipId} className="flex items-center justify-between gap-2">
                      <span className="flex-1 text-foreground/90">{def.name ?? shipId}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">disp. {available}</span>
                      <input
                        type="number"
                        min={0}
                        max={available}
                        value={value || ''}
                        placeholder="0"
                        onChange={(e) => setShipCount(shipId, Math.floor(Number(e.target.value) || 0))}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShipCount(shipId, available)}
                        className="rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent"
                      >
                        Max
                      </button>
                    </div>
                  );
                })}
                <div className="border-t border-border/30 pt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Vaisseau amiral</span>
                  <span className="text-foreground font-semibold">+ 1 (obligatoire)</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/80">
            ⚠️ Une fois engagés, ces vaisseaux sont bloqués jusqu'au retour. Si la flotte est anéantie en combat, tout est perdu (cargo, vaisseaux, Exilium).
          </div>

          {blockingMessage && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
              {blockingMessage}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {totalShipsSelected} vaisseaux sélectionnés (+ vaisseau amiral)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button
                onClick={handleEngage}
                disabled={!!blockingMessage || engageMutation.isPending}
              >
                <Zap className="h-3.5 w-3.5 mr-1" />
                Engager — {cost} Exilium
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
