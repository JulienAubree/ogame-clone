import { useState } from 'react';
import { useOutletContext, useSearchParams, Link } from 'react-router';
import { Lock, Home, HelpCircle, ShoppingCart, DollarSign, Check, Layers, FileText } from 'lucide-react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { ResourceBuy } from '@/components/market/ResourceBuy';
import { ResourceSell } from '@/components/market/ResourceSell';
import { ResourceMyOffers } from '@/components/market/ResourceMyOffers';
import { MarketReportsBuy } from '@/components/market/MarketReportsBuy';
import { MarketReportsInventory } from '@/components/market/MarketReportsInventory';
import { cn } from '@/lib/utils';
import { getAssetUrl } from '@/lib/assets';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { KpiTile } from '@/components/common/KpiTile';

// ── Types ────────────────────────────────────────────────────────────

type MarketTab = 'buy' | 'sell' | 'my-offers' | 'history';
type MarketFilter = 'all' | 'resources' | 'planets';

const TABS: { key: MarketTab; label: string }[] = [
  { key: 'buy', label: 'Acheter' },
  { key: 'sell', label: 'Vendre' },
  { key: 'my-offers', label: 'Mes offres' },
  { key: 'history', label: 'Historique' },
];

const FILTERS: { key: MarketFilter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'resources', label: 'Ressources' },
  { key: 'planets', label: 'Planetes' },
];

/** Map legacy ?view= values to new tab (backward compat). */
function resolveInitialTab(param: string | null): MarketTab {
  if (!param) return 'buy';
  const map: Record<string, MarketTab> = {
    'resource-buy': 'buy',
    'resource-sell': 'sell',
    'resource-my': 'my-offers',
    'report-buy': 'buy',
    'report-my': 'sell',
    'buy': 'buy',
    'sell': 'sell',
    'my-offers': 'my-offers',
    'history': 'history',
  };
  return map[param] ?? 'buy';
}

function resolveInitialFilter(param: string | null, viewParam: string | null): MarketFilter {
  if (param === 'all' || param === 'resources' || param === 'planets') return param;
  if (param === 'exploration') return 'planets';
  if (viewParam?.startsWith('report')) return 'planets';
  return 'all';
}

// ─────────────────────────────────────────────────────────────────────

export default function Market() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const { data: gameConfig } = useGameConfig();
  const [searchParams] = useSearchParams();
  const [helpOpen, setHelpOpen] = useState(false);
  const [tab, setTab] = useState<MarketTab>(
    resolveInitialTab(searchParams.get('tab') ?? searchParams.get('view')),
  );
  const [filter, setFilter] = useState<MarketFilter>(
    resolveInitialFilter(searchParams.get('cat'), searchParams.get('view')),
  );

  const commissionPercent = Number(gameConfig?.universe?.market_commission_percent) || 5;

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const marketLevel = buildings?.find((b) => b.id === 'galacticMarket')?.currentLevel ?? 0;
  const marketReady = !!buildings && marketLevel >= 1;

  // KPI data — queries share React Query cache with child components
  const { data: offersData } = trpc.market.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId && marketReady },
  );
  const { data: myOffers } = trpc.market.myOffers.useQuery(
    undefined,
    { enabled: marketReady },
  );
  const { data: reports } = trpc.explorationReport.list.useQuery(
    undefined,
    { enabled: marketReady },
  );

  // KPI computations
  const totalOffers = offersData?.offers?.length ?? 0;
  const myActiveResourceOffers = (myOffers ?? []).filter((o) => o.status === 'active').length;
  const myListedReports = (reports ?? []).filter((r) => r.status === 'listed').length;
  const mySalesCount = myActiveResourceOffers + myListedReports;
  const soldResourceOffers = (myOffers ?? []).filter((o) => o.status === 'sold').length;
  const soldReports = (reports ?? []).filter((r) => r.status === 'sold').length;
  const totalTrades = soldResourceOffers + soldReports;

  // ── Locked state (building not constructed) ──────────────────────────

  if (buildings && marketLevel < 1) {
    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/80 via-slate-950 to-purple-950/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="relative flex flex-col items-center justify-center px-5 py-16 lg:py-24 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-muted-foreground/20 bg-card/50 mb-6">
              <Lock className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground mb-2">Marche Galactique</h1>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Construisez le <span className="text-foreground font-semibold">Marche Galactique</span> pour
              echanger des ressources et des rapports d'exploration avec les autres joueurs.
            </p>
            <Link
              to="/buildings"
              className="inline-flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              Aller aux bâtiments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Hero banner */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={getAssetUrl('buildings', 'galacticMarket')}
            alt=""
            className="h-full w-full object-cover opacity-40 blur-sm scale-110"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/60 via-slate-950/80 to-purple-950/60" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

        <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
          <div className="flex items-start gap-5">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="relative group shrink-0"
              title="Comment fonctionne le marche ?"
            >
              <img
                src={getAssetUrl('buildings', 'galacticMarket', 'thumb')}
                alt="Marche Galactique"
                className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-cyan-500/10 transition-opacity group-hover:opacity-80"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <HelpCircle className="h-5 w-5 text-white" />
              </div>
            </button>

            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">Marche Galactique</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Niveau {marketLevel} · Commission {commissionPercent}%
              </p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-lg leading-relaxed hidden lg:block">
                Echangez des ressources et des rapports d'exploration avec les autres joueurs.
                Chaque vente est soumise a une commission de {commissionPercent}% et la livraison
                s'effectue par flotte marchande.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content with padding */}
      <div className="space-y-4 px-4 pb-4 lg:px-6 lg:pb-6">

        {/* KPI tiles */}
        <div className="grid grid-cols-3 gap-3">
          <KpiTile
            label="Offres sur le marche"
            value={totalOffers}
            color="text-cyan-400"
            onClick={() => setTab('buy')}
            icon={
              <ShoppingCart className="h-[18px] w-[18px]" />
            }
          />
          <KpiTile
            label="Mes ventes en cours"
            value={mySalesCount}
            color="text-emerald-400"
            onClick={() => setTab('my-offers')}
            icon={
              <DollarSign className="h-[18px] w-[18px]" />
            }
          />
          <KpiTile
            label="Echanges realises"
            value={totalTrades}
            color="text-amber-400"
            onClick={() => setTab('history')}
            icon={
              <Check className="h-[18px] w-[18px]" />
            }
          />
        </div>

        {/* Action tabs */}
        <div className="flex gap-0.5 bg-card/50 rounded-lg p-0.5 border border-border/30 w-fit">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-semibold transition-colors',
                tab === key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex gap-0.5 bg-card/30 rounded-lg p-0.5 border border-border/20 w-fit">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                filter === key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────── */}

        {planetId && (
          <section className="glass-card p-4 lg:p-5 space-y-8">
            {/* Resources */}
            {(filter === 'all' || filter === 'resources') && (
              <div>
                {filter === 'all' && (
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Ressources</h3>
                )}
                {tab === 'buy' && <ResourceBuy planetId={planetId} />}
                {tab === 'sell' && <ResourceSell planetId={planetId} commissionPercent={commissionPercent} />}
                {tab === 'my-offers' && <ResourceMyOffers planetId={planetId} statuses={['active', 'reserved']} />}
                {tab === 'history' && <ResourceMyOffers planetId={planetId} statuses={['sold', 'expired', 'cancelled']} />}
              </div>
            )}

            {/* Planets (exploration reports) */}
            {(filter === 'all' || filter === 'planets') && (
              <div>
                {filter === 'all' && (
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Planetes</h3>
                )}
                {tab === 'buy' && <MarketReportsBuy planetId={planetId} />}
                {tab === 'sell' && <MarketReportsInventory planetId={planetId} sections={['inventory']} />}
                {tab === 'my-offers' && <MarketReportsInventory planetId={planetId} sections={['listed']} />}
                {tab === 'history' && <MarketReportsInventory planetId={planetId} sections={['sold']} />}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Help overlay */}
      <EntityDetailOverlay open={helpOpen} onClose={() => setHelpOpen(false)} title="Marche Galactique">
        {/* Hero image */}
        <div className="relative -mx-5 -mt-5 overflow-hidden rounded-t-lg">
          <img
            src={getAssetUrl('buildings', 'galacticMarket')}
            alt=""
            className="w-full h-40 object-cover"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
          <div className="absolute bottom-3 left-5">
            <p className="text-sm font-semibold text-foreground">Niveau {marketLevel}</p>
            <p className="text-xs text-muted-foreground">Commission : {commissionPercent}%</p>
          </div>
        </div>

        {/* Acheter */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShoppingCart className="h-3.5 w-3.5 text-cyan-400" />
            Acheter
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Parcourez les offres des autres joueurs en <span className="text-foreground font-medium">ressources</span> (minerai, silicium, hydrogène) et en <span className="text-foreground font-medium">rapports de planètes</span>. Pour acheter, vous devez envoyer une <span className="text-foreground font-medium">flotte marchande</span> chargée du prix demandé vers la planète du vendeur.
          </p>
        </div>

        {/* Vendre */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            Vendre
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Mettez en vente vos <span className="text-foreground font-medium">ressources excédentaires</span> ou vos <span className="text-foreground font-medium">rapports d&apos;exploration</span> en fixant votre prix. Une commission de <span className="text-foreground font-medium">{commissionPercent}%</span> est prélevée sur chaque vente. Vos offres restent actives jusqu&apos;à ce qu&apos;un acheteur les prenne ou que vous les annuliez.
          </p>
        </div>

        {/* Livraison */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            Livraison
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Les échanges se font par <span className="text-foreground font-medium">flotte marchande</span>. L&apos;acheteur envoie ses cargos chargés du paiement vers la planète du vendeur. Le temps de trajet dépend de la <span className="text-foreground font-medium">distance</span> entre les deux planètes et de la <span className="text-foreground font-medium">vitesse</span> de la flotte.
          </p>
        </div>

        {/* Rapports */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-purple-400" />
            Rapports d&apos;exploration
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Les rapports d&apos;exploration révèlent les <span className="text-foreground font-medium">biomes</span> et les <span className="text-foreground font-medium">bonus</span> d&apos;une planète avant colonisation. Plus une planète est rare, plus son rapport a de valeur. Créez des rapports depuis la <span className="text-foreground font-medium">vue galaxie</span> en sélectionnant une position explorée.
          </p>
        </div>
      </EntityDetailOverlay>
    </div>
  );
}
