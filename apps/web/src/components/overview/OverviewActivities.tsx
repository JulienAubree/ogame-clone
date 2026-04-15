import { useNavigate } from 'react-router';
import { GameImage } from '@/components/common/GameImage';
import { Timer } from '@/components/common/Timer';
import { getUnitName } from '@/lib/entity-names';

interface BuildingActivity {
  id: string;
  name: string;
  currentLevel: number;
  nextLevelTime: number;
  upgradeEndTime: string;
}

interface QueueItem {
  id: string;
  itemId: string;
  type: 'ship' | 'defense';
  quantity: number;
  completedCount?: number;
  startTime: string;
  endTime: string | null;
  status: string;
  facilityId: string | null;
}

interface OverviewActivitiesProps {
  activeBuilding: BuildingActivity | undefined;
  shipyardQueue: QueueItem[];
  commandCenterQueue: QueueItem[];
  planetId: string;
  gameConfig: any;
  onBuildingComplete: () => void;
  onShipyardComplete: () => void;
  onCommandCenterComplete: () => void;
}

function ActiveSlot({ icon, label, sublabel, endTime, startTime, totalDuration, color, onClick, onComplete }: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  endTime: string;
  startTime?: string;
  totalDuration: number;
  color: string;
  onClick: () => void;
  onComplete: () => void;
}) {
  return (
    <div
      className="flex-1 min-w-[140px] p-2.5 rounded-lg bg-card/60 border border-white/[0.06] cursor-pointer hover:bg-card/80 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-foreground truncate">{label}</div>
          <div className="text-[10px] text-muted-foreground">{sublabel}</div>
        </div>
      </div>
      <div className="h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-1000"
          style={{ background: color, width: `${Math.min(100, Math.max(0, ((Date.now() - new Date(startTime ?? endTime).getTime()) / (new Date(endTime).getTime() - new Date(startTime ?? endTime).getTime())) * 100))}%` }}
        />
      </div>
      <div className="mt-1">
        <Timer
          endTime={new Date(endTime)}
          totalDuration={totalDuration}
          className="text-[10px]"
          onComplete={onComplete}
        />
      </div>
    </div>
  );
}

function EmptySlot({ label, cta, onClick }: { label: string; cta: string; onClick: () => void }) {
  return (
    <div
      className="flex-1 min-w-[140px] p-2.5 rounded-lg bg-card/30 border border-dashed border-white/[0.08] cursor-pointer hover:bg-card/40 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-white/[0.04]" />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-[10px] text-muted-foreground/50 mt-2">{cta} →</div>
    </div>
  );
}

export function OverviewActivities({
  activeBuilding, shipyardQueue, commandCenterQueue, planetId, gameConfig,
  onBuildingComplete, onShipyardComplete, onCommandCenterComplete,
}: OverviewActivitiesProps) {
  const navigate = useNavigate();

  const activeShipyard = shipyardQueue.find((q) => q.status === 'active' && q.endTime);
  const activeCommandCenter = commandCenterQueue.find((q) => q.status === 'active' && q.endTime);

  return (
    <div className="flex gap-3 overflow-x-auto">
      {/* Construction slot */}
      {activeBuilding ? (
        <ActiveSlot
          icon={<GameImage category="buildings" id={activeBuilding.id} size="icon" alt={activeBuilding.name} className="w-5 h-5 rounded flex-shrink-0" />}
          label={activeBuilding.name}
          sublabel={`Niv. ${activeBuilding.currentLevel + 1}`}
          endTime={activeBuilding.upgradeEndTime}
          totalDuration={activeBuilding.nextLevelTime}
          color="#38bdf8"
          onClick={() => navigate('/buildings')}
          onComplete={onBuildingComplete}
        />
      ) : (
        <EmptySlot label="Aucune construction" cta="Lancer" onClick={() => navigate('/buildings')} />
      )}

      {/* Shipyard slot */}
      {activeShipyard ? (
        <ActiveSlot
          icon={<GameImage category={activeShipyard.type === 'defense' ? 'defenses' : 'ships'} id={activeShipyard.itemId} size="icon" alt={getUnitName(activeShipyard.itemId, gameConfig)} className="w-5 h-5 rounded flex-shrink-0" />}
          label={getUnitName(activeShipyard.itemId, gameConfig)}
          sublabel={`x${activeShipyard.quantity - (activeShipyard.completedCount ?? 0)}`}
          endTime={activeShipyard.endTime!}
          startTime={activeShipyard.startTime}
          totalDuration={Math.floor((new Date(activeShipyard.endTime!).getTime() - new Date(activeShipyard.startTime).getTime()) / 1000)}
          color="#f59e0b"
          onClick={() => navigate('/shipyard')}
          onComplete={onShipyardComplete}
        />
      ) : (
        <EmptySlot label="Chantier libre" cta="Lancer une production" onClick={() => navigate('/shipyard')} />
      )}

      {/* Command center slot */}
      {activeCommandCenter ? (
        <ActiveSlot
          icon={<GameImage category={activeCommandCenter.type === 'defense' ? 'defenses' : 'ships'} id={activeCommandCenter.itemId} size="icon" alt={getUnitName(activeCommandCenter.itemId, gameConfig)} className="w-5 h-5 rounded flex-shrink-0" />}
          label={getUnitName(activeCommandCenter.itemId, gameConfig)}
          sublabel={`x${activeCommandCenter.quantity - (activeCommandCenter.completedCount ?? 0)}`}
          endTime={activeCommandCenter.endTime!}
          startTime={activeCommandCenter.startTime}
          totalDuration={Math.floor((new Date(activeCommandCenter.endTime!).getTime() - new Date(activeCommandCenter.startTime).getTime()) / 1000)}
          color="#8b5cf6"
          onClick={() => navigate('/command-center')}
          onComplete={onCommandCenterComplete}
        />
      ) : (
        <EmptySlot label="Commandement libre" cta="Lancer une production" onClick={() => navigate('/command-center')} />
      )}
    </div>
  );
}
