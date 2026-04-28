import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { usePlanetStore } from '@/stores/planet.store';
import { KpiTile } from '@/components/common/KpiTile';
import { Timer } from '@/components/common/Timer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { BuildingDetailContent } from '@/components/entity-details/BuildingDetailContent';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon, EnergieIcon } from '@/components/common/ResourceIcons';
import { getPlanetImageUrl } from '@/lib/assets';
import { BuildingsList } from './Buildings';

const RESOURCE_CATEGORY_IDS = [
  'building_extraction',
  'building_energie',
  'building_stockage',
];

const fmt = (n: number) => Number(n).toLocaleString('fr-FR');

const KPI_BUILDING_ID: Record<'minerai' | 'silicium' | 'hydrogene' | 'energy', string> = {
  minerai: 'mineraiMine',
  silicium: 'siliciumMine',
  hydrogene: 'hydrogeneSynth',
  energy: 'solarPlant',
};

function estimateRefund(
  cost: { minerai: number; silicium: number; hydrogene: number },
  endTime: string,
  totalDurationSec: number,
  maxRatio = 0.7,
) {
  const totalMs = totalDurationSec * 1000;
  const timeLeft = Math.max(0, new Date(endTime).getTime() - Date.now());
  const ratio = Math.min(maxRatio, totalMs > 0 ? timeLeft / totalMs : 0);
  return {
    minerai: Math.floor(cost.minerai * ratio),
    silicium: Math.floor(cost.silicium * ratio),
    hydrogene: Math.floor(cost.hydrogene * ratio),
    ratio: Math.round(ratio * 100),
  };
}

export default function Resources() {
  const { planetId, planetClassId } = useOutletContext<{ planetId?: string; planetClassId?: string | null }>();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();
  const activePlanetId = usePlanetStore((s) => s.activePlanetId);
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanet = planets?.find((p) => p.id === (activePlanetId ?? planetId));

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const cancelMutation = trpc.building.cancel.useMutation({
    onSuccess: () => {
      utils.building.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      utils.planet.empire.invalidate();
    },
  });

  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const upgradingBuilding = useMemo(
    () => buildings?.find((b) => b.isUpgrading && b.upgradeEndTime) ?? null,
    [buildings],
  );

  const mineraiPerHour = resourceData?.rates.mineraiPerHour ?? 0;
  const siliciumPerHour = resourceData?.rates.siliciumPerHour ?? 0;
  const hydrogenePerHour = resourceData?.rates.hydrogenePerHour ?? 0;
  const energyBalance = resourceData
    ? resourceData.rates.energyProduced - resourceData.rates.energyConsumed
    : 0;

  const planetThumb = activePlanet?.planetClassId && activePlanet.planetImageIndex != null
    ? getPlanetImageUrl(activePlanet.planetClassId, activePlanet.planetImageIndex, 'thumb')
    : null;

  return (
    <div className="space-y-4">
      {/* Hero banner — planet thumb instead of generic icon */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          {planetThumb && (
            <img
              src={planetThumb}
              alt=""
              className="h-full w-full object-cover opacity-40 blur-md scale-110"
              decoding="async"
              fetchPriority="low"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950/30 via-slate-950/70 to-emerald-950/30" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

        <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
          <div className="flex items-start gap-4 sm:gap-5">
            {planetThumb ? (
              <img
                src={planetThumb}
                alt={activePlanet?.name ?? ''}
                className="shrink-0 h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-amber-500/30 object-cover shadow-lg shadow-amber-500/15"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
            ) : (
              <div className="shrink-0 h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-amber-500/30 bg-card/60 shadow-lg shadow-amber-500/10" />
            )}

            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">Ressources</h1>
              {activePlanet && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  <span className="text-foreground font-medium">{activePlanet.name}</span>
                  <span className="ml-1.5 font-mono text-primary/70">
                    [{activePlanet.galaxy}:{activePlanet.system}:{activePlanet.position}]
                  </span>
                </p>
              )}
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-lg leading-relaxed hidden lg:block">
                Extraction (mines), production d&apos;énergie (centrale solaire) et stockage de la planète sélectionnée.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 px-4 pb-4 lg:px-6 lg:pb-6">
        {/* File de construction (placée AVANT les KPIs, pattern Recherche) */}
        {upgradingBuilding && upgradingBuilding.upgradeEndTime && (
          <section className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                File de construction
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setDetailId(upgradingBuilding.id)}
              className="flex w-full items-center gap-3 rounded-md bg-card/50 p-3 border-l-4 border-l-orange-500 text-left hover:bg-card/70 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {upgradingBuilding.name}{' '}
                  <span className="text-muted-foreground">
                    Niv. {upgradingBuilding.currentLevel + 1}
                  </span>
                </p>
                <Timer
                  endTime={new Date(upgradingBuilding.upgradeEndTime)}
                  totalDuration={upgradingBuilding.nextLevelTime}
                  onComplete={() => {
                    utils.building.list.invalidate({ planetId: planetId! });
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setCancelConfirm(true);
                }}
              >
                Annuler
              </Button>
            </button>
          </section>
        )}

        {/* KPI tiles cliquables → ouvrent le détail du bâtiment correspondant */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Minerai / h"
            value={fmt(mineraiPerHour)}
            color="text-minerai"
            icon={<MineraiIcon size={18} className="text-minerai" />}
            onClick={() => setDetailId(KPI_BUILDING_ID.minerai)}
          />
          <KpiTile
            label="Silicium / h"
            value={fmt(siliciumPerHour)}
            color="text-silicium"
            icon={<SiliciumIcon size={18} className="text-silicium" />}
            onClick={() => setDetailId(KPI_BUILDING_ID.silicium)}
          />
          <KpiTile
            label="Hydrogène / h"
            value={fmt(hydrogenePerHour)}
            color="text-hydrogene"
            icon={<HydrogeneIcon size={18} className="text-hydrogene" />}
            onClick={() => setDetailId(KPI_BUILDING_ID.hydrogene)}
          />
          <KpiTile
            label="Énergie nette"
            value={`${energyBalance >= 0 ? '+' : ''}${fmt(energyBalance)}`}
            color={energyBalance >= 0 ? 'text-energy' : 'text-destructive'}
            icon={<EnergieIcon size={18} className={energyBalance >= 0 ? 'text-energy' : 'text-destructive'} />}
            onClick={() => setDetailId(KPI_BUILDING_ID.energy)}
          />
        </div>

        {/* Buildings list (extraction / énergie / stockage) */}
        <section className="glass-card p-4 lg:p-5">
          <BuildingsList
            title="Ressources"
            categoryIds={RESOURCE_CATEGORY_IDS}
            hideHeader
            hideUpgradeQueue
            containerClassName="space-y-4 lg:space-y-6"
          />
        </section>
      </div>

      {/* Detail overlay opened from KPI clicks (and from upgrade queue card click) */}
      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? gameConfig?.buildings[detailId]?.name ?? '' : ''}
      >
        {detailId && buildings && (
          <BuildingDetailContent
            buildingId={detailId}
            buildings={buildings}
            planetClassId={planetClassId}
            planetContext={
              resourceData
                ? {
                    maxTemp: resourceData.maxTemp,
                    productionFactor: resourceData.rates.productionFactor,
                  }
                : undefined
            }
          />
        )}
      </EntityDetailOverlay>

      {/* Cancel confirm — same UX as Buildings page */}
      <ConfirmDialog
        open={cancelConfirm}
        onConfirm={() => cancelMutation.mutate({ planetId: planetId! })}
        onCancel={() => setCancelConfirm(false)}
        title="Annuler la construction ?"
        description="Le remboursement est proportionnel au temps restant, plafonné à 70% des ressources investies."
        variant="destructive"
        confirmLabel="Annuler la construction"
      >
        {(() => {
          if (!upgradingBuilding || !upgradingBuilding.upgradeEndTime) return null;
          const refund = estimateRefund(
            upgradingBuilding.nextLevelCost,
            upgradingBuilding.upgradeEndTime,
            upgradingBuilding.nextLevelTime,
          );
          return (
            <div className="rounded-md border border-border bg-card/50 p-3 space-y-1.5">
              <div className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
                Remboursement estimé ({refund.ratio}%)
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {refund.minerai > 0 && (
                  <span className="text-minerai font-semibold">+{refund.minerai.toLocaleString('fr-FR')} M</span>
                )}
                {refund.silicium > 0 && (
                  <span className="text-silicium font-semibold">+{refund.silicium.toLocaleString('fr-FR')} S</span>
                )}
                {refund.hydrogene > 0 && (
                  <span className="text-hydrogene font-semibold">+{refund.hydrogene.toLocaleString('fr-FR')} H</span>
                )}
              </div>
            </div>
          );
        })()}
      </ConfirmDialog>

    </div>
  );
}
