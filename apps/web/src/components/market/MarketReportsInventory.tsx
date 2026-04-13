import { useState } from 'react';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PlanetDot } from '@/components/galaxy/PlanetDot';
import { PlanetVisual } from '@/components/galaxy/PlanetVisual';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { cn } from '@/lib/utils';

const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#eab308',
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  epic: 'Epique',
  legendary: 'Legendaire',
};

const STAT_LABELS: Record<string, string> = {
  production_minerai: 'Production minerai',
  production_silicium: 'Production silicium',
  production_hydrogene: 'Production hydrogene',
  energy_production: 'Production energie',
  storage_minerai: 'Stockage minerai',
  storage_silicium: 'Stockage silicium',
  storage_hydrogene: 'Stockage hydrogene',
};

const RESOURCE_COLORS: Record<string, string> = {
  minerai: 'text-orange-400',
  silicium: 'text-emerald-400',
  hydrogene: 'text-blue-400',
};

const RESOURCE_LABELS: Record<string, string> = {
  minerai: 'Minerai',
  silicium: 'Silicium',
  hydrogene: 'Hydrogene',
};

/** Value score based on rarity composition — used for the star rating. */
const RARITY_SCORE: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

function computeValueStars(biomes: Array<{ rarity: string }>): number {
  if (biomes.length === 0) return 0;
  const total = biomes.reduce((s, b) => s + (RARITY_SCORE[b.rarity] ?? 1), 0);
  const avg = total / biomes.length;
  return Math.min(5, Math.max(1, Math.round(avg)));
}

function ValueStars({ count }: { count: number }) {
  return (
    <span className="inline-flex gap-px" title={`Valeur estimee : ${count}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          width={10}
          height={10}
          viewBox="0 0 20 20"
          fill={i < count ? '#eab308' : '#374151'}
        >
          <polygon points="10,1 12.9,7 19.5,7.6 14.5,12 16.2,18.5 10,15 3.8,18.5 5.5,12 0.5,7.6 7.1,7" />
        </svg>
      ))}
    </span>
  );
}

function formatPrice(mi: number, si: number, h2: number) {
  const parts: string[] = [];
  if (mi > 0) parts.push(`${mi.toLocaleString('fr-FR')} Mi`);
  if (si > 0) parts.push(`${si.toLocaleString('fr-FR')} Si`);
  if (h2 > 0) parts.push(`${h2.toLocaleString('fr-FR')} H2`);
  return parts.join(' + ') || '0';
}

interface MarketReportsInventoryProps {
  planetId: string;
}

export function MarketReportsInventory({ planetId }: MarketReportsInventoryProps) {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const { data: gameConfig } = useGameConfig();

  const { data: reports } = trpc.explorationReport.list.useQuery();

  // Expanded card
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sell form state
  const [sellingReportId, setSellingReportId] = useState<string | null>(null);
  const [priceMinerai, setPriceMinerai] = useState(0);
  const [priceSilicium, setPriceSilicium] = useState(0);
  const [priceHydrogene, setPriceHydrogene] = useState(0);

  const createOfferMutation = trpc.market.createReportOffer.useMutation({
    onSuccess: () => {
      addToast('Rapport mis en vente');
      utils.explorationReport.list.invalidate();
      utils.market.listReports.invalidate();
      closeSellForm();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const cancelOfferMutation = trpc.market.cancelReportOffer.useMutation({
    onSuccess: () => {
      addToast('Offre annulee');
      utils.explorationReport.list.invalidate();
      utils.market.listReports.invalidate();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const removeMutation = trpc.explorationReport.remove.useMutation({
    onSuccess: () => {
      addToast('Rapport supprime');
      utils.explorationReport.list.invalidate();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const closeSellForm = () => {
    setSellingReportId(null);
    setPriceMinerai(0);
    setPriceSilicium(0);
    setPriceHydrogene(0);
  };

  const openSellForm = (reportId: string) => {
    setSellingReportId(reportId);
    setExpandedId(reportId);
    setPriceMinerai(0);
    setPriceSilicium(0);
    setPriceHydrogene(0);
  };

  const handleCreateOffer = (reportId: string) => {
    createOfferMutation.mutate({
      planetId,
      reportId,
      priceMinerai,
      priceSilicium,
      priceHydrogene,
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    if (sellingReportId && sellingReportId !== id) {
      closeSellForm();
    }
  };

  const resolvePlanetName = (planetClassId: string): string => {
    if (!gameConfig?.planetTypes) return planetClassId;
    const pt = gameConfig.planetTypes.find((t: any) => t.id === planetClassId);
    return pt?.name ?? planetClassId;
  };

  const inventory = reports?.filter((r) => r.status === 'inventory') ?? [];
  const listed = reports?.filter((r) => r.status === 'listed') ?? [];
  const sold = reports?.filter((r) => r.status === 'sold') ?? [];

  const biomesOf = (report: NonNullable<typeof reports>[number]) => {
    const raw = report.biomes;
    if (!Array.isArray(raw)) return [];
    return raw as Array<{ id: string; name: string; rarity: string; effects?: Array<{ stat: string; modifier: number }> }>;
  };

  // ── Collapsed card (shared by all sections) ──────────────────────────
  const renderCardHeader = (
    report: NonNullable<typeof reports>[number],
    opts?: { clickable?: boolean; showStars?: boolean },
  ) => {
    const rarityColor = RARITY_COLORS[report.maxRarity] ?? '#9ca3af';
    const biomes = biomesOf(report);
    const stars = computeValueStars(biomes);
    const isExpanded = expandedId === report.id;

    return (
      <div
        className={cn(
          'flex items-start gap-3',
          opts?.clickable && 'cursor-pointer',
        )}
        onClick={opts?.clickable ? () => toggleExpand(report.id) : undefined}
      >
        <div className="shrink-0 mt-0.5">
          <PlanetDot planetClassId={report.planetClassId} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              <span className="font-mono text-muted-foreground">{report.galaxy}:{report.system}:{report.position}</span>
              {' '}
              <span className="text-cyan-400/70">—</span>
              {' '}
              Planete {resolvePlanetName(report.planetClassId)}
            </span>
            {opts?.showStars && stars > 0 && <ValueStars count={stars} />}
            {opts?.clickable && (
              <svg
                width={12}
                height={12}
                viewBox="0 0 20 20"
                fill="currentColor"
                className={cn(
                  'text-muted-foreground transition-transform ml-auto shrink-0',
                  isExpanded && 'rotate-180',
                )}
              >
                <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
              </svg>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ color: rarityColor, backgroundColor: `${rarityColor}20` }}
            >
              {RARITY_LABELS[report.maxRarity] ?? report.maxRarity}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-cyan-500/15 text-cyan-400">
              {report.biomeCount} biome{report.biomeCount > 1 ? 's' : ''}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                report.isComplete
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-400',
              )}
            >
              {report.isComplete ? 'Complet' : 'Partiel'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ── Expanded biome detail ────────────────────────────────────────────
  const renderBiomeDetail = (report: NonNullable<typeof reports>[number]) => {
    const biomes = biomesOf(report);
    if (biomes.length === 0) {
      return (
        <p className="text-xs italic text-muted-foreground mt-3">
          Aucun biome dans ce rapport.
        </p>
      );
    }
    return (
      <div className="mt-4 space-y-4">
        {/* Big planet visual */}
        <div className="flex justify-center">
          <PlanetVisual
            planetClassId={report.planetClassId}
            planetImageIndex={null}
            size={96}
            variant="thumb"
          />
        </div>

        {/* Biomes list */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-500/70 mb-2">
            Biomes du rapport
          </div>
          <div className="space-y-2">
            {biomes.map((biome) => {
              const color = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
              const effects = Array.isArray(biome.effects) ? biome.effects : [];
              return (
                <div
                  key={biome.id}
                  className="border-l-2 pl-3 py-1"
                  style={{ borderColor: color }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-semibold" style={{ color }}>
                      {biome.name}
                    </span>
                    <span
                      className="text-[10px] rounded-full px-1.5 py-px font-medium"
                      style={{ color, backgroundColor: `${color}20` }}
                    >
                      {RARITY_LABELS[biome.rarity] ?? biome.rarity}
                    </span>
                  </div>
                  {effects.length > 0 && (
                    <div className="text-xs space-y-0.5 ml-4 mt-1">
                      {effects.map((e, i) => (
                        <div key={i} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">
                            {STAT_LABELS[e.stat] ?? e.stat}
                          </span>
                          <span
                            className={
                              e.modifier > 0
                                ? 'text-emerald-400 font-medium'
                                : 'text-red-400 font-medium'
                            }
                          >
                            {e.modifier > 0 ? '+' : ''}
                            {Math.round(e.modifier * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Inventory section ──────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          En inventaire
        </h3>
        {inventory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 px-4 py-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Aucun rapport en inventaire.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Pour vendre les informations sur une planete, rendez-vous dans la{' '}
              <a href="/galaxy" className="text-cyan-400 hover:underline">vue galaxie</a>,
              {' '}selectionnez une position exploree et cliquez sur{' '}
              <span className="text-amber-300 font-medium">Vendre le rapport</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {inventory.map((report) => {
              const isExpanded = expandedId === report.id;
              return (
                <div key={report.id} className="retro-card p-4 space-y-3">
                  {renderCardHeader(report, { clickable: true, showStars: true })}

                  {isExpanded && renderBiomeDetail(report)}

                  {/* Sell form */}
                  {isExpanded && sellingReportId === report.id ? (
                    <div className="border border-primary/20 bg-primary/5 rounded-md p-3 space-y-3 mt-3">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                        Prix demande
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { key: 'minerai' as const, value: priceMinerai, setter: setPriceMinerai },
                          { key: 'silicium' as const, value: priceSilicium, setter: setPriceSilicium },
                          { key: 'hydrogene' as const, value: priceHydrogene, setter: setPriceHydrogene },
                        ]).map(({ key, value, setter }) => (
                          <div key={key}>
                            <div className={cn('text-[10px] mb-1 font-medium uppercase tracking-wider', RESOURCE_COLORS[key])}>
                              {RESOURCE_LABELS[key]}
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={value || ''}
                              onChange={(e) => setter(Math.max(0, Number(e.target.value) || 0))}
                              className="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="retro"
                          size="sm"
                          onClick={() => handleCreateOffer(report.id)}
                          disabled={
                            createOfferMutation.isPending ||
                            (priceMinerai <= 0 && priceSilicium <= 0 && priceHydrogene <= 0)
                          }
                        >
                          Confirmer
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={closeSellForm}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : isExpanded ? (
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="retro"
                        size="sm"
                        onClick={() => openSellForm(report.id)}
                      >
                        Mettre en vente
                      </Button>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => {
                          if (confirm('Supprimer ce rapport ? Cette action est irreversible.')) {
                            removeMutation.mutate({ reportId: report.id });
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Listed section ─────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          En vente
        </h3>
        {listed.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun rapport en vente.</p>
        ) : (
          <div className="space-y-3">
            {listed.map((report) => {
              const isExpanded = expandedId === report.id;
              return (
                <div key={report.id} className="retro-card p-4 space-y-3">
                  {renderCardHeader(report, { clickable: true, showStars: true })}

                  {isExpanded && renderBiomeDetail(report)}

                  <div className="flex items-center justify-between gap-3 mt-2">
                    {report.offerStatus === 'reserved' ? (
                      <>
                        <div className="text-xs text-amber-400 flex items-center gap-1.5">
                          <div className="h-3 w-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                          Acheteur en route — vente verrouillee
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled
                          title="Impossible d'annuler — un acheteur est en route"
                        >
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="text-xs text-muted-foreground">
                          En attente d'acheteur
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => cancelOfferMutation.mutate({ reportId: report.id })}
                          disabled={cancelOfferMutation.isPending}
                        >
                          Annuler
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Sold section ───────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Vendus
        </h3>
        {sold.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun rapport vendu.</p>
        ) : (
          <div className="space-y-3">
            {sold.map((report) => {
              const isExpanded = expandedId === report.id;
              return (
                <div key={report.id} className="retro-card p-4 space-y-2">
                  {renderCardHeader(report, { clickable: true })}
                  {isExpanded && renderBiomeDetail(report)}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      Vendu
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(report.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
