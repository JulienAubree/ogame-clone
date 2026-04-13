// apps/web/src/components/reports/ExploreReportDetail.tsx
import { useMemo, type ReactNode } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { PlanetVisual } from '@/components/galaxy/PlanetVisual';
import { CoordsLink } from '@/components/common/CoordsLink';

// Button styles — mirrors ModePlanet.tsx so enabled/disabled states
// stay consistent between the galaxy detail panel and the report view.
const BTN_BASE =
  'inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs border transition-colors';
const BTN_EMERALD = `${BTN_BASE} bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25`;
const BTN_CYAN = `${BTN_BASE} bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25`;
const BTN_AMBER = `${BTN_BASE} bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25`;
const BTN_NEUTRAL = `${BTN_BASE} bg-white/5 text-foreground border-white/10 hover:bg-white/10`;
const BTN_DISABLED = `${BTN_BASE} bg-white/5 text-muted-foreground border-white/5 cursor-not-allowed opacity-50`;

function ActionButton({
  enabled,
  enabledClassName,
  disabledTitle,
  enabledTitle,
  onClick,
  children,
}: {
  enabled: boolean;
  enabledClassName: string;
  disabledTitle: string;
  enabledTitle?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      title={enabled ? enabledTitle : disabledTitle}
      className={enabled ? enabledClassName : BTN_DISABLED}
      onClick={enabled ? onClick : undefined}
    >
      {children}
    </button>
  );
}

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

interface BiomeDiscovery {
  id: string;
  name: string;
  rarity: string;
  effects?: Array<{ stat: string; modifier: number }>;
}

interface ExploreReportDetailProps {
  result: {
    discovered?: BiomeDiscovery[];
    discoveredCount?: number;
    remaining?: number;
  };
  coordinates: { galaxy: number; system: number; position: number };
}

function generateReport(opts: {
  discoveredCount: number;
  isComplete: boolean;
  rarities: string[];
  planetTypeName: string;
}): { title: string; body: string } {
  const hasLegendary = opts.rarities.includes('legendary');
  const hasEpic = opts.rarities.includes('epic');
  const hasRare = opts.rarities.includes('rare');

  // Nothing new + nothing left: the mission was redundant, the planet was
  // already fully mapped before this flight.
  if (opts.discoveredCount === 0 && opts.isComplete) {
    return {
      title: "Rapport d'exploration — planète déjà cartographiée",
      body: `Cette planète a déjà été entièrement cartographiée. Elle ne recèle plus aucun secret. Nos équipes confirment l'état des biomes précédemment identifiés.`,
    };
  }

  if (opts.discoveredCount === 0 && !opts.isComplete) {
    return {
      title: "Rapport d'exploration — sans découverte",
      body: `L'équipe scientifique a survolé la position sans parvenir à établir de relevés concluants. Les conditions environnementales de cette planète ${opts.planetTypeName.toLowerCase()} rendent la collecte de données particulièrement délicate. Un second passage, ou une flotte renforcée, devrait permettre de compléter la cartographie.`,
    };
  }

  if (opts.isComplete) {
    const highlight = hasLegendary
      ? "notamment une structure écosystémique d'intérêt majeur"
      : hasEpic
        ? 'dont plusieurs formations géologiques remarquables'
        : hasRare
          ? "avec des particularités dignes d'une étude approfondie"
          : 'à potentiel stratégique modéré';
    return {
      title: "Rapport d'exploration — cartographie complète",
      body: `L'équipe a achevé la cartographie intégrale de cette planète ${opts.planetTypeName.toLowerCase()}. ${opts.discoveredCount} biome${opts.discoveredCount > 1 ? 's' : ''} identifié${opts.discoveredCount > 1 ? 's' : ''}, ${highlight}. La position est désormais prête à être colonisée.`,
    };
  }

  // Partial discovery
  const tone = hasLegendary
    ? 'Découverte exceptionnelle'
    : hasEpic
      ? 'Relevés prometteurs'
      : hasRare
        ? 'Premiers résultats encourageants'
        : 'Résultats préliminaires';
  return {
    title: `Rapport d'exploration — ${tone.toLowerCase()}`,
    body: `Notre équipe a isolé ${opts.discoveredCount} biome${opts.discoveredCount > 1 ? 's' : ''} lors de cette mission. Les relevés suggèrent que la planète recèle encore des formations non identifiées ; une nouvelle mission sera nécessaire pour compléter la cartographie.`,
  };
}

export function ExploreReportDetail({ result, coordinates }: ExploreReportDetailProps) {
  const navigate = useNavigate();
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const { data: gameConfig } = useGameConfig();
  const addToast = useToastStore((s) => s.addToast);

  const canCreate = trpc.explorationReport.canCreate.useQuery({
    galaxy: coordinates.galaxy,
    system: coordinates.system,
    position: coordinates.position,
  });

  const createMutation = trpc.explorationReport.create.useMutation({
    onSuccess: () => {
      addToast('Rapport cree — renseignez votre prix de vente', 'success');
      navigate('/market?view=report-my');
    },
    onError: (err) => {
      addToast(err.message ?? 'Erreur lors de la creation du rapport', 'error');
    },
  });

  const handleSellReport = () => {
    if (!planetId) return;
    createMutation.mutate({
      planetId,
      galaxy: coordinates.galaxy,
      system: coordinates.system,
      position: coordinates.position,
    });
  };

  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

  const { data: systemData } = trpc.galaxy.system.useQuery({
    galaxy: coordinates.galaxy,
    system: coordinates.system,
  });

  const discovered = result.discovered ?? [];
  const discoveredCount = result.discoveredCount ?? discovered.length;
  const remaining = result.remaining ?? 0;
  const isComplete = remaining === 0;

  const targetSlot = systemData?.slots?.[coordinates.position - 1];
  const planetClassId: string | null =
    targetSlot && typeof targetSlot === 'object' && 'planetClassId' in targetSlot
      ? ((targetSlot as any).planetClassId ?? null)
      : null;

  // Biomes the player currently knows about this position, from the live
  // galaxy state. Used when the exploration is complete so the report
  // displays the full picture (not just what this specific mission found).
  const targetBiomes: BiomeDiscovery[] =
    targetSlot && typeof targetSlot === 'object' && 'biomes' in targetSlot && Array.isArray((targetSlot as any).biomes)
      ? ((targetSlot as any).biomes as BiomeDiscovery[])
      : [];

  const planetTypeName = planetClassId
    ? (gameConfig?.planetTypes?.find((t: any) => t.id === planetClassId)?.name ?? 'Inconnue')
    : 'Inconnue';

  const colonizerShipId = useMemo(() => {
    if (!gameConfig?.ships) return null;
    const entry = Object.entries(gameConfig.ships).find(
      ([, s]) => (s as any).role === 'colonization',
    );
    return entry?.[0] ?? null;
  }, [gameConfig?.ships]);

  const explorerShipId = useMemo(() => {
    if (!gameConfig?.ships) return null;
    const entry = Object.entries(gameConfig.ships).find(
      ([, s]) => (s as any).role === 'exploration',
    );
    return entry?.[0] ?? null;
  }, [gameConfig?.ships]);

  const hasColonizer = !!(
    colonizerShipId && ships?.find((s: any) => s.id === colonizerShipId && s.count > 0)
  );
  const hasExplorer = !!(
    explorerShipId && ships?.find((s: any) => s.id === explorerShipId && s.count > 0)
  );

  // When the planet is fully mapped, show all known biomes (full state).
  // Otherwise surface only the ones this specific mission turned up.
  const biomesToShow = isComplete ? targetBiomes : discovered;
  const biomesSectionTitle =
    isComplete && discoveredCount === 0
      ? 'État actuel des biomes'
      : isComplete
        ? 'Biomes cartographiés'
        : 'Nouveaux biomes';

  const rarities = discovered.map((b) => b.rarity);
  const report = generateReport({
    discoveredCount,
    isComplete,
    rarities,
    planetTypeName,
  });

  // coordsLabel kept for non-link usages; CoordsLink used in JSX
  const coordsLabel = `[${coordinates.galaxy}:${coordinates.system}:${coordinates.position}]`;

  const statusBadge = isComplete
    ? { label: 'Cartographie complète', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    : { label: 'Exploration incomplète', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };

  return (
    <div className="glass-card p-4 lg:p-5 border border-cyan-500/20">
      {/* Header row: planet visual + target info */}
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <PlanetVisual
            planetClassId={planetClassId}
            planetImageIndex={null}
            size={128}
            variant="thumb"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Position cartographiée
          </div>
          <h3 className="text-lg font-bold text-foreground leading-tight">{planetTypeName}</h3>
          <div className="mt-0.5"><CoordsLink galaxy={coordinates.galaxy} system={coordinates.system} position={coordinates.position} /></div>
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusBadge.cls}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {statusBadge.label}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="text-cyan-400 font-semibold">{discoveredCount}</span> biome
            {discoveredCount > 1 ? 's' : ''} découvert{discoveredCount > 1 ? 's' : ''}
            {!isComplete && remaining > 0 && (
              <>
                {' '}
                · <span className="text-amber-400">{remaining} restant{remaining > 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scientific report flavor block */}
      <div className="mt-4 rounded-lg border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-cyan-400/80 mb-2">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 3h6" />
            <path d="M10 3v6L4.5 19a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3" />
            <path d="M7 14h10" />
          </svg>
          <span>Rapport scientifique</span>
        </div>
        <h4 className="text-sm font-semibold text-foreground mb-1">{report.title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed italic">{report.body}</p>
      </div>

      {/* Biomes section */}
      {biomesToShow.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {biomesSectionTitle}
          </h3>
          <div className="space-y-3">
            {biomesToShow.map((biome) => {
              const color = RARITY_COLORS[biome.rarity] ?? '#9ca3af';
              return (
                <div
                  key={biome.id}
                  className="border-l-2 pl-3"
                  style={{ borderColor: color }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
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
                  {biome.effects && biome.effects.length > 0 && (
                    <div className="text-xs space-y-0.5 ml-4">
                      {biome.effects.map((e, i) => (
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
      )}

      {/* Action buttons row */}
      <div className="mt-5 pt-4 border-t border-border/50">
        <div className="flex flex-wrap gap-2">
          <ActionButton
            enabled={hasColonizer}
            enabledClassName={BTN_EMERALD}
            disabledTitle="Aucun vaisseau de colonisation disponible"
            onClick={() =>
              navigate(
                `/fleet/send?mission=colonize&galaxy=${coordinates.galaxy}&system=${coordinates.system}&position=${coordinates.position}`,
              )
            }
          >
            Coloniser
          </ActionButton>
          <ActionButton
            enabled={hasExplorer && !isComplete}
            enabledClassName={BTN_CYAN}
            disabledTitle={
              !hasExplorer
                ? "Aucun vaisseau d'exploration disponible"
                : "L'exploration de cette planète est terminée"
            }
            onClick={() =>
              navigate(
                `/fleet/send?mission=explore&galaxy=${coordinates.galaxy}&system=${coordinates.system}&position=${coordinates.position}`,
              )
            }
          >
            Explorer à nouveau
          </ActionButton>
          <ActionButton
            enabled={canCreate.data?.canCreate === true && !createMutation.isPending}
            enabledClassName={BTN_AMBER}
            disabledTitle={canCreate.data?.reason ?? 'Vente impossible'}
            onClick={handleSellReport}
          >
            {createMutation.isPending ? 'Creation...' : 'Vendre le rapport'}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
