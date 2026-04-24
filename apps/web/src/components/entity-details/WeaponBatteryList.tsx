import type { WeaponProfile } from '@/lib/entity-details';
import { WeaponsIcon, ShotsIcon } from './stat-components';
import { CombatTraitPopover } from './CombatTraitPopover';

interface Props {
  profiles: WeaponProfile[];
  weaponsMultiplier: number;
  categoryLabels: Record<string, string>;
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

export function WeaponBatteryList({ profiles, weaponsMultiplier, categoryLabels }: Props) {
  return (
    <div className="space-y-1.5">
      {profiles.map((w, i) => {
        const effectiveDamage = w.damage * weaponsMultiplier;
        const targetLabel = categoryLabels[w.targetCategory] ?? w.targetCategory;
        const isPrimary = i === 0;
        return (
          <div
            key={i}
            className="rounded-md border border-border/30 bg-muted/30 px-2.5 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-foreground">
                {isPrimary ? 'Canon principal' : 'Batterie secondaire'}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Cible : <span className="text-foreground">{targetLabel}</span>
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex items-center gap-1 text-[11px] text-foreground font-mono">
                <WeaponsIcon size={12} className="text-red-400" />
                {fmt(effectiveDamage)}
                {weaponsMultiplier > 1 && (
                  <span className="text-[9px] text-emerald-500">
                    (+{Math.round((weaponsMultiplier - 1) * 100)}%)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-foreground font-mono">
                <ShotsIcon size={12} className="text-amber-400" />
                ×{w.shots}
              </div>
            </div>
            {(w.rafale || w.hasChainKill) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {w.rafale && (
                  <CombatTraitPopover
                    variant="rafale"
                    label={`Rafale ${w.rafale.count} ${categoryLabels[w.rafale.category] ?? w.rafale.category}`}
                    categoryLabel={categoryLabels[w.rafale.category] ?? w.rafale.category}
                    count={w.rafale.count}
                  />
                )}
                {w.hasChainKill && (
                  <CombatTraitPopover variant="chainKill" label="Enchaînement" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
