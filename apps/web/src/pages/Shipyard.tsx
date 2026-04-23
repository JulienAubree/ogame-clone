import { useState, useMemo, useEffect } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { useOutletContext, Link } from 'react-router';
import { trpc } from '@/trpc';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useTutorialTargetId } from '@/hooks/useTutorialHighlight';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { ShipDetailContent } from '@/components/entity-details/ShipDetailContent';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ShipyardHero } from '@/components/shipyard/ShipyardHero';
import { ShipyardQueue } from '@/components/shipyard/ShipyardQueue';
import { ShipyardRoleFilter, type ShipyardFilter } from '@/components/shipyard/ShipyardRoleFilter';
import { ShipCard } from '@/components/shipyard/ShipCard';
import { ShipMobileRow } from '@/components/shipyard/ShipMobileRow';
import { ShipyardHelp } from '@/components/shipyard/ShipyardHelp';
import { RoleAllIcon, RoleTransportIcon, RoleUtilityIcon } from '@/components/shipyard/role-icons';

const CATEGORY_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  ship_transport: RoleTransportIcon,
  ship_utilitaire: RoleUtilityIcon,
};

export default function Shipyard() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const utils = trpc.useUtils();
  const { data: gameConfig } = useGameConfig();
  const tutorialTargetId = useTutorialTargetId();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  useEffect(() => { setQuantities({}); }, [planetId]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [filter, setFilter] = useState<ShipyardFilter>('all');

  const shipCategories = (gameConfig?.categories ?? [])
    .filter((c) => c.entityType === 'ship' && c.id !== 'ship_combat')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const { data: buildings } = trpc.building.list.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );
  const shipyardLevel = buildings?.find((b) => b.id === 'shipyard')?.currentLevel ?? 0;

  const { data: ships, isLoading } = trpc.shipyard.ships.useQuery(
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

  const { data: queue } = trpc.shipyard.queue.useQuery(
    { planetId: planetId!, facilityId: 'shipyard' },
    { enabled: !!planetId },
  );

  const { data: researchData } = trpc.research.list.useQuery();
  const researchList = researchData?.items;

  const researchLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    researchList?.forEach((r) => { levels[r.id] = r.currentLevel; });
    return levels;
  }, [researchList]);

  const buildingLevels = useMemo(() => {
    const levels: Record<string, number> = {};
    buildings?.forEach((b) => { levels[b.id] = b.currentLevel; });
    return levels;
  }, [buildings]);

  const buildMutation = trpc.shipyard.buildShip.useMutation({
    onSuccess: () => {
      utils.shipyard.ships.invalidate({ planetId: planetId! });
      utils.shipyard.queue.invalidate({ planetId: planetId!, facilityId: 'shipyard' });
      utils.resource.production.invalidate({ planetId: planetId! });
      utils.planet.empire.invalidate();
      utils.tutorial.getCurrent.invalidate();
    },
  });

  const cancelMutation = trpc.shipyard.cancelBatch.useMutation({
    onSuccess: () => {
      utils.shipyard.queue.invalidate({ planetId: planetId!, facilityId: 'shipyard' });
      utils.shipyard.ships.invalidate({ planetId: planetId! });
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

  const shipQueue = queue ?? [];

  // ── Loading ───────────────────────────────────────────────────────────
  if (isLoading || !ships) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Chantier spatial" />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  // ── Locked (shipyard not built) ───────────────────────────────────────
  if (buildings && shipyardLevel < 1) {
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
            <h1 className="text-xl lg:text-2xl font-bold text-foreground mb-2">Chantier spatial</h1>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Construisez le <span className="text-foreground font-semibold">Chantier spatial</span> pour assembler les vaisseaux industriels de votre empire.
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

  // ── Total units currently in production (for hero pill) ───────────────
  const inProduction = shipQueue.reduce((sum, e) => sum + (e.quantity - (e.completedCount ?? 0)), 0);

  // ── Visible categories based on filter ────────────────────────────────
  const visibleCategories = filter === 'all' ? shipCategories : shipCategories.filter((c) => c.id === filter);

  // ── Per-ship derived values (qty, affordability, highlight) ───────────
  const derivations = new Map<string, {
    qty: number;
    maxAffordable: number;
    canAfford: boolean;
    highlighted: boolean;
  }>();
  for (const ship of ships) {
    const qty = quantities[ship.id] || 1;
    const maxAffordable = Math.max(1, Math.min(
      ship.cost.minerai > 0 ? Math.floor(resources.minerai / ship.cost.minerai) : 9999,
      ship.cost.silicium > 0 ? Math.floor(resources.silicium / ship.cost.silicium) : 9999,
      ship.cost.hydrogene > 0 ? Math.floor(resources.hydrogene / ship.cost.hydrogene) : 9999,
      9999,
    ));
    const canAfford =
      resources.minerai >= ship.cost.minerai * qty &&
      resources.silicium >= ship.cost.silicium * qty &&
      resources.hydrogene >= ship.cost.hydrogene * qty;
    derivations.set(ship.id, { qty, maxAffordable, canAfford, highlighted: tutorialTargetId === ship.id });
  }

  // ── Main layout ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <ShipyardHero
        level={shipyardLevel}
        inProduction={inProduction}
        onOpenHelp={() => setHelpOpen(true)}
      />

      <div className="space-y-4 px-4 pb-4 lg:px-6 lg:pb-6">
        <ShipyardQueue
          queue={shipQueue}
          ships={ships}
          gameConfig={gameConfig}
          onTimerComplete={() => {
            utils.shipyard.queue.invalidate({ planetId: planetId!, facilityId: 'shipyard' });
            utils.shipyard.ships.invalidate({ planetId: planetId! });
          }}
          onReduce={(batchId) => reduceMutation.mutate({ planetId: planetId!, batchId, removeCount: 1 })}
          onCancel={(batchId) => setCancelConfirm(batchId)}
          reducePending={reduceMutation.isPending}
          cancelPending={cancelMutation.isPending}
        />

        <ShipyardRoleFilter value={filter} onChange={setFilter} />

        <section className="glass-card p-4 lg:p-5 space-y-8">
          {visibleCategories.map((category) => {
            const categoryShips = ships.filter((s) => gameConfig?.ships[s.id]?.categoryId === category.id);
            if (categoryShips.length === 0) return null;
            const CategoryIcon = CATEGORY_ICON[category.id] ?? RoleAllIcon;

            return (
              <div key={category.id}>
                {filter === 'all' && (
                  <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    <CategoryIcon className="h-3.5 w-3.5" />
                    {category.name}
                  </h3>
                )}

                {/* Mobile compact list */}
                <div className="space-y-1 lg:hidden">
                  {categoryShips.map((ship) => {
                    const { qty, maxAffordable, canAfford, highlighted } = derivations.get(ship.id)!;

                    return (
                      <ShipMobileRow
                        key={ship.id}
                        ship={ship}
                        quantity={qty}
                        maxAffordable={maxAffordable}
                        canAfford={canAfford}
                        highlighted={highlighted}
                        buildPending={buildMutation.isPending}
                        onQuantityChange={(v) => setQuantities({ ...quantities, [ship.id]: v })}
                        onBuild={() => buildMutation.mutate({ planetId: planetId!, shipId: ship.id as any, quantity: qty })}
                        onOpenDetail={() => setDetailId(ship.id)}
                      />
                    );
                  })}
                </div>

                {/* Desktop vertical card grid */}
                <div className="hidden lg:grid lg:gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                  {categoryShips.map((ship) => {
                    const { qty, maxAffordable, canAfford, highlighted } = derivations.get(ship.id)!;

                    return (
                      <ShipCard
                        key={ship.id}
                        ship={ship}
                        quantity={qty}
                        maxAffordable={maxAffordable}
                        canAfford={canAfford}
                        highlighted={highlighted}
                        resources={{ minerai: resources.minerai, silicium: resources.silicium, hydrogene: resources.hydrogene }}
                        gameConfig={gameConfig}
                        buildingLevels={buildingLevels}
                        researchLevels={researchLevels}
                        buildPending={buildMutation.isPending}
                        onQuantityChange={(v) => setQuantities({ ...quantities, [ship.id]: v })}
                        onBuild={() => buildMutation.mutate({ planetId: planetId!, shipId: ship.id as any, quantity: qty })}
                        onOpenDetail={() => setDetailId(ship.id)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {/* Detail overlay */}
      <EntityDetailOverlay
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={detailId ? gameConfig?.ships[detailId]?.name ?? '' : ''}
      >
        {detailId && (
          <ShipDetailContent
            shipId={detailId}
            researchLevels={researchLevels}
            buildingLevels={buildingLevels}
            maxTemp={resourceData?.maxTemp}
            isHomePlanet={resourceData?.planetClassId === 'homeworld'}
            timePerUnit={ships?.find((s) => s.id === detailId)?.timePerUnit}
          />
        )}
      </EntityDetailOverlay>

      {/* Help overlay */}
      <EntityDetailOverlay open={helpOpen} onClose={() => setHelpOpen(false)} title="Chantier spatial">
        <ShipyardHelp level={shipyardLevel} />
      </EntityDetailOverlay>

      {/* Cancel confirm */}
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
