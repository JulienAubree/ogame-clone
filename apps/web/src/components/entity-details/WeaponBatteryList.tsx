import type { WeaponProfile } from '@/lib/entity-details';
import { WeaponsIcon, ShotsIcon } from './stat-components';

interface Props {
  profiles: WeaponProfile[];
  weaponsMultiplier: number;
  categoryLabels: Record<string, string>;
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

function fmtRafale(rafale: { category: string; count: number }, labels: Record<string, string>): string {
  const cat = labels[rafale.category] ?? rafale.category;
  return `Rafale ${rafale.count} ${cat}`;
}

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
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    title={`Tire ${w.rafale.count} coups supplémentaires quand la cible est ${categoryLabels[w.rafale.category] ?? w.rafale.category}.`}
                  >
                    {fmtRafale(w.rafale, categoryLabels)}
                  </span>
                )}
                {w.hasChainKill && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30"
                    title="Sur destruction d'une cible, tire un coup bonus sur une unité de la même catégorie."
                  >
                    Enchaînement
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
