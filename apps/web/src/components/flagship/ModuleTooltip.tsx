import type { ReactNode } from 'react';
import { Crosshair, Sparkles, Zap, AlertTriangle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * V7.2 ModuleTooltip — popover détaillé au survol des modules.
 * Affiche : nom, rareté, kind, description, effet complet
 * (stat passive / conditional / active / weapon profile).
 *
 * Le wrapper utilise `group` + `group-hover` Tailwind. Les enfants
 * (slot/card) restent cliquables, le tooltip est `pointer-events-none`
 * pour ne pas intercepter les clics.
 *
 * Positionnement par défaut : en bas, centré. Override via `placement`.
 */

export interface TooltipModule {
  id: string;
  name: string;
  description?: string;
  rarity?: string;
  kind?: string;
  effect?: unknown;
}

type Placement = 'bottom' | 'top' | 'right' | 'left';

interface Props {
  module: TooltipModule | null;
  children: ReactNode;
  /** Default 'bottom'. Use 'right' / 'left' near screen edges. */
  placement?: Placement;
  /** Override the wrapper className (e.g. to ensure inline-flex sizing). */
  wrapperClassName?: string;
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Commun',
  rare:   'Rare',
  epic:   'Épique',
};

const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-300 border-gray-400/40 bg-gray-900/60',
  rare:   'text-blue-300 border-blue-400/50 bg-blue-950/60',
  epic:   'text-violet-300 border-violet-400/60 bg-violet-950/60',
};

const PLACEMENT_CLASSES: Record<Placement, string> = {
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
};

const STAT_LABEL: Record<string, string> = {
  damage:           'Armement',
  hull:             'Coque',
  shield:           'Bouclier',
  armor:            'Blindage',
  cargo:            'Soute',
  speed:            'Vitesse',
  regen:            'Régén',
  epic_charges_max: 'Charges épiques max',
};

const TRIGGER_LABEL: Record<string, string> = {
  first_round:    '1er tour',
  low_hull:       'Coque basse',
  enemy_fp_above: 'FP enemy haut',
};

const ABILITY_LABEL: Record<string, string> = {
  repair:        'Réparation',
  shield_burst:  'Bouclier rebond',
  overcharge:    'Surcharge',
  scan:          'Scan',
  skip:          'Saut',
  damage_burst:  'Surchauffe',
};

function formatStatBonus(stat: string, value: number): string {
  const label = STAT_LABEL[stat] ?? stat;
  if (stat === 'epic_charges_max') return `+${value} ${label}`;
  const pct = Math.round(value * 100);
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}% ${label}`;
}

interface ParsedEffect {
  kind: 'stat' | 'conditional' | 'active' | 'weapon' | 'unknown';
  stat?: string;
  value?: number;
  trigger?: string;
  threshold?: number;
  ability?: string;
  magnitude?: number;
  profile?: {
    damage?: number;
    shots?: number;
    targetCategory?: string;
    rafale?: { category?: string; count: number };
    hasChainKill?: boolean;
  };
}

function parseEffect(effect: unknown): ParsedEffect {
  if (!effect || typeof effect !== 'object') return { kind: 'unknown' };
  const e = effect as Record<string, unknown>;
  const type = typeof e.type === 'string' ? e.type : null;
  if (type === 'stat') {
    return { kind: 'stat', stat: String(e.stat ?? ''), value: Number(e.value ?? 0) };
  }
  if (type === 'conditional') {
    const inner = (e.effect ?? {}) as Record<string, unknown>;
    return {
      kind: 'conditional',
      trigger: String(e.trigger ?? ''),
      threshold: e.threshold !== undefined ? Number(e.threshold) : undefined,
      stat: String(inner.stat ?? ''),
      value: Number(inner.value ?? 0),
    };
  }
  if (type === 'active') {
    return {
      kind: 'active',
      ability: String(e.ability ?? ''),
      magnitude: Number(e.magnitude ?? 0),
    };
  }
  if (type === 'weapon') {
    const p = (e.profile ?? {}) as Record<string, unknown>;
    const rafale = p.rafale as { category?: string; count?: number } | undefined;
    return {
      kind: 'weapon',
      profile: {
        damage: p.damage !== undefined ? Number(p.damage) : undefined,
        shots: p.shots !== undefined ? Number(p.shots) : undefined,
        targetCategory: typeof p.targetCategory === 'string' ? p.targetCategory : undefined,
        rafale: rafale && rafale.count !== undefined ? { category: rafale.category, count: Number(rafale.count) } : undefined,
        hasChainKill: Boolean(p.hasChainKill),
      },
    };
  }
  return { kind: 'unknown' };
}

function EffectBlock({ parsed }: { parsed: ParsedEffect }) {
  if (parsed.kind === 'stat') {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
        <span className="text-emerald-300 font-mono">
          {formatStatBonus(parsed.stat ?? '', parsed.value ?? 0)}
        </span>
      </div>
    );
  }
  if (parsed.kind === 'conditional') {
    const trig = TRIGGER_LABEL[parsed.trigger ?? ''] ?? parsed.trigger;
    const thresh = parsed.threshold !== undefined && parsed.trigger !== 'first_round'
      ? ` (${parsed.trigger === 'low_hull' ? `≤${Math.round((parsed.threshold ?? 0) * 100)}%` : parsed.threshold})`
      : '';
    return (
      <div className="space-y-0.5 text-xs">
        <div className="text-[10px] text-amber-300 font-mono uppercase tracking-wider">
          Conditionnel
        </div>
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
          <span className="text-emerald-300 font-mono">
            {formatStatBonus(parsed.stat ?? '', parsed.value ?? 0)}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground italic">
          Si {trig}{thresh}
        </div>
      </div>
    );
  }
  if (parsed.kind === 'active') {
    const ab = ABILITY_LABEL[parsed.ability ?? ''] ?? parsed.ability;
    return (
      <div className="space-y-0.5 text-xs">
        <div className="text-[10px] text-violet-300 font-mono uppercase tracking-wider">
          Capacité active
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-violet-400 shrink-0" />
          <span className="text-violet-200 font-semibold">{ab}</span>
        </div>
        {parsed.magnitude !== undefined && parsed.magnitude !== 0 && (
          <div className="text-[10px] text-muted-foreground font-mono">
            Magnitude : {Math.round((parsed.magnitude ?? 0) * 100)}%
          </div>
        )}
      </div>
    );
  }
  if (parsed.kind === 'weapon' && parsed.profile) {
    const p = parsed.profile;
    return (
      <div className="space-y-1 text-xs">
        <div className="text-[10px] text-orange-300 font-mono uppercase tracking-wider">
          Profil d'arme
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {p.damage !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dégâts</span>
              <span className="font-mono text-foreground/90">{p.damage}</span>
            </div>
          )}
          {p.shots !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tirs</span>
              <span className="font-mono text-foreground/90">×{p.shots}</span>
            </div>
          )}
          {p.targetCategory && (
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Cible</span>
              <span className="font-mono text-foreground/90">anti-{p.targetCategory}</span>
            </div>
          )}
        </div>
        {p.rafale && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
            <span className="rounded bg-amber-900/50 border border-amber-500/40 text-amber-200 text-[9px] font-mono px-1 py-0">
              rafale
            </span>
            <span className="text-[10px] text-muted-foreground">
              ×{p.rafale.count}{p.rafale.category ? ` vs ${p.rafale.category}` : ''}
            </span>
          </div>
        )}
        {p.hasChainKill && (
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-rose-900/50 border border-rose-500/40 text-rose-200 text-[9px] font-mono px-1 py-0">
              chain
            </span>
            <span className="text-[10px] text-muted-foreground">
              Tir bonus à chaque destruction
            </span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
      <AlertTriangle className="h-3 w-3 text-amber-400" />
      Effet inconnu
    </div>
  );
}

export function ModuleTooltip({ module, children, placement = 'bottom', wrapperClassName }: Props) {
  if (!module) {
    return <>{children}</>;
  }

  const parsed = parseEffect(module.effect);
  const isWeapon = module.kind === 'weapon' || parsed.kind === 'weapon';
  const rarity = module.rarity ?? 'common';
  const rarityClass = RARITY_COLOR[rarity] ?? RARITY_COLOR.common;

  return (
    <div className={cn('relative group/mt inline-flex', wrapperClassName)}>
      {children}
      <div
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 w-64 max-w-[80vw]',
          'opacity-0 group-hover/mt:opacity-100 transition-opacity duration-150 delay-100',
          'rounded-md border border-border/60 bg-popover/95 backdrop-blur-md shadow-xl',
          'p-3 space-y-2',
          PLACEMENT_CLASSES[placement],
        )}
      >
        {/* Header : nom + rareté */}
        <div className="space-y-1">
          <div className="flex items-start gap-1.5">
            {isWeapon ? (
              <Crosshair className="h-3.5 w-3.5 text-orange-400 mt-0.5 shrink-0" />
            ) : (
              <Star className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0" />
            )}
            <h4 className="text-sm font-semibold text-foreground leading-tight">
              {module.name}
            </h4>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border',
              rarityClass,
            )}>
              {RARITY_LABEL[rarity] ?? rarity}
            </span>
            {isWeapon && (
              <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-orange-400/40 bg-orange-950/60 text-orange-300">
                Arme
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {module.description && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {module.description}
          </p>
        )}

        {/* Effet */}
        <div className="border-t border-border/40 pt-2">
          <EffectBlock parsed={parsed} />
        </div>
      </div>
    </div>
  );
}
