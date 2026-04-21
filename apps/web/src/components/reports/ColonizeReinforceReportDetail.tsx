import { ReportHero } from './shared/ReportHero';
import { ResourceDeltaCard } from './shared/ResourceDeltaCard';
import { getShipName } from '@/lib/entity-names';

interface Props {
  result: Record<string, any>;
  fleet: { ships: Record<string, number>; totalCargo: number };
  gameConfig: any;
  coordinates: { galaxy: number; system: number; position: number };
}

function CargoDeliveredIcon() {
  return (
    <svg viewBox="0 0 72 72" width="72" height="72" fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round">
      <rect x="18" y="30" width="36" height="28" rx="2" fill="#065f46" />
      <line x1="18" y1="42" x2="54" y2="42" />
      <line x1="36" y1="30" x2="36" y2="58" />
      <path d="M36 10 v14" />
      <path d="M28 20 l8 8 l8 -8" fill="none" />
    </svg>
  );
}

function EmptyDockIcon() {
  return (
    <svg viewBox="0 0 72 72" width="72" height="72" fill="none" stroke="#fbbf24" strokeWidth="2">
      <path d="M14 54 h44" />
      <path d="M18 54 v-22" />
      <path d="M54 54 v-22" />
      <text x="36" y="44" textAnchor="middle" fill="#fbbf24" fontSize="22" fontFamily="sans-serif" fontWeight="bold" stroke="none">?</text>
    </svg>
  );
}

function ShipGrid({ ships, gameConfig }: { ships: Record<string, number>; gameConfig: any }) {
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

export function ColonizeReinforceReportDetail({ result, fleet, gameConfig, coordinates }: Props) {
  // Aborted
  if (result.aborted === true) {
    return (
      <div className="space-y-4">
        <ReportHero
          coords={coordinates}
          title="Mission annulée"
          statusLabel="Cible non trouvée"
          status="warning"
          icon={<EmptyDockIcon />}
          lore="À l'arrivée, plus rien à défendre."
        />
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Raison</h3>
          <p className="text-sm">La colonisation est terminée ou a été abandonnée.</p>
        </div>
        <div className="glass-card p-4 text-xs text-muted-foreground italic">
          La flotte et son cargo reviennent à leur planète d'origine (rapport d'arrivée séparé).
        </div>
      </div>
    );
  }

  // Delivered
  const stationed = (result.stationed as Record<string, number>) ?? {};
  const deposited = (result.deposited as { minerai: number; silicium: number; hydrogene: number }) ?? { minerai: 0, silicium: 0, hydrogene: 0 };
  const shipsToShow = Object.keys(stationed).length > 0 ? stationed : fleet.ships;

  return (
    <div className="space-y-4">
      <ReportHero
        coords={coordinates}
        title="Renforts livrés"
        statusLabel="Colonisation en cours"
        status="success"
        icon={<CargoDeliveredIcon />}
      />
      <ResourceDeltaCard title="Cargo livré" cargo={deposited} variant="gain" />
      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Ships intégrés à la garnison
        </h3>
        <ShipGrid ships={shipsToShow} gameConfig={gameConfig} />
      </div>
    </div>
  );
}
