import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Layers } from 'lucide-react';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RESOURCE_COLORS,
  RESOURCE_GLOWS,
  RESOURCE_CARD_CLASS,
  RESOURCE_BORDER_ACTIVE,
  RESOURCE_LABELS,
  formatPrice,
} from './market-constants';

interface ResourceBuyProps {
  planetId: string;
}

export function ResourceBuy({ planetId }: ResourceBuyProps) {
  const navigate = useNavigate();
  const [resourceFilter, setResourceFilter] = useState<string | undefined>(undefined);

  const { data: offersData, isFetching: offersLoading } = trpc.market.list.useQuery(
    { planetId, resourceType: resourceFilter as any },
    { enabled: !!planetId },
  );

  const handleBuy = (offer: {
    id: string;
    priceMinerai: number;
    priceSilicium: number;
    priceHydrogene: number;
    sellerCoords: { galaxy: number; system: number; position: number };
  }) => {
    navigate(
      `/fleet/send?mission=trade&galaxy=${offer.sellerCoords.galaxy}&system=${offer.sellerCoords.system}&position=${offer.sellerCoords.position}&tradeId=${offer.id}&cargoMi=${offer.priceMinerai}&cargoSi=${offer.priceSilicium}&cargoH2=${offer.priceHydrogene}`,
    );
  };

  return (
    <div>
      {/* Resource filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setResourceFilter(undefined)}
          className={cn(
            'rounded-md border px-4 py-1.5 text-xs font-medium uppercase tracking-wider transition-all',
            !resourceFilter
              ? 'border-primary/50 text-primary bg-primary/10 shadow-[0_0_8px_rgba(103,212,232,0.15)]'
              : 'border-border text-muted-foreground hover:border-white/20 hover:text-foreground',
          )}
        >
          Tout
        </button>
        {(['minerai', 'silicium', 'hydrogene'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setResourceFilter(r)}
            className={cn(
              'rounded-md border px-4 py-1.5 text-xs font-medium uppercase tracking-wider transition-all',
              resourceFilter === r
                ? cn(RESOURCE_COLORS[r], RESOURCE_BORDER_ACTIVE[r], 'bg-white/5')
                : 'border-border text-muted-foreground hover:border-white/20 hover:text-foreground',
            )}
          >
            {RESOURCE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Offers grid */}
      {offersLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-3" />
          Chargement...
        </div>
      )}
      {!offersLoading && (!offersData?.offers || offersData.offers.length === 0) && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Layers className="h-10 w-10 mb-3 opacity-30" strokeWidth={1.5} />
          <p className="text-sm">Aucune offre disponible</p>
        </div>
      )}
      {!offersLoading && offersData?.offers && offersData.offers.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {offersData.offers.map((offer) => (
            <div
              key={offer.id}
              className={cn('retro-card p-4 flex flex-col gap-3', RESOURCE_CARD_CLASS[offer.resourceType])}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className={cn('text-lg font-bold tabular-nums', RESOURCE_COLORS[offer.resourceType], RESOURCE_GLOWS[offer.resourceType])}>
                    {offer.quantity.toLocaleString('fr-FR')}
                  </span>
                  <span className={cn('ml-1.5 text-sm font-medium', RESOURCE_COLORS[offer.resourceType])}>
                    {RESOURCE_LABELS[offer.resourceType]}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  [{offer.sellerCoords.galaxy}:{offer.sellerCoords.system}:{offer.sellerCoords.position}]
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prix</span>
                  <span className="text-foreground">{formatPrice(offer.priceMinerai, offer.priceSilicium, offer.priceHydrogene)}</span>
                </div>
              </div>

              <Button
                variant="retro"
                size="sm"
                className="w-full mt-auto"
                onClick={() => handleBuy(offer)}
              >
                Acheter
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
