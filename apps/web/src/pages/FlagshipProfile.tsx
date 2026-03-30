import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { Skeleton } from '@/components/common/Skeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { cn } from '@/lib/utils';
import { getFlagshipImageUrl, getPlanetImageUrl } from '@/lib/assets';
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

function IncapacitatedOverlay({
  name,
  repairEndsAt,
  flagshipImageIndex,
  onRepaired,
  balance,
}: {
  name: string;
  repairEndsAt: Date;
  flagshipImageIndex: number | null;
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
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-red-500/5 animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-red-500/8 animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="relative flex flex-col items-center gap-6 max-w-md mx-auto px-6 text-center">
        <div className="relative">
          {flagshipImageIndex ? (
            <img
              src={getFlagshipImageUrl(flagshipImageIndex, 'thumb')}
              alt={name}
              className="h-40 w-40 rounded-2xl object-cover border-2 border-red-500/30 grayscale opacity-60"
            />
          ) : (
            <div className="h-40 w-40 rounded-2xl bg-red-950/40 flex items-center justify-center text-5xl font-bold text-red-500/40 border-2 border-red-500/30">
              VA
            </div>
          )}
          <div className="absolute -bottom-3 -right-3 w-12 h-12 rounded-full bg-red-600 border-2 border-red-400 flex items-center justify-center shadow-lg shadow-red-500/30">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-red-400 tracking-tight uppercase">
            Vaisseau incapacite
          </h1>
          <p className="text-sm text-red-300/60">
            <span className="font-semibold text-red-300/80">{name}</span> a ete mis hors service au combat.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Reparation automatique en cours...
          </p>
        </div>

        <div className="w-full space-y-4">
          <div className="flex items-center justify-center gap-3">
            {[
              { value: h, label: 'h' },
              { value: m, label: 'min' },
              { value: s, label: 'sec' },
            ].map((unit, i) => (
              <div key={unit.label} className="flex items-center gap-3">
                {i > 0 && <span className="text-2xl text-red-500/40 font-light -mt-4">:</span>}
                <div className="flex flex-col items-center">
                  <span className="text-4xl sm:text-5xl font-mono font-black tabular-nums text-red-400 leading-none">
                    {String(unit.value).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-red-400/40 uppercase tracking-widest mt-1">
                    {unit.label}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="w-full space-y-1.5">
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-linear bg-gradient-to-r from-red-600 to-red-400"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground/40">
              <span>Reparation</span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground/50">
          Retour operationnel : {repairEndsAt.toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })}
        </div>

        <button
          onClick={() => setConfirmRepair(true)}
          disabled={balance < repairCost || repairMutation.isPending}
          className="mt-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
        >
          {repairMutation.isPending ? 'Reparation...' : `Reparer maintenant (${repairCost} Exilium)`}
        </button>
        {balance < repairCost && (
          <p className="text-[10px] text-red-400/70">Solde insuffisant ({balance} Exilium)</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmRepair}
        onConfirm={() => repairMutation.mutate()}
        onCancel={() => setConfirmRepair(false)}
        title="Reparer immediatement ?"
        description={`Cout : ${repairCost} Exilium. Votre vaisseau sera immediatement operationnel.`}
        confirmLabel="Reparer"
      />
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: 'Operationnel', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  in_mission: { label: 'En mission', color: 'text-blue-400', dot: 'bg-blue-400' },
  incapacitated: { label: 'Incapacite', color: 'text-red-400', dot: 'bg-red-400' },
};

const DRIVE_LABELS: Record<string, string> = {
  combustion: 'Combustion',
  impulse: 'Impulsion',
  impulsion: 'Impulsion',
  hyperespace: 'Hyperespace',
};

const BRANCH_COLORS: Record<string, { border: string; text: string; bg: string }> = {
  combattant: { border: 'border-red-500/40', text: 'text-red-400', bg: 'bg-red-950/30' },
  explorateur: { border: 'border-teal-500/40', text: 'text-teal-400', bg: 'bg-teal-950/30' },
  negociant: { border: 'border-amber-500/40', text: 'text-amber-400', bg: 'bg-amber-950/30' },
};

const EFFECT_LABELS: Record<string, { label: string; color: string }> = {
  modify_stat: { label: 'Stat', color: 'text-blue-400' },
  global_bonus: { label: 'Global', color: 'text-amber-400' },
  planet_bonus: { label: 'Planete', color: 'text-emerald-400' },
  timed_buff: { label: 'Actif', color: 'text-pink-400' },
  unlock: { label: 'Deblocage', color: 'text-purple-400' },
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
  const { data: flagshipImages } = trpc.flagship.listImages.useQuery();
  const { data: talentTree } = trpc.talent.list.useQuery();
  const { data: exiliumData } = trpc.exilium.getBalance.useQuery();
  const { data: planets } = trpc.planet.list.useQuery();
  const balance = exiliumData?.balance ?? 0;

  const [showImagePicker, setShowImagePicker] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmInvest, setConfirmInvest] = useState<string | null>(null);
  const [confirmRespec, setConfirmRespec] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [talentGuideOpen, setTalentGuideOpen] = useState(false);

  const renameMutation = trpc.flagship.rename.useMutation({
    onSuccess: () => {
      utils.flagship.get.invalidate();
      setEditingName(false);
    },
  });

  const imageMutation = trpc.flagship.updateImage.useMutation({
    onSuccess: () => utils.flagship.get.invalidate(),
  });

  const investMutation = trpc.talent.invest.useMutation({
    onSuccess: () => {
      utils.talent.list.invalidate();
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      setConfirmInvest(null);
    },
  });

  const respecMutation = trpc.talent.respec.useMutation({
    onSuccess: () => {
      utils.talent.list.invalidate();
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      setConfirmRespec(null);
    },
  });

  const resetMutation = trpc.talent.resetAll.useMutation({
    onSuccess: () => {
      utils.talent.list.invalidate();
      utils.flagship.get.invalidate();
      utils.exilium.getBalance.invalidate();
      setConfirmReset(false);
    },
  });

  const activateMutation = trpc.talent.activate.useMutation({
    onSuccess: () => utils.talent.list.invalidate(),
  });

  const handleRepaired = useCallback(() => {
    utils.flagship.get.invalidate();
  }, [utils.flagship.get]);

  const branchData = useMemo(() => {
    if (!talentTree) return [];
    return talentTree.branches.map(branch => {
      const branchTalents = Object.values(talentTree.talents)
        .filter(t => t.branchId === branch.id)
        .sort((a, b) => a.tier - b.tier || a.sortOrder - b.sortOrder);

      const tiers: Record<number, typeof branchTalents> = {};
      for (const t of branchTalents) {
        if (!tiers[t.tier]) tiers[t.tier] = [];
        tiers[t.tier].push(t);
      }

      const totalPoints = branchTalents.reduce((sum, t) => sum + (talentTree.ranks[t.id] ?? 0), 0);

      return { branch, tiers, totalPoints };
    });
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

  if (flagship.status === 'incapacitated' && flagship.repairEndsAt) {
    return (
      <IncapacitatedOverlay
        name={flagship.name}
        repairEndsAt={new Date(flagship.repairEndsAt)}
        flagshipImageIndex={flagship.flagshipImageIndex}
        onRepaired={handleRepaired}
        balance={balance}
      />
    );
  }

  const status = STATUS_LABELS[flagship.status] ?? { label: flagship.status, color: 'text-muted-foreground', dot: 'bg-muted-foreground' };
  const effectiveStats = 'effectiveStats' in flagship ? (flagship as any).effectiveStats : null;
  const talentBonuses = 'talentBonuses' in flagship ? (flagship as any).talentBonuses as Record<string, number> : {};
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

  function getTierCost(tier: number) {
    return tier;
  }

  function canInvest(talentId: string): boolean {
    if (!talentTree) return false;
    const def = talentTree.talents[talentId];
    if (!def) return false;
    const rank = talentTree.ranks[talentId] ?? 0;
    if (rank >= def.maxRanks) return false;
    const bp = branchData.find(b => b.branch.id === def.branchId);
    const thresholds: Record<number, number> = { 1: 0, 2: 5, 3: 10, 4: 15, 5: 20 };
    if ((bp?.totalPoints ?? 0) < (thresholds[def.tier] ?? 0)) return false;
    if (def.prerequisiteId && (talentTree.ranks[def.prerequisiteId] ?? 0) < 1) return false;
    if (balance < getTierCost(def.tier)) return false;
    return true;
  }

  const totalTalentPoints = branchData.reduce((sum, b) => sum + b.totalPoints, 0);

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Vaisseau amiral" />

      {/* ===== Identity Card ===== */}
      <div className="glass-card p-4 lg:p-5">
        <div className="flex gap-4 lg:gap-5">
          {/* Image — fixed size */}
          <div className="relative flex-shrink-0">
            {flagship.flagshipImageIndex ? (
              <img
                src={getFlagshipImageUrl(flagship.flagshipImageIndex, 'thumb')}
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
      <div className="glass-card p-4 lg:p-5 space-y-4">
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
      {talentTree && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Arbre de talents</h3>
            <button
              onClick={() => setConfirmReset(true)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Reinitialiser tout
            </button>
          </div>

          {/* Collapsible guide */}
          <div className="rounded-lg border border-white/[0.06] overflow-hidden">
            <button
              onClick={() => setTalentGuideOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="font-medium">Comment fonctionnent les talents ?</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={cn('transition-transform duration-200', talentGuideOpen && 'rotate-180')}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {talentGuideOpen && (
              <div className="px-4 pb-4 text-xs text-muted-foreground/80 space-y-2 border-t border-white/[0.04] pt-3">
                <p>
                  Votre vaisseau amiral possede un arbre de talents reparti en <strong className="text-foreground">3 branches de specialisation</strong> :
                  Combattant, Explorateur et Negociant. Chaque branche modifie votre style de jeu et offre des bonus uniques.
                </p>
                <p>
                  Les talents sont repartis en <strong className="text-foreground">5 tiers</strong>. Pour debloquer un tier superieur,
                  vous devez investir un certain nombre de points dans la branche. Le cout en Exilium augmente avec le tier (1 Exilium au tier 1, 5 au tier 5).
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                  {Object.entries(EFFECT_LABELS).map(([key, { label, color }]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className={cn('w-1.5 h-1.5 rounded-full', color.replace('text-', 'bg-'))} />
                      <span className="text-[10px]">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground/50">
                  Vous pouvez reinitialiser un talent individuel ou tout l'arbre. Gratuit pendant la phase de developpement.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {branchData.map(({ branch, tiers, totalPoints }) => {
              const colors = BRANCH_COLORS[branch.id] ?? BRANCH_COLORS.combattant;
              return (
                <div key={branch.id} className={cn('rounded-lg border p-3 space-y-3', colors.border, colors.bg)}>
                  <div className="text-center">
                    <h3 className={cn('text-sm font-bold uppercase tracking-wider', colors.text)}>{branch.name}</h3>
                    <p className="text-[10px] text-muted-foreground">{branch.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Points : {totalPoints}</p>
                  </div>

                  {[1, 2, 3, 4, 5].map(tier => {
                    const tierTalents = tiers[tier] ?? [];
                    if (tierTalents.length === 0) return null;
                    const thresholds: Record<number, number> = { 1: 0, 2: 5, 3: 10, 4: 15, 5: 20 };
                    const unlocked = totalPoints >= (thresholds[tier] ?? 0);

                    return (
                      <div key={tier}>
                        <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wide mb-1">
                          Tier {tier} — {getTierCost(tier)} Exilium/rang
                          {!unlocked && ` (${thresholds[tier]} pts requis)`}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {tierTalents.map(talent => {
                            const rank = talentTree.ranks[talent.id] ?? 0;
                            const maxed = rank >= talent.maxRanks;
                            const available = canInvest(talent.id);
                            const effectInfo = EFFECT_LABELS[talent.effectType];
                            const cooldown = talentTree.cooldowns[talent.id];
                            const isOnCooldown = cooldown && new Date() < new Date(cooldown.cooldownEnds);
                            const isBuffActive = cooldown && new Date() < new Date(cooldown.expiresAt);

                            return (
                              <div
                                key={talent.id}
                                className={cn(
                                  'rounded-md border p-2 text-center text-[10px] space-y-1 transition-all',
                                  talent.position === 'center' && tierTalents.length === 1 && 'col-span-3',
                                  maxed ? 'border-primary/50 bg-primary/10' : rank > 0 ? 'border-primary/30' : 'border-border/50',
                                  !unlocked && 'opacity-40',
                                )}
                              >
                                <div className="font-semibold leading-tight">{talent.name}</div>
                                <div className={cn('text-[8px]', effectInfo?.color)}>{effectInfo?.label}</div>
                                <div className="text-muted-foreground text-[8px] leading-tight">{talent.description}</div>
                                <div className="font-mono text-[9px]">{rank}/{talent.maxRanks}</div>

                                <div className="flex gap-1 justify-center flex-wrap">
                                  {available && (
                                    <button
                                      onClick={() => setConfirmInvest(talent.id)}
                                      className="text-[8px] px-1.5 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                                    >
                                      +1
                                    </button>
                                  )}
                                  {rank > 0 && (
                                    <button
                                      onClick={() => setConfirmRespec(talent.id)}
                                      className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                    >
                                      Respec
                                    </button>
                                  )}
                                  {talent.effectType === 'timed_buff' && rank > 0 && (
                                    <button
                                      onClick={() => activateMutation.mutate({ talentId: talent.id })}
                                      disabled={!!isOnCooldown}
                                      className={cn(
                                        'text-[8px] px-1.5 py-0.5 rounded transition-colors',
                                        isBuffActive ? 'bg-pink-500/20 text-pink-400' :
                                        isOnCooldown ? 'bg-muted text-muted-foreground cursor-not-allowed' :
                                        'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20',
                                      )}
                                    >
                                      {isBuffActive ? 'Actif' : isOnCooldown ? 'CD' : 'Activer'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!confirmInvest}
        onConfirm={() => { if (confirmInvest) investMutation.mutate({ talentId: confirmInvest }); }}
        onCancel={() => setConfirmInvest(null)}
        title="Investir dans ce talent ?"
        description={`Cout : ${confirmInvest && talentTree ? getTierCost(talentTree.talents[confirmInvest]?.tier ?? 1) : 0} Exilium`}
        confirmLabel="Investir"
      />

      <ConfirmDialog
        open={!!confirmRespec}
        onConfirm={() => { if (confirmRespec) respecMutation.mutate({ talentId: confirmRespec }); }}
        onCancel={() => setConfirmRespec(null)}
        title="Reinitialiser ce talent ?"
        description="Les talents dependants seront aussi reinitialises. Gratuit pendant la phase de developpement."
        variant="destructive"
        confirmLabel="Reinitialiser"
      />

      <ConfirmDialog
        open={confirmReset}
        onConfirm={() => resetMutation.mutate()}
        onCancel={() => setConfirmReset(false)}
        title="Reinitialiser tout l'arbre ?"
        description="Tous vos talents seront reinitialises. Gratuit pendant la phase de developpement."
        variant="destructive"
        confirmLabel="Tout reinitialiser"
      />

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
                    <img src={getFlagshipImageUrl(idx, 'thumb')} alt={`Flagship ${idx}`} className="w-full h-full object-cover" />
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
    </div>
  );
}
