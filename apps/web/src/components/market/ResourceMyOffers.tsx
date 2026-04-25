import { ClipboardList } from 'lucide-react';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { useToastStore } from '@/stores/toast.store';
import { cn } from '@/lib/utils';
import {
  RESOURCE_COLORS,
  RESOURCE_GLOWS,
  RESOURCE_CARD_CLASS,
  RESOURCE_LABELS,
  STATUS_STYLES,
  STATUS_LABELS,
  formatPrice,
} from './market-constants';

interface ResourceMyOffersProps {
  planetId: string;
  /** Filter by offer statuses. Shows all statuses when omitted. */
  statuses?: string[];
}

export function ResourceMyOffers({ planetId: _planetId, statuses }: ResourceMyOffersProps) {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);

  const { data: myOffers } = trpc.market.myOffers.useQuery();

  const cancelOfferMutation = trpc.market.cancelOffer.useMutation({
    onSuccess: () => {
      addToast('Offre annulee');
      utils.market.myOffers.invalidate();
      utils.resource.production.invalidate();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const resourceOffers = (myOffers ?? [])
    .filter((o) => o.resourceType != null)
    .filter((o) => !statuses || statuses.includes(o.status));

  return (
    <div>
      {resourceOffers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mb-3 opacity-30" strokeWidth={1.5} />
          <p className="text-sm">Aucune offre.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {resourceOffers.map((offer) => (
            <div
              key={offer.id}
              className={cn(
                'retro-card flex items-center justify-between p-4',
                RESOURCE_CARD_CLASS[offer.resourceType],
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className={cn('font-bold tabular-nums', RESOURCE_COLORS[offer.resourceType], RESOURCE_GLOWS[offer.resourceType])}>
                    {Number(offer.quantity).toLocaleString('fr-FR')}
                  </span>
                  <span className={cn('text-sm font-medium', RESOURCE_COLORS[offer.resourceType])}>
                    {RESOURCE_LABELS[offer.resourceType]}
                  </span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-medium', STATUS_STYLES[offer.status])}>
                    {STATUS_LABELS[offer.status]}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  Prix : {formatPrice(offer.priceMinerai, offer.priceSilicium, offer.priceHydrogene)}
                </div>
              </div>
              <div className="shrink-0 ml-3">
                {offer.status === 'active' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => cancelOfferMutation.mutate({ offerId: offer.id })}
                    disabled={cancelOfferMutation.isPending}
                  >
                    Annuler
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
