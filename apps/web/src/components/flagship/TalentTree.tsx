import { useState, useMemo } from 'react';
import { trpc } from '@/trpc';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { cn } from '@/lib/utils';

const BRANCH_COLORS: Record<string, { border: string; text: string; bg: string; tab: string; tabActive: string }> = {
  militaire: { border: 'border-red-500/30', text: 'text-red-400', bg: 'bg-red-950/20', tab: 'text-red-400/60 hover:text-red-400', tabActive: 'text-red-400 border-red-500 bg-red-500/10' },
  scientifique: { border: 'border-cyan-500/30', text: 'text-cyan-400', bg: 'bg-cyan-950/20', tab: 'text-cyan-400/60 hover:text-cyan-400', tabActive: 'text-cyan-400 border-cyan-500 bg-cyan-500/10' },
  industriel: { border: 'border-amber-500/30', text: 'text-amber-400', bg: 'bg-amber-950/20', tab: 'text-amber-400/60 hover:text-amber-400', tabActive: 'text-amber-400 border-amber-500 bg-amber-500/10' },
};

const EFFECT_LABELS: Record<string, { label: string; color: string }> = {
  modify_stat: { label: 'Stat', color: 'text-blue-400' },
  global_bonus: { label: 'Global', color: 'text-amber-400' },
  planet_bonus: { label: 'Planete', color: 'text-emerald-400' },
  unlock: { label: 'Deblocage', color: 'text-purple-400' },
};

const TIER_THRESHOLDS: Record<number, number> = { 1: 0, 2: 5, 3: 10, 4: 15, 5: 20 };

function getTierCost(tier: number) {
  return tier;
}

interface TalentTreeProps {
  showResetButton?: boolean;
  showGuide?: boolean;
}

export function TalentTree({ showResetButton = true, showGuide = false }: TalentTreeProps) {
  const utils = trpc.useUtils();
  const { data: talentTree } = trpc.talent.list.useQuery();
  const { data: exiliumData } = trpc.exilium.getBalance.useQuery();
  const balance = exiliumData?.balance ?? 0;

  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [confirmInvest, setConfirmInvest] = useState<string | null>(null);
  const [confirmRespec, setConfirmRespec] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

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

      return { branch, tiers, talents: branchTalents, totalPoints };
    });
  }, [talentTree]);

  // Default to first branch
  const currentBranchId = activeBranch ?? branchData[0]?.branch.id ?? null;
  const currentBranch = branchData.find(b => b.branch.id === currentBranchId);

  if (!talentTree) return null;

  function getInvestBlockReason(talentId: string): string | null {
    if (!talentTree) return 'Chargement…';
    const def = talentTree.talents[talentId];
    if (!def) return null;
    const rank = talentTree.ranks[talentId] ?? 0;
    if (rank >= def.maxRanks) return null;
    const bp = branchData.find(b => b.branch.id === def.branchId);
    const needed = TIER_THRESHOLDS[def.tier] ?? 0;
    const pts = bp?.totalPoints ?? 0;
    if (pts < needed) return `${needed - pts} pts manquants`;
    if (def.prerequisiteId && (talentTree.ranks[def.prerequisiteId] ?? 0) < 1) {
      const prereqName = talentTree.talents[def.prerequisiteId]?.name ?? def.prerequisiteId;
      return `Requiert : ${prereqName}`;
    }
    if (balance < getTierCost(def.tier)) return `${getTierCost(def.tier)} Exilium requis`;
    return null;
  }

  const totalAllPoints = branchData.reduce((sum, b) => sum + b.totalPoints, 0);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Arbre de talents</h3>
          <span className="text-[10px] text-muted-foreground font-mono">{totalAllPoints} pts investis</span>
        </div>
        {showResetButton && (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Reinitialiser tout
          </button>
        )}
      </div>

      {/* Guide */}
      {showGuide && (
        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
          <button
            onClick={() => setGuideOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="font-medium">Comment fonctionnent les talents ?</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={cn('transition-transform duration-200', guideOpen && 'rotate-180')}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {guideOpen && (
            <div className="px-4 pb-4 text-xs text-muted-foreground/80 space-y-2 border-t border-white/[0.04] pt-3">
              <p>
                Votre vaisseau amiral possede un arbre de talents reparti en <strong className="text-foreground">3 branches de specialisation</strong> :
                Militaire, Scientifique et Industriel. Chaque branche correspond a un type de coque.
              </p>
              <p>
                Les talents sont repartis en <strong className="text-foreground">5 tiers</strong>. Pour debloquer un tier superieur,
                vous devez investir un certain nombre de points dans la branche. Le cout en Exilium augmente avec le tier.
              </p>
              <div className="flex gap-3 pt-1">
                {Object.entries(EFFECT_LABELS).map(([key, { label, color }]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={cn('w-1.5 h-1.5 rounded-full', color.replace('text-', 'bg-'))} />
                    <span className="text-[10px]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Branch tabs */}
      <div className="flex border-b border-border/50">
        {branchData.map(({ branch, totalPoints }) => {
          const colors = BRANCH_COLORS[branch.id] ?? BRANCH_COLORS.militaire;
          const isActive = branch.id === currentBranchId;
          return (
            <button
              key={branch.id}
              onClick={() => setActiveBranch(branch.id)}
              className={cn(
                'flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2',
                isActive ? colors.tabActive : cn('border-transparent', colors.tab),
              )}
            >
              <div>{branch.name}</div>
              {totalPoints > 0 && (
                <div className={cn('text-[9px] font-mono font-normal mt-0.5', isActive ? '' : 'opacity-60')}>
                  {totalPoints} pts
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active branch content */}
      {currentBranch && (() => {
        const { branch, tiers, totalPoints } = currentBranch;
        const colors = BRANCH_COLORS[branch.id] ?? BRANCH_COLORS.militaire;

        return (
          <div className={cn('rounded-lg border p-4 space-y-4', colors.border, colors.bg)}>
            {/* Branch header */}
            <div className="text-center">
              <p className="text-[11px] text-muted-foreground">{branch.description}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Points investis : <span className={cn('font-semibold', colors.text)}>{totalPoints}</span></p>
            </div>

            {/* Tiers */}
            {[1, 2, 3, 4, 5].map(tier => {
              const tierTalents = tiers[tier] ?? [];
              if (tierTalents.length === 0) return null;
              const unlocked = totalPoints >= (TIER_THRESHOLDS[tier] ?? 0);

              return (
                <div key={tier}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn('h-px flex-1', unlocked ? colors.border.replace('border', 'bg').replace('/30', '/20') : 'bg-border/30')} />
                    <span className={cn(
                      'text-[9px] uppercase tracking-wide font-semibold px-2',
                      unlocked ? colors.text : 'text-muted-foreground/50',
                    )}>
                      Tier {tier} — {getTierCost(tier)} Exilium
                      {!unlocked && ` (${TIER_THRESHOLDS[tier]} pts requis)`}
                    </span>
                    <div className={cn('h-px flex-1', unlocked ? colors.border.replace('border', 'bg').replace('/30', '/20') : 'bg-border/30')} />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {tierTalents.map(talent => {
                      const rank = talentTree.ranks[talent.id] ?? 0;
                      const maxed = rank >= talent.maxRanks;
                      const blockReason = !maxed ? getInvestBlockReason(talent.id) : null;
                      const available = !maxed && !blockReason;
                      const effectInfo = EFFECT_LABELS[talent.effectType];

                      return (
                        <div
                          key={talent.id}
                          className={cn(
                            'rounded-lg border p-3 text-center space-y-1.5 transition-all',
                            talent.position === 'center' && tierTalents.length === 1 && 'col-span-3 max-w-xs mx-auto w-full',
                            maxed
                              ? cn(colors.border, colors.bg, 'border-opacity-60')
                              : rank > 0
                                ? cn(colors.border, 'bg-card/60')
                                : 'border-border/40 bg-card/30',
                            !unlocked && 'opacity-40',
                          )}
                        >
                          {/* Name */}
                          <div className="text-[11px] font-semibold leading-tight">{talent.name}</div>

                          {/* Effect type badge */}
                          <div className={cn('inline-block text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full', effectInfo?.color, 'bg-current/10')}>
                            <span className={effectInfo?.color}>{effectInfo?.label}</span>
                          </div>

                          {/* Description */}
                          <div className="text-muted-foreground text-[10px] leading-snug">{talent.description}</div>

                          {/* Rank display */}
                          <div className="flex items-center justify-center gap-1">
                            {Array.from({ length: talent.maxRanks }, (_, i) => (
                              <div
                                key={i}
                                className={cn(
                                  'w-2.5 h-2.5 rounded-sm border transition-colors',
                                  i < rank
                                    ? cn(colors.border.replace('border', 'bg').replace('/30', ''), colors.border)
                                    : 'bg-transparent border-border/40',
                                )}
                              />
                            ))}
                            <span className="text-[9px] font-mono text-muted-foreground ml-1">{rank}/{talent.maxRanks}</span>
                          </div>

                          {/* Block reason */}
                          {blockReason && (
                            <div className="text-[9px] text-orange-400/80">{blockReason}</div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-1.5 justify-center">
                            {available && (
                              <button
                                onClick={() => setConfirmInvest(talent.id)}
                                className={cn(
                                  'text-[9px] px-2.5 py-1 rounded-md font-medium transition-colors',
                                  colors.bg, colors.text, 'border', colors.border,
                                  'hover:brightness-125',
                                )}
                              >
                                + Investir
                              </button>
                            )}
                            {rank > 0 && (
                              <button
                                onClick={() => setConfirmRespec(talent.id)}
                                className="text-[9px] px-2 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                              >
                                Respec
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
      })()}

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
    </>
  );
}
