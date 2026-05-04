import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { Button } from '@/components/ui/button';
import { Zap, Sparkles, Wrench, X, Star, Trophy, Crosshair } from 'lucide-react';
import { resolveBonus } from '@exilium/game-engine';

/**
 * V7-WeaponProfiles : descriptor d'un weaponProfile pour le preview.
 * Couvre à la fois le profil de coque (hull defaultWeaponProfile) et les
 * profils des modules d'arme équipés.
 */
interface WeaponProfilePreview {
  source: 'hull' | 'module';
  label: string;
  shots?: number;
  targetCategory?: string;
  rafale?: { category?: string; count: number };
  hasChainKill?: boolean;
}

function formatWeaponProfile(p: WeaponProfilePreview): string {
  const parts: string[] = [];
  if (p.shots !== undefined) parts.push(`${p.shots} tir${p.shots > 1 ? 's' : ''}`);
  if (p.targetCategory) parts.push(`anti-${p.targetCategory}`);
  if (p.rafale) {
    const cat = p.rafale.category ? ` vs ${p.rafale.category}` : '';
    parts.push(`rafale ×${p.rafale.count}${cat}`);
  }
  if (p.hasChainKill) parts.push('chainKill');
  return parts.join(' · ');
}

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
  // V7-WeaponProfiles : on a besoin de la liste complète des modules pour
  // résoudre les ids des weapon slots équipés (nom + profile).
  const { data: allModules } = trpc.modules.list.useQuery(undefined, { enabled: open });

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

  // V7-WeaponProfiles : compose les weaponProfiles utilisés au combat :
  //  - 1 profil "hull" (defaultWeaponProfile + shotCount du flagship)
  //  - 1 profil par weapon module équipé (slots weaponEpic/Rare/Common)
  // Les modules invalides (kind != 'weapon') sont silencieusement ignorés —
  // côté Arsenal UI, ils sont déjà signalés en rouge.
  // IMPORTANT : ce hook DOIT être appelé avant tout early-return — sinon
  // l'ordre des hooks varie entre les renders et React lève une erreur.
  const weaponProfiles = useMemo<WeaponProfilePreview[]>(() => {
    const out: WeaponProfilePreview[] = [];
    if (!flagship || !gameConfig) return out;

    const hullId = (flagship as { hullId?: string | null }).hullId ?? '';
    const hullsConfig = (gameConfig as { hulls?: Record<string, {
      name?: string;
      defaultWeaponProfile?: { targetCategory?: string; rafale?: { category?: string; count: number }; hasChainKill?: boolean };
    }> }).hulls ?? {};
    const hullCfg = hullsConfig[hullId];
    const hullProfile = hullCfg?.defaultWeaponProfile;
    const hullShotCount = Number((flagship as { effectiveStats?: { shotCount?: number } }).effectiveStats?.shotCount ?? (flagship as { shotCount?: number }).shotCount ?? 1);
    out.push({
      source: 'hull',
      label: hullCfg?.name ?? 'Vaisseau base',
      shots: hullShotCount,
      targetCategory: hullProfile?.targetCategory ?? 'medium',
      rafale: hullProfile?.rafale,
      hasChainKill: hullProfile?.hasChainKill,
    });

    // Equipped weapon module ids on the flagship's current hull.
    const moduleLoadout = ((flagship as { moduleLoadout?: unknown }).moduleLoadout ?? {}) as
      Record<string, { weaponEpic?: string | null; weaponRare?: string | null; weaponCommon?: string | null } | undefined>;
    const slot = hullId ? moduleLoadout[hullId] : undefined;
    const weaponIds = [
      slot?.weaponCommon ?? null,
      slot?.weaponRare ?? null,
      slot?.weaponEpic ?? null,
    ].filter((id): id is string => typeof id === 'string' && id.length > 0);

    const byId = new Map<string, { name: string; effect?: unknown; kind?: string }>();
    for (const m of (allModules ?? []) as Array<{ id: string; name: string; effect?: unknown; kind?: string }>) {
      byId.set(m.id, { name: m.name, effect: m.effect, kind: m.kind });
    }
    for (const id of weaponIds) {
      const mod = byId.get(id);
      if (!mod) continue;
      const effect = mod.effect as { type?: string; profile?: { shots?: number; targetCategory?: string; rafale?: { category?: string; count: number }; hasChainKill?: boolean } } | undefined;
      if (!effect || effect.type !== 'weapon' || !effect.profile) continue; // module invalide — silently skip
      out.push({
        source: 'module',
        label: mod.name,
        shots: effect.profile.shots,
        targetCategory: effect.profile.targetCategory,
        rafale: effect.profile.rafale,
        hasChainKill: effect.profile.hasChainKill,
      });
    }
    return out;
  }, [flagship, gameConfig, allModules]);

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

        {/* V7-WeaponProfiles : preview des profils d'arme effectivement
            utilisés au combat (coque + modules d'armes équipés). Le combat
            tire avec chacun de ces profils par tour. */}
        <div className="rounded-md border border-orange-500/30 bg-gradient-to-br from-orange-950/30 via-stone-900/50 to-amber-950/20 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-300">
            <Crosshair className="h-3.5 w-3.5" /> Arsenal
            <span className="ml-auto text-[10px] text-muted-foreground font-mono normal-case">
              {weaponProfiles.length} profil{weaponProfiles.length > 1 ? 's' : ''}
            </span>
          </div>
          <ul className="space-y-1 text-[11px]">
            {weaponProfiles.length === 0 ? (
              <li className="text-muted-foreground italic">Aucun profil — vérifier la configuration du flagship.</li>
            ) : (
              weaponProfiles.map((p, idx) => (
                <li key={`${p.source}-${idx}`} className="flex items-baseline justify-between gap-2">
                  <span className={p.source === 'hull' ? 'text-stone-200' : 'text-amber-200'}>
                    {p.source === 'hull' ? 'Coque' : '·'} <span className="font-semibold">{p.label}</span>
                  </span>
                  <span className="text-muted-foreground font-mono text-[10px] truncate">
                    {formatWeaponProfile(p)}
                  </span>
                </li>
              ))
            )}
          </ul>
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
