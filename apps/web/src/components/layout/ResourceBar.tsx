import { useState } from 'react';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { useResourceCounter } from '@/hooks/useResourceCounter';
import { formatNumber } from '@/lib/format';
import { trpc } from '@/trpc';

interface ResourceBarProps {
  planetId: string | null;
}

export function ResourceBar({ planetId }: ResourceBarProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  const { data } = trpc.resource.production.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId, refetchInterval: 60_000 },
  );

  const resources = useResourceCounter(
    data
      ? {
          minerai: data.minerai,
          silicium: data.silicium,
          hydrogene: data.hydrogene,
          resourcesUpdatedAt: data.resourcesUpdatedAt,
          mineraiPerHour: data.rates.mineraiPerHour,
          siliciumPerHour: data.rates.siliciumPerHour,
          hydrogenePerHour: data.rates.hydrogenePerHour,
          storageMineraiCapacity: data.rates.storageMineraiCapacity,
          storageSiliciumCapacity: data.rates.storageSiliciumCapacity,
          storageHydrogeneCapacity: data.rates.storageHydrogeneCapacity,
        }
      : undefined,
  );

  const energyPercent = data
    ? data.rates.energyConsumed > 0
      ? Math.min(100, Math.round((data.rates.energyProduced / data.rates.energyConsumed) * 100))
      : 100
    : 0;

  return (
    <>
      <div
        className="sticky top-12 z-30 flex h-10 items-center justify-around border-b border-white/5 bg-card/80 backdrop-blur-md px-2 lg:hidden"
        onClick={() => setDetailOpen(!detailOpen)}
      >
        <ResourceCounter icon={<MineraiIcon size={14} className="text-minerai" />} value={resources.minerai} colorClass="text-minerai" />
        <ResourceCounter icon={<SiliciumIcon size={14} className="text-silicium" />} value={resources.silicium} colorClass="text-silicium" />
        <ResourceCounter icon={<HydrogeneIcon size={14} className="text-hydrogene" />} value={resources.hydrogene} colorClass="text-hydrogene" />
        <ResourceCounter icon={<span className="text-energy text-xs">⚡</span>} value={energyPercent} colorClass="text-energy" suffix="%" />
      </div>

      {detailOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDetailOpen(false)}>
          <div className="absolute top-[88px] left-0 right-0 animate-slide-down-sheet border-b border-white/10 bg-card/95 backdrop-blur-lg p-4" style={{ maxHeight: '50vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="space-y-3 text-sm">
              <DetailRow label="Minerai" value={resources.minerai} perHour={data?.rates.mineraiPerHour ?? 0} capacity={data?.rates.storageMineraiCapacity ?? 0} colorClass="text-minerai" />
              <DetailRow label="Silicium" value={resources.silicium} perHour={data?.rates.siliciumPerHour ?? 0} capacity={data?.rates.storageSiliciumCapacity ?? 0} colorClass="text-silicium" />
              <DetailRow label="Hydrogène" value={resources.hydrogene} perHour={data?.rates.hydrogenePerHour ?? 0} capacity={data?.rates.storageHydrogeneCapacity ?? 0} colorClass="text-hydrogene" />
              <div className="flex items-center justify-between border-t border-white/5 pt-2">
                <span className="text-energy">Énergie</span>
                <span className="text-energy tabular-nums">{data?.rates.energyProduced ?? 0} / {data?.rates.energyConsumed ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResourceCounter({ icon, value, colorClass, suffix }: { icon: React.ReactNode; value: number; colorClass: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className={`text-xs font-medium tabular-nums ${colorClass}`}>
        {formatNumber(Math.floor(value))}{suffix}
      </span>
    </div>
  );
}

function DetailRow({ label, value, perHour, capacity, colorClass }: { label: string; value: number; perHour: number; capacity: number; colorClass: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={colorClass}>{label}</span>
      <div className="flex gap-3 tabular-nums text-muted-foreground">
        <span>{formatNumber(Math.floor(value))} / {formatNumber(capacity)}</span>
        <span className="text-foreground">+{formatNumber(Math.round(perHour))}/h</span>
      </div>
    </div>
  );
}
