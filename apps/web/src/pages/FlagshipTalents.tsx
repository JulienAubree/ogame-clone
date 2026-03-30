import { useState, useMemo } from 'react';
import { trpc } from '@/trpc';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { cn } from '@/lib/utils';

const BREADCRUMB = [
  { label: 'Flotte', path: '/fleet' },
  { label: 'Vaisseau amiral', path: '/flagship/talents' },
];

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

export default function FlagshipTalents() {
  const utils = trpc.useUtils();
  const { data: talentTree, isLoading } = trpc.talent.list.useQuery();
  const { data: exiliumData } = trpc.exilium.getBalance.useQuery();
  const balance = exiliumData?.balance ?? 0;

  const [confirmInvest, setConfirmInvest] = useState<string | null>(null);
  const [confirmRespec, setConfirmRespec] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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
    onSuccess: () => {
      utils.talent.list.invalidate();
    },
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

      return { branch, tiers, talents: branchTalents, totalPoints };
    });
  }, [talentTree]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <Breadcrumb segments={BREADCRUMB} />
        <PageHeader title="Arbre de talents" />
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  if (!talentTree) return null;

  function getTierCost(tier: number) {
    return tier; // Simplifie — le vrai cout est cote serveur
  }

  function getInvestBlockReason(talentId: string): string | null {
    if (!talentTree) return 'Chargement…';
    const def = talentTree.talents[talentId];
    if (!def) return null;
    const rank = talentTree.ranks[talentId] ?? 0;
    if (rank >= def.maxRanks) return null; // maxed, pas besoin de message
    const bp = branchData.find(b => b.branch.id === def.branchId);
    const thresholds: Record<number, number> = { 1: 0, 2: 5, 3: 10, 4: 15, 5: 20 };
    const needed = thresholds[def.tier] ?? 0;
    const pts = bp?.totalPoints ?? 0;
    if (pts < needed) return `${needed - pts} pts manquants`;
    if (def.prerequisiteId && (talentTree.ranks[def.prerequisiteId] ?? 0) < 1) {
      const prereqName = talentTree.talents[def.prerequisiteId]?.name ?? def.prerequisiteId;
      return `Requiert : ${prereqName}`;
    }
    if (balance < getTierCost(def.tier)) return `${getTierCost(def.tier)} Exilium requis`;
    return null; // investissable
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <Breadcrumb segments={BREADCRUMB} />
      <PageHeader
        title="Arbre de talents"
        actions={
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Réinitialiser tout
          </button>
        }
      />

      {/* Branches */}
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
                      {!unlocked && ` (${thresholds[tier]} pts dans la branche requis)`}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {tierTalents.map(talent => {
                        const rank = talentTree.ranks[talent.id] ?? 0;
                        const maxed = rank >= talent.maxRanks;
                        const blockReason = !maxed ? getInvestBlockReason(talent.id) : null;
                        const available = !maxed && !blockReason;
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

                            {blockReason && (
                              <div className="text-[8px] text-orange-400/80">{blockReason}</div>
                            )}

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

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!confirmInvest}
        onConfirm={() => { if (confirmInvest) investMutation.mutate({ talentId: confirmInvest }); }}
        onCancel={() => setConfirmInvest(null)}
        title="Investir dans ce talent ?"
        description={`Coût : ${confirmInvest ? getTierCost(talentTree.talents[confirmInvest]?.tier ?? 1) : 0} Exilium`}
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
    </div>
  );
}
