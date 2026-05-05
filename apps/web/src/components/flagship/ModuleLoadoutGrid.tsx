import { ModuleSlot } from './ModuleSlot';

interface ModuleLite {
  id: string;
  name: string;
  image: string;
  rarity: string;
  description?: string;
  kind?: string;
  effect?: unknown;
}

interface Slot {
  epic: string | null;
  /** Fixed-length 3 with `null` placeholders for empty slots. */
  rare: (string | null)[];
  /** Fixed-length 5 with `null` placeholders for empty slots. */
  common: (string | null)[];
}

interface Props {
  slot: Slot;
  inventory: Map<string, ModuleLite>;
  onSlotClick: (slotType: 'epic' | 'rare' | 'common', slotIndex: number) => void;
  onUnequip: (slotType: 'epic' | 'rare' | 'common', slotIndex: number) => void;
}

const TIER_LABEL_CLASS =
  'block text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 text-center';

export function ModuleLoadoutGrid({ slot, inventory, onSlotClick, onUnequip }: Props) {
  const epicMod = slot.epic ? inventory.get(slot.epic) ?? null : null;

  return (
    <div className="rounded-lg bg-card/30 backdrop-blur-sm p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-5 max-w-md mx-auto">
      <div className="flex justify-center">
        <span
          className="rounded border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-violet-300 text-center"
          title="Les modules passifs (épique + rares + communs) ne sont consommés que pendant les runs d'anomalie. En PvP/pirate/raid, le vaisseau amiral combat avec ses stats brutes (sans bonus de modules)."
        >
          Anomalie uniquement
        </span>
      </div>
      {/* ─── ÉPIQUE ─── */}
      <section className="space-y-2">
        <span className={TIER_LABEL_CLASS}>Épique</span>
        <div className="flex justify-center">
          <ModuleSlot
            size="epic"
            module={epicMod}
            onClick={() => onSlotClick('epic', 0)}
            onUnequip={epicMod ? () => onUnequip('epic', 0) : undefined}
          />
        </div>
      </section>

      {/* ─── RARES ─── */}
      <section className="space-y-2">
        <span className={TIER_LABEL_CLASS}>Rares</span>
        <div className="flex justify-center gap-2 sm:gap-3">
          {[0, 1, 2].map((idx) => {
            const m = slot.rare[idx] ? inventory.get(slot.rare[idx] as string) ?? null : null;
            return (
              <ModuleSlot
                key={idx}
                size="rare"
                module={m}
                onClick={() => onSlotClick('rare', idx)}
                onUnequip={m ? () => onUnequip('rare', idx) : undefined}
              />
            );
          })}
        </div>
      </section>

      {/* ─── COMMUNS ─── */}
      <section className="space-y-2">
        <span className={TIER_LABEL_CLASS}>Communs</span>
        <div className="flex justify-center gap-1.5 sm:gap-2">
          {[0, 1, 2, 3, 4].map((idx) => {
            const m = slot.common[idx] ? inventory.get(slot.common[idx] as string) ?? null : null;
            return (
              <ModuleSlot
                key={idx}
                size="common"
                module={m}
                onClick={() => onSlotClick('common', idx)}
                onUnequip={m ? () => onUnequip('common', idx) : undefined}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
