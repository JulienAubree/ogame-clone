import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { useToastStore } from '@/stores/toast.store';
import { Button } from '@/components/ui/button';
import { Zap, Sparkles, Wrench, X, Star, Trophy, Crosshair, ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveBonus } from '@exilium/game-engine';
import { formatTargetCategory } from '@/lib/combat-helpers';
import { cn } from '@/lib/utils';
import {
  HullIcon, ShieldIcon, ArmorIcon, WeaponsIcon,
} from '@/components/entity-details/stat-components';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
import { AnomalyIcon } from '@/lib/icons';

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
  if (p.targetCategory) parts.push(`vs ${formatTargetCategory(p.targetCategory)}`);
  if (p.rafale) {
    const cat = p.rafale.category ? ` vs ${formatTargetCategory(p.rafale.category)}` : '';
    parts.push(`rafale ×${p.rafale.count}${cat}`);
  }
  if (p.hasChainKill) parts.push('cascade');
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
      addToast(`✨ Anomalie engagée — vaisseau amiral en mission`, 'success');
      utils.anomaly.current.invalidate();
      utils.exilium.getBalance.invalidate();
      utils.flagship.get.invalidate();
      onClose();
    },
    onError: (err) => addToast(err.message ?? 'Engagement impossible', 'error'),
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

  const flagshipName = flagship.name ?? 'Vaisseau amiral';
  const hullName = flagship.hullConfig?.name ?? 'Coque inconnue';
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

  const level = (flagship as { level?: number }).level ?? 1;
  const levelMultDisplay = (1 + level * 0.05).toFixed(2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-violet-500/30 bg-card shadow-2xl shadow-violet-950/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero header — gradient atmosphérique cohérent avec /anomalies */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/80 via-slate-950 to-indigo-950/60" />
          <div
            className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(167,139,250,0.04), rgba(167,139,250,0.04) 1px, transparent 1px, transparent 3px)',
            }}
          />
          <div className="relative flex items-center gap-3 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/40 bg-violet-950/70 shadow-[0_0_16px_rgba(167,139,250,0.18)]">
              <AnomalyIcon className="h-5 w-5 text-violet-200" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-foreground leading-tight">Engager une anomalie</h2>
              <p className="text-[11px] text-violet-200/70 mt-0.5 truncate">
                <strong className="text-foreground/90">{flagshipName}</strong>
                <span className="text-violet-200/60"> · {hullName}</span> part seul — modules + charges feront la différence.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="shrink-0 rounded-md p-1 text-violet-200/70 hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Combat stats grid — mêmes tiles que FlagshipStatsClearCard */}
          <div className="grid grid-cols-2 gap-2">
            <ModalStatTile
              icon={<HullIcon size={14} />}
              label="Coque"
              value={finalHull}
              tone="text-slate-200"
              iconTone="text-slate-400"
            />
            <ModalStatTile
              icon={<ShieldIcon size={14} />}
              label="Bouclier"
              value={finalShield}
              tone="text-sky-300"
              iconTone="text-sky-400"
            />
            <ModalStatTile
              icon={<ArmorIcon size={14} />}
              label="Blindage"
              value={finalArmor}
              tone="text-amber-300"
              iconTone="text-amber-400"
            />
            <ModalStatTile
              icon={<WeaponsIcon size={14} />}
              label="Armement"
              value={finalWeapons}
              tone="text-red-300"
              iconTone="text-red-400"
            />
          </div>

          {/* Pilot + repair charges — sous-stats compactes */}
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Star className="h-3 w-3 text-violet-400" />
              <span>Niv. {level}</span>
              <span className="font-mono text-muted-foreground/60">×{levelMultDisplay}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Wrench className="h-3 w-3 text-emerald-400" />
              <span>Réparation</span>
              <span className="font-mono text-foreground/80">{repairCharges}/{repairCharges}</span>
            </span>
          </div>

          {/* Arsenal — preview des profils d'arme */}
          <div className="rounded-md border border-orange-500/30 bg-gradient-to-br from-orange-950/30 via-stone-900/50 to-amber-950/20 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-orange-300">
              <Crosshair className="h-3 w-3" /> Arsenal
              <span className="ml-auto text-[10px] text-muted-foreground font-mono normal-case tracking-normal">
                {weaponProfiles.length} profil{weaponProfiles.length > 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-0.5 text-[11px]">
              {weaponProfiles.length === 0 ? (
                <li className="text-muted-foreground italic">Aucun profil — vérifier la configuration du vaisseau amiral.</li>
              ) : (
                weaponProfiles.map((p, idx) => (
                  <li key={`${p.source}-${idx}`} className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          p.source === 'hull' ? 'bg-muted-foreground/50' : 'bg-orange-400',
                        )}
                        aria-hidden
                      />
                      <span className="font-medium text-foreground/90 truncate">{p.label}</span>
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px] truncate shrink-0">
                      {formatWeaponProfile(p)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Sélecteur de palier */}
          <div className="rounded-md border border-violet-500/20 bg-violet-950/20 p-3 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-200 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-yellow-400" /> Palier
              </span>
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={() => setSelectedTier(Math.max(1, selectedTier - 1))}
                  disabled={selectedTier <= 1}
                  aria-label="Palier précédent"
                  className="rounded p-1 hover:bg-violet-500/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-bold text-lg font-mono tabular-nums text-violet-100 w-8 text-center">
                  {selectedTier}
                </span>
                <button
                  onClick={() => setSelectedTier(Math.min(maxUnlocked, selectedTier + 1))}
                  disabled={selectedTier >= maxUnlocked}
                  aria-label="Palier suivant"
                  className="rounded p-1 hover:bg-violet-500/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="text-[10px] text-muted-foreground font-mono ml-1">/ {maxUnlocked}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center justify-between rounded bg-card/40 px-2 py-1">
                <span className="text-muted-foreground">FP ennemi</span>
                <span className="font-mono tabular-nums text-foreground/90">~{enemyFpAtDepth1.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded bg-card/40 px-2 py-1">
                <span className="text-muted-foreground">Butin</span>
                <span className="font-mono tabular-nums text-emerald-300">×{lootMult}</span>
              </div>
            </div>
          </div>

          {/* Coût */}
          <div className="flex items-center justify-between border-t border-border/40 pt-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-violet-400" /> Coût d'engagement
            </span>
            <span className={cn(
              'flex items-center gap-1 text-sm font-bold font-mono tabular-nums',
              insufficientFundsScaled ? 'text-rose-400' : 'text-foreground',
            )}>
              <ExiliumIcon size={14} />
              {scaledCost.toLocaleString()}
              {insufficientFundsScaled && (
                <span className="text-[10px] font-normal text-rose-400/80 ml-1">(insuffisant)</span>
              )}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              onClick={handleEngage}
              disabled={insufficientFundsScaled || engageMutation.isPending}
              className={cn(
                'gap-1.5',
                !insufficientFundsScaled && !engageMutation.isPending && !confirming &&
                  'bg-violet-600 hover:bg-violet-500 text-white',
                confirming && 'bg-violet-500 hover:bg-violet-400 text-white shadow-lg shadow-violet-500/30',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {confirming ? 'Confirmer ?' : engageMutation.isPending ? 'Engagement…' : 'Engager'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compact stat tile (mirrors FlagshipStatsClearCard.StatTile) ────────────
function ModalStatTile({
  icon, label, value, tone, iconTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
  iconTone: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-[#0f172a]/60 border border-panel-border/50 px-2.5 py-2">
      <span className={cn('shrink-0', iconTone)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wide text-slate-500 truncate">{label}</div>
        <div className={cn('text-sm font-bold font-mono tabular-nums leading-tight', tone)}>
          {value.toLocaleString('fr-FR')}
        </div>
      </div>
    </div>
  );
}
