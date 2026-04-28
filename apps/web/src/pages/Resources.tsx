import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import {
  mineraiProduction,
  siliciumProduction,
  hydrogeneProduction,
  solarPlantEnergy,
} from '@exilium/game-engine';
import { trpc } from '@/trpc';
import { estimateRefund } from '@/lib/refund';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { usePlanetStore } from '@/stores/planet.store';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { BuildingQueuePanel } from '@/components/common/BuildingQueuePanel';
import { BuildingDetailContent } from '@/components/entity-details/BuildingDetailContent';
import { ResourcesHelp } from '@/components/resources/ResourcesHelp';
import { ResourceCard } from '@/components/resources/ResourceCard';
import { EnergyCard } from '@/components/resources/EnergyCard';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon, EnergieIcon } from '@/components/common/ResourceIcons';
import { getPlanetImageUrl } from '@/lib/assets';
import { BuildingsList } from './Buildings';

const RESOURCE_CATEGORY_IDS = [
  'building_extraction',
  'building_energie',
  'building_stockage',
];

const BUILDING_IDS = {
  minerai: 'mineraiMine',
  silicium: 'siliciumMine',
  hydrogene: 'hydrogeneSynth',
  energy: 'solarPlant',
} as const;

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

  const upgradeMutation = trpc.building.upgrade.useMutation({
    onSuccess: () => {
      utils.building.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
    },
  });

  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const upgradingBuilding = useMemo(
    () => buildings?.find((b) => b.isUpgrading && b.upgradeEndTime) ?? null,
    [buildings],
  );

  const buildingLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    buildings?.forEach((b) => { levels[b.id] = b.currentLevel; });
    return levels;
  }, [buildings]);

  const isAnyBuildingUpgrading = buildings?.some((b) => b.isUpgrading) ?? false;

  // Live resource counters
  const liveResources = useResourceCounter(
    resourceData
      ? {
          minerai: resourceData.minerai,
          silicium: resourceData.silicium,
          hydrogene: resourceData.hydrogene,
          resourcesUpdatedAt: resourceData.resourcesUpdatedAt,
          mineraiPerHour: resourceData.rates.mineraiPerHour,
          siliciumPerHour: resourceData.rates.siliciumPerHour,
          hydrogenePerHour: resourceData.rates.hydrogenePerHour,
          storageMineraiCapacity: resourceData.rates.storageMineraiCapacity,
          storageSiliciumCapacity: resourceData.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: resourceData.rates.storageHydrogeneCapacity,
        }
      : undefined,
  );

  const planetThumb = activePlanet?.planetClassId && activePlanet.planetImageIndex != null
    ? getPlanetImageUrl(activePlanet.planetClassId, activePlanet.planetImageIndex, 'thumb')
    : null;

  // Find each resource building (typed to ResourceCard's BuildingForCard shape)
  const findBuilding = (id: string) => buildings?.find((b) => b.id === id);
  const mineraiBuilding = findBuilding(BUILDING_IDS.minerai);
  const siliciumBuilding = findBuilding(BUILDING_IDS.silicium);
  const hydrogeneBuilding = findBuilding(BUILDING_IDS.hydrogene);
  const solarBuilding = findBuilding(BUILDING_IDS.energy);

  // Compute "next level" production via game-engine formulas. Uses the same
  // productionFactor returned by the API so all biome/type/research bonuses
  // are reflected. For energy, no factor is applied (matches the game-engine
  // signature which doesn't take one).
  const productionFactor = resourceData?.rates.productionFactor ?? 1;
  const maxTemp = resourceData?.maxTemp ?? 0;

  const handleUpgrade = (buildingId: string) => () => {
    if (!planetId) return;
    upgradeMutation.mutate({ planetId, buildingId: buildingId as never });
  };

  const handleCancel = () => setCancelConfirm(true);
  const handleTimerComplete = () => {
    if (planetId) utils.building.list.invalidate({ planetId });
  };

  return (
    <div className="space-y-4">
      {/* Hero banner */}
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
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="relative group shrink-0"
              title="Comment fonctionnent les ressources ?"
            >
              {planetThumb ? (
                <img
                  src={planetThumb}
                  alt={activePlanet?.name ?? ''}
                  className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-amber-500/30 object-cover shadow-lg shadow-amber-500/15 transition-opacity group-hover:opacity-80"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <div className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-amber-500/30 bg-card/60 shadow-lg shadow-amber-500/10" />
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <HelpCircle className="h-5 w-5 text-white" />
              </div>
            </button>

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

              <BuildingQueuePanel
                upgradingBuilding={upgradingBuilding}
                onTimerComplete={handleTimerComplete}
                onCancel={handleCancel}
                cancelPending={cancelMutation.isPending}
                onOpenDetail={() => upgradingBuilding && setDetailId(upgradingBuilding.id)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 px-4 pb-4 lg:px-6 lg:pb-6">
        {/* Resource cards — 3 cols on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {/* Minerai */}
          <ResourceCard
            label="Minerai"
            buildingLabel="Mine de minerai"
            buildingId={BUILDING_IDS.minerai}
            icon={<MineraiIcon size={22} className="text-minerai" />}
            accentColor="text-minerai"
            fillColor="bg-minerai"
            perHour={resourceData?.rates.mineraiPerHour ?? 0}
            current={liveResources.minerai}
            capacity={resourceData?.rates.storageMineraiCapacity ?? 0}
            productionFactor={productionFactor}
            productionAtCurrentLevel={
              mineraiBuilding && mineraiBuilding.currentLevel > 0
                ? mineraiProduction(mineraiBuilding.currentLevel, productionFactor)
                : undefined
            }
            productionAtNextLevel={
              mineraiBuilding
                ? mineraiProduction(mineraiBuilding.currentLevel + 1, productionFactor)
                : undefined
            }
            building={mineraiBuilding}
            resources={{ minerai: liveResources.minerai, silicium: liveResources.silicium, hydrogene: liveResources.hydrogene }}
            buildingLevels={buildingLevels}
            isAnyUpgrading={isAnyBuildingUpgrading}
            upgradePending={upgradeMutation.isPending}
            cancelPending={cancelMutation.isPending}
            gameConfig={gameConfig}
            onUpgrade={handleUpgrade(BUILDING_IDS.minerai)}
            onCancel={handleCancel}
            onTimerComplete={handleTimerComplete}
            onOpenDetail={() => setDetailId(BUILDING_IDS.minerai)}
          />

          {/* Silicium */}
          <ResourceCard
            label="Silicium"
            buildingLabel="Mine de silicium"
            buildingId={BUILDING_IDS.silicium}
            icon={<SiliciumIcon size={22} className="text-silicium" />}
            accentColor="text-silicium"
            fillColor="bg-silicium"
            perHour={resourceData?.rates.siliciumPerHour ?? 0}
            current={liveResources.silicium}
            capacity={resourceData?.rates.storageSiliciumCapacity ?? 0}
            productionFactor={productionFactor}
            productionAtCurrentLevel={
              siliciumBuilding && siliciumBuilding.currentLevel > 0
                ? siliciumProduction(siliciumBuilding.currentLevel, productionFactor)
                : undefined
            }
            productionAtNextLevel={
              siliciumBuilding
                ? siliciumProduction(siliciumBuilding.currentLevel + 1, productionFactor)
                : undefined
            }
            building={siliciumBuilding}
            resources={{ minerai: liveResources.minerai, silicium: liveResources.silicium, hydrogene: liveResources.hydrogene }}
            buildingLevels={buildingLevels}
            isAnyUpgrading={isAnyBuildingUpgrading}
            upgradePending={upgradeMutation.isPending}
            cancelPending={cancelMutation.isPending}
            gameConfig={gameConfig}
            onUpgrade={handleUpgrade(BUILDING_IDS.silicium)}
            onCancel={handleCancel}
            onTimerComplete={handleTimerComplete}
            onOpenDetail={() => setDetailId(BUILDING_IDS.silicium)}
          />

          {/* Hydrogene */}
          <ResourceCard
            label="Hydrogène"
            buildingLabel="Synthétiseur d'hydrogène"
            buildingId={BUILDING_IDS.hydrogene}
            icon={<HydrogeneIcon size={22} className="text-hydrogene" />}
            accentColor="text-hydrogene"
            fillColor="bg-hydrogene"
            perHour={resourceData?.rates.hydrogenePerHour ?? 0}
            current={liveResources.hydrogene}
            capacity={resourceData?.rates.storageHydrogeneCapacity ?? 0}
            productionFactor={productionFactor}
            productionAtCurrentLevel={
              hydrogeneBuilding && hydrogeneBuilding.currentLevel > 0
                ? hydrogeneProduction(hydrogeneBuilding.currentLevel, maxTemp, productionFactor)
                : undefined
            }
            productionAtNextLevel={
              hydrogeneBuilding
                ? hydrogeneProduction(hydrogeneBuilding.currentLevel + 1, maxTemp, productionFactor)
                : undefined
            }
            building={hydrogeneBuilding}
            resources={{ minerai: liveResources.minerai, silicium: liveResources.silicium, hydrogene: liveResources.hydrogene }}
            buildingLevels={buildingLevels}
            isAnyUpgrading={isAnyBuildingUpgrading}
            upgradePending={upgradeMutation.isPending}
            cancelPending={cancelMutation.isPending}
            gameConfig={gameConfig}
            onUpgrade={handleUpgrade(BUILDING_IDS.hydrogene)}
            onCancel={handleCancel}
            onTimerComplete={handleTimerComplete}
            onOpenDetail={() => setDetailId(BUILDING_IDS.hydrogene)}
          />
        </div>

        {/* Energy card — full width, more horizontal */}
        <EnergyCard
          icon={<EnergieIcon size={22} className="text-energy" />}
          buildingId={BUILDING_IDS.energy}
          produced={resourceData?.rates.energyProduced ?? 0}
          consumed={resourceData?.rates.energyConsumed ?? 0}
          productionAtCurrentLevel={
            solarBuilding && solarBuilding.currentLevel > 0
              ? solarPlantEnergy(solarBuilding.currentLevel)
              : undefined
          }
          productionAtNextLevel={
            solarBuilding ? solarPlantEnergy(solarBuilding.currentLevel + 1) : undefined
          }
          building={solarBuilding}
          resources={{ minerai: liveResources.minerai, silicium: liveResources.silicium, hydrogene: liveResources.hydrogene }}
          buildingLevels={buildingLevels}
          isAnyUpgrading={isAnyBuildingUpgrading}
          upgradePending={upgradeMutation.isPending}
          cancelPending={cancelMutation.isPending}
          gameConfig={gameConfig}
          onUpgrade={handleUpgrade(BUILDING_IDS.energy)}
          onCancel={handleCancel}
          onTimerComplete={handleTimerComplete}
          onOpenDetail={() => setDetailId(BUILDING_IDS.energy)}
        />

        {/* Detailed buildings list — collapsed by default */}
        <section className="glass-card overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors"
          >
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tous les bâtiments de ressources</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Extraction · Énergie · Stockage</p>
            </div>
            {detailsExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {detailsExpanded && (
            <div className="border-t border-border/30 p-4 lg:p-5">
              <BuildingsList
                title="Ressources"
                categoryIds={RESOURCE_CATEGORY_IDS}
                hideHeader
                hideUpgradeQueue
                containerClassName="space-y-4 lg:space-y-6"
              />
            </div>
          )}
        </section>
      </div>

      {/* Help overlay */}
      <EntityDetailOverlay
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Ressources"
      >
        <ResourcesHelp />
      </EntityDetailOverlay>

      {/* Building detail overlay */}
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

      {/* Cancel confirm */}
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
