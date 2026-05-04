import { useMemo } from 'react';
import { Sparkles, Crosshair, Zap } from 'lucide-react';
import {
  applyModulesToStats,
  parseLoadout,
  levelMultiplier,
  resolveBonus,
  getMaxCharges,
  type ModuleDefinitionLite,
  type CombatContext,
} from '@exilium/game-engine';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { cn } from '@/lib/utils';
import {
  ShieldIcon, ArmorIcon, HullIcon, WeaponsIcon, ShotsIcon,
  SectionHeader,
} from '@/components/entity-details/stat-components';
import { getHullCardStyles } from './hullCardStyles';

const fmt = (n: number) => n.toLocaleString('fr-FR');

interface FlagshipBaseStats {
  shield: number;
  baseArmor: number;
  hull: number;
  weapons: number;
  shotCount: number;
  hullId: string | null;
  level?: number;
  status?: string;
  moduleLoadout?: unknown;
}

interface FlagshipStatsClearCardProps {
  flagship: FlagshipBaseStats;
}

interface HullPassiveBonuses {
  bonus_weapons?: number;
  bonus_armor?: number;
  bonus_shot_count?: number;
}

interface HullDefaultWeaponProfile {
  damage?: number;
  shots?: number;
  targetCategory?: string;
  rafale?: { category?: string; count: number };
  hasChainKill?: boolean;
}

interface HullConfigShape {
  name?: string;
  passiveBonuses?: HullPassiveBonuses;
  defaultWeaponProfile?: HullDefaultWeaponProfile;
}

interface WeaponBatteryDisplay {
  /** "Coque" or module name */
  source: string;
  /** Rarity label for module ('common' | 'rare' | 'epic') */
  rarityLabel?: string | null;
  damagePerShot: number;
  shots: number;
  targetCategory: string;
  rafale?: { category?: string; count: number };
  hasChainKill?: boolean;
  totalDamage: number;
  isHull: boolean;
}

const RARITY_TONE: Record<string, string> = {
  common: 'text-slate-300 border-slate-500/40 bg-slate-500/10',
  rare: 'text-blue-300 border-blue-500/40 bg-blue-500/10',
  epic: 'text-violet-300 border-violet-500/40 bg-violet-500/10',
};

const RARITY_LABEL: Record<string, string> = { common: 'C', rare: 'R', epic: 'E' };

/**
 * V8-FlagshipRework : bloc de stats "vraies" combat-ready, intégrant
 * level × hull bonuses × modules passives × research multipliers, et
 * détaillant les batteries d'armes (hull defaultWeaponProfile + weapon
 * modules équipés).
 *
 * Reproduit fidèlement le calcul de `loadFlagshipCombatConfig` côté API
 * (anomaly.combat.ts) avec un CombatContext neutre :
 *   - roundIndex = 1 (donc first_round triggers ON — ce qui montre les
 *     stats au début de combat, le moment le plus pertinent)
 *   - currentHullPercent = 1.0 (low_hull triggers OFF — situationnel)
 *   - enemyFP = 0 (enemy_fp_above triggers OFF — dépend de la difficulté)
 *   - pendingEpicEffect = null (pas d'epic en cours)
 */
export function FlagshipStatsClearCard({ flagship }: FlagshipStatsClearCardProps) {
  const styles = getHullCardStyles(flagship.hullId);

  const { data: researchData, isLoading: researchLoading } = trpc.research.list.useQuery();
  const { data: gameConfig, isLoading: configLoading } = useGameConfig();
  const { data: allModules, isLoading: modulesLoading } = trpc.modules.list.useQuery();
  // V8 : on lit le moduleLoadout directement depuis flagship.get pour éviter
  // un appel séparé. Si non disponible (ancien cache), on fallback sur le
  // tRPC loadout.get.
  const directLoadout = flagship.moduleLoadout;
  const { data: loadoutData, isLoading: loadoutLoading } = trpc.modules.loadout.get.useQuery(
    { hullId: flagship.hullId ?? 'industrial' },
    { enabled: !directLoadout && !!flagship.hullId },
  );

  const isLoading = researchLoading || configLoading || modulesLoading || loadoutLoading;

  const computed = useMemo(() => {
    if (!gameConfig || !allModules) return null;

    // --- Research multipliers (applied on top of effective + module-modified stats) ---
    const researchLevels: Record<string, number> = {};
    for (const r of researchData?.items ?? []) {
      researchLevels[r.id] = r.currentLevel;
    }
    const bonusDefs = gameConfig.bonuses ?? [];
    const weaponsMult = resolveBonus('weapons', null, researchLevels, bonusDefs);
    const shieldingMult = resolveBonus('shielding', null, researchLevels, bonusDefs);
    const armorMult = resolveBonus('armor', null, researchLevels, bonusDefs);

    // --- Level multiplier (V4-XP) ---
    const universe = gameConfig.universe as Record<string, unknown>;
    const rawLevelPct = Number(universe?.flagship_xp_level_multiplier_pct);
    const levelPct = Number.isFinite(rawLevelPct) ? rawLevelPct : 0.05;
    const level = flagship.level ?? 1;
    const levelMult = levelMultiplier(level, levelPct);

    // --- Hull config + passive bonuses (only when active) ---
    const hullsConfig = (gameConfig.hulls ?? {}) as Record<string, HullConfigShape>;
    const hullConfig = flagship.hullId ? hullsConfig[flagship.hullId] : undefined;
    const isStationed = flagship.status === 'active';
    const hullBonusWeapons = (hullConfig && isStationed) ? (hullConfig.passiveBonuses?.bonus_weapons ?? 0) : 0;
    const hullBonusArmor = (hullConfig && isStationed) ? (hullConfig.passiveBonuses?.bonus_armor ?? 0) : 0;
    const hullBonusShotCount = (hullConfig && isStationed) ? (hullConfig.passiveBonuses?.bonus_shot_count ?? 0) : 0;

    // --- Base stats with level mult applied (matches loadFlagshipCombatConfig) ---
    const baseDamage = Math.round((flagship.weapons + hullBonusWeapons) * levelMult);
    const baseShield = Math.round(flagship.shield * levelMult);
    // hull MAX (no hullPercent dégradation : on montre la coque pleine)
    const baseHull = Math.round(flagship.hull * levelMult);
    const baseArmor = Math.round((flagship.baseArmor + hullBonusArmor) * levelMult);
    const baseShotCount = (flagship.shotCount ?? 1) + hullBonusShotCount;

    // --- Resolve loadout into passive + weapon modules ---
    const hullId = flagship.hullId ?? 'industrial';
    const pool = (allModules ?? []) as ModuleDefinitionLite[];
    // The loadout snapshot can come either from flagship.moduleLoadout (full
    // record keyed by hullId) or from the tRPC loadout.get response (single
    // hull's slot). Normalize to the Record<hullId, slot> shape parseLoadout
    // expects.
    let loadoutSnapshot: Record<string, unknown>;
    if (directLoadout) {
      loadoutSnapshot = directLoadout as Record<string, unknown>;
    } else if (loadoutData?.slot) {
      loadoutSnapshot = { [hullId]: loadoutData.slot };
    } else {
      loadoutSnapshot = {};
    }
    const { equipped: passives, weapons: weaponModules } = parseLoadout(
      loadoutSnapshot as Parameters<typeof parseLoadout>[0],
      hullId,
      pool,
    );

    // --- Apply modules passives via applyModulesToStats with neutral context ---
    const neutralContext: CombatContext = {
      roundIndex: 1,
      currentHullPercent: 1.0,
      enemyFP: 0,
      pendingEpicEffect: null,
    };
    const modified = applyModulesToStats(
      { damage: baseDamage, hull: baseHull, shield: baseShield, armor: baseArmor, cargo: 0, speed: 0, regen: 0 },
      passives,
      neutralContext,
    );

    // --- Apply research multipliers on top (matches combat resolution) ---
    const finalDamage = Math.round(modified.damage * weaponsMult);
    const finalShield = Math.round(modified.shield * shieldingMult);
    const finalHull = Math.round(modified.hull * armorMult);
    const finalArmor = Math.round(modified.armor * armorMult);

    // Charges épiques max (1 + bonus modules epic_charges_max, cap 3)
    const maxCharges = getMaxCharges(passives);

    // --- Weapon profiles breakdown ---
    const hullDefaultProfile = hullConfig?.defaultWeaponProfile;
    const batteries: WeaponBatteryDisplay[] = [];

    // Battery 0 : hull base profile (uses post-mods damage + shotCount, then research)
    const hullDamagePerShot = Math.round(modified.damage * weaponsMult);
    batteries.push({
      source: hullConfig?.name ?? 'Coque',
      rarityLabel: null,
      damagePerShot: hullDamagePerShot,
      shots: baseShotCount,
      targetCategory: hullDefaultProfile?.targetCategory ?? 'medium',
      rafale: hullDefaultProfile?.rafale,
      hasChainKill: hullDefaultProfile?.hasChainKill,
      totalDamage: hullDamagePerShot * baseShotCount,
      isHull: true,
    });

    // Modules — each weapon module brings its own profile (research applied to damage)
    for (const m of weaponModules) {
      if (m.effect.type !== 'weapon') continue;
      const p = m.effect.profile;
      const dps = Math.round(p.damage * weaponsMult);
      batteries.push({
        source: (m as ModuleDefinitionLite & { name?: string }).name ?? m.id,
        rarityLabel: m.rarity,
        damagePerShot: dps,
        shots: p.shots,
        targetCategory: p.targetCategory ?? 'medium',
        rafale: p.rafale,
        hasChainKill: p.hasChainKill,
        totalDamage: dps * p.shots,
        isHull: false,
      });
    }

    // Totals across all batteries
    const totalShots = batteries.reduce((s, b) => s + b.shots, 0);
    const totalDamage = batteries.reduce((s, b) => s + b.totalDamage, 0);

    return {
      finalDamage, finalShield, finalHull, finalArmor,
      baseShotCount, totalShots, totalDamage,
      maxCharges,
      batteries,
      level, levelMult,
      passivesCount: passives.length,
    };
  }, [flagship, gameConfig, allModules, researchData, directLoadout, loadoutData]);

  if (isLoading || !computed) {
    return (
      <div className={cn('glass-card p-4 lg:p-5 border space-y-3', styles.border)}>
        <div className="h-4 w-32 bg-muted/30 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 bg-muted/20 rounded animate-pulse" />
          <div className="h-16 bg-muted/20 rounded animate-pulse" />
          <div className="h-16 bg-muted/20 rounded animate-pulse" />
          <div className="h-16 bg-muted/20 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('glass-card p-4 lg:p-5 space-y-4 border', styles.border)}>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className={cn('h-3.5 w-3.5', styles.badgeText)} />
            Stats de combat
          </h3>
          <span className="text-[10px] text-muted-foreground/70 font-mono">
            ×{computed.levelMult.toFixed(2)} niv. {computed.level}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          Chiffres exacts utilisés en anomalie (niveau × coque × modules × recherches).
        </p>
      </div>

      {/* Defense + Attack grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Coque */}
        <StatTile
          icon={<HullIcon size={14} />}
          label="Coque"
          value={computed.finalHull}
          tone="text-slate-200"
          iconTone="text-slate-400"
        />
        {/* Bouclier */}
        <StatTile
          icon={<ShieldIcon size={14} />}
          label="Bouclier"
          value={computed.finalShield}
          tone="text-sky-300"
          iconTone="text-sky-400"
        />
        {/* Blindage */}
        <StatTile
          icon={<ArmorIcon size={14} />}
          label="Blindage"
          value={computed.finalArmor}
          tone="text-amber-300"
          iconTone="text-amber-400"
        />
        {/* Charges */}
        <StatTile
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Charges épiques"
          value={computed.maxCharges}
          tone="text-violet-300"
          iconTone="text-violet-400"
          suffix="max"
        />
      </div>

      <div className="h-px bg-panel-border/50" />

      {/* Attack summary */}
      <div>
        <SectionHeader
          icon={<WeaponsIcon size={13} className="text-red-400" />}
          label="Armement"
          color="text-red-400"
        />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <StatTile
            icon={<ShotsIcon size={14} />}
            label="Tirs / round"
            value={computed.totalShots}
            tone="text-purple-300"
            iconTone="text-purple-400"
          />
          <StatTile
            icon={<WeaponsIcon size={14} />}
            label="Dégâts / round"
            value={computed.totalDamage}
            tone="text-red-300"
            iconTone="text-red-400"
          />
        </div>
      </div>

      <div className="h-px bg-panel-border/50" />

      {/* Weapon batteries breakdown */}
      <div>
        <SectionHeader
          icon={<Crosshair className="h-3.5 w-3.5 text-orange-400" />}
          label={`Batteries d'armes (${computed.batteries.length})`}
          color="text-orange-400"
        />
        <ul className="mt-2 space-y-1.5">
          {computed.batteries.map((b, i) => (
            <li
              key={`${b.isHull ? 'hull' : 'mod'}-${i}`}
              className={cn(
                'rounded-md border px-2.5 py-2 text-[11px] space-y-0.5',
                b.isHull
                  ? 'border-stone-500/30 bg-stone-500/5'
                  : 'border-orange-500/20 bg-orange-500/5',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={cn(
                    'truncate font-semibold',
                    b.isHull ? 'text-stone-200' : 'text-amber-200',
                  )}>
                    {b.source}
                  </span>
                  {b.rarityLabel && (
                    <span className={cn(
                      'shrink-0 inline-flex h-4 w-4 items-center justify-center rounded border text-[9px] font-bold uppercase',
                      RARITY_TONE[b.rarityLabel] ?? RARITY_TONE.common,
                    )}>
                      {RARITY_LABEL[b.rarityLabel] ?? '·'}
                    </span>
                  )}
                </div>
                <span className="text-red-300 font-mono tabular-nums shrink-0">
                  {fmt(b.damagePerShot)} × {b.shots} = <span className="font-semibold">{fmt(b.totalDamage)}</span>
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                anti-{b.targetCategory}
                {b.rafale && (
                  <> · rafale ×{b.rafale.count}{b.rafale.category ? ` vs ${b.rafale.category}` : ''}</>
                )}
                {b.hasChainKill && <> · chainKill</>}
              </div>
            </li>
          ))}
        </ul>
        {computed.batteries.length === 1 && (
          <p className="mt-2 text-[10px] text-muted-foreground/60 italic">
            Aucune arme additionnelle équipée — l'arsenal augmenterait les batteries de combat.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Stat tile ───────────────────────────────────────────────────────────────

function StatTile({
  icon, label, value, tone, iconTone, suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
  iconTone: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-[#0f172a]/60 border border-panel-border/50 px-2.5 py-2">
      <span className={cn('shrink-0', iconTone)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wide text-slate-500 truncate">{label}</div>
        <div className={cn('text-sm font-bold font-mono tabular-nums leading-tight', tone)}>
          {fmt(value)}
          {suffix && <span className="ml-1 text-[9px] text-muted-foreground/60 font-normal">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}
