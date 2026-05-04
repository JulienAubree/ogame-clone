import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleTooltip } from './ModuleTooltip';

interface InventoryItem {
  moduleId: string;
  count: number;
  hullId: string;
  rarity: string;
  name: string;
  description: string;
  image: string;
  enabled: boolean;
  effect?: unknown;
  /** V7-WeaponProfiles : kind ('passive' | 'weapon'). */
  kind?: string;
}

interface Props {
  items: InventoryItem[];
  hullFilter: string;
  selectedSlotType: 'epic' | 'rare' | 'common' | null;
  equippedIds: Set<string>;
  onEquip: (moduleId: string) => void;
  onDetails: (moduleId: string) => void;
}

const RARITY_TONE: Record<string, string> = {
  common: 'text-gray-400 border-gray-400/30',
  rare:   'text-blue-300 border-blue-400/40',
  epic:   'text-violet-300 border-violet-400/50',
};

export function ModuleInventoryPanel({ items, hullFilter, selectedSlotType, equippedIds, onEquip, onDetails }: Props) {
  const [search, setSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState<'all' | 'common' | 'rare' | 'epic'>('all');

  const filtered = useMemo(() => {
    return items
      .filter((m) => m.hullId === hullFilter)
      .filter((m) => rarityFilter === 'all' || m.rarity === rarityFilter)
      .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()))
      .filter((m) => !selectedSlotType || m.rarity === selectedSlotType)
      .sort((a, b) => {
        const order = { epic: 0, rare: 1, common: 2 };
        if (a.rarity !== b.rarity) return (order[a.rarity as keyof typeof order] ?? 3) - (order[b.rarity as keyof typeof order] ?? 3);
        return a.name.localeCompare(b.name);
      });
  }, [items, hullFilter, rarityFilter, search, selectedSlotType]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text" placeholder="Rechercher un module..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border/40 bg-card/30 pl-7 pr-2 py-1.5 text-xs"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'common', 'rare', 'epic'] as const).map((r) => (
            <button
              key={r} onClick={() => setRarityFilter(r)}
              className={cn(
                'flex-1 rounded text-[10px] uppercase font-mono py-1 border',
                rarityFilter === r ? 'border-hull-500/60 bg-hull-950/40 text-hull-200' : 'border-border/30 bg-card/20 text-muted-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="text-xs text-muted-foreground italic text-center p-4">Aucun module disponible avec ces filtres.</li>
        ) : (
          filtered.map((m) => {
            const equipped = equippedIds.has(m.moduleId);
            return (
              <li key={m.moduleId} className={cn(
                'flex items-center gap-2 p-1.5 rounded border',
                RARITY_TONE[m.rarity] ?? '',
                equipped && 'opacity-50',
              )}>
                <ModuleTooltip
                  module={{
                    id: m.moduleId, name: m.name, description: m.description,
                    rarity: m.rarity, kind: m.kind, effect: m.effect,
                  }}
                  placement="right"
                  wrapperClassName="flex-1 min-w-0 block"
                >
                  <div className="flex-1 min-w-0 cursor-help">
                    <div className="text-xs font-semibold text-foreground/90 truncate flex items-center gap-1">
                      {m.name}
                      {m.count > 1 && <span className="text-[9px] text-muted-foreground">×{m.count}</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{m.description}</div>
                  </div>
                </ModuleTooltip>
                <button
                  onClick={() => onDetails(m.moduleId)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >Détails</button>
                <button
                  onClick={() => onEquip(m.moduleId)}
                  disabled={equipped}
                  className="text-[10px] rounded bg-hull-600/80 hover:bg-hull-600 disabled:opacity-40 px-2 py-1 text-white"
                >{equipped ? '✓' : 'Équiper'}</button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
