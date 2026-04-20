import { useState, useMemo } from 'react';
import { trpc } from '@/trpc';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName } from '@/lib/entity-names';
import { useToastStore } from '@/stores/toast.store';
import { cn } from '@/lib/utils';
import { FlagshipIcon } from '@/lib/icons';

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
                <>
                  <section>
                    <h3 className="mb-1.5 text-sm font-semibold text-foreground">Sauvé</h3>
                    <ul className="space-y-0.5 text-sm text-muted-foreground">
                      {Object.entries(preview.data.ships).map(([shipId, count]) => (
                        <li key={shipId} className="flex items-center gap-1.5">
                          <span>
                            {count}× {getShipName(shipId, gameConfig)}
                          </span>
                          {shipId === 'flagship' && (
                            <span className="inline-flex items-center gap-1 text-energy">
                              <FlagshipIcon width={12} height={12} />
                              <span className="text-[11px]">(vaisseau amiral inclus)</span>
                            </span>
                          )}
                        </li>
                      ))}
                      {preview.data.flagshipIncluded && !('flagship' in preview.data.ships) && (
                        <li className="flex items-center gap-1.5 text-energy">
                          <FlagshipIcon width={12} height={12} />
                          <span>Vaisseau amiral inclus</span>
                        </li>
                      )}
                      <li>
                        Minerai chargé :{' '}
                        <span className="text-minerai">
                          {preview.data.loaded.minerai.toLocaleString('fr-FR')}
                        </span>
                      </li>
                      <li>
                        Silicium chargé :{' '}
                        <span className="text-silicium">
                          {preview.data.loaded.silicium.toLocaleString('fr-FR')}
                        </span>
                      </li>
                      <li>
                        Hydrogène chargé :{' '}
                        <span className="text-hydrogene">
                          {preview.data.loaded.hydrogene.toLocaleString('fr-FR')}
                        </span>
                      </li>
                      <li>
                        Arrivée :{' '}
                        {new Date(preview.data.arrivalTime).toLocaleString('fr-FR')} (
                        {formatDuration(preview.data.travelSeconds)})
                      </li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="mb-1.5 text-sm font-semibold text-foreground">
                      Champ de débris
                    </h3>
                    <ul className="space-y-0.5 text-sm text-muted-foreground">
                      <li>
                        Minerai :{' '}
                        <span className="text-minerai">
                          {preview.data.overflow.minerai.toLocaleString('fr-FR')}
                        </span>
                      </li>
                      <li>
                        Silicium :{' '}
                        <span className="text-silicium">
                          {preview.data.overflow.silicium.toLocaleString('fr-FR')}
                        </span>
                      </li>
                    </ul>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      Un recycleur peut les récupérer — y compris les vôtres.
                    </p>
                  </section>

                  <section>
                    <h3 className="mb-1.5 text-sm font-semibold text-destructive">
                      Perdu définitivement
                    </h3>
                    <ul className="space-y-0.5 text-sm text-muted-foreground">
                      <li>{preview.data.buildingsLost} niveau(x) de bâtiments</li>
                      <li>{preview.data.defensesLost} défense(s)</li>
                      <li>{preview.data.queuesLost} élément(s) en file de construction</li>
                      <li>
                        {preview.data.overflow.hydrogene.toLocaleString('fr-FR')} hydrogène
                        (non récupérable)
                      </li>
                    </ul>
                  </section>

                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-destructive"
                    />
                    <span>J'ai compris ce que je vais perdre.</span>
                  </label>
                </>
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
