import { useEffect, useState } from 'react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { Button } from '@/components/ui/button';
import { Zap, Sparkles, Wrench, X, Star, Trophy } from 'lucide-react';
import { resolveBonus } from '@exilium/game-engine';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AnomalyEngageModal({ open, onClose }: Props) {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const [confirming, setConfirming] = useState(false);

  const { data: flagship } = trpc.flagship.get.useQuery(undefined, { enabled: open });
  const { data: gameConfig } = useGameConfig();  // wraps trpc.gameConfig.getAll
  const { data: exilium } = trpc.exilium.getBalance.useQuery(undefined, { enabled: open });
  const { data: researchData } = trpc.research.list.useQuery(undefined, { enabled: open });

  const cost = Number(gameConfig?.universe?.anomaly_entry_cost_exilium) || 5;
  const repairCharges = Number(gameConfig?.universe?.anomaly_repair_charges_per_run) || 3;
  const balance = exilium?.balance ?? 0;

  // V5-Tiers : difficulty + loot + cost scaled by tier
  const maxUnlocked = flagship?.maxTierUnlocked ?? 1;
  const [selectedTier, setSelectedTier] = useState(maxUnlocked);
  // Sync state when flagship arrives after mount (modal could open before query resolves)
  useEffect(() => {
    setSelectedTier((prev) => Math.min(prev, maxUnlocked));
  }, [maxUnlocked]);

  // V6-AbsoluteFP : enemy FP absolu par palier, indépendant du player.
  const tierBaseFp = Number(gameConfig?.universe?.anomaly_tier_base_fp) || 80;
  const tierFpGrowth = Number(gameConfig?.universe?.anomaly_tier_fp_growth) || 1.7;
  const enemyFpAtDepth1 = Math.round(tierBaseFp * Math.pow(tierFpGrowth, selectedTier - 1));
  const lootTierCap = Number(gameConfig?.universe?.anomaly_loot_tier_cap) || 10;
  const lootMult = Math.min(selectedTier, lootTierCap);
  const costFactor = Number(gameConfig?.universe?.anomaly_tier_engage_cost_factor) || 1.0;
  const scaledCost = Math.round(cost * (1 + (selectedTier - 1) * costFactor));
  const insufficientFundsScaled = balance < scaledCost;

  // Research multipliers — applied on top of effective stats (level mult + hull bonuses)
  // to match what the combat actually uses (see FlagshipStatsCard for reference).
  const researchLevels: Record<string, number> = {};
  for (const r of researchData?.items ?? []) {
    researchLevels[r.id] = r.currentLevel;
  }
  const bonusDefs = gameConfig?.bonuses ?? [];
  const weaponsMult = resolveBonus('weapons', null, researchLevels, bonusDefs);
  const shieldingMult = resolveBonus('shielding', null, researchLevels, bonusDefs);
  const armorMult = resolveBonus('armor', null, researchLevels, bonusDefs);

  const engageMutation = trpc.anomaly.engage.useMutation({
    onSuccess: () => {
      addToast(`✨ Anomaly engagée — flagship en mission`, 'success');
      utils.anomaly.current.invalidate();
      utils.exilium.getBalance.invalidate();
      utils.flagship.get.invalidate();
      onClose();
    },
    onError: (err) => addToast(err.message ?? 'Engage impossible', 'error'),
  });

  if (!open) return null;
  if (!flagship) return null;

  function handleEngage() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    engageMutation.mutate({ ships: {}, tier: selectedTier });
  }

  const hullName = flagship.hullConfig?.name ?? 'Flagship';
  const effectiveStats = flagship.effectiveStats as Record<string, number | string> | null;

  // Compose final combat stats : effectiveStats × research multipliers (combat-realistic)
  const baseHull = Number(effectiveStats?.hull ?? flagship.hull);
  const baseShield = Number(effectiveStats?.shield ?? flagship.shield);
  const baseArmor = Number(effectiveStats?.baseArmor ?? flagship.baseArmor);
  const baseWeapons = Number(effectiveStats?.weapons ?? flagship.weapons);
  const finalHull = Math.round(baseHull * armorMult);
  const finalShield = Math.round(baseShield * shieldingMult);
  const finalArmor = Math.round(baseArmor * armorMult);
  const finalWeapons = Math.round(baseWeapons * weaponsMult);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Engager une anomalie
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-400 leading-relaxed">
          Votre <strong>{hullName}</strong> part seul dans l'anomalie. Pas d'escorte —
          vos modules équipés et vos charges réparation feront la différence.
        </p>

        <div className="rounded-md bg-panel-light/50 border border-panel-border p-3 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-gray-500">Coque</span><span>{finalHull}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Bouclier</span><span>{finalShield}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Blindage</span><span>{finalArmor}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Armement</span><span>{finalWeapons}</span></div>
          <div className="flex justify-between">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Star className="h-3 w-3" /> Niveau pilote
            </span>
            <span>
              {(flagship as { level?: number }).level ?? 1}
              {' '}
              (×{(1 + ((flagship as { level?: number }).level ?? 1) * 0.05).toFixed(2)} stats)
            </span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-panel-border/50">
            <span className="text-gray-500 flex items-center gap-1.5"><Wrench className="h-3 w-3" /> Charges réparation</span>
            <span>{repairCharges}/{repairCharges}</span>
          </div>
        </div>

        <div className="border-t border-panel-border pt-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-sm flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-yellow-400" /> Palier
            </span>
            <button
              onClick={() => setSelectedTier(Math.max(1, selectedTier - 1))}
              disabled={selectedTier <= 1}
              className="px-2 py-1 rounded hover:bg-panel-hover disabled:opacity-30 text-sm"
            >◀</button>
            <span className="font-bold text-lg w-8 text-center">{selectedTier}</span>
            <button
              onClick={() => setSelectedTier(Math.min(maxUnlocked, selectedTier + 1))}
              disabled={selectedTier >= maxUnlocked}
              className="px-2 py-1 rounded hover:bg-panel-hover disabled:opacity-30 text-sm"
            >▶</button>
            <span className="text-xs text-gray-500">/ {maxUnlocked}</span>
          </div>
          <div className="text-xs text-gray-500 flex justify-between">
            <span>Enemy FP : ~{enemyFpAtDepth1.toLocaleString()} (depth 1)</span>
            <span>Loot : ×{lootMult} ressources</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm border-t border-panel-border pt-3">
          <span className="text-gray-500 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-purple-400" /> Coût
          </span>
          <span className={insufficientFundsScaled ? 'text-red-400 font-bold' : 'font-bold'}>
            {scaledCost} Exilium {insufficientFundsScaled && '(insuffisant)'}
          </span>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleEngage}
            disabled={insufficientFundsScaled || engageMutation.isPending}
          >
            {confirming ? 'Confirmer ?' : engageMutation.isPending ? 'Engage…' : 'Engager'}
          </Button>
        </div>
      </div>
    </div>
  );
}
