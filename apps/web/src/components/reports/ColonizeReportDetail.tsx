import { useNavigate } from 'react-router';
import { trpc } from '@/trpc';
import { ReportHero } from './shared/ReportHero';
import { BiomeCard } from './shared/BiomeCard';
import { PlanetVisual } from '@/components/galaxy/PlanetVisual';
import { getShipName } from '@/lib/entity-names';
import { usePlanetStore } from '@/stores/planet.store';

/** Subset of gameConfig used by this component. */
type GameConfigLike = {
  ships?: Record<string, { name: string }>;
  defenses?: Record<string, { name: string }>;
  planetTypes?: Array<{
    id: string;
    name?: string;
    mineraiBonus?: number;
    siliciumBonus?: number;
    hydrogeneBonus?: number;
  }>;
};

interface Props {
  result: Record<string, unknown>;
  fleet: { ships: Record<string, number>; totalCargo: number };
  gameConfig: GameConfigLike | undefined;
  coordinates: { galaxy: number; system: number; position: number };
}

function AsteroidIcon() {
  return (
    <svg viewBox="0 0 72 72" width="72" height="72" fill="none" stroke="#94a3b8" strokeWidth="1.5">
      <ellipse cx="22" cy="34" rx="11" ry="8" fill="#334155" />
      <ellipse cx="46" cy="28" rx="8" ry="6" fill="#475569" />
      <ellipse cx="40" cy="48" rx="10" ry="7" fill="#334155" />
      <circle cx="56" cy="44" r="3" fill="#64748b" />
      <circle cx="14" cy="48" r="2" fill="#64748b" />
      <circle cx="58" cy="22" r="1.5" fill="#64748b" />
    </svg>
  );
}

function OccupiedIcon() {
  return (
    <svg viewBox="0 0 72 72" width="72" height="72" fill="none">
      <circle cx="36" cy="36" r="24" fill="#78350f" stroke="#fbbf24" strokeWidth="1.5" />
      <circle cx="36" cy="36" r="24" fill="#fbbf24" opacity="0.15" />
      <rect x="29" y="34" width="14" height="11" rx="1.5" fill="#0f172a" stroke="#fbbf24" strokeWidth="1.5" />
      <path d="M32 34 V29 a4 4 0 0 1 8 0 V34" fill="none" stroke="#fbbf24" strokeWidth="1.5" />
    </svg>
  );
}

function ShipGrid({ ships, gameConfig }: { ships: Record<string, number>; gameConfig: GameConfigLike | undefined }) {
  const entries = Object.entries(ships).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {entries.map(([id, n]) => (
        <span key={id} className="text-sm">
          <span className="text-foreground font-medium">{n}x</span>{' '}
          <span className="text-muted-foreground">{id === 'flagship' ? (gameConfig?.ships?.flagship?.name ?? 'Vaisseau amiral') : getShipName(id, gameConfig)}</span>
        </span>
      ))}
    </div>
  );
}

export function ColonizeReportDetail({ result, fleet, gameConfig, coordinates }: Props) {
  // Success
  if (result.success === true) {
    const planetId = result.planetId as string | undefined;
    const { data: planets } = trpc.planet.list.useQuery();
    const newPlanet = planetId ? planets?.find((p) => p.id === planetId) : undefined;
    const planetClassId = newPlanet?.planetClassId ?? undefined;
    const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
    const navigate = useNavigate();

    const { data: systemData } = trpc.galaxy.system.useQuery({
      galaxy: coordinates.galaxy,
      system: coordinates.system,
    });
    const slot = systemData?.slots?.[coordinates.position - 1];
    const knownBiomes =
      slot && typeof slot === 'object' && 'biomes' in slot && Array.isArray((slot as any).biomes)
        ? ((slot as any).biomes as Array<{
            id: string;
            name: string;
            rarity: string;
            effects?: Array<{ stat: string; modifier: number }>;
          }>)
        : [];

    const planetType = planetClassId
      ? gameConfig?.planetTypes?.find((t) => t.id === planetClassId)
      : undefined;
    const planetTypeName = planetType?.name;
    const resourceBonuses = planetType
      ? ([
          { label: 'Minerai', bonus: Number(planetType.mineraiBonus ?? 1) },
          { label: 'Silicium', bonus: Number(planetType.siliciumBonus ?? 1) },
          { label: 'Hydrogène', bonus: Number(planetType.hydrogeneBonus ?? 1) },
        ].filter((b) => b.bonus !== 1))
      : [];

    return (
      <div className="space-y-4">
        <ReportHero
          coords={coordinates}
          title="Nouvelle colonie"
          statusLabel="Débarquement réussi"
          status="success"
          planetClassId={planetClassId}
          lore="Les premiers modules s'enfoncent dans le régolithe. Le drapeau de votre empire flotte au-dessus d'un monde encore sauvage."
        />

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Colonie en construction
          </h3>
          <p className="text-sm text-muted-foreground">
            Les opérations de terraformation ont commencé.
          </p>
          {planetId && (
            <button
              type="button"
              onClick={() => {
                setActivePlanet(planetId);
                navigate('/');
              }}
              className="inline-block mt-3 text-sm text-cyan-400 hover:text-cyan-300 underline"
            >
              Suivre l'avancement →
            </button>
          )}
        </div>

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Monde découvert
          </h3>

          <div className="flex items-center gap-3">
            {planetClassId ? (
              <>
                <PlanetVisual
                  planetClassId={planetClassId}
                  planetImageIndex={null}
                  size={48}
                  variant="thumb"
                />
                <span className="text-sm font-medium text-foreground">{planetTypeName}</span>
              </>
            ) : (
              <span className="text-sm font-medium text-foreground">Nouveau monde</span>
            )}
          </div>

          {resourceBonuses.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {resourceBonuses.map(({ label, bonus }) => {
                const pct = Math.round((bonus - 1) * 100);
                const sign = pct > 0 ? '+' : '';
                const cls = bonus > 1 ? 'text-emerald-400' : 'text-red-400';
                return (
                  <span key={label} className={cls}>
                    {sign}
                    {pct}% {label}
                  </span>
                );
              })}
            </div>
          )}

          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3 mb-2">
            Biomes identifiés
          </div>
          {knownBiomes.length > 0 ? (
            <div className="space-y-3">
              {knownBiomes.map((b) => (
                <BiomeCard key={b.id} biome={b} gameConfig={gameConfig} />
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              Planète non explorée — lancez une mission d'exploration pour cartographier ses biomes.
            </p>
          )}
        </div>

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Flotte débarquée
          </h3>
          <ShipGrid ships={fleet.ships} gameConfig={gameConfig} />
        </div>
      </div>
    );
  }

  // Asteroid belt
  if (result.reason === 'asteroid_belt') {
    return (
      <div className="space-y-4">
        <ReportHero
          coords={coordinates}
          title="Position inhabitable"
          statusLabel="Ceinture d'astéroïdes"
          status="neutral"
          icon={<AsteroidIcon />}
          lore="Le vaisseau colonial n'a trouvé qu'un champ de poussières et de roches."
        />
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Raison</h3>
          <p className="text-sm">Ceinture d'astéroïdes. Un recycleur peut exploiter le champ.</p>
        </div>
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flotte rappelée</h3>
          <ShipGrid ships={fleet.ships} gameConfig={gameConfig} />
        </div>
      </div>
    );
  }

  // Position occupied
  if (result.reason === 'occupied') {
    return (
      <div className="space-y-4">
        <ReportHero
          coords={coordinates}
          title="Position déjà colonisée"
          statusLabel="Arrivée annulée"
          status="warning"
          icon={<OccupiedIcon />}
        />
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Raison</h3>
          <p className="text-sm">Une colonie occupe déjà cette position.</p>
        </div>
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flotte rappelée</h3>
          <ShipGrid ships={fleet.ships} gameConfig={gameConfig} />
        </div>
      </div>
    );
  }

  return null;
}
