import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { Skeleton } from '@/components/common/Skeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { cn } from '@/lib/utils';
import { getFlagshipImageUrl, getPlanetImageUrl } from '@/lib/assets';
import { TalentTree } from '@/components/flagship/TalentTree';
import { HullChangeModal } from '@/components/flagship/HullChangeModal';
import {
  ShieldIcon, ArmorIcon, HullIcon, WeaponsIcon, ShotsIcon,
  SpeedIcon, PropulsionIcon, FuelIcon, CargoIcon,
  SectionHeader,
} from '@/components/entity-details/stat-components';

// ── Incapacitation Overlay ──

function useCountdown(endTime: Date | null) {
  const [seconds, setSeconds] = useState(() =>
    endTime ? Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000)) : 0,
  );
  const cbRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!endTime) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining <= 0 && cbRef.current) cbRef.current();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return seconds;
}

function fmtCountdown(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { h, m, s };
}

function IncapacitatedBanner({
  name,
  repairEndsAt,
  flagshipImageIndex,
  hullId,
  onRepaired,
  balance,
}: {
  name: string;
  repairEndsAt: Date;
  flagshipImageIndex: number | null;
  hullId: string;
  onRepaired: () => void;
  balance: number;
}) {
  const utils = trpc.useUtils();
  const [confirmRepair, setConfirmRepair] = useState(false);
  const repairMutation = trpc.flagship.repair.useMutation({
    onSuccess: () => {
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      onRepaired();
    },
  });
  const repairCost = 2;
  const totalDuration = useMemo(() => Math.max(1, Math.floor((repairEndsAt.getTime() - Date.now()) / 1000 + 7200)), [repairEndsAt]);
  const secondsLeft = useCountdown(repairEndsAt);
  const { h, m, s } = fmtCountdown(secondsLeft);
  const progress = Math.min(100, ((totalDuration - secondsLeft) / totalDuration) * 100);

  const onRepairedRef = useRef(onRepaired);
  onRepairedRef.current = onRepaired;
  const firedRef = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0 && !firedRef.current) {
      firedRef.current = true;
      setTimeout(() => onRepairedRef.current(), 500);
    }
  }, [secondsLeft]);

  return (
    <>
      <div className="relative overflow-hidden rounded-lg border border-red-500/30 bg-red-950/20">
        {/* Subtle pulse background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-red-500/5 animate-pulse" />
        </div>

        <div className="relative flex flex-col sm:flex-row items-center gap-4 p-4 lg:p-5">
          {/* Flagship image */}
          <div className="relative shrink-0">
            {flagshipImageIndex ? (
              <img
                src={getFlagshipImageUrl(hullId, flagshipImageIndex, 'thumb')}
                alt={name}
                className="h-20 w-20 rounded-xl object-cover border border-red-500/30 grayscale opacity-60"
              />
            ) : (
              <div className="h-20 w-20 rounded-xl bg-red-950/40 flex items-center justify-center text-2xl font-bold text-red-500/40 border border-red-500/30">
                VA
              </div>
            )}
            <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-red-600 border-2 border-red-400 flex items-center justify-center shadow-lg shadow-red-500/30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
            <div>
              <h2 className="text-lg font-black text-red-400 uppercase tracking-tight">Vaisseau incapacite</h2>
              <p className="text-xs text-red-300/60">
                <span className="font-semibold text-red-300/80">{name}</span> a ete mis hors service au combat.
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-1000 ease-linear bg-gradient-to-r from-red-600 to-red-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground/40">
                <span>Reparation {Math.round(progress)}%</span>
                <span>{String(h).padStart(2, '0')}h {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s</span>
              </div>
            </div>
          </div>

          {/* Repair button */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <button
              onClick={() => setConfirmRepair(true)}
              disabled={balance < repairCost || repairMutation.isPending}
              className="px-4 py-2 rounded-lg font-semibold text-xs transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20 whitespace-nowrap"
            >
              {repairMutation.isPending ? 'Reparation...' : `Reparer (${repairCost} Exilium)`}
            </button>
            {balance < repairCost && (
              <p className="text-[10px] text-red-400/70">Solde insuffisant</p>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRepair}
        onConfirm={() => repairMutation.mutate()}
        onCancel={() => setConfirmRepair(false)}
        title="Reparer immediatement ?"
        description={`Cout : ${repairCost} Exilium. Votre vaisseau sera immediatement operationnel.`}
        confirmLabel="Reparer"
      />
    </>
  );
}

function HullRefitBanner({
  name,
  refitEndsAt,
  onComplete,
}: {
  name: string;
  refitEndsAt: Date;
  onComplete: () => void;
}) {
  const totalDuration = useMemo(() => Math.max(1, Math.floor((refitEndsAt.getTime() - Date.now()) / 1000 + 3600)), [refitEndsAt]);
  const secondsLeft = useCountdown(refitEndsAt);
  const { h, m, s } = fmtCountdown(secondsLeft);
  const progress = Math.min(100, ((totalDuration - secondsLeft) / totalDuration) * 100);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const firedRef = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0 && !firedRef.current) {
      firedRef.current = true;
      setTimeout(() => onCompleteRef.current(), 500);
    }
  }, [secondsLeft]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-500/30 bg-amber-950/20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-amber-500/5 animate-pulse" />
      </div>

      <div className="relative flex flex-col sm:flex-row items-center gap-4 p-4 lg:p-5">
        <div className="relative shrink-0">
          <div className="h-20 w-20 rounded-xl bg-amber-950/40 flex items-center justify-center text-2xl font-bold text-amber-500/40 border border-amber-500/30">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400/60">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
          <div>
            <h2 className="text-lg font-black text-amber-400 uppercase tracking-tight">Changement de coque</h2>
            <p className="text-xs text-amber-300/60">
              <span className="font-semibold text-amber-300/80">{name}</span> est en cours de modification.
            </p>
          </div>

          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-linear bg-gradient-to-r from-amber-600 to-amber-400"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground/40">
              <span>Modification {Math.round(progress)}%</span>
              <span>{String(h).padStart(2, '0')}h {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HullCooldownButton({ hullChangeAvailableAt, disabled, onClick }: {
  hullChangeAvailableAt: string | Date | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const endTime = hullChangeAvailableAt ? new Date(hullChangeAvailableAt) : null;
  const secondsLeft = useCountdown(endTime);
  const onCooldown = secondsLeft > 0;

  let label = 'Changer de coque';
  if (onCooldown) {
    const d = Math.floor(secondsLeft / 86400);
    const h = Math.floor((secondsLeft % 86400) / 3600);
    label = `Changement dans ${d}j ${h}h`;
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || onCooldown}
      className="text-[10px] text-muted-foreground/50 hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

const HULL_CARD_STYLES: Record<string, { border: string; glow: string; badge: string; badgeText: string }> = {
  combat: { border: 'border-red-500/30', glow: 'shadow-[0_0_15px_-3px_rgba(239,68,68,0.15)]', badge: 'bg-red-500/15 border-red-500/30', badgeText: 'text-red-400' },
  industrial: { border: 'border-amber-500/30', glow: 'shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)]', badge: 'bg-amber-500/15 border-amber-500/30', badgeText: 'text-amber-400' },
  scientific: { border: 'border-cyan-500/30', glow: 'shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)]', badge: 'bg-cyan-500/15 border-cyan-500/30', badgeText: 'text-cyan-400' },
};

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: 'Operationnel', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  in_mission: { label: 'En mission', color: 'text-blue-400', dot: 'bg-blue-400' },
  incapacitated: { label: 'Incapacite', color: 'text-red-400', dot: 'bg-red-400' },
  hull_refit: { label: 'Changement de coque', color: 'text-amber-400', dot: 'bg-amber-400' },
};

const DRIVE_LABELS: Record<string, string> = {
  combustion: 'Combustion',
  impulse: 'Impulsion',
  impulsion: 'Impulsion',
  hyperespace: 'Hyperespace',
};

// ── Stat display helpers ──

const fmt = (n: number) => n.toLocaleString('fr-FR');

const STAT_VARIANTS: Record<string, { iconBg: string; valueColor: string; iconColor: string }> = {
  shield:  { iconBg: 'bg-sky-400/10',    valueColor: 'text-sky-400',    iconColor: 'text-sky-400' },
  armor:   { iconBg: 'bg-amber-400/10',  valueColor: 'text-amber-400',  iconColor: 'text-amber-400' },
  hull:    { iconBg: 'bg-slate-400/10',   valueColor: 'text-slate-200',  iconColor: 'text-slate-400' },
  weapons: { iconBg: 'bg-red-400/10',     valueColor: 'text-red-400',    iconColor: 'text-red-400' },
  shots:   { iconBg: 'bg-purple-400/10',  valueColor: 'text-purple-400', iconColor: 'text-purple-400' },
};

function FlagshipStat({ icon, label, value, base, bonus, variant, wide }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  base?: number;
  bonus?: number;
  variant: string;
  wide?: boolean;
}) {
  const v = STAT_VARIANTS[variant] ?? STAT_VARIANTS.hull;
  const hasBonus = bonus != null && bonus !== 0 && typeof bonus === 'number';
  return (
    <div className={cn(
      'flex items-center gap-2.5 bg-[#0f172a] rounded-lg p-2.5 border border-transparent hover:border-[#334155] transition-colors',
      wide && 'col-span-2',
    )}>
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', v.iconBg)}>
        <span className={v.iconColor}>{icon}</span>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
        <div className={cn('text-base font-bold font-mono leading-tight', v.valueColor)}>
          {typeof value === 'number' ? fmt(value) : value}
        </div>
        {hasBonus && (
          <div className="text-[9px] text-emerald-500">
            base {fmt(base!)} · {bonus > 0 ? '+' : ''}{fmt(bonus)}
          </div>
        )}
      </div>
    </div>
  );
}

function FlagshipSkeleton() {
  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          <Skeleton className="h-48 w-48 rounded-xl flex-shrink-0 mx-auto sm:mx-0" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FlagshipProfile() {
  const utils = trpc.useUtils();
  const { data: flagship, isLoading } = trpc.flagship.get.useQuery();
  const { data: flagshipImages } = trpc.flagship.listImages.useQuery(
    { hullId: (flagship?.hullId ?? 'industrial') as 'combat' | 'industrial' | 'scientific' },
    { enabled: !!flagship },
  );
  const { data: talentTree } = trpc.talent.list.useQuery();
  const { data: exiliumData } = trpc.exilium.getBalance.useQuery();
  const { data: planets } = trpc.planet.list.useQuery();
  const balance = exiliumData?.balance ?? 0;

  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showHullChange, setShowHullChange] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const renameMutation = trpc.flagship.rename.useMutation({
    onSuccess: () => {
      utils.flagship.get.invalidate();
      setEditingName(false);
    },
  });

  const imageMutation = trpc.flagship.updateImage.useMutation({
    onSuccess: () => utils.flagship.get.invalidate(),
  });

  const handleRepaired = useCallback(() => {
    utils.flagship.get.invalidate();
  }, [utils.flagship.get]);

  const totalTalentPoints = useMemo(() => {
    if (!talentTree) return 0;
    return Object.values(talentTree.ranks).reduce((sum, r) => sum + r, 0);
  }, [talentTree]);

  // Find planet where flagship is stationed
  const stationedPlanet = useMemo(() => {
    if (!flagship || !planets) return null;
    return planets.find((p: any) => p.id === flagship.planetId) ?? null;
  }, [flagship, planets]);

  if (isLoading) return <FlagshipSkeleton />;

  if (!flagship) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Vaisseau amiral" />
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">Vous n'avez pas encore de vaisseau amiral.</p>
        </div>
      </div>
    );
  }

  const isIncapacitated = flagship.status === 'incapacitated' && flagship.repairEndsAt;
  const isHullRefit = flagship.status === 'hull_refit' && (flagship as any).refitEndsAt;

  const status = STATUS_LABELS[flagship.status] ?? { label: flagship.status, color: 'text-muted-foreground', dot: 'bg-muted-foreground' };
  const effectiveStats = 'effectiveStats' in flagship ? (flagship as any).effectiveStats : null;
  const talentBonuses = 'talentBonuses' in flagship ? (flagship as any).talentBonuses as Record<string, number> : {};
  const hullConfig = 'hullConfig' in flagship ? (flagship as any).hullConfig as { id: string; name: string; description: string } | null : null;
  const driveType = effectiveStats?.driveType ?? flagship.driveType;

  function startEditName() {
    setName(flagship!.name);
    setDescription(flagship!.description);
    setEditingName(true);
  }

  function handleRename() {
    if (name.length < 2 || name.length > 32) return;
    renameMutation.mutate({ name, description: description || undefined });
  }

  function handleImageSelect(imageIndex: number) {
    imageMutation.mutate({ imageIndex });
    setShowImagePicker(false);
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Vaisseau amiral" />

      {isIncapacitated && (
        <IncapacitatedBanner
          name={flagship.name}
          repairEndsAt={new Date(flagship.repairEndsAt!)}
          flagshipImageIndex={flagship.flagshipImageIndex}
          hullId={flagship.hullId ?? 'industrial'}
          onRepaired={handleRepaired}
          balance={balance}
        />
      )}

      {isHullRefit && (
        <HullRefitBanner
          name={flagship.name}
          refitEndsAt={new Date((flagship as any).refitEndsAt)}
          onComplete={handleRepaired}
        />
      )}

      {/* ===== Identity Card ===== */}
      <div className={cn('glass-card p-4 lg:p-5 border relative', HULL_CARD_STYLES[flagship.hullId ?? 'industrial']?.border ?? '', HULL_CARD_STYLES[flagship.hullId ?? 'industrial']?.glow ?? '')}>
        {hullConfig && (
          <span className={cn(
            'absolute top-3 right-3 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            HULL_CARD_STYLES[flagship.hullId ?? 'industrial']?.badge ?? '',
            HULL_CARD_STYLES[flagship.hullId ?? 'industrial']?.badgeText ?? '',
          )}>
            {hullConfig.name}
          </span>
        )}
        <div className="flex gap-4 lg:gap-5">
          {/* Image — fixed size */}
          <div className="relative flex-shrink-0">
            {flagship.flagshipImageIndex ? (
              <img
                src={getFlagshipImageUrl(flagship.hullId ?? 'industrial', flagship.flagshipImageIndex, 'thumb')}
                alt={flagship.name}
                className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-xl object-cover border border-white/10"
              />
            ) : (
              <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-xl bg-primary/10 border border-white/10 flex items-center justify-center text-3xl sm:text-4xl lg:text-5xl font-black text-primary/20">
                VA
              </div>
            )}
            {flagshipImages && flagshipImages.length > 0 && (
              <button
                onClick={() => setShowImagePicker(true)}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-[10px] font-medium bg-black/70 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/90 transition-colors border border-white/10 whitespace-nowrap"
              >
                Changer
              </button>
            )}
          </div>

          {/* Name + status + planet */}
          <div className="flex-1 min-w-0 space-y-2">
            {editingName ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-lg font-bold"
                  autoFocus
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={256}
                  rows={2}
                  placeholder="Description (optionnel)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
                <div className="flex items-center gap-2 justify-end text-xs">
                  <span className="text-muted-foreground">{name.length}/32</span>
                  <button onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground">Annuler</button>
                  <button onClick={handleRename} disabled={name.length < 2 || renameMutation.isPending} className="text-primary hover:text-primary/80 disabled:opacity-50">
                    {renameMutation.isPending ? '...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-bold truncate">{flagship.name}</h2>
                  <button onClick={startEditName} className="text-[11px] text-muted-foreground/50 hover:text-primary transition-colors flex-shrink-0">
                    Renommer
                  </button>
                </div>
                {hullConfig && (
                  <HullCooldownButton
                    hullChangeAvailableAt={flagship.hullChangeAvailableAt}
                    disabled={flagship.status !== 'active'}
                    onClick={() => setShowHullChange(true)}
                  />
                )}
                {flagship.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{flagship.description}</p>
                )}
              </div>
            )}

            {/* Status */}
            <div className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', status.dot)} />
              <span className={cn('text-xs font-medium', status.color)}>{status.label}</span>
            </div>

            {/* Planet + Exilium + Talents — inline */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {stationedPlanet && (
                <Link to="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  {stationedPlanet.planetClassId && stationedPlanet.planetImageIndex != null ? (
                    <img
                      src={getPlanetImageUrl(stationedPlanet.planetClassId, stationedPlanet.planetImageIndex, 'icon')}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-primary/20" />
                  )}
                  <span>{stationedPlanet.name}</span>
                  <span className="text-muted-foreground/40 text-[10px]">[{stationedPlanet.galaxy}:{stationedPlanet.system}:{stationedPlanet.position}]</span>
                </Link>
              )}
              <span className="text-primary font-medium">{balance} Exilium</span>
              {totalTalentPoints > 0 && (
                <Link to="/flagship/talents" className="text-muted-foreground hover:text-foreground transition-colors">
                  {totalTalentPoints} pts talents
                </Link>
              )}
            </div>

            {/* Quick links */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              <Link to="/flagship/talents" className="text-[11px] text-primary/70 hover:text-primary transition-colors">Arbre de talents</Link>
              <Link to="/fleet" className="text-[11px] text-primary/70 hover:text-primary transition-colors">Flotte</Link>
              <Link to="/fleet/movements" className="text-[11px] text-primary/70 hover:text-primary transition-colors">Mouvements</Link>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Stats Card ===== */}
      <div className={cn('glass-card p-4 lg:p-5 space-y-4 border', HULL_CARD_STYLES[flagship.hullId ?? 'industrial']?.border ?? '')}>
        {/* Defense */}
        <div>
          <SectionHeader icon={<ShieldIcon size={14} className="text-sky-400" />} label="Defense" color="text-sky-400" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            <FlagshipStat
              icon={<ShieldIcon />}
              label="Bouclier"
              value={effectiveStats?.shield ?? flagship.shield}
              base={flagship.shield}
              bonus={talentBonuses.shield}
              variant="shield"
            />
            <FlagshipStat
              icon={<ArmorIcon />}
              label="Blindage"
              value={effectiveStats?.baseArmor ?? flagship.baseArmor}
              base={flagship.baseArmor}
              bonus={talentBonuses.baseArmor}
              variant="armor"
            />
            <FlagshipStat
              icon={<HullIcon />}
              label="Coque"
              value={effectiveStats?.hull ?? flagship.hull}
              base={flagship.hull}
              bonus={talentBonuses.hull}
              variant="hull"
            />
          </div>
        </div>

        <div className="h-px bg-[#334155]" />

        {/* Attaque */}
        <div>
          <SectionHeader icon={<WeaponsIcon size={14} className="text-red-400" />} label="Attaque" color="text-red-400" />
          <div className="grid grid-cols-2 gap-1.5">
            <FlagshipStat
              icon={<WeaponsIcon />}
              label="Armement"
              value={effectiveStats?.weapons ?? flagship.weapons}
              base={flagship.weapons}
              bonus={talentBonuses.weapons}
              variant="weapons"
            />
            <FlagshipStat
              icon={<ShotsIcon />}
              label="Tirs / round"
              value={effectiveStats?.shotCount ?? flagship.shotCount}
              base={flagship.shotCount}
              bonus={talentBonuses.shotCount}
              variant="shots"
            />
          </div>
        </div>

        <div className="h-px bg-[#334155]" />

        {/* Deplacement */}
        <div>
          <SectionHeader
            icon={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><polygon points="3,11 22,2 13,21 11,13" /></svg>}
            label="Deplacement"
            color="text-slate-500"
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <SpeedIcon size={14} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Vitesse</div>
                <div className="text-xs text-slate-200 font-mono font-semibold">
                  {fmt(effectiveStats?.baseSpeed ?? flagship.baseSpeed)}
                  {talentBonuses.speedPercent ? (
                    <span className="text-[9px] text-emerald-500 ml-1">
                      base {fmt(flagship.baseSpeed)} · +{fmt(Math.round(flagship.baseSpeed * talentBonuses.speedPercent))}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PropulsionIcon size={14} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Propulsion</div>
                <div className="text-xs text-purple-400 font-mono font-semibold">
                  {DRIVE_LABELS[driveType] ?? driveType}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FuelIcon size={14} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Consommation</div>
                <div className="text-xs text-slate-200 font-mono font-semibold">
                  {fmt(effectiveStats?.fuelConsumption ?? flagship.fuelConsumption)}
                  {talentBonuses.fuelConsumption ? (
                    <span className="text-[9px] text-emerald-500 ml-1">
                      base {fmt(flagship.fuelConsumption)} · {talentBonuses.fuelConsumption > 0 ? '+' : ''}{fmt(talentBonuses.fuelConsumption)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CargoIcon size={14} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Soute</div>
                <div className="text-xs text-slate-200 font-mono font-semibold">
                  {fmt(effectiveStats?.cargoCapacity ?? flagship.cargoCapacity)}
                  {talentBonuses.cargoCapacity ? (
                    <span className="text-[9px] text-emerald-500 ml-1">
                      base {fmt(flagship.cargoCapacity)} · +{fmt(talentBonuses.cargoCapacity)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Talent Tree ===== */}
      <TalentTree showGuide />

      {/* Image picker modal */}
      {showImagePicker && flagshipImages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowImagePicker(false)}>
          <div className="glass-card max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Choisir une image</h3>
            {flagshipImages.length === 0 ? (
              <div className="text-muted-foreground text-sm">Aucune image disponible</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-80 overflow-y-auto">
                {flagshipImages.map(idx => (
                  <button
                    key={idx}
                    onClick={() => handleImageSelect(idx)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                      idx === flagship!.flagshipImageIndex ? 'border-primary ring-2 ring-primary/50' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={getFlagshipImageUrl(flagship!.hullId ?? 'industrial', idx, 'thumb')} alt={`Flagship ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowImagePicker(false)} className="text-sm text-muted-foreground hover:text-foreground">Fermer</button>
            </div>
          </div>
        </div>
      )}

      <HullChangeModal
        open={showHullChange}
        onClose={() => setShowHullChange(false)}
        flagship={flagship}
      />
    </div>
  );
}
