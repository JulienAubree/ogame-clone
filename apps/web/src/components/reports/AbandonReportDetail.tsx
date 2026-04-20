/**
 * AbandonReportDetail — renders an `abandon_return` mission report.
 *
 * Two states:
 *   - Success: destination still exists — shows delivered ships + cargo
 *     and optional overflow debris left behind.
 *   - Loss-in-transit (aborted): destination was deleted between abandon
 *     and arrival — shows what was lost (ships + cargo).
 */

import { CoordsLink } from '@/components/common/CoordsLink';
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

interface AbandonReportDetailProps {
  result: AbandonReportResult | Record<string, any>;
  gameConfig: GameConfigLike | null | undefined;
}

function shipLabel(id: string, gameConfig: GameConfigLike | null | undefined): string {
  if (id === 'flagship') {
    return gameConfig?.ships?.flagship?.name ?? 'Vaisseau amiral';
  }
  return getShipName(id, gameConfig);
}

export function AbandonReportDetail({ result, gameConfig }: AbandonReportDetailProps) {
  if ((result as any).aborted) {
    const r = result as Extract<AbandonReportResult, { aborted: true }>;
    const ships = r.shipsLost ?? {};
    const cargo = r.cargoLost ?? { minerai: 0, silicium: 0, hydrogene: 0 };
    const shipEntries = Object.entries(ships).filter(([, count]) => count > 0);
    return (
      <div className="space-y-4">
        <div className="glass-card p-4 border border-red-500/20 bg-red-500/5">
          <h3 className="font-semibold text-red-400">Retour échoué</h3>
          <p className="text-sm text-muted-foreground mt-1">
            La planète de destination n'existe plus. Ships et ressources perdus en transit.
          </p>
        </div>

        {shipEntries.length > 0 && (
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Ships perdus
            </h3>
            <div className="flex flex-wrap gap-3">
              {shipEntries.map(([ship, count]) => (
                <span key={ship} className="text-sm">
                  <span className="font-medium text-foreground">{Number(count).toLocaleString('fr-FR')}x</span>{' '}
                  <span className="text-muted-foreground">{shipLabel(ship, gameConfig)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Ressources perdues
          </h3>
          <div className="text-sm space-y-1">
            <div>Minerai : {Number(cargo.minerai ?? 0).toLocaleString('fr-FR')}</div>
            <div>Silicium : {Number(cargo.silicium ?? 0).toLocaleString('fr-FR')}</div>
            <div>Hydrogène : {Number(cargo.hydrogene ?? 0).toLocaleString('fr-FR')}</div>
          </div>
        </div>
      </div>
    );
  }

  const { destination, delivered, overflow } = result as Extract<
    AbandonReportResult,
    { destination: any }
  >;
  const cargo = delivered.cargo ?? { minerai: 0, silicium: 0, hydrogene: 0 };
  const shipEntries = Object.entries(delivered.ships ?? {}).filter(
    ([, count]) => Number(count) > 0,
  );

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Arrivée sur{' '}
          <CoordsLink
            galaxy={destination.galaxy}
            system={destination.system}
            position={destination.position}
          />
        </h3>
        <div className="text-sm space-y-1">
          <div>Destination : {destination.name}</div>
          <div>Minerai livré : {Number(cargo.minerai ?? 0).toLocaleString('fr-FR')}</div>
          <div>Silicium livré : {Number(cargo.silicium ?? 0).toLocaleString('fr-FR')}</div>
          <div>Hydrogène livré : {Number(cargo.hydrogene ?? 0).toLocaleString('fr-FR')}</div>
        </div>
      </div>

      {shipEntries.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Ships arrivés
          </h3>
          <div className="flex flex-wrap gap-3">
            {shipEntries.map(([ship, count]) => (
              <span key={ship} className="text-sm">
                <span className="font-medium text-foreground">{Number(count).toLocaleString('fr-FR')}x</span>{' '}
                <span className="text-muted-foreground">{shipLabel(ship, gameConfig)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {overflow && (overflow.minerai > 0 || overflow.silicium > 0) && (
        <div className="glass-card p-4 border border-amber-500/20 bg-amber-500/5">
          <h3 className="text-sm font-semibold text-amber-300 mb-2">Champ de débris laissé</h3>
          <div className="text-sm space-y-1">
            <div>Minerai : {Number(overflow.minerai).toLocaleString('fr-FR')}</div>
            <div>Silicium : {Number(overflow.silicium).toLocaleString('fr-FR')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
