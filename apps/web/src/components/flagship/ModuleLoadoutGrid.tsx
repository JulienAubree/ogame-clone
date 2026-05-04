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

export function ModuleLoadoutGrid({ slot, inventory, onSlotClick, onUnequip }: Props) {
  const epicMod = slot.epic ? inventory.get(slot.epic) ?? null : null;
  return (
    <div className="relative aspect-square w-full max-w-md mx-auto bg-gradient-to-br from-violet-950/30 via-slate-900 to-indigo-950/40 rounded-lg p-6">
      {/* Épique au centre */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <ModuleSlot
          size="epic"
          module={epicMod}
          onClick={() => onSlotClick('epic', 0)}
          onUnequip={epicMod ? () => onUnequip('epic', 0) : undefined}
        />
      </div>

      {/* 3 rares en triangle (top, bottom-left, bottom-right) */}
      {[0, 1, 2].map((idx) => {
        const angle = (idx * 120 - 90) * (Math.PI / 180);
        const x = 50 + 28 * Math.cos(angle);
        const y = 50 + 28 * Math.sin(angle);
        const m = slot.rare[idx] ? inventory.get(slot.rare[idx]) ?? null : null;
        return (
          <div key={idx} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ top: `${y}%`, left: `${x}%` }}>
            <ModuleSlot size="rare" module={m} onClick={() => onSlotClick('rare', idx)} onUnequip={m ? () => onUnequip('rare', idx) : undefined} />
          </div>
        );
      })}

      {/* 5 communs en couronne externe */}
      {[0, 1, 2, 3, 4].map((idx) => {
        const angle = (idx * 72 - 90) * (Math.PI / 180);
        const x = 50 + 42 * Math.cos(angle);
        const y = 50 + 42 * Math.sin(angle);
        const m = slot.common[idx] ? inventory.get(slot.common[idx]) ?? null : null;
        return (
          <div key={idx} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ top: `${y}%`, left: `${x}%` }}>
            <ModuleSlot size="common" module={m} onClick={() => onSlotClick('common', idx)} onUnequip={m ? () => onUnequip('common', idx) : undefined} />
          </div>
        );
      })}
    </div>
  );
}
