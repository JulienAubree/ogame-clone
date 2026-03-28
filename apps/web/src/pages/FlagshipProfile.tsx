import { useState, useMemo } from 'react';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { Skeleton } from '@/components/common/Skeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Actif', color: 'text-emerald-400' },
  in_mission: { label: 'En mission', color: 'text-blue-400' },
  incapacitated: { label: 'Incapacité', color: 'text-red-400' },
};

const DRIVE_LABELS: Record<string, string> = {
  combustion: 'Combustion',
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
  planet_bonus: { label: 'Planète', color: 'text-emerald-400' },
  timed_buff: { label: 'Actif', color: 'text-pink-400' },
  unlock: { label: 'Déblocage', color: 'text-purple-400' },
};

function FlagshipSkeleton() {
  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-6">
        <div className="space-y-4">
          <div className="glass-card p-4 flex flex-col items-center gap-3">
            <Skeleton className="h-32 w-32 rounded-lg" />
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <Skeleton className="h-5 w-20" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
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
  const balance = exiliumData?.balance ?? 0;

  const [showImagePicker, setShowImagePicker] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmInvest, setConfirmInvest] = useState<string | null>(null);
  const [confirmRespec, setConfirmRespec] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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

  // Organiser les talents par branche et tier
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

  const status = STATUS_LABELS[flagship.status] ?? { label: flagship.status, color: 'text-muted-foreground' };
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

  function handleImageSelect(imageId: string) {
    imageMutation.mutate({ imageId });
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

  const stats = [
    { label: 'Armes', base: flagship.weapons, bonus: talentBonuses.weapons, value: effectiveStats?.weapons ?? flagship.weapons },
    { label: 'Bouclier', base: flagship.shield, bonus: talentBonuses.shield, value: effectiveStats?.shield ?? flagship.shield },
    { label: 'Coque', base: flagship.hull, bonus: talentBonuses.hull, value: effectiveStats?.hull ?? flagship.hull },
    { label: 'Blindage', base: flagship.baseArmor, bonus: talentBonuses.baseArmor, value: effectiveStats?.baseArmor ?? flagship.baseArmor },
    { label: 'Tirs', base: flagship.shotCount, bonus: talentBonuses.shotCount, value: effectiveStats?.shotCount ?? flagship.shotCount },
    { label: 'Cargo', base: flagship.cargoCapacity, bonus: talentBonuses.cargoCapacity, value: effectiveStats?.cargoCapacity ?? flagship.cargoCapacity },
    { label: 'Vitesse', base: flagship.baseSpeed, bonus: talentBonuses.speedPercent ? Math.round(flagship.baseSpeed * talentBonuses.speedPercent) : undefined, value: effectiveStats?.baseSpeed ?? flagship.baseSpeed },
    { label: 'Carburant', base: flagship.fuelConsumption, bonus: talentBonuses.fuelConsumption, value: effectiveStats?.fuelConsumption ?? flagship.fuelConsumption },
    { label: 'Propulsion', value: DRIVE_LABELS[driveType] ?? driveType },
  ];

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Vaisseau amiral" />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 lg:gap-6">
        {/* ===== Left column — Identity ===== */}
        <div className="space-y-4">
          {/* Image + Name */}
          <div className="glass-card p-4 flex flex-col items-center gap-3">
            <div className="relative">
              {flagship.imageId ? (
                <img
                  src={`/assets/flagships/${flagship.imageId}.webp`}
                  alt={flagship.name}
                  className="h-32 w-32 rounded-lg object-cover border-2 border-white/10"
                />
              ) : (
                <div className="h-32 w-32 rounded-lg bg-primary/20 flex items-center justify-center text-4xl font-bold text-primary border-2 border-white/10">
                  VA
                </div>
              )}
            </div>
            {flagshipImages && flagshipImages.length > 0 && (
              <button
                onClick={() => setShowImagePicker(true)}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Changer l'image
              </button>
            )}

            {editingName ? (
              <div className="w-full space-y-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-center"
                  autoFocus
                />
                <div className="text-right text-xs text-muted-foreground">{name.length}/32</div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={256}
                  rows={2}
                  placeholder="Description (optionnel)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
                <div className="text-right text-xs text-muted-foreground">{description.length}/256</div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingName(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleRename}
                    disabled={name.length < 2 || renameMutation.isPending}
                    className="text-xs text-primary hover:text-primary/80 disabled:opacity-50"
                  >
                    {renameMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold text-center">{flagship.name}</h2>
                {flagship.description && (
                  <p className="text-xs text-muted-foreground text-center">{flagship.description}</p>
                )}
                <button
                  onClick={startEditName}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Renommer
                </button>
              </>
            )}

            <span className={`inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold ${status.color}`}>
              {status.label}
            </span>
          </div>

          {/* Repair info */}
          {flagship.status === 'incapacitated' && flagship.repairEndsAt && (
            <div className="glass-card p-4 border border-red-500/30">
              <h3 className="text-sm font-semibold text-red-400">En réparation</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Réparation automatique : {new Date(flagship.repairEndsAt).toLocaleString('fr-FR')}
              </p>
            </div>
          )}
        </div>

        {/* ===== Right column — Stats ===== */}
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Statistiques</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-lg bg-accent/50 p-3 text-center">
                  <div className="text-lg font-bold text-primary">
                    {typeof stat.value === 'number' ? stat.value.toLocaleString('fr-FR') : stat.value}
                  </div>
                  {stat.bonus != null && stat.bonus !== 0 && typeof stat.bonus === 'number' && (
                    <div className="text-[10px] text-emerald-400">
                      {stat.base?.toLocaleString('fr-FR')} {stat.bonus > 0 ? '+' : ''}{stat.bonus.toLocaleString('fr-FR')}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
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
              Réinitialiser tout
            </button>
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
        description={`Coût : ${confirmInvest && talentTree ? getTierCost(talentTree.talents[confirmInvest]?.tier ?? 1) : 0} Exilium`}
        confirmLabel="Investir"
      />

      <ConfirmDialog
        open={!!confirmRespec}
        onConfirm={() => { if (confirmRespec) respecMutation.mutate({ talentId: confirmRespec }); }}
        onCancel={() => setConfirmRespec(null)}
        title="Réinitialiser ce talent ?"
        description="Les talents dépendants seront aussi réinitialisés. Le coût est 50% de l'Exilium investi."
        variant="destructive"
        confirmLabel="Réinitialiser"
      />

      <ConfirmDialog
        open={confirmReset}
        onConfirm={() => resetMutation.mutate()}
        onCancel={() => setConfirmReset(false)}
        title="Réinitialiser tout l'arbre ?"
        description="Coût : 50 Exilium. Tous vos talents seront réinitialisés."
        variant="destructive"
        confirmLabel="Tout réinitialiser"
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
                {flagshipImages.map(id => (
                  <button
                    key={id}
                    onClick={() => handleImageSelect(id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                      id === flagship!.imageId ? 'border-primary ring-2 ring-primary/50' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={`/assets/flagships/${id}.webp`} alt={id} className="w-full h-full object-cover" />
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
