import { useNavigate } from 'react-router';
import { Shield } from 'lucide-react';
import { Timer } from '@/components/common/Timer';
import { FleetIcon, DefenseIcon, FlagshipIcon, MovementsIcon } from '@/lib/icons';
import { getFlagshipImageUrl } from '@/lib/assets';

interface ShipCount {
  id: string;
  name: string;
  count: number;
}

interface DefenseCount {
  id: string;
  name: string;
  count: number;
}

interface FleetMovement {
  id: string;
  mission: string;
  phase: string;
  departureTime: string;
  arrivalTime: string;
  ships: Record<string, number>;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  originPlanetId: string;
  mineraiCargo: number;
  siliciumCargo: number;
  hydrogeneCargo: number;
  // For inbound peaceful
  senderUsername?: string | null;
  allianceTag?: string | null;
  originGalaxy?: number;
  originSystem?: number;
  originPosition?: number;
  originPlanetName?: string | null;
}

interface FlagshipData {
  name: string;
  status: string;
  hullId: string | null;
  flagshipImageIndex: number | null;
  planetId: string | null;
}

interface OverviewGridProps {
  ships: ShipCount[];
  defenses: DefenseCount[];
  movements: FleetMovement[];
  flagship: FlagshipData | undefined;
  shieldLevel: number;
  currentPlanetId: string;
  currentPlanetName: string;
  currentPlanetCoords: { galaxy: number; system: number; position: number };
  gameConfig: any;
  onFleetTimerComplete: () => void;
}

function GridCard({ children, onClick, className = '' }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <div
      className={`glass-card p-3 cursor-pointer hover:bg-muted/30 transition-colors ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function GridHeader({ icon: Icon, label, color, count }: { icon: any; label: string; color: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className={`text-[11px] font-semibold flex items-center gap-1.5 ${color}`}>
        <Icon width={14} height={14} />
        {label}
      </h3>
      {count != null && <span className="text-[10px] text-muted-foreground">{count}</span>}
    </div>
  );
}

export function OverviewGrid({
  ships, defenses, movements, flagship, shieldLevel, currentPlanetId, currentPlanetName: _currentPlanetName, currentPlanetCoords: _currentPlanetCoords, gameConfig, onFleetTimerComplete,
}: OverviewGridProps) {
  const navigate = useNavigate();
  const totalShips = ships.reduce((sum, s) => sum + s.count, 0);
  const totalDefenses = defenses.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Fleet */}
      <GridCard onClick={() => navigate('/fleet')}>
        <GridHeader icon={FleetIcon} label="Flotte stationnée" color="text-cyan-400" count={totalShips} />
        {ships.length > 0 ? (
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            {ships.map((s) => (
              <div key={s.id} className="flex justify-between px-1.5 py-1 rounded bg-white/[0.03]">
                <span className="text-muted-foreground truncate">{s.name}</span>
                <span className="font-semibold ml-1">{s.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Aucun vaisseau stationné</p>
        )}
      </GridCard>

      {/* Movements */}
      <GridCard onClick={() => navigate('/fleet/movements')}>
        <GridHeader icon={MovementsIcon} label="Mouvements" color="text-purple-400" count={movements.length} />
        {movements.length > 0 ? (
          <div className="space-y-1.5">
            {movements.slice(0, 4).map((m) => {
              const missionLabel = gameConfig?.missions[m.mission]?.label ?? m.mission;
              const hex = gameConfig?.missions[m.mission]?.color ?? '#8b5cf6';
              const phaseLabel = gameConfig?.labels[`phase.${m.phase}`] ?? m.phase;

              return (
                <div key={m.id} className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: hex }} />
                    <span className="font-medium text-foreground truncate">{missionLabel}</span>
                    <span className="text-muted-foreground/60 text-[9px]">{phaseLabel}</span>
                    <div className="ml-auto flex-shrink-0">
                      <Timer endTime={new Date(m.arrivalTime)} onComplete={onFleetTimerComplete} className="!text-[9px]" />
                    </div>
                  </div>
                  <div className="h-[1.5px] rounded-full bg-white/[0.04] overflow-hidden ml-3">
                    <div className="h-full rounded-full" style={{
                      background: hex,
                      width: `${Math.min(100, Math.max(0, ((Date.now() - new Date(m.departureTime).getTime()) / (new Date(m.arrivalTime).getTime() - new Date(m.departureTime).getTime())) * 100))}%`,
                    }} />
                  </div>
                </div>
              );
            })}
            {movements.length > 4 && (
              <p className="text-[9px] text-muted-foreground">+{movements.length - 4} autre{movements.length - 4 > 1 ? 's' : ''}</p>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Aucun mouvement</p>
        )}
      </GridCard>

      {/* Defenses — col-span-2 on mobile, normal on desktop */}
      <GridCard onClick={() => navigate('/defense')} className="col-span-2 lg:col-span-1">
        <GridHeader icon={DefenseIcon} label="Défenses" color="text-emerald-400" count={totalDefenses} />
        {shieldLevel > 0 && (
          <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-cyan-500/[0.06] border border-cyan-500/10 mb-1.5 text-[10px]">
            <Shield className="h-3 w-3 text-cyan-400 flex-shrink-0" />
            <span className="text-cyan-300 font-medium">Bouclier planétaire</span>
            <span className="text-cyan-400 font-bold ml-auto">Niv. {shieldLevel}</span>
          </div>
        )}
        {defenses.length > 0 ? (
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            {defenses.map((d) => (
              <div key={d.id} className="flex justify-between px-1.5 py-1 rounded bg-white/[0.03]">
                <span className="text-muted-foreground truncate">{d.name}</span>
                <span className="font-semibold ml-1">{d.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Aucune défense</p>
        )}
      </GridCard>

      {/* Flagship — col-span-2 on mobile, normal on desktop */}
      <GridCard onClick={() => navigate('/flagship')} className="col-span-2 lg:col-span-1">
        <GridHeader icon={FlagshipIcon} label="Vaisseau amiral" color="text-yellow-400" />
        {flagship ? (
          flagship.planetId === currentPlanetId ? (
            <div className="flex items-center gap-3">
              {flagship.flagshipImageIndex ? (
                <img
                  src={getFlagshipImageUrl(flagship.hullId ?? 'industrial', flagship.flagshipImageIndex, 'icon')}
                  alt={flagship.name}
                  className="w-7 h-7 rounded-md object-cover border border-white/10 flex-shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-md bg-primary/10 border border-white/10 flex items-center justify-center text-[9px] font-bold text-primary/30 flex-shrink-0">VA</div>
              )}
              <div className="min-w-0">
                <div className="text-[11px] font-medium truncate">{flagship.name}</div>
                <div className="flex items-center gap-1 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    flagship.status === 'active' ? 'bg-emerald-400' :
                    flagship.status === 'in_mission' ? 'bg-blue-400' : 'bg-red-400'
                  }`} />
                  <span className={
                    flagship.status === 'active' ? 'text-emerald-400' :
                    flagship.status === 'in_mission' ? 'text-blue-400' : 'text-red-400'
                  }>
                    {flagship.status === 'active' ? 'Opérationnel' :
                     flagship.status === 'in_mission' ? 'En mission' : 'Incapacité'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">Pas sur cette planète</p>
          )
        ) : (
          <p className="text-[10px] text-muted-foreground italic">Aucun vaisseau amiral</p>
        )}
      </GridCard>
    </div>
  );
}
