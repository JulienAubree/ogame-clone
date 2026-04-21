import { CoordsLink } from '@/components/common/CoordsLink';
import { ReportHero } from './shared/ReportHero';
import { ResourceDeltaCard } from './shared/ResourceDeltaCard';
import { getShipName } from '@/lib/entity-names';

interface GameConfigLike {
  ships?: Record<string, { name: string }>;
  [key: string]: unknown;
}

type Cargo = { minerai: number; silicium: number; hydrogene: number };

type AbandonReportResult =
  | {
      aborted: true;
      reason: string;
      shipsLost: Record<string, number>;
      cargoLost: Cargo;
    }
  | {
      destination: {
        id: string;
        name: string;
        galaxy: number;
        system: number;
        position: number;
      };
      delivered: {
        ships: Record<string, number>;
        cargo: Cargo;
      };
      overflow: { minerai: number; silicium: number; hydrogene: number } | null;
    };

interface Props {
  result: AbandonReportResult | Record<string, any>;
  gameConfig: GameConfigLike | null | undefined;
  coordinates?: { galaxy: number; system: number; position: number };
}

function DockingIcon() {
  return (
    <svg viewBox="0 0 72 72" width="72" height="72" fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round">
      <path d="M14 48 h44" />
      <path d="M18 48 v-12" />
      <path d="M54 48 v-12" />
      <path d="M22 30 l14 -6 l14 6 l-4 6 h-20 Z" fill="#065f46" />
      <line x1="22" y1="48" x2="22" y2="56" />
      <line x1="50" y1="48" x2="50" y2="56" />
      <line x1="36" y1="24" x2="36" y2="18" />
      <circle cx="36" cy="16" r="2" fill="#34d399" stroke="none" />
    </svg>
  );
}

function LostShipIcon() {
  return (
    <svg viewBox="0 0 72 72" width="72" height="72" fill="none" stroke="#f43f5e" strokeWidth="1.5">
      <path d="M10 36 l16 -10" />
      <path d="M26 26 l12 4" />
      <path d="M28 40 l10 8" />
      <path d="M38 30 l4 -8" />
      <path d="M42 22 l10 14" />
      <path d="M38 48 l8 -6" />
      <path d="M46 42 l12 -6" />
      <circle cx="14" cy="38" r="1.5" fill="#f43f5e" stroke="none" />
      <circle cx="52" cy="48" r="1.5" fill="#f43f5e" stroke="none" />
      <circle cx="44" cy="22" r="1.5" fill="#f43f5e" stroke="none" />
    </svg>
  );
}

function shipLabel(id: string, gameConfig: GameConfigLike | null | undefined) {
  if (id === 'flagship') {
    return gameConfig?.ships?.flagship?.name ?? 'Vaisseau amiral';
  }
  return getShipName(id, gameConfig);
}

function ShipGrid({ ships, gameConfig }: { ships: Record<string, number>; gameConfig: GameConfigLike | null | undefined }) {
  const entries = Object.entries(ships).filter(([, n]) => Number(n) > 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {entries.map(([id, n]) => (
        <span key={id} className="text-sm">
          <span className="text-foreground font-medium">{Number(n).toLocaleString('fr-FR')}x</span>{' '}
          <span className="text-muted-foreground">{shipLabel(id, gameConfig)}</span>
        </span>
      ))}
    </div>
  );
}

function reasonText(reason: string): string {
  if (reason === 'destination_gone' || reason === 'destination_deleted') {
    return 'La destination n\'existe plus.';
  }
  return reason;
}

export function AbandonReportDetail({ result, gameConfig, coordinates }: Props) {
  // Lost in transit
  if ((result as any).aborted === true) {
    const r = result as Extract<AbandonReportResult, { aborted: true }>;
    const shipsLost = r.shipsLost ?? {};
    const cargoLost = r.cargoLost ?? { minerai: 0, silicium: 0, hydrogene: 0 };
    return (
      <div className="space-y-4">
        <ReportHero
          coords={coordinates ?? { galaxy: 0, system: 0, position: 0 }}
          title="Convoi perdu"
          statusLabel="Retour échoué"
          status="danger"
          icon={<LostShipIcon />}
          lore="La planète de destination s'est effondrée avant l'arrivée. Le convoi erre dans le vide, sans port d'attache."
        />
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Raison</h3>
          <p className="text-sm">{reasonText(r.reason ?? '')}</p>
        </div>
        {Object.keys(shipsLost).length > 0 && (
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ships perdus</h3>
            <ShipGrid ships={shipsLost} gameConfig={gameConfig} />
          </div>
        )}
        <ResourceDeltaCard title="Ressources perdues" cargo={cargoLost} variant="loss" />
      </div>
    );
  }

  // Homecoming
  const { destination, delivered, overflow } = result as Extract<AbandonReportResult, { destination: any }>;
  return (
    <div className="space-y-4">
      <ReportHero
        coords={{ galaxy: destination.galaxy, system: destination.system, position: destination.position }}
        title={destination.name}
        statusLabel="Convoi rapatrié"
        status="success"
        icon={<DockingIcon />}
        lore="Le convoi s'amarre au port spatial. Le monde qu'il a quitté n'existe plus."
      />
      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Arrivée sur{' '}
          <CoordsLink galaxy={destination.galaxy} system={destination.system} position={destination.position} />
        </h3>
        <p className="text-sm">Destination : {destination.name}</p>
      </div>
      {Object.keys(delivered.ships ?? {}).length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Ships rapatriés
          </h3>
          <ShipGrid ships={delivered.ships} gameConfig={gameConfig} />
        </div>
      )}
      <ResourceDeltaCard title="Ressources livrées" cargo={delivered.cargo} variant="gain" />
      {overflow && (
        <ResourceDeltaCard
          title="Champ de débris laissé"
          cargo={overflow}
          variant="debris"
          explainer="Recyclable par votre flotte sur l'ancienne position."
        />
      )}
    </div>
  );
}
