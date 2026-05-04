import { Crosshair, Plus, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleTooltip } from './ModuleTooltip';

/**
 * V7-WeaponProfiles : Arsenal section. Présente 3 slots horizontaux
 * (commun → rare → épique de gauche à droite) avec un design distinct
 * du ModuleLoadoutGrid (passives) :
 *   - layout horizontal au lieu de grid radiale
 *   - cards rectangulaires plus grandes
 *   - palette orange/amber au lieu de violet/indigo
 *   - badges "X tirs", "anti-{cat}", "rafale", "chainKill"
 *
 * Le composant accepte un `inventory` Map (id → { name, image, kind, effect })
 * pour résoudre les slots équipés. Si le module n'a pas le bon kind ('weapon'),
 * il est affiché en mode "Module invalide" plutôt que crash.
 */

export type WeaponRarity = 'common' | 'rare' | 'epic';

interface WeaponProfileSummary {
  damage?: number;
  shots?: number;
  targetCategory?: string;
  rafale?: { category?: string; count: number };
  hasChainKill?: boolean;
}

export interface ArsenalModuleLite {
  id: string;
  name: string;
  image: string;
  rarity: string;
  /** V7-WeaponProfiles : kind permet de filtrer Arsenal vs passive. */
  kind?: string;
  /** Module effect — used to extract weaponProfile for badges. */
  effect?: unknown;
  /** Description for tooltip popover. */
  description?: string;
}

interface Slot {
  weaponEpic?: string | null;
  weaponRare?: string | null;
  weaponCommon?: string | null;
}

interface Props {
  slot: Slot;
  inventory: Map<string, ArsenalModuleLite>;
  onSlotClick: (rarity: WeaponRarity) => void;
  onUnequip: (rarity: WeaponRarity) => void;
}

const RARITY_LABEL: Record<WeaponRarity, string> = {
  common: 'Commun',
  rare:   'Rare',
  epic:   'Épique',
};

const RARITY_BORDER: Record<WeaponRarity, string> = {
  common: 'border-stone-400/40',
  rare:   'border-amber-400/50',
  epic:   'border-orange-400/70 shadow-md shadow-orange-500/20',
};

const RARITY_ACCENT_TEXT: Record<WeaponRarity, string> = {
  common: 'text-stone-300',
  rare:   'text-amber-300',
  epic:   'text-orange-300',
};

function extractProfile(mod: ArsenalModuleLite | null): WeaponProfileSummary | null {
  if (!mod) return null;
  const effect = mod.effect as { type?: string; profile?: WeaponProfileSummary } | null | undefined;
  if (!effect || effect.type !== 'weapon' || !effect.profile) return null;
  return effect.profile;
}

function isInvalidWeaponSlot(mod: ArsenalModuleLite | null | undefined): boolean {
  if (!mod) return false;
  // V7-WeaponProfiles : si le kind n'est pas 'weapon' OU si effect.type !== 'weapon',
  // le module est invalide pour un slot Arsenal (admin disable, migration mistake).
  if (mod.kind && mod.kind !== 'weapon') return true;
  const effect = mod.effect as { type?: string } | null | undefined;
  if (effect && effect.type !== 'weapon') return true;
  return false;
}

interface SlotProps {
  rarity: WeaponRarity;
  module: ArsenalModuleLite | null;
  onClick: () => void;
  onUnequip: () => void;
}

function ArsenalSlot({ rarity, module, onClick, onUnequip }: SlotProps) {
  const invalid = isInvalidWeaponSlot(module);
  const profile = extractProfile(module);
  const isEpic = rarity === 'epic';

  const slotButton = (
      <button
        type="button"
        onClick={module ? onUnequip : onClick}
        aria-label={module ? `${module.name} — clic pour déséquiper` : `Clic pour équiper une arme ${RARITY_LABEL[rarity].toLowerCase()}`}
        className={cn(
          'group relative h-32 sm:h-36 w-full rounded-md border-2 transition-all',
          'flex flex-col items-stretch justify-between p-2',
          module
            ? 'bg-gradient-to-br from-stone-900/80 via-amber-950/40 to-orange-950/40 hover:from-stone-900 hover:to-orange-900/50'
            : 'border-dashed bg-stone-950/40 hover:bg-stone-900/40',
          invalid ? 'border-rose-500/60' : RARITY_BORDER[rarity],
          isEpic && module && !invalid && 'ring-1 ring-orange-500/30',
        )}
      >
        {module ? (
          invalid ? (
            <>
              <div className="flex items-center justify-center text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="text-[10px] font-mono text-rose-300 text-center truncate">
                Module invalide
              </div>
              <div className="text-[8px] text-rose-300/70 text-center truncate" title={module.name}>
                {module.name}
              </div>
            </>
          ) : (
            <>
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-rose-500/80 p-0.5">
                <X className="h-3 w-3 text-white" />
              </div>
              <div className="flex-1 flex items-center justify-center min-h-0">
                {module.image ? (
                  <img
                    src={`${module.image}-thumb.webp`}
                    alt={module.name}
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <Crosshair className={cn('h-7 w-7', RARITY_ACCENT_TEXT[rarity])} />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] font-semibold text-foreground/95 text-center leading-tight line-clamp-2">
                  {module.name}
                </div>
                {profile && (
                  <div className="flex flex-wrap items-center justify-center gap-0.5">
                    {profile.shots !== undefined && (
                      <span className="rounded bg-orange-900/50 border border-orange-500/30 text-orange-200 text-[8px] font-mono px-1 py-0">
                        ×{profile.shots}
                      </span>
                    )}
                    {profile.targetCategory && (
                      <span className="rounded bg-stone-900/60 border border-stone-500/40 text-stone-200 text-[8px] font-mono px-1 py-0">
                        anti-{profile.targetCategory}
                      </span>
                    )}
                    {profile.rafale && (
                      <span className="rounded bg-amber-900/50 border border-amber-500/40 text-amber-200 text-[8px] font-mono px-1 py-0" title={`Rafale ×${profile.rafale.count}${profile.rafale.category ? ` vs ${profile.rafale.category}` : ''}`}>
                        rafale
                      </span>
                    )}
                    {profile.hasChainKill && (
                      <span className="rounded bg-rose-900/50 border border-rose-500/40 text-rose-200 text-[8px] font-mono px-1 py-0" title="Chaîne de kill : tir bonus à chaque destruction">
                        chain
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )
        ) : (
          <>
            <div className="flex-1 flex items-center justify-center">
              <Crosshair className="h-7 w-7 text-stone-600/60" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground/70">
                <Plus className="h-3 w-3" />
                Vide
              </div>
              <div className="text-[8px] text-muted-foreground/50 text-center font-mono uppercase tracking-wider">
                {RARITY_LABEL[rarity]}
              </div>
            </div>
          </>
        )}
      </button>
  );

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
      <div className={cn(
        'text-[9px] font-mono uppercase tracking-widest text-center',
        RARITY_ACCENT_TEXT[rarity],
      )}>
        {RARITY_LABEL[rarity]}
      </div>
      {module && !invalid ? (
        <ModuleTooltip
          module={{
            id: module.id,
            name: module.name,
            description: module.description,
            rarity: module.rarity,
            kind: module.kind,
            effect: module.effect,
          }}
          placement="bottom"
          wrapperClassName="block"
        >
          {slotButton}
        </ModuleTooltip>
      ) : (
        slotButton
      )}
    </div>
  );
}

export function ArsenalLoadoutGrid({ slot, inventory, onSlotClick, onUnequip }: Props) {
  const commonId = slot.weaponCommon ?? null;
  const rareId = slot.weaponRare ?? null;
  const epicId = slot.weaponEpic ?? null;

  const commonMod = commonId ? inventory.get(commonId) ?? null : null;
  const rareMod = rareId ? inventory.get(rareId) ?? null : null;
  const epicMod = epicId ? inventory.get(epicId) ?? null : null;

  return (
    <section className="rounded-lg border border-orange-500/30 bg-gradient-to-br from-orange-950/30 via-stone-900/80 to-amber-950/30 p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 border-b border-orange-500/20 pb-2">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-orange-200">
            Arsenal de combat
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          3 armes max · 1 par rareté
        </span>
      </header>

      <div className="flex gap-3 sm:gap-4">
        <ArsenalSlot
          rarity="common"
          module={commonMod}
          onClick={() => onSlotClick('common')}
          onUnequip={() => onUnequip('common')}
        />
        <ArsenalSlot
          rarity="rare"
          module={rareMod}
          onClick={() => onSlotClick('rare')}
          onUnequip={() => onUnequip('rare')}
        />
        <ArsenalSlot
          rarity="epic"
          module={epicMod}
          onClick={() => onSlotClick('epic')}
          onUnequip={() => onUnequip('epic')}
        />
      </div>

      <p className="text-[10px] text-muted-foreground/80 leading-snug">
        Chaque arme équipée ajoute un profil de tir au flagship en plus de son tir
        de coque. Les armes ne fournissent pas de bonus de stats — elles tirent
        directement contre les cibles ennemies de leur catégorie.
      </p>
    </section>
  );
}
