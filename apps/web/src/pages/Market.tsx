import { useState } from 'react';
import { useOutletContext, useSearchParams, Link } from 'react-router';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { type MarketView, MARKET_VIEWS } from '@/components/market/MarketSidebar';
import { ResourceBuy } from '@/components/market/ResourceBuy';
import { ResourceSell } from '@/components/market/ResourceSell';
import { ResourceMyOffers } from '@/components/market/ResourceMyOffers';
import { MarketReportsBuy } from '@/components/market/MarketReportsBuy';
import { MarketReportsInventory } from '@/components/market/MarketReportsInventory';
import { cn } from '@/lib/utils';
import { getAssetUrl } from '@/lib/assets';

// ── KPI Tile ─────────────────────────────────────────────────────────

function KpiTile({ label, value, icon, color, onClick }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border/30 bg-card/60 px-4 py-3 text-left transition-colors hover:bg-card/80 hover:border-primary/20 cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-white/5', color)}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={cn('text-lg font-bold tabular-nums leading-tight', color)}>{value}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
        </div>
      </div>
    </button>
  );
}

// ── Tab config ───────────────────────────────────────────────────────

const RESOURCE_TABS: { key: MarketView; label: string }[] = [
  { key: 'resource-buy', label: 'Acheter' },
  { key: 'resource-sell', label: 'Vendre' },
  { key: 'resource-my', label: 'Mes offres' },
];

const REPORT_TABS: { key: MarketView; label: string }[] = [
  { key: 'report-buy', label: 'Acheter' },
  { key: 'report-my', label: 'Mes rapports' },
];

// ─────────────────────────────────────────────────────────────────────

export default function Market() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const { data: gameConfig } = useGameConfig();
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get('view');
  const [view, setView] = useState<MarketView>(
    initialView && MARKET_VIEWS.includes(initialView as MarketView)
      ? (initialView as MarketView)
      : 'resource-buy',
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
  const totalOffers = (offersData?.offers?.length ?? 0);
  const myActiveResourceOffers = (myOffers ?? []).filter((o: any) => o.status === 'active').length;
  const myListedReports = (reports ?? []).filter((r: any) => r.status === 'listed').length;
  const mySalesCount = myActiveResourceOffers + myListedReports;
  const soldResourceOffers = (myOffers ?? []).filter((o: any) => o.status === 'sold').length;
  const soldReports = (reports ?? []).filter((r: any) => r.status === 'sold').length;
  const totalTrades = soldResourceOffers + soldReports;

  const isResources = view.startsWith('resource');
  const subTabs = isResources ? RESOURCE_TABS : REPORT_TABS;

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
              Aller aux batiments
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
        {/* Background: building image blurred, with gradient overlay */}
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
            {/* Building thumbnail */}
            <img
              src={getAssetUrl('buildings', 'galacticMarket', 'thumb')}
              alt="Marche Galactique"
              className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-cyan-500/10 shrink-0"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />

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
            onClick={() => setView('resource-buy')}
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
            onClick={() => setView('resource-my')}
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
            onClick={() => setView('resource-my')}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
          />
        </div>

        {/* Section toggle + sub-tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-0.5 bg-card/50 rounded-lg p-0.5 border border-border/30">
            <button
              onClick={() => { if (!isResources) setView('resource-buy'); }}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                isResources ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Ressources
            </button>
            <button
              onClick={() => { if (isResources) setView('report-buy'); }}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                !isResources ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Rapports
            </button>
          </div>

          <div className="h-5 w-px bg-border/40 hidden lg:block" />

          <div className="flex flex-wrap gap-2">
            {subTabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  'rounded-md border px-4 py-1.5 text-xs font-medium uppercase tracking-wider transition-all',
                  view === key
                    ? 'border-primary/50 text-primary bg-primary/10 shadow-[0_0_8px_rgba(103,212,232,0.15)]'
                    : 'border-border text-muted-foreground hover:border-white/20 hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="glass-card p-4 lg:p-5">
          {view === 'resource-buy' && planetId && <ResourceBuy planetId={planetId} />}
          {view === 'resource-sell' && planetId && <ResourceSell planetId={planetId} commissionPercent={commissionPercent} />}
          {view === 'resource-my' && planetId && <ResourceMyOffers planetId={planetId} />}
          {view === 'report-buy' && planetId && <MarketReportsBuy planetId={planetId} />}
          {view === 'report-my' && planetId && <MarketReportsInventory planetId={planetId} />}
        </div>
      </div>
    </div>
  );
}
