import { useState } from 'react';
import { useOutletContext, useSearchParams, Link } from 'react-router';
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
  const myActiveResourceOffers = (myOffers ?? []).filter((o: any) => o.status === 'active').length;
  const myListedReports = (reports ?? []).filter((r: any) => r.status === 'listed').length;
  const mySalesCount = myActiveResourceOffers + myListedReports;
  const soldResourceOffers = (myOffers ?? []).filter((o: any) => o.status === 'sold').length;
  const soldReports = (reports ?? []).filter((r: any) => r.status === 'sold').length;
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
              <svg className="h-10 w-10 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            }
          />
          <KpiTile
            label="Mes ventes en cours"
            value={mySalesCount}
            color="text-emerald-400"
            onClick={() => setTab('my-offers')}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          />
          <KpiTile
            label="Echanges realises"
            value={totalTrades}
            color="text-amber-400"
            onClick={() => setTab('history')}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            Acheter
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Parcourez les offres des autres joueurs en <span className="text-foreground font-medium">ressources</span> (minerai, silicium, hydrogène) et en <span className="text-foreground font-medium">rapports de planètes</span>. Pour acheter, vous devez envoyer une <span className="text-foreground font-medium">flotte marchande</span> chargée du prix demandé vers la planète du vendeur.
          </p>
        </div>

        {/* Vendre */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Vendre
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Mettez en vente vos <span className="text-foreground font-medium">ressources excédentaires</span> ou vos <span className="text-foreground font-medium">rapports d&apos;exploration</span> en fixant votre prix. Une commission de <span className="text-foreground font-medium">{commissionPercent}%</span> est prélevée sur chaque vente. Vos offres restent actives jusqu&apos;à ce qu&apos;un acheteur les prenne ou que vous les annuliez.
          </p>
        </div>

        {/* Livraison */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Livraison
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Les échanges se font par <span className="text-foreground font-medium">flotte marchande</span>. L&apos;acheteur envoie ses cargos chargés du paiement vers la planète du vendeur. Le temps de trajet dépend de la <span className="text-foreground font-medium">distance</span> entre les deux planètes et de la <span className="text-foreground font-medium">vitesse</span> de la flotte.
          </p>
        </div>

        {/* Rapports */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
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
