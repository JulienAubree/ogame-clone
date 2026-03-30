import { useState } from 'react';
import { useNavigate, useOutletContext, Link } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { cn } from '@/lib/utils';

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

const RESOURCE_GLOWS: Record<string, string> = {
  minerai: 'glow-minerai',
  silicium: 'glow-silicium',
  hydrogene: 'glow-hydrogene',
};

const RESOURCE_CARD_CLASS: Record<string, string> = {
  minerai: 'retro-card-minerai',
  silicium: 'retro-card-silicium',
  hydrogene: 'retro-card-hydrogene',
};

const RESOURCE_BORDER_ACTIVE: Record<string, string> = {
  minerai: 'border-orange-400/50 shadow-[0_0_8px_rgba(251,146,60,0.15)]',
  silicium: 'border-emerald-400/50 shadow-[0_0_8px_rgba(52,211,153,0.15)]',
  hydrogene: 'border-blue-400/50 shadow-[0_0_8px_rgba(96,165,250,0.15)]',
};

const RESOURCE_LABELS: Record<string, string> = {
  minerai: 'Minerai',
  silicium: 'Silicium',
  hydrogene: 'Hydrogene',
};

type Tab = 'buy' | 'sell' | 'my';

export default function Market() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const { data: gameConfig } = useGameConfig();
  const [tab, setTab] = useState<Tab>('buy');
  const [resourceFilter, setResourceFilter] = useState<string | undefined>(undefined);

  // Sell form state
  const [sellResource, setSellResource] = useState<'minerai' | 'silicium' | 'hydrogene'>('minerai');
  const [sellQuantity, setSellQuantity] = useState(0);
  const [sellPriceMinerai, setSellPriceMinerai] = useState(0);
  const [sellPriceSilicium, setSellPriceSilicium] = useState(0);
  const [sellPriceHydrogene, setSellPriceHydrogene] = useState(0);

  const commissionPercent = Number(gameConfig?.universe?.market_commission_percent) || 5;

  // Check if galacticMarket is built
  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const marketLevel = buildings?.find((b) => b.id === 'galacticMarket')?.currentLevel ?? 0;

  // Queries
  const { data: offersData, isFetching: offersLoading } = trpc.market.list.useQuery(
    { planetId: planetId!, resourceType: resourceFilter as any },
    { enabled: !!planetId && tab === 'buy' },
  );
  const { data: myOffers } = trpc.market.myOffers.useQuery(
    undefined,
    { enabled: tab === 'my' },
  );

  // Mutations
  const createOfferMutation = trpc.market.createOffer.useMutation({
    onSuccess: () => {
      addToast('Offre creee !');
      utils.market.myOffers.invalidate();
      utils.resource.production.invalidate();
      setSellQuantity(0);
      setSellPriceMinerai(0);
      setSellPriceSilicium(0);
      setSellPriceHydrogene(0);
      setTab('my');
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const cancelOfferMutation = trpc.market.cancelOffer.useMutation({
    onSuccess: () => {
      addToast('Offre annulee');
      utils.market.myOffers.invalidate();
      utils.resource.production.invalidate();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const handleCreateOffer = () => {
    if (!planetId) return;
    createOfferMutation.mutate({
      planetId,
      resourceType: sellResource,
      quantity: sellQuantity,
      priceMinerai: sellPriceMinerai,
      priceSilicium: sellPriceSilicium,
      priceHydrogene: sellPriceHydrogene,
    });
  };

  const handleBuy = (offer: {
    id: string;
    priceMinerai: number;
    priceSilicium: number;
    priceHydrogene: number;
    sellerCoords: { galaxy: number; system: number; position: number };
  }) => {
    if (!planetId) return;
    navigate(`/fleet/send?mission=trade&galaxy=${offer.sellerCoords.galaxy}&system=${offer.sellerCoords.system}&position=${offer.sellerCoords.position}&tradeId=${offer.id}&cargoMi=${offer.priceMinerai}&cargoSi=${offer.priceSilicium}&cargoH2=${offer.priceHydrogene}`);
  };

  const formatPrice = (mi: number, si: number, h2: number) => {
    const parts: string[] = [];
    if (mi > 0) parts.push(`${mi.toLocaleString('fr-FR')} Mi`);
    if (si > 0) parts.push(`${si.toLocaleString('fr-FR')} Si`);
    if (h2 > 0) parts.push(`${h2.toLocaleString('fr-FR')} H2`);
    return parts.join(' + ') || '0';
  };

  const STATUS_STYLES: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    reserved: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    sold: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    expired: 'bg-red-500/20 text-red-400 border border-red-500/30',
    cancelled: 'bg-white/5 text-muted-foreground border border-white/10',
  };

  const STATUS_LABELS: Record<string, string> = {
    active: 'Active',
    reserved: 'Reservee',
    sold: 'Vendue',
    expired: 'Expiree',
    cancelled: 'Annulee',
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Marche Galactique" />

      {buildings && marketLevel < 1 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="h-12 w-12 mb-4 text-muted-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-sm text-muted-foreground mb-2">
            Avant de pouvoir acceder au marche, veuillez construire le <span className="text-foreground font-semibold">Marche Galactique</span>.
          </p>
          <Link to="/buildings" className="text-xs text-primary hover:underline">
            Aller aux batiments
          </Link>
        </div>
      ) : (
      /* Tabs */
      <div className="glass-card overflow-hidden">
        <div className="flex border-b border-white/10">
          {([
            { key: 'buy' as Tab, label: 'Acheter' },
            { key: 'sell' as Tab, label: 'Vendre' },
            { key: 'my' as Tab, label: 'Mes offres' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'relative flex-1 px-5 py-3 text-sm font-medium uppercase tracking-wider transition-colors',
                tab === key
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]',
              )}
            >
              {label}
              {tab === key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary shadow-[0_0_8px_rgba(103,212,232,0.4)]" />
              )}
            </button>
          ))}
        </div>

        {/* Buy tab */}
        {tab === 'buy' && (
          <div className="p-4 lg:p-5">
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
                <svg className="h-10 w-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-sm">Aucune offre disponible</p>
              </div>
            )}
            {!offersLoading && offersData?.offers && offersData.offers.length > 0 && (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {offersData.offers.map((offer) => {
                  return (
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
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sell tab */}
        {tab === 'sell' && (
          <div className="p-4 lg:p-5">
            <div className="max-w-lg space-y-5">
              {/* Resource select */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block uppercase tracking-wider">Ressource a vendre</label>
                <div className="flex gap-2">
                  {(['minerai', 'silicium', 'hydrogene'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setSellResource(r)}
                      className={cn(
                        'flex-1 rounded-md border px-3 py-2.5 text-sm font-medium transition-all',
                        sellResource === r
                          ? cn(RESOURCE_COLORS[r], RESOURCE_BORDER_ACTIVE[r], 'bg-white/5')
                          : 'border-border text-muted-foreground hover:border-white/20 hover:text-foreground',
                      )}
                    >
                      {RESOURCE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block uppercase tracking-wider">Quantite</label>
                <input
                  type="number"
                  min={1}
                  value={sellQuantity || ''}
                  onChange={(e) => setSellQuantity(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2.5 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                  placeholder="10000"
                />
              </div>

              {/* Price */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block uppercase tracking-wider">Prix demande</label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { key: 'minerai' as const, value: sellPriceMinerai, setter: setSellPriceMinerai },
                    { key: 'silicium' as const, value: sellPriceSilicium, setter: setSellPriceSilicium },
                    { key: 'hydrogene' as const, value: sellPriceHydrogene, setter: setSellPriceHydrogene },
                  ]).map(({ key, value, setter }) => (
                    <div key={key}>
                      <div className={cn('text-[10px] mb-1.5 font-medium uppercase tracking-wider', RESOURCE_COLORS[key])}>
                        {RESOURCE_LABELS[key]}
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={value || ''}
                        onChange={(e) => setter(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full rounded-md border border-border bg-muted/50 px-3 py-2.5 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Commission preview (paid by seller) */}
              {sellQuantity > 0 && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quantité en vente</span>
                    <span className="text-foreground">{sellQuantity.toLocaleString('fr-FR')} {RESOURCE_LABELS[sellResource]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Commission ({commissionPercent}%)</span>
                    <span className="text-destructive">{Math.ceil(sellQuantity * commissionPercent / 100).toLocaleString('fr-FR')} {RESOURCE_LABELS[sellResource]}</span>
                  </div>
                  <div className="border-t border-white/10 pt-1 flex justify-between font-medium">
                    <span className="text-muted-foreground">Total prélevé</span>
                    <span className="text-foreground">{(sellQuantity + Math.ceil(sellQuantity * commissionPercent / 100)).toLocaleString('fr-FR')} {RESOURCE_LABELS[sellResource]}</span>
                  </div>
                </div>
              )}

              <Button
                variant="retro"
                className="w-full"
                onClick={handleCreateOffer}
                disabled={
                  createOfferMutation.isPending ||
                  sellQuantity <= 0 ||
                  (sellPriceMinerai <= 0 && sellPriceSilicium <= 0 && sellPriceHydrogene <= 0)
                }
              >
                Mettre en vente
              </Button>
            </div>
          </div>
        )}

        {/* My offers tab */}
        {tab === 'my' && (
          <div className="p-4 lg:p-5">
            {!myOffers || myOffers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <svg className="h-10 w-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6" />
                </svg>
                <p className="text-sm">Aucune offre.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myOffers.map((offer) => (
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
        )}
      </div>
      )}
    </div>
  );
}
