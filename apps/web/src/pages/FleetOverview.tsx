import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Star, ArrowDown, ArrowUp } from 'lucide-react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { usePlanetStore } from '@/stores/planet.store';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { getAssetUrl, getPlanetImageUrl } from '@/lib/assets';
import { cn } from '@/lib/utils';

type FilterMode = 'all' | 'with-ships' | 'empty';
type SortMode = 'fp' | 'ships' | 'cargo' | 'name';

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.floor(value));
}

export default function FleetOverview() {
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const { data: gameConfig } = useGameConfig();
  const { data: overview, isLoading } = trpc.shipyard.empireOverview.useQuery();

  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('fp');
  const [sortAsc, setSortAsc] = useState(false);

  const filteredPlanets = useMemo(() => {
    if (!overview) return [];
    let list = [...overview.planets];

    if (filter === 'with-ships') list = list.filter((p) => p.totalShips > 0);
    if (filter === 'empty') list = list.filter((p) => p.totalShips === 0);

    list.sort((a, b) => {
      let cmp = 0;
      switch (sort) {
        case 'fp': cmp = a.totalFP - b.totalFP; break;
        case 'ships': cmp = a.totalShips - b.totalShips; break;
        case 'cargo': cmp = a.totalCargo - b.totalCargo; break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [overview, filter, sort, sortAsc]);

  if (isLoading || !overview) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Vue de la flotte" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  const { empireTotals, flagship } = overview;
  const counts = {
    all: overview.planets.length,
    withShips: overview.planets.filter((p) => p.totalShips > 0).length,
    empty: overview.planets.filter((p) => p.totalShips === 0).length,
  };

  return (
    <div className="space-y-3 p-3 lg:p-4">
      <PageHeader title="Vue de la flotte" />

      {/* ── Bandeau de totaux empire ───────────────────────────────────── */}
      <section className="space-y-2">
        {empireTotals.shipsByType.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 p-4 text-center text-sm text-muted-foreground">
            Aucun vaisseau dans votre flotte. Construisez-en au Chantier spatial ou au Centre de commandement.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {flagship && flagship.status === 'active' && (
                <TotalChip
                  icon={<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                  value="1"
                  label={flagship.planetName ? `Amiral · ${flagship.planetName}` : 'Amiral'}
                  accent="amber"
                />
              )}
              {empireTotals.shipsByType.map((s) => (
                <TotalChip
                  key={s.id}
                  icon={
                    <img
                      src={getAssetUrl('ships', s.id, 'thumb')}
                      alt=""
                      className="h-5 w-5 rounded-sm object-cover"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  }
                  value={s.count.toLocaleString('fr-FR')}
                  label={s.name}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span><strong className="font-mono text-foreground">{empireTotals.totalShips.toLocaleString('fr-FR')}</strong> vaisseaux · {counts.all} planète{counts.all > 1 ? 's' : ''}</span>
              <span>FP <strong className="font-mono text-amber-400">{formatCompact(empireTotals.totalFP)}</strong></span>
              <span>Cargo <strong className="font-mono text-foreground">{formatCompact(empireTotals.totalCargo)}</strong></span>
            </div>
          </>
        )}
      </section>

      {/* ── Filtres + tri ───────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Toutes · {counts.all}</FilterChip>
        <FilterChip active={filter === 'with-ships'} onClick={() => setFilter('with-ships')}>Avec vsx · {counts.withShips}</FilterChip>
        <FilterChip active={filter === 'empty'} onClick={() => setFilter('empty')}>Vides · {counts.empty}</FilterChip>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
          >
            <option value="fp">FP</option>
            <option value="ships">Vsx</option>
            <option value="cargo">Cargo</option>
            <option value="name">Nom</option>
          </select>
          <button
            type="button"
            onClick={() => setSortAsc((v) => !v)}
            className="rounded-md border border-border bg-background p-0.5 text-foreground hover:bg-accent"
            title={sortAsc ? 'Croissant' : 'Décroissant'}
          >
            {sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          </button>
        </div>
      </section>

      {/* ── Grid de planètes ────────────────────────────────────────────── */}
      <section>
        {filteredPlanets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
            Aucune planète ne correspond aux filtres.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {filteredPlanets.map((p) => (
              <PlanetFleetCard
                key={p.id}
                planet={p}
                gameConfig={gameConfig}
                onOpen={() => {
                  setActivePlanet(p.id);
                  navigate('/fleet/stationed');
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function TotalChip({ icon, value, label, accent }: { icon: React.ReactNode; value: string; label: string; accent?: 'amber' }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border bg-card/60 px-2 py-1',
        accent === 'amber' ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60',
      )}
      title={label}
    >
      <div className="flex h-5 w-5 items-center justify-center shrink-0">{icon}</div>
      <span className={cn('font-mono text-sm font-bold leading-none', accent === 'amber' ? 'text-amber-400' : 'text-foreground')}>
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground line-clamp-1 max-w-[120px]">{label}</span>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/15 text-primary'
          : 'border-border/60 text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

interface PlanetShipEntry {
  id: string;
  name: string;
  count: number;
  role: string | null;
  cargoCapacity: number;
}

interface Planet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  ships: PlanetShipEntry[];
  totalShips: number;
  totalCargo: number;
  totalFP: number;
  hasFlagship: boolean;
}

function PlanetFleetCard({
  planet,
  gameConfig,
  onOpen,
}: {
  planet: Planet;
  gameConfig: ReturnType<typeof useGameConfig>['data'];
  onOpen: () => void;
}) {
  const planetClassName = planet.planetClassId
    ? (gameConfig?.planetTypes as { id: string; name: string }[] | undefined)?.find((t) => t.id === planet.planetClassId)?.name ?? null
    : null;
  const hasImage = !!planet.planetClassId && planet.planetImageIndex != null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-2.5 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-2 mb-2">
        {hasImage ? (
          <img
            src={getPlanetImageUrl(planet.planetClassId!, planet.planetImageIndex!, 'thumb')}
            alt=""
            className="h-8 w-8 rounded-full border border-primary/30 object-cover shrink-0"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
        ) : (
          <div className="h-8 w-8 rounded-full border border-border/60 bg-slate-800 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{planet.name}</span>
            {planet.hasFlagship && (
              <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" aria-label="Amiral présent" />
            )}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground leading-tight">
            [{planet.galaxy}:{planet.system}:{planet.position}]{planetClassName ? ` · ${planetClassName}` : ''}
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0 text-[10px] leading-tight">
          <span className="font-mono text-amber-400 font-semibold">{formatCompact(planet.totalFP)}</span>
          <span className="text-muted-foreground/70">FP</span>
        </div>
      </div>

      {planet.ships.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/40 py-2 text-center text-[11px] text-muted-foreground/70">
          Aucun vaisseau stationné
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
          {planet.ships.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 rounded bg-background/40 px-1.5 py-1"
              title={`${s.count.toLocaleString('fr-FR')} ${s.name}`}
            >
              <img
                src={getAssetUrl('ships', s.id, 'thumb')}
                alt=""
                className="h-4 w-4 rounded-sm object-cover shrink-0"
                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
              />
              <span className="font-mono text-[11px] font-semibold text-foreground">{s.count.toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 border-t border-border/30 pt-1.5 text-[10px] text-muted-foreground">
        <span><strong className="font-mono text-foreground">{planet.totalShips.toLocaleString('fr-FR')}</strong> vsx</span>
        <span>Cargo <strong className="font-mono text-foreground">{formatCompact(planet.totalCargo)}</strong></span>
      </div>
    </button>
  );
}
