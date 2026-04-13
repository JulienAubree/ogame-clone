import { useState } from 'react';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { PlanetDot } from '@/components/galaxy/PlanetDot';
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

  // Sell form state: which report is currently being priced
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

  const resolvePlanetName = (planetClassId: string): string => {
    if (!gameConfig?.planetTypes) return planetClassId;
    const pt = gameConfig.planetTypes.find((t: any) => t.id === planetClassId);
    return pt?.name ?? planetClassId;
  };

  const inventory = reports?.filter((r) => r.status === 'inventory') ?? [];
  const listed = reports?.filter((r) => r.status === 'listed') ?? [];
  const sold = reports?.filter((r) => r.status === 'sold') ?? [];

  const renderReportCard = (report: NonNullable<typeof reports>[number]) => {
    const rarityColor = RARITY_COLORS[report.maxRarity] ?? '#9ca3af';
    return (
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <PlanetDot planetClassId={report.planetClassId} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {resolvePlanetName(report.planetClassId)}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              [{report.galaxy}:{report.system}:{report.position}]
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
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

  return (
    <div className="space-y-6">
      {/* ── Inventory section ──────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          En inventaire
        </h3>
        {inventory.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun rapport en inventaire.</p>
        ) : (
          <div className="space-y-3">
            {inventory.map((report) => (
              <div key={report.id} className="retro-card p-4 space-y-3">
                {renderReportCard(report)}

                {/* Sell form */}
                {sellingReportId === report.id ? (
                  <div className="border border-primary/20 bg-primary/5 rounded-md p-3 space-y-3">
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
                ) : (
                  <div className="flex gap-2">
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
                )}
              </div>
            ))}
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
            {listed.map((report) => (
              <div key={report.id} className="retro-card p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  {renderReportCard(report)}
                </div>
                <div className="shrink-0">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => cancelOfferMutation.mutate({ reportId: report.id })}
                    disabled={cancelOfferMutation.isPending}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ))}
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
            {sold.map((report) => (
              <div key={report.id} className="retro-card p-4 space-y-2">
                {renderReportCard(report)}
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    Vendu
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(report.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
