import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import {
  calculateShieldCapacity,
  maxMarketOffers,
  discoveryCooldown,
  getMissionRelayBonusPerLevel,
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
import { InfrastructureCard } from '@/components/infrastructures/InfrastructureCard';
import { InfrastructuresHelp } from '@/components/infrastructures/InfrastructuresHelp';
import { getPlanetImageUrl } from '@/lib/assets';
import { BuildingsList } from './Buildings';

const INFRASTRUCTURE_CATEGORY_IDS = [
  'building_industrie',
  'building_recherche',
  'building_exploration',
  'building_commerce',
  'building_gouvernance',
  'building_defense',
];

const EXCLUDED_BUILDINGS = ['shipyard', 'arsenal', 'commandCenter'];

const ANNEX_LAB_BY_BIOME: Record<string, string> = {
  volcanic: 'labVolcanic',
  arid: 'labArid',
  temperate: 'labTemperate',
  glacial: 'labGlacial',
  gaseous: 'labGaseous',
};

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

/** Returns a one-line dynamic effect for the building, or null if level=0. */
function getEffectLine(buildingId: string, level: number): string | null {
  if (level <= 0) return null;
  switch (buildingId) {
    case 'robotics':
      return `−${Math.round((1 - Math.pow(0.85, level)) * 100)}% temps de construction (×${Math.pow(0.85, level).toFixed(2)})`;
    case 'galacticMarket':
      return `${maxMarketOffers(level)} offres simultanées`;
    case 'planetaryShield':
      return `${formatCompact(calculateShieldCapacity(level))} de bouclier`;
    case 'missionCenter':
      return `1 découverte / ${discoveryCooldown(level)} h`;
    case 'imperialPowerCenter':
      return `+${level} colonie${level > 1 ? 's' : ''} en gouvernance`;
    case 'missionRelay': {
      // For relay we show the planet-class-specific bonus
      return `Bonus PvE actif (niv. ${level})`;
    }
    case 'researchLab':
      return 'Pilote toute la recherche';
    case 'labVolcanic': case 'labArid': case 'labTemperate': case 'labGlacial': case 'labGaseous':
      return 'Boost +5%/niv. recherche';
    default:
      return null;
  }
}

/** Returns a relay-specific effect line that shows the actual bonus per resource. */
function getRelayEffectLine(level: number, planetClassId: string | null): string | null {
  if (level <= 0) return null;
  const bonus = getMissionRelayBonusPerLevel(planetClassId);
  const parts: string[] = [];
  if (bonus.minerai > 0)   parts.push(`+${Math.round(bonus.minerai * level * 100)}% minerai`);
  if (bonus.silicium > 0)  parts.push(`+${Math.round(bonus.silicium * level * 100)}% silicium`);
  if (bonus.hydrogene > 0) parts.push(`+${Math.round(bonus.hydrogene * level * 100)}% hydrogène`);
  if (bonus.pirate > 0)    parts.push(`+${Math.round(bonus.pirate * level * 100)}% butin pirates`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface InfraSlot {
  id: string;
  label: string;
  description: string;
  effectLine: string | null;
  locked: boolean;
  lockReason?: string;
}

export default function Infrastructures() {
  const { planetId, planetClassId } = useOutletContext<{ planetId?: string; planetClassId?: string | null }>();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();
  const activePlanetId = usePlanetStore((s) => s.activePlanetId);
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanet = planets?.find((p) => p.id === (activePlanetId ?? planetId));
  const homePlanet = planets?.find((p) => p.planetClassId === 'homeworld');
  const isHomeworld = planetClassId === 'homeworld';

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

  // Build the list of cards based on planet type. Order matters (visual layout).
  const slots: InfraSlot[] = useMemo(() => {
    const make = (id: string, locked: boolean, lockReason?: string): InfraSlot => {
      const def = gameConfig?.buildings[id];
      const level = buildingLevels[id] ?? 0;
      const effect = id === 'missionRelay'
        ? getRelayEffectLine(level, planetClassId ?? null)
        : getEffectLine(id, level);
      return {
        id,
        label: def?.name ?? id,
        description: def?.description ?? '',
        effectLine: effect,
        locked,
        lockReason,
      };
    };

    const annexId = planetClassId && ANNEX_LAB_BY_BIOME[planetClassId] ? ANNEX_LAB_BY_BIOME[planetClassId] : null;

    return [
      make('robotics', false),
      isHomeworld
        ? make('researchLab', false)
        : annexId
          ? make(annexId, false)
          : make('researchLab', true, 'Le laboratoire principal vit sur votre planète-mère.'),
      isHomeworld
        ? make('missionCenter', false)
        : make('missionRelay', false),
      make('galacticMarket', false),
      isHomeworld
        ? make('imperialPowerCenter', false)
        : make('imperialPowerCenter', true, 'Réservé à la planète-mère.'),
      make('planetaryShield', false),
    ];
  }, [gameConfig, buildingLevels, isHomeworld, planetClassId]);

  const handleUpgrade = (id: string) => () => {
    if (!planetId) return;
    upgradeMutation.mutate({ planetId, buildingId: id as never });
  };

  const handleCancel = () => setCancelConfirm(true);
  const handleTimerComplete = () => {
    if (planetId) utils.building.list.invalidate({ planetId });
  };

  const handleSwitchToHome = () => {
    if (homePlanet?.id) setActivePlanet(homePlanet.id);
  };

  return (
    <div className="space-y-4">
      {/* Hero */}
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
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/30 via-slate-950/70 to-cyan-950/30" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

        <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
          <div className="flex items-start gap-4 sm:gap-5">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="relative group shrink-0"
              title="Comment fonctionnent les infrastructures ?"
            >
              {planetThumb ? (
                <img
                  src={planetThumb}
                  alt={activePlanet?.name ?? ''}
                  className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-violet-500/30 object-cover shadow-lg shadow-violet-500/15 transition-opacity group-hover:opacity-80"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <div className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-violet-500/30 bg-card/60 shadow-lg shadow-violet-500/10" />
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <HelpCircle className="h-5 w-5 text-white" />
              </div>
            </button>

            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">Infrastructures</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-fr gap-3 lg:gap-4">
          {slots.map((slot) => (
            <InfrastructureCard
              key={slot.id + (slot.locked ? '-locked' : '')}
              buildingId={slot.id}
              buildingLabel={slot.label}
              planetClassId={planetClassId}
              description={slot.description}
              effectLine={slot.effectLine}
              building={buildings?.find((b) => b.id === slot.id)}
              locked={slot.locked}
              lockReason={slot.lockReason}
              onSwitchToHome={slot.locked ? handleSwitchToHome : undefined}
              resources={{ minerai: liveResources.minerai, silicium: liveResources.silicium, hydrogene: liveResources.hydrogene }}
              buildingLevels={buildingLevels}
              isAnyUpgrading={isAnyBuildingUpgrading}
              upgradePending={upgradeMutation.isPending}
              cancelPending={cancelMutation.isPending}
              gameConfig={gameConfig}
              onUpgrade={handleUpgrade(slot.id)}
              onCancel={handleCancel}
              onTimerComplete={handleTimerComplete}
              onOpenDetail={() => setDetailId(slot.id)}
            />
          ))}
        </div>

        {/* Detailed buildings list — collapsed by default */}
        <section className="glass-card overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors"
          >
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tous les bâtiments d'infrastructure</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Industrie · Recherche · Exploration · Commerce · Gouvernance · Défense</p>
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
                title="Infrastructures"
                categoryIds={INFRASTRUCTURE_CATEGORY_IDS}
                excludeBuildingIds={EXCLUDED_BUILDINGS}
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
        title="Infrastructures"
      >
        <InfrastructuresHelp />
      </EntityDetailOverlay>

      {/* Detail overlay */}
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
