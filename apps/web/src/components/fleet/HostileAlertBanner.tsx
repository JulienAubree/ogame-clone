import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { Timer } from '@/components/common/Timer';

interface InboundFleet {
  id: string;
  arrivalTime: string;
  targetPlanetName?: string | null;
  targetPlanetId?: string | null;
  mission: string;
}

interface HostileAlertBannerProps {
  hostileFleets: InboundFleet[];
  /** If true, hides the "Voir details" link (used on the movements page itself) */
  hideLink?: boolean;
  /** If true, renders as a fixed global banner at top of viewport */
  fixed?: boolean;
}

export function HostileAlertBanner({ hostileFleets, hideLink = false, fixed = false }: HostileAlertBannerProps) {
  if (hostileFleets.length === 0) return null;

  const count = hostileFleets.length;

  const content = (
    <div
      className={
        fixed
          ? 'w-full border-b border-destructive/60 bg-gradient-to-r from-destructive/20 via-destructive/10 to-destructive/20 px-4 py-2'
          : 'w-full rounded-lg border border-destructive/60 bg-gradient-to-r from-destructive/20 via-destructive/10 to-destructive/20 px-4 py-3'
      }
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Pulsing red dot */}
          <span className="relative flex h-3 w-3 shrink-0">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: 'hsl(var(--destructive))' }}
            />
            <span
              className="relative inline-flex h-3 w-3 rounded-full"
              style={{ backgroundColor: 'hsl(var(--destructive))' }}
            />
          </span>

          {/* Warning triangle icon */}
          <AlertTriangle
            className="h-4 w-4 shrink-0"
            style={{ color: 'hsl(var(--destructive))' }}
            aria-hidden="true"
          />

          <span className="text-sm font-semibold" style={{ color: 'hsl(var(--destructive))' }}>
            {count === 1
              ? 'ATTAQUE IMMINENTE'
              : `${count} ATTAQUES IMMINENTES`}
          </span>
        </div>

        {!hideLink && (
          <Link
            to="/fleet/movements"
            className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
            style={{ color: 'hsl(var(--destructive))' }}
          >
            Voir details →
          </Link>
        )}
      </div>

      {/* Per-attack details */}
      <ul className="mt-1.5 space-y-1">
        {hostileFleets.map((fleet) => (
          <li key={fleet.id} className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--destructive) / 0.85)' }}>
            <span className="shrink-0">▸</span>
            {fleet.targetPlanetId ? (
              <Link
                to={`/fleet?planet=${fleet.targetPlanetId}`}
                className="flex-1 truncate hover:underline underline-offset-2"
              >
                Attaque sur <span className="font-medium">{fleet.targetPlanetName ?? 'planète'}</span>
              </Link>
            ) : (
              <span className="flex-1 truncate">
                {fleet.targetPlanetName ? (
                  <>Attaque sur <span className="font-medium">{fleet.targetPlanetName}</span></>
                ) : (
                  'Attaque en approche'
                )}
              </span>
            )}
            <Timer
              endTime={new Date(fleet.arrivalTime)}
              className="shrink-0 font-mono"
            />
          </li>
        ))}
      </ul>
    </div>
  );

  return content;
}
