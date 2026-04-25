import { useNavigate } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { Timer } from '@/components/common/Timer';

interface InboundFleet {
  id: string;
  senderUsername: string | null;
  allianceTag: string | null;
  originGalaxy: number;
  originSystem: number;
  originPosition: number;
  departureTime: string;
  arrivalTime: string;
  ships: Record<string, number>;
  detectionTier?: number;
  shipCount?: number;
}

interface AttackAlertProps {
  hostileFleets: InboundFleet[];
  onTimerComplete: () => void;
}

export function AttackAlert({ hostileFleets, onTimerComplete }: AttackAlertProps) {
  const navigate = useNavigate();

  if (hostileFleets.length === 0) return null;

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-red-500/40 cursor-pointer hover:border-red-500/60 transition-colors"
      style={{ background: 'linear-gradient(135deg, rgba(127,29,29,0.5) 0%, rgba(69,10,10,0.6) 50%, rgba(127,29,29,0.4) 100%)' }}
      onClick={() => navigate('/fleet/movements')}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(239,68,68,0.08) 50%, transparent 100%)',
          animation: 'scan 3s ease-in-out infinite',
        }}
      />
      <style>{`@keyframes scan { 0%,100% { transform: translateX(-100%); } 50% { transform: translateX(100%); } }`}</style>

      <div className="h-1 w-full bg-gradient-to-r from-red-600 via-red-500 to-red-600" />

      <div className="px-4 py-3 space-y-2.5 relative">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-40" />
            </div>
            <AlertTriangle className="h-[18px] w-[18px] flex-shrink-0" stroke="#ef4444" />
          </div>
          <span className="text-red-400 font-bold text-sm uppercase tracking-wider">Attaque imminente</span>
          <span className="text-red-400/60 text-[10px] font-semibold ml-auto">
            {hostileFleets.length} flotte{hostileFleets.length > 1 ? 's' : ''}
          </span>
        </div>

        {hostileFleets.map((event) => {
          const tier = event.detectionTier ?? 0;
          const ships = event.ships;
          const shipCount = tier >= 3
            ? Object.values(ships).reduce((sum, n) => sum + n, 0)
            : tier >= 2 ? (event.shipCount ?? 0) : 0;
          const hasOrigin = tier >= 1;
          const hasSender = tier >= 4;

          const dep = new Date(event.departureTime).getTime();
          const arr = new Date(event.arrivalTime).getTime();
          const total = arr - dep;
          const progress = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - dep) / total) * 100)) : 100;

          return (
            <div key={event.id} className="space-y-1.5 border-t border-red-500/20 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-red-300">
                  {hasSender ? (
                    <>
                      {event.allianceTag && <span className="text-red-400 mr-1">[{event.allianceTag}]</span>}
                      {event.senderUsername}
                    </>
                  ) : (
                    <span className="italic text-red-400/50">Attaquant inconnu</span>
                  )}
                </span>
                <div className="ml-auto">
                  <Timer endTime={new Date(event.arrivalTime)} onComplete={onTimerComplete} className="!text-red-400 font-bold" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-red-300/60">
                <span>{hasOrigin ? `[${event.originGalaxy}:${event.originSystem}:${event.originPosition}]` : '???'} → ici</span>
                {shipCount > 0 && (
                  <>
                    <span className="text-red-500/30">·</span>
                    <span>{shipCount} vaisseaux</span>
                  </>
                )}
              </div>
              <div className="h-1 rounded-full bg-red-950/60 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400" style={{ width: `${progress}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
