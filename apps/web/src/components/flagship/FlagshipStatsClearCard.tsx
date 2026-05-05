import { useMemo } from 'react';
import { Sparkles, Crosshair, Zap, Info } from 'lucide-react';
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
import { formatTargetCategory } from '@/lib/combat-helpers';
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

const RARITY_DOT: Record<string, string> = {
  common: 'bg-gray-400',
  rare: 'bg-blue-400',
  epic: 'bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.5)]',
};

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
    // V8.1 : si `damageMultiplier` est présent, le damage par shot est dérivé
    // du damage de coque post-research (`hullDamagePerShot`) × multiplicateur.
    // Sinon fallback V7 sur `p.damage` absolu × weaponsMult.
    for (const m of weaponModules) {
      if (m.effect.type !== 'weapon') continue;
      const p = m.effect.profile as {
        damage: number;
        damageMultiplier?: number;
        shots: number;
        targetCategory?: string;
        rafale?: { category?: string; count: number };
        hasChainKill?: boolean;
      };
      const dps = p.damageMultiplier !== undefined
        ? Math.round(hullDamagePerShot * p.damageMultiplier)
        : Math.round(p.damage * weaponsMult);
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

    // V8.2 : ratios modules (damage/hull/shield/armor) post-applyModulesToStats
    // pour pouvoir reconstruire le breakdown étape-par-étape dans les tooltips.
    // Si baseX vaut 0 (cas dégénéré), ratio = 1 (pas de boost).
    const modulesDamageRatio = baseDamage > 0 ? modified.damage / baseDamage : 1;
    const modulesShieldRatio = baseShield > 0 ? modified.shield / baseShield : 1;
    const modulesHullRatio = baseHull > 0 ? modified.hull / baseHull : 1;
    const modulesArmorRatio = baseArmor > 0 ? modified.armor / baseArmor : 1;

    return {
      finalDamage, finalShield, finalHull, finalArmor,
      baseShotCount, totalShots, totalDamage,
      maxCharges,
      batteries,
      level, levelMult,
      passivesCount: passives.length,
      // V8.2 — intermédiaires pour les tooltips breakdown
      breakdown: {
        rawWeapons: flagship.weapons,
        rawShield: flagship.shield,
        rawHull: flagship.hull,
        rawArmor: flagship.baseArmor,
        hullBonusWeapons,
        hullBonusArmor,
        levelMult,
        modulesDamageRatio,
        modulesShieldRatio,
        modulesHullRatio,
        modulesArmorRatio,
        weaponsMult,
        shieldingMult,
        armorMult,
        isStationed,
      },
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
          breakdown={buildBreakdown({
            base: computed.breakdown.rawHull,
            baseLabel: 'Coque base',
            hullBonus: 0,
            levelMult: computed.breakdown.levelMult,
            level: computed.level,
            modulesRatio: computed.breakdown.modulesHullRatio,
            researchMult: computed.breakdown.armorMult,
            researchLabel: 'Recherche armure',
            isStationed: computed.breakdown.isStationed,
          })}
        />
        {/* Bouclier */}
        <StatTile
          icon={<ShieldIcon size={14} />}
          label="Bouclier"
          value={computed.finalShield}
          tone="text-sky-300"
          iconTone="text-sky-400"
          breakdown={buildBreakdown({
            base: computed.breakdown.rawShield,
            baseLabel: 'Bouclier base',
            hullBonus: 0,
            levelMult: computed.breakdown.levelMult,
            level: computed.level,
            modulesRatio: computed.breakdown.modulesShieldRatio,
            researchMult: computed.breakdown.shieldingMult,
            researchLabel: 'Recherche bouclier',
            isStationed: computed.breakdown.isStationed,
          })}
        />
        {/* Blindage */}
        <StatTile
          icon={<ArmorIcon size={14} />}
          label="Blindage"
          value={computed.finalArmor}
          tone="text-amber-300"
          iconTone="text-amber-400"
          breakdown={buildBreakdown({
            base: computed.breakdown.rawArmor,
            baseLabel: 'Blindage base',
            hullBonus: computed.breakdown.hullBonusArmor,
            levelMult: computed.breakdown.levelMult,
            level: computed.level,
            modulesRatio: computed.breakdown.modulesArmorRatio,
            researchMult: computed.breakdown.armorMult,
            researchLabel: 'Recherche armure',
            isStationed: computed.breakdown.isStationed,
          })}
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
            breakdown={buildBreakdown({
              base: computed.breakdown.rawWeapons,
              baseLabel: 'Armement base',
              hullBonus: computed.breakdown.hullBonusWeapons,
              levelMult: computed.breakdown.levelMult,
              level: computed.level,
              modulesRatio: computed.breakdown.modulesDamageRatio,
              researchMult: computed.breakdown.weaponsMult,
              researchLabel: 'Recherche armement',
              isStationed: computed.breakdown.isStationed,
              footnote: 'Total = Σ (dégâts/tir × tirs) sur toutes les batteries.',
            })}
          />
        </div>
      </div>

      <div className="h-px bg-panel-border/50" />

      {/* Weapon batteries breakdown */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <SectionHeader
            icon={<Crosshair className="h-3.5 w-3.5 text-orange-400" />}
            label={`Batteries d'armes (${computed.batteries.length})`}
            color="text-orange-400"
          />
          <span
            className="shrink-0 rounded border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider text-violet-300"
            title="Les batteries d'armes (coque + modules d'arme) ne sont consommées que pendant les runs d'anomalie. En PvP/pirate/raid, le vaisseau amiral combat avec ses stats brutes (sans modules ni profils d'arme avancés)."
          >
            Anomalie uniquement
          </span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {computed.batteries.map((b, i) => (
            <li
              key={`${b.isHull ? 'hull' : 'mod'}-${i}`}
              className="rounded-md border border-panel-border/50 bg-card/30 px-2.5 py-2 text-[11px] space-y-0.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={cn(
                      'shrink-0 h-1.5 w-1.5 rounded-full',
                      b.isHull
                        ? 'bg-muted-foreground/50'
                        : RARITY_DOT[b.rarityLabel ?? 'common'] ?? RARITY_DOT.common,
                    )}
                    aria-hidden
                  />
                  <span className="truncate font-medium text-foreground/90">
                    {b.source}
                  </span>
                </div>
                <span className="text-foreground/80 font-mono tabular-nums shrink-0">
                  {fmt(b.damagePerShot)} × {b.shots} = <span className="font-semibold text-foreground">{fmt(b.totalDamage)}</span>
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground/70 font-mono pl-3">
                vs {formatTargetCategory(b.targetCategory)}
                {b.rafale && (
                  <> · rafale ×{b.rafale.count}{b.rafale.category ? ` vs ${formatTargetCategory(b.rafale.category)}` : ''}</>
                )}
                {b.hasChainKill && <> · cascade</>}
              </div>
            </li>
          ))}
        </ul>
        {computed.batteries.length === 1 && (
          <p className="mt-2 text-[10px] text-muted-foreground/60 italic">
            Aucune arme additionnelle équipée — l'arsenal augmenterait les batteries de combat.
          </p>
        )}

        {/* V8.1 — légende discrète des cibles. Aide les joueurs à matcher
            leur arsenal avec la composition enemy. Format compact, font tiny. */}
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground/70 leading-snug">
          <Info className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
          <div className="space-y-0.5">
            <div><span className="text-foreground/80 font-medium">Légers</span> : chasseurs, drones, frégates légères</div>
            <div><span className="text-foreground/80 font-medium">Moyens</span> : frégates, croiseurs, destroyers</div>
            <div><span className="text-foreground/80 font-medium">Lourds</span> : battlecruisers, vaisseaux capitaux</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stat tile ───────────────────────────────────────────────────────────────

interface BreakdownStep {
  label: string;
  /** Affichage à droite : nombre formaté ou opérateur ("× 1.20"). */
  display: string;
  /** Cumulé au stade courant (pour la colonne droite, en optionnel). */
  cumulative?: number;
  muted?: boolean;
}

interface BreakdownData {
  steps: BreakdownStep[];
  finalLabel: string;
  finalValue: number;
  footnote?: string;
}

function StatTile({
  icon, label, value, tone, iconTone, suffix, breakdown,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
  iconTone: string;
  suffix?: string;
  breakdown?: BreakdownData | null;
}) {
  const hasBreakdown = !!breakdown && breakdown.steps.length > 0;

  return (
    <div
      className={cn(
        'group/stat relative flex items-center gap-2 rounded-md bg-[#0f172a]/60 border border-panel-border/50 px-2.5 py-2',
        hasBreakdown && 'cursor-help',
      )}
    >
      <span className={cn('shrink-0', iconTone)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wide text-slate-500 truncate">{label}</div>
        <div className={cn('text-sm font-bold font-mono tabular-nums leading-tight', tone)}>
          {fmt(value)}
          {suffix && <span className="ml-1 text-[9px] text-muted-foreground/60 font-normal">{suffix}</span>}
        </div>
      </div>

      {hasBreakdown && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50',
            'w-60 max-w-[80vw]',
            'opacity-0 group-hover/stat:opacity-100 transition-opacity duration-150 delay-150',
            'rounded-md border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl',
            'p-2.5 space-y-1.5',
          )}
        >
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
            Détail {label}
          </div>
          <div className="space-y-0.5">
            {breakdown!.steps.map((s, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-baseline justify-between gap-2 text-[11px] font-mono tabular-nums',
                  s.muted && 'text-muted-foreground/50',
                )}
              >
                <span className="truncate">{s.label}</span>
                <span className="shrink-0 text-foreground/85">{s.display}</span>
              </div>
            ))}
          </div>
          <div className="pt-1 border-t border-border/30 flex items-baseline justify-between gap-2 text-[11px] font-mono tabular-nums">
            <span className="text-foreground/90 font-semibold">{breakdown!.finalLabel}</span>
            <span className={cn('font-bold', tone)}>{fmt(breakdown!.finalValue)}</span>
          </div>
          {breakdown!.footnote && (
            <p className="text-[9px] text-muted-foreground/60 leading-snug pt-0.5">
              {breakdown!.footnote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * V8.2 — assemble le breakdown step-by-step d'une stat finale en partant
 * du brut et en appliquant chaque modificateur dans l'ordre exact du combat :
 *   base + bonus coque  →  × niv pilote  →  × modules  →  × recherche
 *
 * Si flagship pas stationné, `hullBonus` est 0 (déjà filtré côté caller),
 * mais on laisse une note mutée. `modulesRatio` à 1 → ligne discrète.
 */
function buildBreakdown(args: {
  base: number;
  baseLabel: string;
  hullBonus: number;
  levelMult: number;
  level: number;
  modulesRatio: number;
  researchMult: number;
  researchLabel: string;
  isStationed: boolean;
  footnote?: string;
}): BreakdownData {
  const steps: BreakdownStep[] = [];
  // 1. base
  steps.push({
    label: args.baseLabel,
    display: fmt(args.base),
  });
  // 2. + bonus coque
  if (args.hullBonus !== 0) {
    steps.push({
      label: 'Bonus coque',
      display: `+${fmt(args.hullBonus)}`,
      muted: !args.isStationed,
    });
  }
  // 3. × niv pilote
  steps.push({
    label: `Niv. ${args.level}`,
    display: `× ${args.levelMult.toFixed(2)}`,
  });
  // 4. × modules (si non-trivial)
  if (Math.abs(args.modulesRatio - 1) > 0.001) {
    steps.push({
      label: 'Modules',
      display: `× ${args.modulesRatio.toFixed(2)}`,
    });
  }
  // 5. × recherche
  if (Math.abs(args.researchMult - 1) > 0.001) {
    steps.push({
      label: args.researchLabel,
      display: `× ${args.researchMult.toFixed(2)}`,
    });
  }

  // Final value reproduit exactement le calcul du combat
  const finalValue = Math.round(
    (args.base + args.hullBonus) * args.levelMult * args.modulesRatio * args.researchMult,
  );

  return {
    steps,
    finalLabel: 'Final',
    finalValue,
    footnote: args.footnote,
  };
}
