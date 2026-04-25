import { useState, useMemo, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router';
import { Shield, Home } from 'lucide-react';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useTutorialTargetId } from '@/hooks/useTutorialHighlight';
import { Button } from '@/components/ui/button';
import { ResourceCost } from '@/components/common/ResourceCost';
import { QuantityStepper } from '@/components/common/QuantityStepper';
import { GameImage } from '@/components/common/GameImage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { DefenseDetailContent } from '@/components/entity-details/DefenseDetailContent';
import { PrerequisiteList, buildPrerequisiteItems } from '@/components/common/PrerequisiteList';
import { FacilityHero } from '@/components/common/FacilityHero';
import { FacilityQueue } from '@/components/common/FacilityQueue';
import { BuildingUpgradeCard } from '@/components/common/BuildingUpgradeCard';
import { PlanetaryShieldBanner } from '@/components/arsenal/PlanetaryShieldBanner';
import { ArsenalHelp } from '@/components/arsenal/ArsenalHelp';
import { formatDuration } from '@/lib/format';
import { getDefenseName } from '@/lib/entity-names';
import { cn } from '@/lib/utils';
import { ClockIcon } from '@/components/icons/utility-icons';
import { calculateShieldCapacity, resolveBonus } from '@exilium/game-engine';

export default function Defense() {
  const { planetId, planetClassId } = useOutletContext<{ planetId?: string; planetClassId?: string | null }>();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();
  const tutorialTargetId = useTutorialTargetId();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  useEffect(() => { setQuantities({}); }, [planetId]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const getDefenseVariantProps = (defenseId: string) => {
    const def = gameConfig?.defenses?.[defenseId];
    const variants = def?.variantPlanetTypes ?? [];
    const hasVariant = !!planetClassId && variants.includes(planetClassId);
    return { planetType: planetClassId ?? undefined, hasVariant };
  };

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const arsenalBuilding = buildings?.find((b) => b.id === 'arsenal');
  const arsenalLevel = arsenalBuilding?.currentLevel ?? 0;
  const shieldBuilding = buildings?.find((b) => b.id === 'planetaryShield');

  const shieldVariants = gameConfig?.buildings?.planetaryShield?.variantPlanetTypes ?? [];
  const shieldHasVariant = !!planetClassId && shieldVariants.includes(planetClassId);

  const { data: defenses, isLoading } = trpc.shipyard.defenses.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: resourceData } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const resources = useResourceCounter(
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

  const shieldLevelBonus = resourceData?.rates?.shieldLevelBonus ?? 0;
  const shieldPercent = resourceData?.rates?.shieldPercent ?? 100;

  const { data: queue } = trpc.shipyard.queue.useQuery(
    { planetId: planetId!, facilityId: 'arsenal' },
    { enabled: !!planetId },
  );

  const { data: researchData } = trpc.research.list.useQuery();
  const researchList = researchData?.items;

  const researchLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    researchList?.forEach((r) => { levels[r.id] = r.currentLevel; });
    return levels;
  }, [researchList]);

  const shieldingMultiplier = useMemo(
    () => resolveBonus('shielding', null, researchLevels, gameConfig?.bonuses ?? []),
    [researchLevels, gameConfig?.bonuses],
  );

  const buildingLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    buildings?.forEach((b) => { levels[b.id] = b.currentLevel; });
    return levels;
  }, [buildings]);

  const buildMutation = trpc.shipyard.buildDefense.useMutation({
    onSuccess: () => {
      utils.shipyard.defenses.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
    },
  });

  const cancelMutation = trpc.shipyard.cancelBatch.useMutation({
    onSuccess: () => {
      utils.shipyard.queue.invalidate({ planetId: planetId! });
      utils.shipyard.defenses.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
      setCancelConfirm(null);
    },
  });

  const reduceMutation = trpc.shipyard.reduceQuantity.useMutation({
    onSuccess: () => {
      utils.shipyard.queue.invalidate();
      utils.shipyard.ships.invalidate();
      utils.shipyard.defenses.invalidate();
      utils.resource.production.invalidate();
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
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

  const buildingCancelMutation = trpc.building.cancel.useMutation({
    onSuccess: () => {
      utils.building.list.invalidate({ planetId: planetId! });
      utils.resource.production.invalidate({ planetId: planetId! });
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
    },
  });

  const defenseQueue = (queue ?? []).filter((q) => q.type === 'defense');
  const isAnyBuildingUpgrading = buildings?.some((b) => b.isUpgrading) ?? false;

  // ── Loading ───────────────────────────────────────────────────────────
  if (isLoading || !defenses) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Défense" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  // ── Locked (arsenal not built) ────────────────────────────────────────
  if (buildings && arsenalLevel < 1) {
    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/80 via-slate-950 to-purple-950/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="relative flex flex-col items-center justify-center px-5 py-16 lg:py-24 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-muted-foreground/20 bg-card/50 mb-6">
              <Shield className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground mb-2">Arsenal planétaire</h1>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Construisez l'<span className="text-foreground font-semibold">Arsenal planétaire</span> pour produire les défenses qui protègent votre colonie.
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

  // ── Per-defense derived values ────────────────────────────────────────
  type DefenseDerivation = {
    qty: number;
    queuedCount: number;
    maxPerPlanetQty: number;
    maxAffordable: number;
    maxQty: number;
    effectiveQty: number;
    canAfford: boolean;
    highlighted: boolean;
    atMax: boolean;
  };
  const derivations = new Map<string, DefenseDerivation>();
  for (const defense of defenses) {
    const qty = quantities[defense.id] || 1;
    const queuedCount = defenseQueue
      .filter((q) => q.itemId === defense.id)
      .reduce((sum, q) => sum + (q.quantity - (q.completedCount ?? 0)), 0);
    const maxPerPlanetQty = defense.maxPerPlanet
      ? Math.max(0, defense.maxPerPlanet - defense.count - queuedCount)
      : 9999;
    const maxAffordable = Math.max(1, Math.min(
      defense.cost.minerai > 0 ? Math.floor(resources.minerai / defense.cost.minerai) : 9999,
      defense.cost.silicium > 0 ? Math.floor(resources.silicium / defense.cost.silicium) : 9999,
      defense.cost.hydrogene > 0 ? Math.floor(resources.hydrogene / defense.cost.hydrogene) : 9999,
      9999,
    ));
    const maxQty = Math.min(maxPerPlanetQty, maxAffordable);
    const effectiveQty = Math.min(qty, maxQty);
    const canAfford =
      resources.minerai >= defense.cost.minerai * effectiveQty &&
      resources.silicium >= defense.cost.silicium * effectiveQty &&
      resources.hydrogene >= defense.cost.hydrogene * effectiveQty;
    const atMax = !!defense.maxPerPlanet && defense.count + queuedCount >= defense.maxPerPlanet;
    derivations.set(defense.id, {
      qty,
      queuedCount,
      maxPerPlanetQty,
      maxAffordable,
      maxQty,
      effectiveQty,
      canAfford,
      highlighted: tutorialTargetId === defense.id,
      atMax,
    });
  }

  // ── Main layout ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <FacilityHero
        buildingId="arsenal"
        title="Arsenal planétaire"
        level={arsenalLevel}
        planetClassId={resourceData?.planetClassId}
        planetImageIndex={resourceData?.planetImageIndex}
        onOpenHelp={() => setHelpOpen(true)}
        upgradeCard={arsenalBuilding && (
          <BuildingUpgradeCard
            currentLevel={arsenalBuilding.currentLevel}
            nextLevelCost={arsenalBuilding.nextLevelCost}
            nextLevelTime={arsenalBuilding.nextLevelTime}
            prerequisites={arsenalBuilding.prerequisites as any}
            isUpgrading={!!arsenalBuilding.isUpgrading}
            upgradeEndTime={arsenalBuilding.upgradeEndTime ?? null}
            resources={{ minerai: resources.minerai, silicium: resources.silicium, hydrogene: resources.hydrogene }}
            buildingLevels={buildingLevels}
            isAnyUpgrading={isAnyBuildingUpgrading}
            upgradePending={upgradeMutation.isPending}
            cancelPending={buildingCancelMutation.isPending}
            gameConfig={gameConfig}
            onUpgrade={() => upgradeMutation.mutate({ planetId: planetId!, buildingId: 'arsenal' as any })}
            onCancel={() => buildingCancelMutation.mutate({ planetId: planetId! })}
            onTimerComplete={() => {
              utils.building.list.invalidate({ planetId: planetId! });
              utils.resource.production.invalidate({ planetId: planetId! });
            }}
          />
        )}
      >
        <FacilityQueue
          queue={defenseQueue}
          items={defenses}
          getItemName={(id) => getDefenseName(id, gameConfig)}
          itemNoun="défense"
          itemNounPlural="défenses"
          onTimerComplete={() => {
            utils.shipyard.queue.invalidate({ planetId: planetId! });
            utils.shipyard.defenses.invalidate({ planetId: planetId! });
          }}
          onReduce={(batchId) => reduceMutation.mutate({ planetId: planetId!, batchId, removeCount: 1 })}
          onCancel={(batchId) => setCancelConfirm(batchId)}
          reducePending={reduceMutation.isPending}
          cancelPending={cancelMutation.isPending}
        />
      </FacilityHero>

      <div className="space-y-4 px-4 pb-4 lg:px-6 lg:pb-6">
        {shieldBuilding && (
          <PlanetaryShieldBanner
            currentLevel={shieldBuilding.currentLevel}
            levelBonus={shieldLevelBonus}
            effectiveCapacity={shieldBuilding.currentLevel > 0
              ? Math.floor(
                  calculateShieldCapacity(shieldBuilding.currentLevel + shieldLevelBonus)
                  * (shieldPercent / 100)
                  * shieldingMultiplier,
                )
              : 0}
            shieldPercent={shieldPercent}
            shieldingMultiplier={shieldingMultiplier}
            nextLevelCost={shieldBuilding.nextLevelCost}
            nextLevelTime={shieldBuilding.nextLevelTime}
            isUpgrading={!!shieldBuilding.isUpgrading}
            upgradeEndTime={shieldBuilding.upgradeEndTime ?? null}
            resources={{ minerai: resources.minerai, silicium: resources.silicium, hydrogene: resources.hydrogene }}
            isAnyUpgrading={isAnyBuildingUpgrading}
            upgradePending={upgradeMutation.isPending}
            cancelPending={buildingCancelMutation.isPending}
            planetClassId={planetClassId}
            hasVariant={shieldHasVariant}
            onUpgrade={() => upgradeMutation.mutate({ planetId: planetId!, buildingId: 'planetaryShield' as any })}
            onCancel={() => buildingCancelMutation.mutate({ planetId: planetId! })}
            onTimerComplete={() => {
              utils.building.list.invalidate({ planetId: planetId! });
              utils.resource.production.invalidate({ planetId: planetId! });
            }}
          />
        )}

        <section className="glass-card p-4 lg:p-5">
          {/* Mobile: compact list */}
          <div className="space-y-1 lg:hidden">
            {defenses.map((defense) => {
              const d = derivations.get(defense.id)!;
              return (
                <button
                  key={defense.id}
                  onClick={() => setDetailId(defense.id)}
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/50 transition-colors',
                    !defense.prerequisitesMet && 'opacity-50',
                    d.highlighted && 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10',
                  )}
                >
                  {d.highlighted && (
                    <span className="absolute top-2 right-2 z-10 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
                      Objectif
                    </span>
                  )}
                  <GameImage category="defenses" id={defense.id} size="icon" alt={defense.name} className="h-8 w-8 rounded" {...getDefenseVariantProps(defense.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{defense.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        x{defense.count}
                        {defense.maxPerPlanet ? ` / ${defense.maxPerPlanet}` : ''}
                      </span>
                    </div>
                    {d.atMax ? (
                      <p className="text-xs text-muted-foreground mt-0.5">{d.queuedCount > 0 ? 'En construction' : 'Maximum atteint'}</p>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <ResourceCost
                          minerai={defense.cost.minerai}
                          silicium={defense.cost.silicium}
                          hydrogene={defense.cost.hydrogene}
                          currentMinerai={resources.minerai}
                          currentSilicium={resources.silicium}
                          currentHydrogene={resources.hydrogene}
                        />
                      </div>
                    )}
                  </div>
                  {defense.prerequisitesMet && d.maxQty > 0 && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <QuantityStepper
                        value={d.effectiveQty}
                        onChange={(v) => setQuantities({ ...quantities, [defense.id]: v })}
                        max={d.maxQty}
                        showMax={false}
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2"
                        onClick={() =>
                          buildMutation.mutate({
                            planetId: planetId!,
                            defenseId: defense.id as any,
                            quantity: d.effectiveQty,
                          })
                        }
                        disabled={!d.canAfford || buildMutation.isPending || d.effectiveQty === 0}
                      >
                        OK
                      </Button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Desktop: vertical card grid */}
          <div className="hidden lg:grid lg:gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            {defenses.map((defense) => {
              const d = derivations.get(defense.id)!;
              return (
                <button
                  key={defense.id}
                  onClick={() => setDetailId(defense.id)}
                  className={cn(
                    'retro-card relative text-left cursor-pointer overflow-hidden flex flex-col',
                    !defense.prerequisitesMet && 'opacity-50',
                    d.highlighted && 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10',
                  )}
                >
                  {d.highlighted && (
                    <span className="absolute top-2 right-2 z-10 rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">
                      Objectif
                    </span>
                  )}
                  <div className="relative h-[130px] overflow-hidden">
                    <GameImage
                      category="defenses"
                      id={defense.id}
                      size="full"
                      alt={defense.name}
                      className="w-full h-full object-cover"
                      {...getDefenseVariantProps(defense.id)}
                    />
                    <span className="absolute top-2 right-2 bg-slate-700/80 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      x{defense.count}
                      {defense.maxPerPlanet ? ` / ${defense.maxPerPlanet}` : ''}
                    </span>
                  </div>

                  <div className="p-3 flex flex-col flex-1 gap-1.5">
                    <div className="text-[13px] font-semibold text-foreground truncate">
                      {defense.name}
                    </div>

                    <div className="flex-1" />

                    {d.atMax ? (
                      <div className="text-[10px] text-muted-foreground">{d.queuedCount > 0 ? 'En construction' : 'Maximum atteint'}</div>
                    ) : (
                      <>
                        <ResourceCost
                          minerai={defense.cost.minerai}
                          silicium={defense.cost.silicium}
                          hydrogene={defense.cost.hydrogene}
                          currentMinerai={resources.minerai}
                          currentSilicium={resources.silicium}
                          currentHydrogene={resources.hydrogene}
                        />
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                          <ClockIcon className="h-3 w-3" />
                          {formatDuration(defense.timePerUnit)}
                        </div>
                        {!defense.prerequisitesMet ? (
                          <PrerequisiteList items={buildPrerequisiteItems(gameConfig?.defenses[defense.id]?.prerequisites ?? {}, buildingLevels, researchLevels, gameConfig)} missingOnly />
                        ) : d.maxQty > 0 ? (
                          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                            <QuantityStepper
                              value={d.effectiveQty}
                              onChange={(v) => setQuantities({ ...quantities, [defense.id]: v })}
                              max={d.maxQty}
                            />
                            <Button
                              variant="retro"
                              size="sm"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                buildMutation.mutate({
                                  planetId: planetId!,
                                  defenseId: defense.id as any,
                                  quantity: d.effectiveQty,
                                });
                              }}
                              disabled={!d.canAfford || buildMutation.isPending || d.effectiveQty === 0}
                            >
                              Construire
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Detail overlay */}
      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? gameConfig?.defenses[detailId]?.name ?? '' : ''}
      >
        {detailId && (
          <DefenseDetailContent
            defenseId={detailId}
            researchLevels={researchLevels}
            buildingLevels={buildingLevels}
            timePerUnit={defenses?.find((d) => d.id === detailId)?.timePerUnit}
            planetClassId={planetClassId}
          />
        )}
      </EntityDetailOverlay>

      {/* Help overlay */}
      <EntityDetailOverlay open={helpOpen} onClose={() => setHelpOpen(false)} title="Arsenal planétaire">
        <ArsenalHelp level={arsenalLevel} />
      </EntityDetailOverlay>

      <ConfirmDialog
        open={!!cancelConfirm}
        onConfirm={() => cancelConfirm && cancelMutation.mutate({ planetId: planetId!, batchId: cancelConfirm })}
        onCancel={() => setCancelConfirm(null)}
        title="Annuler la production ?"
        description="Les unités restantes seront annulées. Le remboursement est proportionnel au temps restant, plafonné à 70% des ressources investies. Les unités déjà produites sont conservées."
        confirmLabel="Annuler la production"
        variant="destructive"
      />
    </div>
  );
}
